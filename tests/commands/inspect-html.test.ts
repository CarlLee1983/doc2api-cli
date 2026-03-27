import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { runInspectHtml } from '../../src/commands/inspect-html'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

const DEFAULT_FLAGS = {
  json: true,
  isUrl: true,
  isUrlList: false,
  crawl: false,
  maxDepth: 2,
  maxPages: 50,
  browser: false,
  allowPrivate: true,
} as const

describe('runInspectHtml()', () => {
  test('inspects a single URL', async () => {
    const html = `
      <html><body>
        <h1>API Documentation</h1>
        <h2>GET /users</h2>
        <p>Returns a list of users.</p>
      </body></html>
    `
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(html, { headers: { 'content-type': 'text/html' } })
      },
    })

    try {
      const result = await runInspectHtml(`http://localhost:${server.port}/`, DEFAULT_FLAGS)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.pages).toBeGreaterThan(0)
        expect(result.data.chunks.length).toBeGreaterThan(0)
        expect(result.data.stats.total_chunks).toBe(result.data.chunks.length)
        expect(result.data.source).toContain('localhost')
      }
    } finally {
      server.stop()
    }
  })

  test('inspects a URL list file', async () => {
    const html = '<html><body><h1>Test API</h1><h2>POST /data</h2></body></html>'
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(html, { headers: { 'content-type': 'text/html' } })
      },
    })

    const listPath = resolve(FIXTURE_DIR, 'test-urls.txt')
    await Bun.write(
      listPath,
      `# Comment line\nhttp://localhost:${server.port}/api\nhttp://localhost:${server.port}/docs\n`,
    )

    try {
      const result = await runInspectHtml(listPath, {
        ...DEFAULT_FLAGS,
        isUrl: false,
        isUrlList: true,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.pages).toBeGreaterThan(0)
        expect(result.data.source).toBe('test-urls.txt')
      }
    } finally {
      server.stop()
    }
  })

  test('returns error for non-existent URL list file', async () => {
    const result = await runInspectHtml('/no/such/urls.txt', {
      ...DEFAULT_FLAGS,
      isUrl: false,
      isUrlList: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('FILE_NOT_FOUND')
    }
  })

  test('returns error when URL list has no valid URLs', async () => {
    const listPath = resolve(FIXTURE_DIR, 'empty-urls.txt')
    await Bun.write(listPath, '# Only comments\n')

    const result = await runInspectHtml(listPath, {
      ...DEFAULT_FLAGS,
      isUrl: false,
      isUrlList: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('NO_CONTENT')
    }
  })
})
