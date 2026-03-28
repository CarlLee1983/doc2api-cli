import { describe, expect, test } from 'bun:test'
import { extractHtml } from '../../src/pipeline/extract-html'

describe('extractHtml', () => {
  test('extracts RawPages from a single URL serving static HTML', async () => {
    const html = `
      <html><body>
        <h1>API Documentation</h1>
        <h2>GET /users</h2>
        <p>Returns a list of users.</p>
        <table>
          <thead><tr><th>Name</th><th>Type</th></tr></thead>
          <tbody><tr><td>page</td><td>integer</td></tr></tbody>
        </table>
      </body></html>
    `
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(html, { headers: { 'content-type': 'text/html' } })
      },
    })

    try {
      const result = await extractHtml({
        urls: [`http://localhost:${server.port}/`],
        allowPrivate: true,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        // With heading splitting: h1 + h2 = 2 pages per URL
        expect(result.data.rawPages).toHaveLength(2)
        const allText = result.data.rawPages.map((p) => p.text).join(' ')
        expect(allText).toContain('GET /users')
        const allTables = result.data.rawPages.flatMap((p) => p.tables)
        expect(allTables).toHaveLength(1)
        expect(result.data.pages).toBe(2)
        expect(result.data.hasTables).toBe(true)
      }
    } finally {
      server.stop()
    }
  })

  test('extracts RawPages from multiple URLs', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === '/users') {
          return new Response('<html><body><h1>Users API</h1><h2>GET /users</h2></body></html>', {
            headers: { 'content-type': 'text/html' },
          })
        }
        return new Response('<html><body><h1>Orders API</h1><h2>GET /orders</h2></body></html>', {
          headers: { 'content-type': 'text/html' },
        })
      },
    })

    try {
      const result = await extractHtml({
        urls: [`http://localhost:${server.port}/users`, `http://localhost:${server.port}/orders`],
        allowPrivate: true,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        // With heading splitting: each URL (h1+h2) produces 2 pages → 4 total
        expect(result.data.rawPages).toHaveLength(4)
        expect(result.data.rawPages[0].pageNumber).toBe(1)
        expect(result.data.rawPages[3].pageNumber).toBe(4)
        expect(result.data.pages).toBe(4)
      }
    } finally {
      server.stop()
    }
  })

  test('returns fail for empty URL list', async () => {
    const result = await extractHtml({ urls: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E5005')
    }
  })
})
