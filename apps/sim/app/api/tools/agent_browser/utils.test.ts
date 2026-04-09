/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildGlobalCliArgs,
  extractAgentBrowserImagePaths,
  normalizeCliEnvironment,
  normalizeHeaders,
  parseAgentBrowserScript,
  tokenizeCliLine,
} from '@/app/api/tools/agent_browser/utils'

describe('agent browser utils', () => {
  it('tokenizes quoted CLI arguments', () => {
    expect(tokenizeCliLine(`fill @e3 "test@example.com"`)).toEqual([
      'fill',
      '@e3',
      'test@example.com',
    ])
  })

  it('parses scripts and strips the agent-browser prefix', () => {
    expect(
      parseAgentBrowserScript(`
        # comment
        agent-browser open https://example.com
        snapshot -i --compact
      `)
    ).toEqual([
      {
        raw: 'agent-browser open https://example.com',
        command: 'open',
        args: ['https://example.com'],
      },
      {
        raw: 'snapshot -i --compact',
        command: 'snapshot',
        args: ['-i', '--compact'],
      },
    ])
  })

  it('rejects unsupported commands', () => {
    expect(() => parseAgentBrowserScript('install')).toThrow('Unsupported agent-browser command')
  })

  it('normalizes CLI environment tables', () => {
    expect(
      normalizeCliEnvironment([
        {
          cells: {
            Key: 'BROWSERBASE_API_KEY',
            Value: 'secret',
          },
        },
      ])
    ).toEqual({
      BROWSERBASE_API_KEY: 'secret',
    })
  })

  it('normalizes headers and global CLI args', () => {
    expect(normalizeHeaders({ Authorization: 'Bearer token' })).toBe(
      '{"Authorization":"Bearer token"}'
    )

    expect(
      buildGlobalCliArgs({
        script: 'open https://example.com',
        session: 'checkout-flow',
        provider: 'browserbase',
        headers: { Authorization: 'Bearer token' },
        headed: true,
      })
    ).toEqual([
      '--json',
      '--session',
      'checkout-flow',
      '--provider',
      'browserbase',
      '--headed',
      '--headers',
      '{"Authorization":"Bearer token"}',
    ])
  })

  it('extracts screenshot image paths from parsed output and args', () => {
    expect(
      extractAgentBrowserImagePaths(
        {
          raw: 'screenshot page.png',
          command: 'screenshot',
          args: ['page.png'],
        },
        { path: './artifacts/page.png' }
      )
    ).toEqual(['./artifacts/page.png', 'page.png'])
  })

  it('extracts diff screenshot output paths from output flags', () => {
    expect(
      extractAgentBrowserImagePaths(
        {
          raw: 'diff screenshot before.png after.png --output diff.png',
          command: 'diff',
          args: ['screenshot', 'before.png', 'after.png', '--output', 'diff.png'],
        },
        null
      )
    ).toEqual(['diff.png'])
  })
})
