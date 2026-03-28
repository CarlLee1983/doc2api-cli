import { describe, expect, test } from 'bun:test'
import {
  type CrawlOptions,
  crawl,
  filterLinks,
  normalizeUrl,
} from '../../../src/pipeline/fetcher/crawler'

describe('normalizeUrl', () => {
  test('removes fragment', () => {
    expect(normalizeUrl('https://example.com/docs#section')).toBe('https://example.com/docs')
  })

  test('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/docs/')).toBe('https://example.com/docs')
  })

  test('preserves root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
})

describe('filterLinks', () => {
  const baseOptions: CrawlOptions = {
    entryUrl: 'https://example.com/docs',
    maxDepth: 2,
    maxPages: 50,
    concurrency: 3,
    requestDelay: 0,
    respectRobotsTxt: false,
    resume: false,
    maxRetries: 0,
  }

  test('keeps same-domain links under entry path', () => {
    const links = ['https://example.com/docs/users', 'https://example.com/docs/orders']
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual(['https://example.com/docs/users', 'https://example.com/docs/orders'])
  })

  test('excludes external links', () => {
    const links = ['https://other.com/docs/users']
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([])
  })

  test('excludes links outside entry path prefix', () => {
    const links = ['https://example.com/blog/post']
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([])
  })

  test('excludes static assets', () => {
    const links = [
      'https://example.com/docs/style.css',
      'https://example.com/docs/app.js',
      'https://example.com/docs/logo.png',
    ]
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([])
  })

  test('excludes javascript: and # links', () => {
    const links = ['javascript:void(0)', '#section']
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([])
  })

  test('deduplicates URLs', () => {
    const links = [
      'https://example.com/docs/users',
      'https://example.com/docs/users#params',
      'https://example.com/docs/users/',
    ]
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual(['https://example.com/docs/users'])
  })
})

describe('crawl requestDelay', () => {
  function makeServer(extraPaths: Record<string, string> = {}) {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname in extraPaths) {
          return new Response(extraPaths[url.pathname], {
            headers: { 'content-type': 'text/html' },
          })
        }
        return new Response('<html><body><h1>Page</h1></body></html>', {
          headers: { 'content-type': 'text/html' },
        })
      },
    })
    return server
  }

  test('requestDelay: 0 completes without error', async () => {
    const server = makeServer()
    try {
      const opts: CrawlOptions = {
        entryUrl: `http://localhost:${server.port}/docs`,
        maxDepth: 0,
        maxPages: 1,
        concurrency: 1,
        requestDelay: 0,
        respectRobotsTxt: false,
        resume: false,
        maxRetries: 0,
      }
      const result = await crawl(opts, false, true)
      expect(result.ok).toBe(true)
    } finally {
      server.stop()
    }
  })

  test('single batch does not apply requestDelay (no extra wait)', async () => {
    const server = makeServer()
    try {
      const opts: CrawlOptions = {
        entryUrl: `http://localhost:${server.port}/docs`,
        maxDepth: 0,
        maxPages: 1,
        concurrency: 3,
        requestDelay: 500,
        respectRobotsTxt: false,
        resume: false,
        maxRetries: 0,
      }
      const start = Date.now()
      const result = await crawl(opts, false, true)
      const elapsed = Date.now() - start
      expect(result.ok).toBe(true)
      // Single batch — queue is empty after, so no delay applied; should finish well under 400ms
      expect(elapsed).toBeLessThan(400)
    } finally {
      server.stop()
    }
  })

  test('multiple batches apply requestDelay between them', async () => {
    const server = makeServer({
      '/docs': `<html><body>
        <a href="/docs/a">A</a>
        <a href="/docs/b">B</a>
      </body></html>`,
      '/docs/a': '<html><body><h1>A</h1></body></html>',
      '/docs/b': '<html><body><h1>B</h1></body></html>',
    })
    try {
      const delayMs = 150
      const optsWithDelay: CrawlOptions = {
        entryUrl: `http://localhost:${server.port}/docs`,
        maxDepth: 1,
        maxPages: 3,
        concurrency: 1,
        requestDelay: delayMs,
        respectRobotsTxt: false,
        resume: false,
        maxRetries: 0,
      }
      const optsNoDelay: CrawlOptions = {
        ...optsWithDelay,
        requestDelay: 0,
      }

      const start1 = Date.now()
      const result1 = await crawl(optsWithDelay, false, true)
      const elapsedWithDelay = Date.now() - start1

      const start2 = Date.now()
      const result2 = await crawl(optsNoDelay, false, true)
      const elapsedNoDelay = Date.now() - start2

      expect(result1.ok).toBe(true)
      expect(result2.ok).toBe(true)
      // With delay should take at least one delay interval longer
      expect(elapsedWithDelay).toBeGreaterThan(elapsedNoDelay + delayMs - 50)
    } finally {
      server.stop()
    }
  })
})
