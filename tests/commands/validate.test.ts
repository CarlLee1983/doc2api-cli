import { describe, expect, test } from 'bun:test'
import { runValidate } from '../../src/commands/validate'
import { resolve } from 'node:path'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

describe('runValidate()', () => {
  test('validates a valid spec file', async () => {
    const specPath = resolve(FIXTURE_DIR, 'valid-spec.json')
    await Bun.write(
      specPath,
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: { '/test': { get: { responses: { '200': { description: 'OK' } } } } },
      }),
    )
    const result = await runValidate(specPath, { json: true })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.valid).toBe(true)
  })

  test('returns error for non-existent file', async () => {
    const result = await runValidate('/no/such/file.json', { json: true })
    expect(result.ok).toBe(false)
  })
})
