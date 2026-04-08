import type {
  AgentBrowserExecuteParams,
  AgentBrowserExecuteResponse,
} from '@/tools/agent_browser/types'
import { AGENT_BROWSER_RESULTS_OUTPUT } from '@/tools/agent_browser/types'
import type { ToolConfig } from '@/tools/types'

export const agentBrowserExecuteTool: ToolConfig<
  AgentBrowserExecuteParams,
  AgentBrowserExecuteResponse
> = {
  id: 'agent_browser_execute',
  name: 'Agent Browser CLI',
  description: 'Run an agent-browser CLI script to automate browser tasks',
  version: '1.0.0',

  params: {
    script: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Multiline agent-browser CLI script to execute',
    },
    session: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Optional session name shared across commands',
    },
    provider: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Optional remote provider such as browserbase or browseruse',
    },
    cliEnvironment: {
      type: 'json',
      required: false,
      visibility: 'user-only',
      description:
        'Environment variables passed to the CLI process, including API keys from workflow env refs',
    },
    headed: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Launch the browser in headed mode',
    },
    profile: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Persistent browser profile path',
    },
    executablePath: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Custom Chrome or Chromium executable path',
    },
    cdp: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Connect to an existing browser via CDP WebSocket URL',
    },
    autoConnect: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Auto-connect to an existing agent-browser session when possible',
    },
    userAgent: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Override the browser user agent string',
    },
    proxy: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Proxy server URL to use for browser traffic',
    },
    headers: {
      type: 'json',
      required: false,
      visibility: 'user-only',
      description: 'Default HTTP headers applied to requests as a JSON object',
    },
    browserArgs: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Additional browser launch args passed via --args',
    },
    timeoutMs: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Per-command timeout in milliseconds',
    },
    allowFileAccess: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Allow file:// URL access in the browser',
    },
    ignoreHttpsErrors: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Ignore HTTPS certificate errors',
    },
    debug: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Enable verbose CLI debug logging',
    },
  },

  request: {
    url: '/api/tools/agent_browser/execute',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => ({
      script: params.script,
      session: params.session?.trim() || undefined,
      provider: params.provider?.trim() || undefined,
      cliEnvironment: params.cliEnvironment,
      headed: params.headed ?? false,
      profile: params.profile?.trim() || undefined,
      executablePath: params.executablePath?.trim() || undefined,
      cdp: params.cdp?.trim() || undefined,
      autoConnect: params.autoConnect ?? false,
      userAgent: params.userAgent?.trim() || undefined,
      proxy: params.proxy?.trim() || undefined,
      headers: params.headers,
      browserArgs: params.browserArgs?.trim() || undefined,
      timeoutMs: params.timeoutMs,
      allowFileAccess: params.allowFileAccess ?? false,
      ignoreHttpsErrors: params.ignoreHttpsErrors ?? false,
      debug: params.debug ?? false,
      workspaceId: params._context?.workspaceId,
      workflowId: params._context?.workflowId,
      executionId: params._context?.executionId,
    }),
  },

  transformResponse: async (response) => {
    return (await response.json()) as AgentBrowserExecuteResponse
  },

  outputs: {
    success: {
      type: 'boolean',
      description: 'Whether the full agent-browser script completed successfully',
    },
    session: {
      type: 'string',
      description: 'Session name used for the run when provided',
      optional: true,
    },
    commandCount: {
      type: 'number',
      description: 'Number of CLI commands executed from the script',
    },
    finalResult: {
      type: 'json',
      description: 'Structured output from the last command when available',
    },
    imageFile: {
      type: 'file',
      description: 'Latest screenshot or diff image captured during the script',
      optional: true,
    },
    imageFiles: {
      type: 'file[]',
      description: 'All screenshot and diff images captured during the script',
      optional: true,
    },
    results: AGENT_BROWSER_RESULTS_OUTPUT,
  },
}
