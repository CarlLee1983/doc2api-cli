import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '../..')

describe('build output', () => {
  test('dist/index.js exists after build', () => {
    expect(existsSync(resolve(ROOT, 'dist/index.js'))).toBe(true)
  })

  test('dist/lib.js exists after build', () => {
    expect(existsSync(resolve(ROOT, 'dist/lib.js'))).toBe(true)
  })
})
