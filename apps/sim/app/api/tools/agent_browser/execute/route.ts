import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { uploadExecutionFile } from '@/lib/uploads/contexts/execution'
import {
  buildGlobalCliArgs,
  extractAgentBrowserImagePaths,
  getCommandTimeoutMs,
  normalizeCliEnvironment,
  parseAgentBrowserScript,
  parseStructuredStdout,
} from '@/app/api/tools/agent_browser/utils'
import type {
  AgentBrowserCommandResult,
  AgentBrowserExecuteOutput,
  AgentBrowserExecuteParams,
  AgentBrowserOutputImageFile,
} from '@/tools/agent_browser/types'

const logger = createLogger('AgentBrowserExecuteAPI')

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const requestSchema = z.object({
  script: z.string().min(1),
  session: z.string().optional(),
  provider: z.string().optional(),
  cliEnvironment: z.any().optional(),
  headed: z.boolean().optional(),
  profile: z.string().optional(),
  executablePath: z.string().optional(),
  cdp: z.string().optional(),
  autoConnect: z.boolean().optional(),
  userAgent: z.string().optional(),
  proxy: z.string().optional(),
  headers: z.any().optional(),
  browserArgs: z.string().optional(),
  timeoutMs: z.union([z.number(), z.string()]).optional(),
  allowFileAccess: z.boolean().optional(),
  ignoreHttpsErrors: z.boolean().optional(),
  debug: z.boolean().optional(),
  workspaceId: z.string().optional(),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
})

function getCliBinary(): string {
  const configuredPath = process.env.AGENT_BROWSER_CLI_PATH?.trim()
  if (configuredPath) {
    return configuredPath
  }

  const cwd = process.cwd()
  const homeDirectory = process.env.HOME?.trim()
  const candidatePaths = [
    path.resolve(cwd, 'node_modules/.bin/agent-browser'),
    path.resolve(cwd, '../node_modules/.bin/agent-browser'),
    path.resolve(cwd, '../../node_modules/.bin/agent-browser'),
    ...(homeDirectory ? [path.join(homeDirectory, '.bun/bin/agent-browser')] : []),
    '/opt/homebrew/bin/agent-browser',
    '/usr/local/bin/agent-browser',
  ]

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }

  return 'agent-browser'
}

function getMissingCliMessage(binary: string): string {
  return `agent-browser CLI not found at "${binary}". Install agent-browser on the machine running Sim, run "agent-browser install" to provision Chromium, then restart the app. If the binary is not on PATH, set AGENT_BROWSER_CLI_PATH to its absolute path.`
}

function resolveLocalOutputPath(filePath: string): string {
  const trimmedPath = filePath.trim()
  const homeDirectory = process.env.HOME?.trim()

  if (trimmedPath === '~' && homeDirectory) {
    return homeDirectory
  }

  if (trimmedPath.startsWith('~/') && homeDirectory) {
    return path.join(homeDirectory, trimmedPath.slice(2))
  }

  return path.isAbsolute(trimmedPath) ? trimmedPath : path.resolve(process.cwd(), trimmedPath)
}

function getImageContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()

  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    default:
      return 'image/png'
  }
}

function getExecutionUploadContext(params: AgentBrowserExecuteParams) {
  const workspaceId = params._context?.workspaceId?.trim()
  const workflowId = params._context?.workflowId?.trim()
  const executionId = params._context?.executionId?.trim()

  if (!workspaceId || !workflowId || !executionId) {
    return null
  }

  return {
    workspaceId,
    workflowId,
    executionId,
  }
}

async function buildOutputImageFiles(
  commands: ReturnType<typeof parseAgentBrowserScript>,
  results: AgentBrowserCommandResult[],
  params: AgentBrowserExecuteParams,
  userId?: string
): Promise<{
  imageFile: AgentBrowserOutputImageFile | null
  imageFiles: AgentBrowserOutputImageFile[]
}> {
  const uploadContext = getExecutionUploadContext(params)
  const imagePaths = new Set<string>()

  for (let index = 0; index < Math.min(commands.length, results.length); index += 1) {
    const command = commands[index]
    const result = results[index]

    for (const imagePath of extractAgentBrowserImagePaths(command, result.parsedOutput)) {
      imagePaths.add(imagePath)
    }
  }

  const imageFiles: AgentBrowserOutputImageFile[] = []

  for (const imagePath of imagePaths) {
    const resolvedPath = resolveLocalOutputPath(imagePath)

    if (!existsSync(resolvedPath)) {
      logger.warn('Agent-browser output image not found on disk', {
        imagePath,
        resolvedPath,
      })
      continue
    }

    try {
      const buffer = await readFile(resolvedPath)
      const fileName = path.basename(resolvedPath)
      const contentType = getImageContentType(resolvedPath)

      if (uploadContext) {
        imageFiles.push(
          await uploadExecutionFile(uploadContext, buffer, fileName, contentType, userId)
        )
        continue
      }

      imageFiles.push({
        name: fileName,
        mimeType: contentType,
        data: buffer.toString('base64'),
        size: buffer.length,
      })
    } catch (error) {
      logger.warn('Failed to process agent-browser output image', {
        imagePath,
        resolvedPath,
        error,
      })
    }
  }

  return {
    imageFile: imageFiles.at(-1) ?? null,
    imageFiles,
  }
}

