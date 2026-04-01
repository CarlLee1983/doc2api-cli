import { describe, expect, test } from 'bun:test'
import { runSession } from '../../src/commands/session'

describe('runSession', () => {
  test('missing subcommand returns error', async () => {
    const result = await runSession(undefined, [], {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E2001')
    }
  })

  test('unknown subcommand returns error', async () => {
    const result = await runSession('unknown', [], {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('Unknown session subcommand')
    }
  })

  test('submit without file or stdin returns error', async () => {
    const result = await runSession('submit', [], {})
    expect(result.ok).toBe(false)
  })
})
