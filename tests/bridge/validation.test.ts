import { describe, expect, test } from 'bun:test'
import { validateFilePath, validatePages } from '../../src/bridge/pdfplumber'

describe('validatePages()', () => {
  test('accepts single page number', () => {
    expect(validatePages('5')).toBeNull()
  })

  test('accepts page range', () => {
    expect(validatePages('1-10')).toBeNull()
  })

  test('rejects non-numeric input', () => {
    expect(validatePages('abc')).toContain('Invalid pages format')
  })

  test('rejects shell injection attempts', () => {
    expect(validatePages('1; rm -rf /')).toContain('Invalid pages format')
  })

  test('rejects empty-like patterns', () => {
    expect(validatePages('1-2-3')).toContain('Invalid pages format')
  })

  test('rejects spaces', () => {
    expect(validatePages('1 -10')).toContain('Invalid pages format')
  })
})

describe('validateFilePath()', () => {
  test('accepts normal file path', () => {
    expect(validateFilePath('/tmp/doc.pdf')).toBeNull()
  })

  test('accepts relative file path without traversal', () => {
    expect(validateFilePath('docs/spec.json')).toBeNull()
  })

  test('rejects null bytes', () => {
    expect(validateFilePath('/tmp/file\0.pdf')).toContain('null bytes')
  })

  test('rejects path traversal', () => {
    expect(validateFilePath('../../../etc/passwd')).toContain('path traversal')
  })

  test('rejects embedded path traversal', () => {
    expect(validateFilePath('/tmp/docs/../../../etc/shadow')).toContain('path traversal')
  })
})
