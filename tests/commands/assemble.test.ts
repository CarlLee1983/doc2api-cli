import { describe, expect, test } from 'bun:test'
import { runAssemble } from '../../src/commands/assemble'
import { resolve } from 'node:path'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

describe('runAssemble()', () => {
  test('assembles endpoints file into OpenAPI spec', async () => {
    const inputPath = resolve(FIXTURE_DIR, 'sample-endpoints.json')
    const result = await runAssemble(inputPath, { json: true, stdin: false, format: 'json' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.spec.openapi).toBe('3.0.3')
      expect(result.data.spec.info.title).toBe('Sample API')
      expect(result.data.spec.paths['/users']).toBeDefined()
      expect(result.data.spec.paths['/users'].get).toBeDefined()
      expect(result.data.spec.paths['/users'].post).toBeDefined()
    }
  })

  test('returns error for invalid JSON file', async () => {
    const tmpFile = resolve(FIXTURE_DIR, 'bad-input.json')
    await Bun.write(tmpFile, 'not valid json{{{')
    const result = await runAssemble(tmpFile, { json: true, stdin: false, format: 'json' })
    expect(result.ok).toBe(false)
  })

  test('returns error for missing file', async () => {
    const result = await runAssemble('/no/such/file.json', { json: true, stdin: false, format: 'json' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.type).toBe('FILE_NOT_FOUND')
  })
})
