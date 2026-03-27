import { describe, expect, test } from 'bun:test'
import { runDoctor } from '../../src/commands/doctor'

describe('runDoctor()', () => {
  test('returns environment status', async () => {
    const result = await runDoctor()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveProperty('version')
      expect(result.data).toHaveProperty('python')
      expect(result.data).toHaveProperty('pdfplumber')
      expect(result.data).toHaveProperty('playwright')
      expect(result.data.checks).toBeInstanceOf(Array)
    }
  })

  test('includes all required checks', async () => {
    const result = await runDoctor()
    if (result.ok) {
      const checkNames = result.data.checks.map((c) => c.name)
      expect(checkNames).toContain('doc2api')
      expect(checkNames).toContain('python3')
      expect(checkNames).toContain('pdfplumber')
      expect(checkNames).toContain('cheerio')
      expect(checkNames).toContain('defuddle')
      expect(checkNames).toContain('playwright')
    }
  })
})
