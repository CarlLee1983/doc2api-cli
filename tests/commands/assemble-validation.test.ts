import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { runAssemble } from '../../src/commands/assemble'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

describe('runAssemble() input validation', () => {
  test('rejects JSON missing info.title', async () => {
    const tmpFile = resolve(FIXTURE_DIR, 'bad-input.json')
    await Bun.write(
      tmpFile,
      JSON.stringify({
        info: { version: '1.0' },
        endpoints: [{ path: '/a', method: 'get', responses: {} }],
      }),
    )
    const result = await runAssemble(tmpFile, { json: true, stdin: false, format: 'json' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('title')
  })

  test('rejects JSON missing info.version', async () => {
    const tmpFile = resolve(FIXTURE_DIR, 'bad-input.json')
    await Bun.write(
      tmpFile,
      JSON.stringify({
        info: { title: 'Test' },
        endpoints: [{ path: '/a', method: 'get', responses: {} }],
      }),
    )
    const result = await runAssemble(tmpFile, { json: true, stdin: false, format: 'json' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('version')
  })

  test('rejects JSON with empty endpoints', async () => {
    const tmpFile = resolve(FIXTURE_DIR, 'bad-input.json')
    await Bun.write(
      tmpFile,
      JSON.stringify({ info: { title: 'Test', version: '1.0' }, endpoints: [] }),
    )
    const result = await runAssemble(tmpFile, { json: true, stdin: false, format: 'json' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('endpoints')
  })

  test('rejects endpoint missing path', async () => {
    const tmpFile = resolve(FIXTURE_DIR, 'bad-input.json')
    await Bun.write(
      tmpFile,
      JSON.stringify({
        info: { title: 'Test', version: '1.0' },
        endpoints: [{ method: 'get', responses: {} }],
      }),
    )
    const result = await runAssemble(tmpFile, { json: true, stdin: false, format: 'json' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('path')
  })

  test('rejects endpoint missing method', async () => {
    const tmpFile = resolve(FIXTURE_DIR, 'bad-input.json')
    await Bun.write(
      tmpFile,
      JSON.stringify({
        info: { title: 'Test', version: '1.0' },
        endpoints: [{ path: '/a', responses: {} }],
      }),
    )
    const result = await runAssemble(tmpFile, { json: true, stdin: false, format: 'json' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('method')
  })
})
