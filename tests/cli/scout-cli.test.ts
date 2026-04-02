import { describe, expect, test } from 'bun:test'

describe('doc2api scout CLI', () => {
  test('scout --json returns valid JSON with page scores', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname
        if (path === '/api') {
          return new Response(
            `<html><head><title>API</title></head><body>
              <a href="/api/pay">Pay</a>
              <h1>API Reference</h1>
              <p>POST /v1/payments</p>
              <p>${'This is a detailed API documentation page with enough content to avoid SPA detection. '.repeat(3)}</p>
            </body></html>`,
            { headers: { 'content-type': 'text/html' } },
          )
        }
        if (path === '/api/pay') {
          return new Response(
            `<html><head><title>Payments</title></head><body>
              <p>POST /v1/payments/create</p>
              <p>Parameter: amount (required)</p>
              <p>${'Detailed payment documentation with comprehensive examples and descriptions for testing. '.repeat(3)}</p>
            </body></html>`,
            { headers: { 'content-type': 'text/html' } },
          )
        }
        return new Response('Not found', { status: 404 })
      },
    })

    try {
      const proc = Bun.spawn(
        [
          'bun',
          'run',
          'src/index.ts',
          'scout',
          `http://localhost:${server.port}/api`,
          '--json',
          '--no-robots',
          '--allow-private',
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const stdout = await new Response(proc.stdout).text()
      const code = await proc.exited

      expect(code).toBe(0)

      const parsed = JSON.parse(stdout)
      expect(parsed.ok).toBe(true)
      expect(parsed.data.totalPages).toBeGreaterThanOrEqual(1)
      expect(parsed.data.pages[0]).toHaveProperty('score')
      expect(parsed.data.pages[0]).toHaveProperty('isApi')
      expect(parsed.data.pages[0]).toHaveProperty('signals')
    } finally {
      server.stop()
    }
  })

  test('scout without URL exits with code 3', async () => {
    const proc = Bun.spawn(['bun', 'run', 'src/index.ts', 'scout'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const code = await proc.exited
    expect(code).toBe(3)
  })

  test('scout with non-URL exits with code 3', async () => {
    const proc = Bun.spawn(['bun', 'run', 'src/index.ts', 'scout', 'not-a-url.pdf'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const code = await proc.exited
    expect(code).toBe(3)
  })
})
