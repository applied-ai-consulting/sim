import { DEFAULT_EXECUTION_TIMEOUT_MS, getMaxExecutionTimeout } from '@/lib/core/execution-limits'
import type { AgentBrowserExecuteParams } from '@/tools/agent_browser/types'

const SIMPLE_COMMANDS = new Set([
  'back',
  'check',
  'click',
  'close',
  'console',
  'connect',
  'cookies',
  'dblclick',
  'download',
  'errors',
  'eval',
  'fill',
  'forward',
  'highlight',
  'hover',
  'open',
  'goto',
  'navigate',
  'press',
  'reload',
  'screenshot',
  'scroll',
  'select',
  'snapshot',
  'type',
  'uncheck',
  'wait',
])

const NAMESPACE_COMMANDS: Record<string, Set<string> | null> = {
  diff: new Set(['screenshot', 'snapshot', 'url']),
  find: new Set(['alt', 'label', 'placeholder', 'role', 'testid', 'text', 'title']),
  frame: null,
  get: new Set(['attribute', 'html', 'text', 'title', 'url', 'value']),
  is: new Set(['checked', 'disabled', 'editable', 'enabled', 'focused', 'hidden', 'visible']),
  mouse: new Set(['click', 'dblclick', 'down', 'drag', 'move', 'up']),
  network: new Set(['requests', 'route', 'unroute']),
  set: new Set(['headers']),
  state: new Set(['clear', 'clean', 'list', 'load', 'rename', 'save', 'show']),
  storage: new Set(['clear', 'list', 'local', 'session']),
  tab: null,
  trace: new Set(['start', 'stop']),
}

const QUOTE_CHARACTERS = new Set(["'", '"'])
const IMAGE_OUTPUT_FLAGS = new Set(['-o', '--output'])
const IMAGE_FILE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
])
const IMAGE_PATH_HINT_KEYS = new Set([
  'file',
  'filePath',
  'image',
  'imagePath',
  'output',
  'path',
  'screenshot',
])

export interface ParsedAgentBrowserCommand {
  raw: string
  command: string
  args: string[]
}

export function tokenizeCliLine(line: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escapeNext = false

  for (const char of line) {
    if (escapeNext) {
      current += char
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (QUOTE_CHARACTERS.has(char)) {
      quote = char as '"' | "'"
      continue
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escapeNext) {
    current += '\\'
  }

  if (quote) {
    throw new Error(`Unterminated quoted string in command: ${line}`)
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

function validateCommandTokens(tokens: string[]): void {
  if (tokens.length === 0) {
    throw new Error('Empty agent-browser command')
  }

  const [command, subcommand] = tokens

  if (command.startsWith('-')) {
    throw new Error('Inline global CLI flags are not supported. Use the block settings instead.')
  }

  if (SIMPLE_COMMANDS.has(command)) {
    return
  }

  const allowedSubcommands = NAMESPACE_COMMANDS[command]
  if (allowedSubcommands === undefined) {
    throw new Error(`Unsupported agent-browser command: ${command}`)
  }

  if (allowedSubcommands === null) {
    return
  }

  if (!subcommand || !allowedSubcommands.has(subcommand)) {
    throw new Error(
      `Unsupported agent-browser command: ${command}${subcommand ? ` ${subcommand}` : ''}`
    )
  }
}

export function parseAgentBrowserScript(script: string): ParsedAgentBrowserCommand[] {
  const commands = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const tokens = tokenizeCliLine(line)
      const normalized = tokens[0] === 'agent-browser' ? tokens.slice(1) : tokens

      validateCommandTokens(normalized)

      return {
        raw: line,
        command: normalized[0],
        args: normalized.slice(1),
      }
    })

  if (commands.length === 0) {
    throw new Error('Script must contain at least one agent-browser command')
  }

  return commands
}

function isLocalImagePath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || /^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
    return false
  }

  const normalized = trimmed.split(/[?#]/, 1)[0].toLowerCase()
  return Array.from(IMAGE_FILE_EXTENSIONS).some((extension) => normalized.endsWith(extension))
}

function isPathLikeValue(value: string): boolean {
  return (
    value.startsWith('.') ||
    value.startsWith('~') ||
    value.startsWith('/') ||
    value.includes('/') ||
    value.includes('\\')
  )
}

function collectImagePathsFromParsedOutput(value: unknown, paths: Set<string>, key?: string): void {
  if (typeof value === 'string') {
    if (
      isLocalImagePath(value) &&
      (!key || IMAGE_PATH_HINT_KEYS.has(key) || isPathLikeValue(value.trim()))
    ) {
      paths.add(value.trim())
    }
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectImagePathsFromParsedOutput(entry, paths, key)
    }
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    collectImagePathsFromParsedOutput(entryValue, paths, entryKey)
  }
}

function collectFlagOutputPaths(args: string[]): string[] {
  const paths: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!IMAGE_OUTPUT_FLAGS.has(arg)) {
      continue
    }

    const value = args[index + 1]
    if (value && isLocalImagePath(value)) {
      paths.push(value)
    }
  }

  return paths
}

