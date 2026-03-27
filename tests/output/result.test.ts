import { describe, expect, test } from 'bun:test'
import { fail, ok } from '../../src/output/result'

describe('ok()', () => {
  test('wraps data in success result', () => {
    const result = ok({ name: 'test' })
    expect(result).toEqual({ ok: true, data: { name: 'test' } })
  })

  test('preserves complex data structure', () => {
    const data = { chunks: [{ id: '1', type: 'endpoint_definition' }], stats: { total: 1 } }
    const result = ok(data)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.chunks).toHaveLength(1)
    }
  })
})

describe('fail()', () => {
  test('wraps error in fail result', () => {
    const result = fail('E1001', 'EXTRACT_FAILED', 'Cannot extract text')
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'E1001',
        type: 'EXTRACT_FAILED',
        message: 'Cannot extract text',
      },
    })
  })

  test('includes optional suggestion and context', () => {
    const result = fail('E1002', 'FILE_NOT_FOUND', 'File not found', {
      suggestion: 'Check the file path',
      context: { file: 'test.pdf' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.suggestion).toBe('Check the file path')
      expect(result.error.context).toEqual({ file: 'test.pdf' })
    }
  })
})
