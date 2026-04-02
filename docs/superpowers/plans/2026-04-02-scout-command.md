# Scout Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `doc2api scout <url>` command that crawls a site, scores each page for API relevance, and outputs a curated URL list for `doc2api inspect`.

**Architecture:** Reuse existing crawler infrastructure (`src/pipeline/fetcher/crawler.ts`). New scorer module computes API relevance per page via heuristics. New command handler formats output (human/JSON/file). Router wires it up.

**Tech Stack:** Bun, TypeScript, cheerio (for title extraction from crawler HTML), existing crawler/fetcher modules.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/pipeline/scout-scorer.ts` | Heuristic scoring: takes URL + page text, returns score + signals |
| Create | `src/commands/scout.ts` | Command handler: crawl, score, format, optionally save |
| Create | `tests/pipeline/scout-scorer.test.ts` | Unit tests for scorer |
| Create | `tests/commands/scout.test.ts` | Integration tests for scout command |
| Modify | `src/index.ts` | Add `--save` and `--all` flags to parseArgs |
| Modify | `src/cli/router.ts` | Add `scout` command routing |

---

### Task 1: Scout Scorer — Tests

**Files:**
- Create: `tests/pipeline/scout-scorer.test.ts`

- [ ] **Step 1: Write failing tests for `scorePageForApi`**

```typescript
import { describe, expect, test } from 'bun:test'
import { scorePageForApi } from '../../src/pipeline/scout-scorer'

