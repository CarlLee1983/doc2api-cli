import { describe, expect, test } from 'bun:test'
import { validateSpec } from '../../src/validators/openapi-validator'

describe('validateSpec()', () => {
  test('passes a valid OpenAPI spec', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test': { get: { responses: { '200': { description: 'OK' } } } },
      },
    }
    const result = await validateSpec(spec)
    expect(result.ok).toBe(true)
  })

  test('returns valid=false for invalid spec (missing info)', async () => {
    const spec = { openapi: '3.0.3', paths: {} }
    const result = await validateSpec(spec)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.valid).toBe(false)
      expect(result.data.errors.length).toBeGreaterThan(0)
    }
  })
})
