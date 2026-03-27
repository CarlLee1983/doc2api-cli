import { describe, expect, test } from 'bun:test'
import { genericParser } from '../../../src/pipeline/parser/generic-parser'

describe('genericParser', () => {
  test('has name "generic"', () => {
    expect(genericParser.name).toBe('generic')
  })

  test('detect always returns true', () => {
    expect(genericParser.detect('<html></html>')).toBe(true)
  })

  test('extracts text content from HTML', () => {
    const html = `
      <html><body>
        <nav>Navigation</nav>
        <main>
          <h1>API Documentation</h1>
          <h2>GET /users</h2>
          <p>Returns a list of users.</p>
        </main>
        <footer>Footer</footer>
      </body></html>
    `
    const pages = genericParser.parse(html, 'https://example.com/docs')
    expect(pages).toHaveLength(1)
    expect(pages[0].pageNumber).toBe(1)
    expect(pages[0].text).toContain('GET /users')
  })

  test('extracts tables as Table structures', () => {
    const html = `
      <html><body><main>
        <h1>API</h1>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Required</th></tr></thead>
          <tbody>
            <tr><td>page</td><td>integer</td><td>No</td></tr>
            <tr><td>limit</td><td>integer</td><td>No</td></tr>
          </tbody>
        </table>
      </main></body></html>
    `
    const pages = genericParser.parse(html, 'https://example.com/docs')
    expect(pages[0].tables).toHaveLength(1)
    expect(pages[0].tables[0].headers).toEqual(['Name', 'Type', 'Required'])
    expect(pages[0].tables[0].rows).toEqual([
      ['page', 'integer', 'No'],
      ['limit', 'integer', 'No'],
    ])
  })

  test('handles HTML with no tables', () => {
    const html = '<html><body><p>No tables here</p></body></html>'
    const pages = genericParser.parse(html, 'https://example.com')
    expect(pages[0].tables).toEqual([])
  })
})