async function runCliCommand(
  binary: string,
  command: string,
  argv: string[],
  cliEnvironment: Record<string, string>,
  timeoutMs: number
): Promise<AgentBrowserCommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, argv, {
      env: {
        ...process.env,
        ...cliEnvironment,
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(getMissingCliMessage(binary)))
        return
      }
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timer)

      if (timedOut) {
        resolve({
          command,
          argv,
          success: false,
          exitCode: -1,
          stdout,
          stderr: stderr || `Execution timed out after ${timeoutMs}ms`,
          parsedOutput: parseStructuredStdout(stdout),
        })
        return
      }

      resolve({
        command,
        argv,
        success: code === 0,
        exitCode: code ?? -1,
        stdout,
        stderr: stderr || undefined,
        parsedOutput: parseStructuredStdout(stdout),
      })
    })
  })
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const auth = await checkInternalAuth(request, { requireWorkflowId: false })
    if (!auth.success) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { workspaceId, workflowId, executionId, ...rawParams } = parsed.data
    const params: AgentBrowserExecuteParams = {
      ...rawParams,
      _context:
        workspaceId || workflowId || executionId
          ? {
              workspaceId,
              workflowId,
              executionId,
            }
          : undefined,
    }
    let commands: ReturnType<typeof parseAgentBrowserScript>
    let globalCliArgs: string[]
    let cliEnvironment: Record<string, string>
    let timeoutMs: number

    try {
      commands = parseAgentBrowserScript(params.script)
      globalCliArgs = buildGlobalCliArgs(params)
      cliEnvironment = normalizeCliEnvironment(params.cliEnvironment)
      timeoutMs = getCommandTimeoutMs(params.timeoutMs)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid agent-browser request'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const binary = getCliBinary()

    logger.info('Executing agent-browser script', {
      requestId,
      commandCount: commands.length,
      session: params.session || null,
      provider: params.provider || 'local',
      binary,
    })

    const results: AgentBrowserCommandResult[] = []

    for (const command of commands) {
      const argv = [...globalCliArgs, command.command, ...command.args]
      const result = await runCliCommand(binary, command.command, argv, cliEnvironment, timeoutMs)
      results.push(result)

      if (!result.success) {
        const errorMessage =
          result.stderr?.trim() ||
          result.stdout.trim() ||
          `agent-browser command failed: ${command.raw}`

        logger.warn('Agent-browser command failed', {
          requestId,
          command: command.raw,
          exitCode: result.exitCode,
          errorMessage,
        })

        const imageOutputs = await buildOutputImageFiles(
          commands.slice(0, results.length),
          results,
          params,
          auth.userId
        )

        return NextResponse.json(
          {
            success: false,
            output: {
              success: false,
              session: params.session?.trim() || null,
              commandCount: results.length,
              finalResult: result.parsedOutput,
              results,
              ...imageOutputs,
            } satisfies AgentBrowserExecuteOutput,
            error: errorMessage,
          },
          { status: 200 }
        )
      }
    }

    const finalResult = results.at(-1)?.parsedOutput ?? null
    const imageOutputs = await buildOutputImageFiles(commands, results, params, auth.userId)

    return NextResponse.json({
      success: true,
      output: {
        success: true,
        session: params.session?.trim() || null,
        commandCount: results.length,
        finalResult,
        results,
        ...imageOutputs,
      } satisfies AgentBrowserExecuteOutput,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to execute agent-browser script'
    logger.error('Agent-browser execution failed', { requestId, error })

    return NextResponse.json(
      {
        success: false,
        output: {
          success: false,
          session: null,
          commandCount: 0,
          finalResult: null,
          results: [],
        } satisfies AgentBrowserExecuteOutput,
        error: message,
      },
      { status: 500 }
    )
  }
}
