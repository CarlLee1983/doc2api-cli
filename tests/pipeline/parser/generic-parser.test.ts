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
    // With heading splitting: h1 + h2 = 2 pages
    expect(pages.length).toBeGreaterThanOrEqual(1)
    expect(pages[0].pageNumber).toBe(1)
    const allText = pages.map((p) => p.text).join(' ')
    expect(allText).toContain('GET /users')
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

describe('generic parser — heading splitting', () => {
  test('splits content by h1-h6 headings into separate pages', () => {
    const html = `<html><body>
      <h1>Authentication</h1>
      <p>Use Bearer token for auth.</p>
      <h2>Endpoints</h2>
      <p>POST /api/users — Create user</p>
      <h2>Errors</h2>
      <p>400 Bad Request</p>
    </body></html>`

    const pages = genericParser.parse(html, 'https://example.com')
    expect(pages.length).toBe(3)
    expect(pages[0].text).toContain('Authentication')
    expect(pages[0].text).toContain('Bearer token')
    expect(pages[1].text).toContain('Endpoints')
    expect(pages[2].text).toContain('Errors')
  })

  test('returns single page when no headings found', () => {
    const html = '<html><body><p>Just a paragraph.</p></body></html>'
    const pages = genericParser.parse(html, 'https://example.com')
    expect(pages.length).toBe(1)
    expect(pages[0].text).toContain('Just a paragraph')
  })
})

describe('generic parser — table without thead', () => {
  test('extracts table using first row as headers when no thead', () => {
    const html = `<html><body>
      <table>
        <tr><td>Name</td><td>Type</td><td>Required</td></tr>
        <tr><td>user_id</td><td>string</td><td>yes</td></tr>
        <tr><td>email</td><td>string</td><td>no</td></tr>
      </table>
    </body></html>`

    const pages = genericParser.parse(html, 'https://example.com')
    const tables = pages.flatMap((p) => p.tables)
    expect(tables.length).toBe(1)
    expect(tables[0].headers).toEqual(['Name', 'Type', 'Required'])
    expect(tables[0].rows.length).toBe(2)
    expect(tables[0].rows[0]).toEqual(['user_id', 'string', 'yes'])
  })
})

describe('generic parser — code blocks', () => {
  test('preserves code block content in text output', () => {
    const html = `<html><body>
      <h2>Response Example</h2>
      <pre><code>{"id": "123", "status": "active"}</code></pre>
    </body></html>`

    const pages = genericParser.parse(html, 'https://example.com')
    const text = pages.map((p) => p.text).join(' ')
    expect(text).toContain('{"id": "123", "status": "active"}')
  })
})
