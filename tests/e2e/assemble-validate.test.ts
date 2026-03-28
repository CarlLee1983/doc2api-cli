import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { runAssemble } from '../../src/commands/assemble'
import { runValidate } from '../../src/commands/validate'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

describe('E2E: assemble → validate', () => {
  test('assembles fixture JSON into valid OpenAPI spec', async () => {
    const inputPath = resolve(FIXTURE_DIR, 'sample-endpoints.json')

    // Step 1: Assemble
    const assembleResult = await runAssemble(inputPath, {
      json: true,
      stdin: false,
      format: 'json',
    })

    expect(assembleResult.ok).toBe(true)
    if (!assembleResult.ok) return

    expect(assembleResult.data.endpointCount).toBe(2)
    expect(assembleResult.data.pathCount).toBe(1) // /users has GET + POST
    expect(assembleResult.data.spec.openapi).toBe('3.0.3')
    expect(assembleResult.data.spec.info.title).toBe('Sample API')

    // Step 2: Write spec to temp file
    const tmpFile = join(tmpdir(), `doc2api-e2e-${Date.now()}.json`)
    await Bun.write(tmpFile, JSON.stringify(assembleResult.data.spec, null, 2))

    // Step 3: Validate
    const validateResult = await runValidate(tmpFile, { json: true })

    expect(validateResult.ok).toBe(true)
    if (!validateResult.ok) return
    expect(validateResult.data.valid).toBe(true)

    // Cleanup
    const { unlinkSync } = await import('node:fs')
    try {
      unlinkSync(tmpFile)
    } catch {}
  })

  test('assemble rejects empty endpoints', async () => {
    const tmpFile = join(tmpdir(), `doc2api-e2e-empty-${Date.now()}.json`)
    await Bun.write(
      tmpFile,
      JSON.stringify({
        info: { title: 'Empty', version: '1.0.0' },
        endpoints: [],
      }),
    )

    const result = await runAssemble(tmpFile, { json: true, stdin: false, format: 'json' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('MISSING_FIELDS')
    }

    const { unlinkSync } = await import('node:fs')
    try {
      unlinkSync(tmpFile)
    } catch {}
  })
})