export function extractAgentBrowserImagePaths(
  command: ParsedAgentBrowserCommand,
  parsedOutput: unknown
): string[] {
  const paths = new Set<string>()

  collectImagePathsFromParsedOutput(parsedOutput, paths)

  if (command.command === 'screenshot') {
    const screenshotArgs = command.args.filter((arg) => isLocalImagePath(arg))
    if (screenshotArgs.length > 0) {
      paths.add(screenshotArgs.at(-1)!)
    }
  }

  if (command.command === 'diff' && command.args[0] === 'screenshot') {
    for (const outputPath of collectFlagOutputPaths(command.args.slice(1))) {
      paths.add(outputPath)
    }
  }

  return Array.from(paths)
}

export function normalizeCliEnvironment(
  cliEnvironment: AgentBrowserExecuteParams['cliEnvironment']
): Record<string, string> {
  if (!cliEnvironment) {
    return {}
  }

  if (Array.isArray(cliEnvironment)) {
    return cliEnvironment.reduce<Record<string, string>>((acc, row) => {
      const key =
        typeof row?.cells === 'object' && row?.cells !== null && 'Key' in row.cells
          ? String(row.cells.Key || '').trim()
          : String(row?.Key || '').trim()

      const value =
        typeof row?.cells === 'object' && row?.cells !== null && 'Value' in row.cells
          ? row.cells.Value
          : row?.Value

      if (key) {
        acc[key] = value == null ? '' : String(value)
      }

      return acc
    }, {})
  }

  if (typeof cliEnvironment === 'object') {
    return Object.entries(cliEnvironment).reduce<Record<string, string>>((acc, [key, value]) => {
      const normalizedKey = key.trim()
      if (normalizedKey) {
        acc[normalizedKey] = value == null ? '' : String(value)
      }
      return acc
    }, {})
  }

  return {}
}

export function normalizeHeaders(
  headers: AgentBrowserExecuteParams['headers']
): string | undefined {
  if (!headers) {
    return undefined
  }

  if (typeof headers === 'string') {
    const trimmed = headers.trim()
    if (!trimmed) {
      return undefined
    }

    const parsed = JSON.parse(trimmed)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('Headers must be a JSON object')
    }

    return JSON.stringify(parsed)
  }

  if (typeof headers === 'object') {
    return JSON.stringify(headers)
  }

  return undefined
}

export function getCommandTimeoutMs(timeoutMs: AgentBrowserExecuteParams['timeoutMs']): number {
  const defaultTimeout = DEFAULT_EXECUTION_TIMEOUT_MS

  if (timeoutMs == null || timeoutMs === '') {
    return defaultTimeout
  }

  const parsed = typeof timeoutMs === 'number' ? timeoutMs : Number.parseInt(String(timeoutMs), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultTimeout
  }

  return Math.min(parsed, getMaxExecutionTimeout())
}

export function buildGlobalCliArgs(params: AgentBrowserExecuteParams): string[] {
  const args = ['--json']

  if (params.session?.trim()) {
    args.push('--session', params.session.trim())
  }

  if (params.provider?.trim() && params.provider.trim() !== 'local') {
    args.push('--provider', params.provider.trim())
  }

  if (params.headed) {
    args.push('--headed')
  }

  if (params.profile?.trim()) {
    args.push('--profile', params.profile.trim())
  }

  if (params.executablePath?.trim()) {
    args.push('--executable-path', params.executablePath.trim())
  }

  if (params.cdp?.trim()) {
    args.push('--cdp', params.cdp.trim())
  }

  if (params.autoConnect) {
    args.push('--auto-connect')
  }

  if (params.userAgent?.trim()) {
    args.push('--user-agent', params.userAgent.trim())
  }

  if (params.proxy?.trim()) {
    args.push('--proxy', params.proxy.trim())
  }

  const normalizedHeaders = normalizeHeaders(params.headers)
  if (normalizedHeaders) {
    args.push('--headers', normalizedHeaders)
  }

  if (params.browserArgs?.trim()) {
    args.push('--args', params.browserArgs.trim())
  }

  if (params.allowFileAccess) {
    args.push('--allow-file-access')
  }

  if (params.ignoreHttpsErrors) {
    args.push('--ignore-https-errors')
  }

  if (params.debug) {
    args.push('--debug')
  }

  return args
}

export function parseStructuredStdout(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch (_error) {
    const lines = trimmed.split(/\r?\n/).reverse()
    for (const line of lines) {
      try {
        return JSON.parse(line)
      } catch (_innerError) {}
    }
  }

  return trimmed
}
