import { describe, expect, test } from 'bun:test'
import { checkPdfplumber, getBridgePath } from '../../src/bridge/pdfplumber'

describe('getBridgePath()', () => {
  test('returns path to extract_tables.py', () => {
    const path = getBridgePath()
    expect(path).toContain('extract_tables.py')
  })
})

describe('checkPdfplumber()', () => {
  test('returns availability status', async () => {
    const result = await checkPdfplumber()
    expect(result).toHaveProperty('python')
    expect(result).toHaveProperty('pdfplumber')
    expect(typeof result.python).toBe('boolean')
    expect(typeof result.pdfplumber).toBe('boolean')
  })
})
