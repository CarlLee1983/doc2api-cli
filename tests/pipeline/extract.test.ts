import { describe, expect, test } from 'bun:test'
import { extractText } from '../../src/pipeline/extract'
import { resolve } from 'node:path'

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
})