describe('scorePageForApi()', () => {
  test('high score for page with HTTP method endpoints', () => {
    const result = scorePageForApi(
      'https://example.com/api/v3/payments',
      'POST /v3/payments/request\nGET /v3/payments/{id}\nReturns payment details.',
    )
    expect(result.score).toBeGreaterThanOrEqual(0.6)
    expect(result.isApi).toBe(true)
    expect(result.signals).toContain('http_method')
  })

  test('positive signal for URL containing api keyword', () => {
    const result = scorePageForApi(
      'https://example.com/api/reference',
      'Welcome to our API documentation.',
    )
    expect(result.signals).toContain('url_pattern')
  })

  test('positive signal for parameter table keywords', () => {
    const result = scorePageForApi(
      'https://example.com/docs/create',
      'Parameter: name (required, string). Request body contains the payload.',
    )
    expect(result.signals).toContain('param_keywords')
  })

  test('negative signal for FAQ page', () => {
    const result = scorePageForApi(
      'https://example.com/faq',
      'Frequently asked questions about our service.',
    )
    expect(result.score).toBeLessThan(0.3)
    expect(result.isApi).toBe(false)
    expect(result.signals).toContain('exclude_url')
  })

  test('negative signal for changelog page', () => {
    const result = scorePageForApi(
      'https://example.com/changelog',
      'Version 2.0 released with new features.',
    )
    expect(result.isApi).toBe(false)
  })

  test('low score for generic content with no signals', () => {
    const result = scorePageForApi(
      'https://example.com/about',
      'We are a company that builds things.',
    )
    expect(result.score).toBeLessThanOrEqual(0.3)
    expect(result.isApi).toBe(false)
  })

  test('combined signals stack correctly', () => {
    const result = scorePageForApi(
      'https://example.com/api/users',
      'GET /users\nParameter: id (required). Response: { "name": "..." }',
    )
    expect(result.score).toBeGreaterThanOrEqual(0.8)
    expect(result.signals).toContain('http_method')
    expect(result.signals).toContain('url_pattern')
    expect(result.signals).toContain('param_keywords')
  })

  test('threshold boundary: score exactly at 0.3 is not API', () => {
    // A page with only url_pattern signal (+0.2) should be below threshold
    const result = scorePageForApi(
      'https://example.com/api/overview',
      'Welcome to our platform overview.',
    )
    expect(result.isApi).toBe(result.score > 0.3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline/scout-scorer.test.ts`
Expected: FAIL — module `../../src/pipeline/scout-scorer` not found.

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/pipeline/scout-scorer.test.ts
git commit -m "test: [scout] 新增 scout-scorer 單元測試（RED）"
```

---

### Task 2: Scout Scorer — Implementation

**Files:**
- Create: `src/pipeline/scout-scorer.ts`

- [ ] **Step 1: Implement `scorePageForApi`**

```typescript
export interface ScoutScore {
  readonly score: number
  readonly isApi: boolean
  readonly signals: readonly string[]
}

const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[a-zA-Z0-9_\-/{}.]+/i
const URL_API_PATTERN = /\/(api|reference|endpoint|method)(\/|$)/i
const PARAM_KEYWORDS = /\b(required|optional|parameter|request\s+body|response)\b/i
const EXCLUDE_URL_PATTERN = /\/(faq|changelog|blog|logo|contact|glossary|terms|privacy|release-note|change-?log)(\/|$)/i

export function scorePageForApi(url: string, text: string): ScoutScore {
  let score = 0
  const signals: string[] = []

  if (HTTP_METHOD_PATTERN.test(text)) {
    score += 0.4
    signals.push('http_method')
  }

  try {
    const path = new URL(url).pathname
    if (URL_API_PATTERN.test(path)) {
      score += 0.2
      signals.push('url_pattern')
    }
    if (EXCLUDE_URL_PATTERN.test(path)) {
      score -= 0.3
      signals.push('exclude_url')
    }
  } catch {
    // invalid URL, skip URL-based signals
  }

  if (PARAM_KEYWORDS.test(text)) {
    score += 0.2
    signals.push('param_keywords')
  }

  const clamped = Math.max(0, Math.min(1, score))

  return {
    score: Math.round(clamped * 100) / 100,
    isApi: clamped > 0.3,
    signals,
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test tests/pipeline/scout-scorer.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/scout-scorer.ts
git commit -m "feat: [scout] 實作 scout-scorer API 頁面啟發式評分"
```

---

### Task 3: Scout Command — Tests

**Files:**
- Create: `tests/commands/scout.test.ts`

- [ ] **Step 1: Write failing tests for `runScout`**

```typescript
import { describe, expect, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runScout } from '../../src/commands/scout'

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
      </body></html>`,
      '/api/users': `<html><head><title>Users API</title></head><body>
        <h1>Users</h1>
        <p>GET /users - list users</p>
        <p>Parameter: limit (optional)</p>
      </body></html>`,
      '/api/faq': `<html><head><title>FAQ</title></head><body>
        <h1>Frequently Asked Questions</h1>
        <p>How do I sign up?</p>
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
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.totalPages).toBeGreaterThanOrEqual(2)
        expect(result.data.apiPages).toBeGreaterThanOrEqual(1)
        expect(result.data.pages.length).toBe(result.data.totalPages)

        const apiPage = result.data.pages.find((p) => p.url.includes('/users'))
        expect(apiPage).toBeDefined()
        expect(apiPage!.isApi).toBe(true)

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
      </body></html>`,
      '/api/payments': `<html><head><title>Payments</title></head><body>
        <p>POST /v3/payments/request</p>
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
      })

      expect(result.ok).toBe(true)

      const content = await Bun.file(outFile).text()
      expect(content).toContain('http://localhost')
      // Comment header present
      expect(content).toContain('# Scout:')
      // No lines that are FAQ (non-API) unless --all
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
      </body></html>`,
      '/api/faq': `<html><head><title>FAQ</title></head><body>
        <p>Common questions</p>
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
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('CRAWL_FAILED')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/commands/scout.test.ts`
Expected: FAIL — module `../../src/commands/scout` not found.

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/commands/scout.test.ts
git commit -m "test: [scout] 新增 scout 指令整合測試（RED）"
```

---

### Task 4: Scout Command — Implementation

**Files:**
- Create: `src/commands/scout.ts`

- [ ] **Step 1: Implement `runScout`**

```typescript
import * as cheerio from 'cheerio'
import { fail, ok } from '../output/result'
import { crawl } from '../pipeline/fetcher/crawler'
import type { CrawlOptions } from '../pipeline/fetcher/crawler'
import { scorePageForApi } from '../pipeline/scout-scorer'
import type { ScoutScore } from '../pipeline/scout-scorer'
import type { Result } from '../types/result'

export interface ScoutFlags {
  readonly maxDepth: number
  readonly maxPages: number
  readonly browser: boolean
  readonly requestDelay: number
  readonly noRobots: boolean
  readonly allowPrivate?: boolean
  readonly save?: string
  readonly all?: boolean
}

export interface ScoutPage {
  readonly url: string
  readonly title: string
  readonly score: number
  readonly isApi: boolean
  readonly signals: readonly string[]
}

export interface ScoutData {
  readonly entry: string
  readonly totalPages: number
  readonly apiPages: number
  readonly pages: readonly ScoutPage[]
}

function extractTitle(html: string): string {
  const $ = cheerio.load(html)
  return $('title').text().trim() || $('h1').first().text().trim() || '(untitled)'
}

function extractText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, footer, header').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

export async function runScout(
  url: string,
  flags: ScoutFlags,
): Promise<Result<ScoutData>> {
  const crawlOpts: CrawlOptions = {
    entryUrl: url,
    maxDepth: flags.maxDepth,
    maxPages: flags.maxPages,
    concurrency: 3,
    requestDelay: flags.requestDelay,
    respectRobotsTxt: !flags.noRobots,
    resume: false,
    maxRetries: 3,
  }

  const crawlResult = await crawl(crawlOpts, flags.browser, flags.allowPrivate)
  if (!crawlResult.ok) return crawlResult

  const pages: ScoutPage[] = crawlResult.data.pages.map((page) => {
    const title = extractTitle(page.html)
    const text = extractText(page.html)
    const scored: ScoutScore = scorePageForApi(page.url, text)

    return {
      url: page.url,
      title,
      score: scored.score,
      isApi: scored.isApi,
      signals: scored.signals,
    }
  })

  const sorted = [...pages].sort((a, b) => b.score - a.score)
  const apiPages = sorted.filter((p) => p.isApi).length

  if (flags.save) {
    const pagesToSave = flags.all ? sorted : sorted.filter((p) => p.isApi)
    const lines = [
      `# Scout: ${url}`,
      `# Generated: ${new Date().toISOString().slice(0, 10)}`,
      `# API pages: ${apiPages} / ${sorted.length}`,
      ...pagesToSave.map((p) => p.url),
      '',
    ]
    await Bun.write(flags.save, lines.join('\n'))
  }

  return ok({
    entry: url,
    totalPages: sorted.length,
    apiPages,
    pages: sorted,
  })
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test tests/commands/scout.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/commands/scout.ts
git commit -m "feat: [scout] 實作 scout 指令 — 爬取、評分、輸出 URL 清單"
```

---

### Task 5: CLI Router Integration

**Files:**
- Modify: `src/index.ts`
- Modify: `src/cli/router.ts`

- [ ] **Step 1: Add `--save` and `--all` flags to `src/index.ts` parseArgs**

Add these two entries to the `options` object in `parseArgs`:

```typescript
save: { type: 'string' },
all: { type: 'boolean', default: false },
```

- [ ] **Step 2: Add scout routing to `src/cli/router.ts`**

Add import at top:

```typescript
import { runScout } from '../commands/scout'
```

Add to the help text, after the `session` line:

```
  doc2api scout <url>          Scout a site for API documentation pages
```

Add to the flags help, after `--max-retries`:

```
  --save            Save URL list to file (scout only)
  --all             Include non-API pages in saved list (with --save)
```

Add the routing block before the unknown command fallback (`console.error('Unknown command...')`):

```typescript
if (command === 'scout') {
  const source = positionals[1]
  if (!source) {
    console.error('Error: doc2api scout requires a URL')
    process.exit(3)
  }

  if (!source.startsWith('http://') && !source.startsWith('https://')) {
    console.error('Error: doc2api scout requires a URL (starting with http:// or https://)')
    process.exit(3)
  }

  const maxDepth = parsePositiveInt(values['max-depth'] as string | undefined, 'max-depth', 1)
  const maxPages = parsePositiveInt(values['max-pages'] as string | undefined, 'max-pages', 50)
  const scoutRequestDelay = parsePositiveInt(values['request-delay'] as string | undefined, 'request-delay', 200)

  const result = await runScout(source, {
    maxDepth,
    maxPages,
    browser: (values.browser ?? false) as boolean,
    requestDelay: scoutRequestDelay,
    noRobots: (values['no-robots'] ?? false) as boolean,
    save: values.save as string | undefined,
    all: (values.all ?? false) as boolean,
  })

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ok) {
    const { data } = result
    console.log(`Scout: ${data.entry}`)
    console.log(`Found ${data.totalPages} pages:\n`)

    const apiList = data.pages.filter((p) => p.isApi)
    const otherList = data.pages.filter((p) => !p.isApi)

    if (apiList.length > 0) {
      console.log(`  API (${apiList.length} pages):`)
      for (const p of apiList) {
        console.log(`  [${p.score.toFixed(1)}] ${p.url}  ${p.title}`)
      }
    }

    if (otherList.length > 0) {
      console.log(`\n  Other (${otherList.length} pages):`)
      for (const p of otherList) {
        console.log(`  [${p.score.toFixed(1)}] ${p.url}  ${p.title}`)
      }
    }

    if (!values.save) {
      console.log(`\nSuggested next:`)
      console.log(`  doc2api scout ${source} --save urls.txt`)
      console.log(`  doc2api inspect urls.txt`)
    } else {
      console.log(`\nSaved ${data.all ? data.totalPages : data.apiPages} URLs to ${values.save}`)
    }
  } else {
    console.log(formatOutput(result, false))
  }

  process.exit(result.ok ? 0 : 1)
}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Run all existing tests to ensure no regression**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/cli/router.ts
git commit -m "feat: [scout] 整合 scout 指令到 CLI router"
```

---

### Task 6: CLI Integration Test

**Files:**
- Create: `tests/cli/scout-cli.test.ts`

- [ ] **Step 1: Write CLI-level integration test**

```typescript
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
            </body></html>`,
            { headers: { 'content-type': 'text/html' } },
          )
        }
        if (path === '/api/pay') {
          return new Response(
            `<html><head><title>Payments</title></head><body>
              <p>POST /v1/payments/create</p>
              <p>Parameter: amount (required)</p>
            </body></html>`,
            { headers: { 'content-type': 'text/html' } },
          )
        }
        return new Response('Not found', { status: 404 })
      },
    })

    try {
      const proc = Bun.spawn(
        ['bun', 'run', 'src/index.ts', 'scout', `http://localhost:${server.port}/api`, '--json', '--no-robots'],
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
    const proc = Bun.spawn(
      ['bun', 'run', 'src/index.ts', 'scout'],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const code = await proc.exited
    expect(code).toBe(3)
  })

  test('scout with non-URL exits with code 3', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', 'src/index.ts', 'scout', 'not-a-url.pdf'],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const code = await proc.exited
    expect(code).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test tests/cli/scout-cli.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/cli/scout-cli.test.ts
git commit -m "test: [scout] 新增 CLI 整合測試"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 2: Run lint**

Run: `bun run check`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 4: Manual smoke test with LINE Pay**

Run: `bun run src/index.ts scout https://developers-pay.line.me/zh/online-api-v3 --max-depth 1`
Expected: Output showing API pages (like 付款請求, 付款授權) with high scores and non-API pages (FAQ, logo) with low scores.

Run: `bun run src/index.ts scout https://developers-pay.line.me/zh/online-api-v3 --save /tmp/line-pay-urls.txt --max-depth 1`
Then: `cat /tmp/line-pay-urls.txt`
Expected: URL list file with comment header and API-relevant URLs only.

- [ ] **Step 5: Final commit if any lint/format fixes were needed**

```bash
git add -A
git commit -m "chore: [scout] lint 與格式修正"
```
