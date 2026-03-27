import { describe, expect, test } from 'bun:test'
import { runDoctor } from '../../src/commands/doctor'

describe('runDoctor()', () => {
  test('returns environment status', async () => {
    const result = await runDoctor()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveProperty('pdf2apiVersion')
      expect(result.data).toHaveProperty('python')
      expect(result.data).toHaveProperty('pdfplumber')
      expect(result.data.checks).toBeInstanceOf(Array)
    }
  })

  test('includes all required checks', async () => {
    const result = await runDoctor()
    if (result.ok) {
      const checkNames = result.data.checks.map((c) => c.name)
      expect(checkNames).toContain('pdf2api')
      expect(checkNames).toContain('python3')
      expect(checkNames).toContain('pdfplumber')
    }
  })
})
