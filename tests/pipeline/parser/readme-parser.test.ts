import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readmeParser } from '../../../src/pipeline/parser/readme-parser'

const fixture = readFileSync(
  resolve(import.meta.dir, '../../fixtures/html/readme-doc.html'),
  'utf-8',
)

describe('readmeParser', () => {
  test('has name "readme"', () => {
    expect(readmeParser.name).toBe('readme')
  })

  test('detects ReadMe.io HTML', () => {
    expect(readmeParser.detect(fixture)).toBe(true)
  })

  test('does not detect non-ReadMe HTML', () => {
    expect(readmeParser.detect('<html><body>Plain</body></html>')).toBe(false)
  })

  test('extracts endpoint method and path', () => {
    const pages = readmeParser.parse(fixture, 'https://docs.example.com/api/get-user')
    expect(pages).toHaveLength(1)
    expect(pages[0].text).toContain('GET')
    expect(pages[0].text).toContain('/api/v1/users/{id}')
  })

  test('extracts parameter tables', () => {
    const pages = readmeParser.parse(fixture, 'https://docs.example.com/api/get-user')
    expect(pages[0].tables.length).toBeGreaterThanOrEqual(1)
    expect(pages[0].tables[0].headers).toContain('Name')
    expect(pages[0].tables[0].headers).toContain('Type')
  })

  test('extracts response examples', () => {
    const pages = readmeParser.parse(fixture, 'https://docs.example.com/api/get-user')
    expect(pages[0].text).toContain('"id"')
    expect(pages[0].text).toContain('Alice')
  })
})
