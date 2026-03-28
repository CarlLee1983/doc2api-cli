import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { runInspect } from '../../src/commands/inspect'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

describe('E2E: PDF pipeline', () => {
  test('inspect produces valid chunks with required fields', async () => {
    const pdfPath = resolve(FIXTURE_DIR, 'simple-api.pdf')
    const result = await runInspect(pdfPath, { json: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Every chunk has required fields
    for (const chunk of result.data.chunks) {
      expect(chunk.id).toBeTruthy()
      expect(chunk.page).toBeGreaterThan(0)
      expect(chunk.type).toBeTruthy()
      expect(chunk.confidence).toBeGreaterThanOrEqual(0)
      expect(chunk.confidence).toBeLessThanOrEqual(1)
      expect(typeof chunk.raw_text).toBe('string')
    }

    // Stats are consistent
    expect(result.data.stats.total_chunks).toBe(result.data.chunks.length)
    const typeSum = Object.values(result.data.stats.by_type).reduce((a, b) => a + b, 0)
    expect(typeSum).toBe(result.data.chunks.length)

    // Language detection works
    expect(['en', 'zh-TW']).toContain(result.data.language)
  })
})
