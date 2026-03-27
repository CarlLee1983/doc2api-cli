import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { runInspect } from '../../src/commands/inspect'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

describe('runInspect()', () => {
  test('returns structured result for a valid PDF', async () => {
    const pdfPath = resolve(FIXTURE_DIR, 'simple-api.pdf')
    const result = await runInspect(pdfPath, { json: true })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.source).toContain('simple-api.pdf')
      expect(result.data.pages).toBeGreaterThan(0)
      expect(result.data.chunks).toBeDefined()
      expect(result.data.stats).toBeDefined()
      expect(result.data.stats.total_chunks).toBe(result.data.chunks.length)
    }
  })

  test('returns error for non-existent file', async () => {
    const result = await runInspect('/no/such/file.pdf', { json: true })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('FILE_NOT_FOUND')
    }
  })

  test('stats by_type sums to total_chunks', async () => {
    const pdfPath = resolve(FIXTURE_DIR, 'simple-api.pdf')
    const result = await runInspect(pdfPath, { json: true })

    if (result.ok) {
      const sum = Object.values(result.data.stats.by_type).reduce((a, b) => a + b, 0)
      expect(sum).toBe(result.data.stats.total_chunks)
    }
  })
})
