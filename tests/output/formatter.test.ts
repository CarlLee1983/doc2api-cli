import { describe, expect, test } from 'bun:test'
import { formatOutput } from '../../src/output/formatter'
import { fail, ok } from '../../src/output/result'

describe('formatOutput()', () => {
  test('json mode returns JSON string', () => {
    const result = ok({ count: 42 })
    const output = formatOutput(result, true)
    expect(JSON.parse(output)).toEqual({ ok: true, data: { count: 42 } })
  })

  test('json mode for errors returns JSON string', () => {
    const result = fail('E1001', 'TEST', 'test error')
    const output = formatOutput(result, true)
    const parsed = JSON.parse(output)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('E1001')
  })

  test('human mode for success returns readable text', () => {
    const result = ok({ source: 'test.pdf', pages: 5, chunks: [] })
    const output = formatOutput(result, false)
    expect(output).toContain('test.pdf')
  })

  test('human mode for error returns readable text', () => {
    const result = fail('E1001', 'EXTRACT_FAILED', 'Cannot extract text', {
      suggestion: 'Try OCR first',
    })
    const output = formatOutput(result, false)
    expect(output).toContain('Cannot extract text')
    expect(output).toContain('Try OCR first')
  })
})
