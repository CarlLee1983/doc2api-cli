import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { MAX_PDF_SIZE_MB, extractText, parsePageRange } from '../../src/pipeline/extract'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

describe('extractText()', () => {
  test('extracts text from a simple PDF', async () => {
    const pdfPath = resolve(FIXTURE_DIR, 'simple-api.pdf')
    const result = await extractText(pdfPath)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.pages).toBeGreaterThan(0)
      expect(result.data.rawPages).toHaveLength(result.data.pages)
      expect(result.data.rawPages[0].text).toBeTruthy()
    }
  })

  test('returns error for non-existent file', async () => {
    const result = await extractText('/nonexistent/file.pdf')
    expect(result.ok).toBe(false)
  })

  test('returns error for non-PDF file', async () => {
    const tmpFile = resolve(FIXTURE_DIR, 'not-a-pdf.txt')
    await Bun.write(tmpFile, 'This is not a PDF')
    const result = await extractText(tmpFile)
    expect(result.ok).toBe(false)
  })

  test('returns FILE_TOO_LARGE error when file exceeds maxFileSizeMb', async () => {
    // Write a fake PDF header + enough bytes to exceed 1MB limit
    const tmpFile = resolve(FIXTURE_DIR, 'large-fake.pdf')
    const oneMb = 1024 * 1024
    const header = new TextEncoder().encode('%PDF-1.4 ')
    const padding = new Uint8Array(oneMb + 1).fill(0x20)
    const content = new Uint8Array(header.length + padding.length)
    content.set(header)
    content.set(padding, header.length)
    await Bun.write(tmpFile, content)

    const result = await extractText(tmpFile, { maxFileSizeMb: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('FILE_TOO_LARGE')
    }
  })

  test('accepts file within maxFileSizeMb limit', async () => {
    // The simple-api.pdf fixture should be well within a large limit
    const pdfPath = resolve(FIXTURE_DIR, 'simple-api.pdf')
    const result = await extractText(pdfPath, { maxFileSizeMb: MAX_PDF_SIZE_MB })
    expect(result.ok).toBe(true)
  })
})

describe('parsePageRange()', () => {
  test('parses a range: 3-7 with 10 pages', () => {
    expect(parsePageRange('3-7', 10)).toEqual([3, 4, 5, 6, 7])
  })

  test('parses a single page: 5 with 10 pages', () => {
    expect(parsePageRange('5', 10)).toEqual([5])
  })

  test('clamps end to totalPages: 8-15 with 10 pages', () => {
    expect(parsePageRange('8-15', 10)).toEqual([8, 9, 10])
  })

  test('handles 1-1 range with 5 pages', () => {
    expect(parsePageRange('1-1', 5)).toEqual([1])
  })

  test('returns empty array for invalid format', () => {
    expect(parsePageRange('invalid', 10)).toEqual([])
  })

  test('clamps start to 1 when start is 0', () => {
    expect(parsePageRange('0-3', 10)).toEqual([1, 2, 3])
  })
})
