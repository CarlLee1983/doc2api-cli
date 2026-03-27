import { describe, expect, test } from 'bun:test'
import { fetchHtml } from '../../../src/pipeline/fetcher/http-fetcher'

describe('fetchHtml', () => {
  test('returns fail for invalid URL', async () => {
    const result = await fetchHtml('not-a-url')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E5001')
    }
  })

  test('returns fail for unreachable host', async () => {
    const result = await fetchHtml('http://localhost:19999/nonexistent', { allowPrivate: true })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E5001')
    }
  })

  test('blocks private/internal addresses by default', async () => {
    const result = await fetchHtml('http://localhost:19999/')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('SSRF_BLOCKED')
    }
  })

  test('fetches HTML from a local server', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('<html><body><h1>Hello</h1></body></html>', {
          headers: { 'content-type': 'text/html' },
        })
      },
    })

    try {
      const result = await fetchHtml(`http://localhost:${server.port}/`, { allowPrivate: true })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.html).toContain('<h1>Hello</h1>')
        expect(result.data.url).toBe(`http://localhost:${server.port}/`)
      }
    } finally {
      server.stop()
    }
  })

  test('follows redirects', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === '/old') {
          return Response.redirect(`http://localhost:${server.port}/new`, 301)
        }
        return new Response('<html><body>Redirected</body></html>', {
          headers: { 'content-type': 'text/html' },
        })
      },
    })

    try {
      const result = await fetchHtml(`http://localhost:${server.port}/old`, { allowPrivate: true })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.html).toContain('Redirected')
      }
    } finally {
      server.stop()
    }
  })
})
