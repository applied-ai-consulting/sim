import type { UserFile } from '@/executor/types'
import type {
  OutputProperty,
  ToolFileData,
  ToolResponse,
  WorkflowToolExecutionContext,
} from '@/tools/types'

export interface AgentBrowserExecuteParams {
  script: string
  session?: string
  provider?: string
  cliEnvironment?: Record<string, string> | Array<Record<string, unknown>>
  headed?: boolean
  profile?: string
  executablePath?: string
  cdp?: string
  autoConnect?: boolean
  userAgent?: string
  proxy?: string
  headers?: Record<string, string> | string
  browserArgs?: string
  timeoutMs?: number | string
  allowFileAccess?: boolean
  ignoreHttpsErrors?: boolean
  debug?: boolean
  _context?: WorkflowToolExecutionContext
}

export interface AgentBrowserCommandResult {
  command: string
  argv: string[]
  success: boolean
  exitCode: number
  stdout: string
  stderr?: string
  parsedOutput?: unknown
}

export type AgentBrowserOutputImageFile = UserFile | ToolFileData

export interface AgentBrowserExecuteOutput {
  success: boolean
  session: string | null
  commandCount: number
  finalResult: unknown
  results: AgentBrowserCommandResult[]
  imageFile?: AgentBrowserOutputImageFile | null
  imageFiles?: AgentBrowserOutputImageFile[]
}

export interface AgentBrowserExecuteResponse extends ToolResponse {
  output: AgentBrowserExecuteOutput
}

export const AGENT_BROWSER_COMMAND_RESULT_OUTPUT_PROPERTIES = {
  command: {
    type: 'string',
    description: 'The agent-browser subcommand that was executed',
  },
  argv: {
    type: 'array',
    description: 'Resolved argument vector passed to the CLI for this step',
    items: {
      type: 'string',
      description: 'Individual CLI argument',
    },
  },
  success: {
    type: 'boolean',
    description: 'Whether this command completed successfully',
  },
  exitCode: {
    type: 'number',
    description: 'Process exit code returned by the CLI',
  },
  stdout: {
    type: 'string',
    description: 'Raw standard output emitted by the CLI',
  },
  stderr: {
    type: 'string',
    description: 'Raw standard error emitted by the CLI',
    optional: true,
  },
  parsedOutput: {
    type: 'json',
    description: 'Structured JSON parsed from stdout when available',
    optional: true,
  },
} as const satisfies Record<string, OutputProperty>

export const AGENT_BROWSER_COMMAND_RESULT_OUTPUT: OutputProperty = {
  type: 'object',
  description: 'Result for a single agent-browser command execution',
  properties: AGENT_BROWSER_COMMAND_RESULT_OUTPUT_PROPERTIES,
}

export const AGENT_BROWSER_RESULTS_OUTPUT: OutputProperty = {
  type: 'array',
  description: 'Sequential results for each command in the script',
  items: {
    type: 'object',
    properties: AGENT_BROWSER_COMMAND_RESULT_OUTPUT_PROPERTIES,
  },
}
