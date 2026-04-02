import { describe, expect, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runScout } from '../../src/commands/scout'

// Pad HTML body text beyond 150 chars to avoid SPA detection triggering Playwright
const PADDING =
  'This is a documentation page with sufficient content to pass the SPA detector threshold value of one hundred and fifty characters. More padding text here to be safe and ensure we exceed the limit.'

function makeServer(routes: Record<string, string>) {
  return Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      const html = routes[path]
      if (html) {
        return new Response(html, { headers: { 'content-type': 'text/html' } })
      }
      return new Response('Not found', { status: 404 })
    },
  })
}

describe('runScout()', () => {
  test('discovers and scores API pages', async () => {
    const server = makeServer({
      '/api': `<html><head><title>API Docs</title></head><body>
        <a href="/api/users">Users</a>
        <a href="/api/faq">FAQ</a>
        <h1>API Overview</h1>
        <p>POST /api/create</p>
        <p>${PADDING}</p>
      </body></html>`,
      '/api/users': `<html><head><title>Users API</title></head><body>
        <h1>Users</h1>
        <p>GET /users - list users</p>
        <p>Parameter: limit (optional)</p>
        <p>${PADDING}</p>
      </body></html>`,
      '/api/faq': `<html><head><title>FAQ</title></head><body>
        <h1>Frequently Asked Questions</h1>
        <p>How do I sign up?</p>
        <p>${PADDING}</p>
      </body></html>`,
    })

    try {
      const result = await runScout(`http://localhost:${server.port}/api`, {
        maxDepth: 1,
        maxPages: 10,
        browser: false,
        requestDelay: 0,
        noRobots: true,
        allowPrivate: true,
        maxRetries: 0,
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.totalPages).toBeGreaterThanOrEqual(2)
        expect(result.data.apiPages).toBeGreaterThanOrEqual(1)
        expect(result.data.pages.length).toBe(result.data.totalPages)

        const apiPage = result.data.pages.find((p) => p.url.includes('/users'))
        expect(apiPage).toBeDefined()
        expect(apiPage?.isApi).toBe(true)

        const faqPage = result.data.pages.find((p) => p.url.includes('/faq'))
        if (faqPage) {
          expect(faqPage.isApi).toBe(false)
        }
      }
    } finally {
      server.stop()
    }
  })

  test('saves URL list with --save (API only)', async () => {
    const server = makeServer({
      '/api': `<html><head><title>API</title></head><body>
        <a href="/api/payments">Pay</a>
        <p>POST /payments/request</p>
        <p>${PADDING}</p>
      </body></html>`,
      '/api/payments': `<html><head><title>Payments</title></head><body>
        <p>POST /v3/payments/request</p>
        <p>${PADDING}</p>
      </body></html>`,
    })

    const outFile = join(tmpdir(), `scout-test-${Date.now()}.txt`)

    try {
      const result = await runScout(`http://localhost:${server.port}/api`, {
        maxDepth: 1,
        maxPages: 10,
        browser: false,
        requestDelay: 0,
        noRobots: true,
        allowPrivate: true,
        save: outFile,
        maxRetries: 0,
      })

      expect(result.ok).toBe(true)

      const content = await Bun.file(outFile).text()
      expect(content).toContain('http://localhost')
      expect(content).toContain('# Scout:')
      const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
      for (const line of lines) {
        expect(line).toMatch(/^https?:\/\//)
      }
    } finally {
      server.stop()
    }
  })

  test('--save --all includes non-API pages', async () => {
    const server = makeServer({
      '/api': `<html><head><title>API</title></head><body>
        <a href="/api/faq">FAQ</a>
        <p>GET /api/data</p>
        <p>${PADDING}</p>
      </body></html>`,
      '/api/faq': `<html><head><title>FAQ</title></head><body>
        <p>Common questions and answers about the service.</p>
        <p>${PADDING}</p>
      </body></html>`,
    })

    const outFile = join(tmpdir(), `scout-all-test-${Date.now()}.txt`)

    try {
      const result = await runScout(`http://localhost:${server.port}/api`, {
        maxDepth: 1,
        maxPages: 10,
        browser: false,
        requestDelay: 0,
        noRobots: true,
        allowPrivate: true,
        save: outFile,
        all: true,
        maxRetries: 0,
      })

      expect(result.ok).toBe(true)

      const content = await Bun.file(outFile).text()
      const urls = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
      expect(urls.length).toBeGreaterThanOrEqual(2)
    } finally {
      server.stop()
    }
  })

  test('returns error for unreachable URL', async () => {
    const result = await runScout('http://localhost:1/', {
      maxDepth: 1,
      maxPages: 10,
      browser: false,
      requestDelay: 0,
      noRobots: true,
      allowPrivate: true,
      maxRetries: 0,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('CRAWL_FAILED')
    }
  })
})
