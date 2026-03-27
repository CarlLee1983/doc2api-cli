# doc2api — HTML Source 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 pdf2api 升級為 doc2api，新增 HTML API 文檔網站作為輸入來源，輸出與 PDF 相同的 `RawPage[]` 中間格式，下游 pipeline 零修改。

**Architecture:** Extract 層使用 strategy pattern，PDF 和 HTML 各自實作統一介面。HTML 路徑分為取得層（HTTP fetch + Playwright fallback）和解析層（框架偵測 + 專用/通用 parser）。多頁爬取內建於 extract-html。

**Tech Stack:** Bun runtime, TypeScript strict, Cheerio (HTML 解析), Defuddle (HTML 清理), Playwright (optional, SPA 渲染)

---

## 檔案結構

### 新增檔案

| 檔案 | 職責 |
|------|------|
| `src/pipeline/extract-html.ts` | HTML 提取主進入點，協調 fetcher + parser |
| `src/pipeline/fetcher/http-fetcher.ts` | HTTP fetch 取得 HTML |
| `src/pipeline/fetcher/browser-fetcher.ts` | Playwright 取得 HTML（optional dep） |
| `src/pipeline/fetcher/crawler.ts` | 多頁發現、去重、深度控制 |
| `src/pipeline/fetcher/spa-detector.ts` | SPA 偵測邏輯 |
| `src/pipeline/parser/types.ts` | `HtmlParser` 介面定義 |
| `src/pipeline/parser/detect.ts` | 框架偵測 + parser 路由 |
| `src/pipeline/parser/generic-parser.ts` | Defuddle → Markdown 通用解析 |
| `src/pipeline/parser/readme-parser.ts` | ReadMe.io 專用 parser（示範） |
| `tests/pipeline/fetcher/http-fetcher.test.ts` | HTTP fetcher 測試 |
| `tests/pipeline/fetcher/spa-detector.test.ts` | SPA 偵測測試 |
| `tests/pipeline/fetcher/crawler.test.ts` | 爬取邏輯測試 |
| `tests/pipeline/parser/detect.test.ts` | 框架偵測測試 |
| `tests/pipeline/parser/generic-parser.test.ts` | 通用 parser 測試 |
| `tests/pipeline/parser/readme-parser.test.ts` | ReadMe.io parser 測試 |
| `tests/pipeline/extract-html.test.ts` | HTML 提取整合測試 |
| `tests/fixtures/html/static-api-doc.html` | 靜態 HTML API 文檔 fixture |
| `tests/fixtures/html/spa-shell.html` | SPA 空殼 fixture |
| `tests/fixtures/html/readme-doc.html` | ReadMe.io 風格 fixture |
| `tests/fixtures/html/multi-page/` | 多頁爬取 fixture 目錄 |

### 修改檔案

| 檔案 | 變更內容 |
|------|----------|
| `package.json` | 更名、新增 cheerio/defuddle 依賴 |
| `src/version.ts` | 版本號更新 |
| `src/index.ts` | 更名引用、來源偵測路由、新增 flags |
| `src/commands/inspect.ts` | 支援 HTML source |
| `src/commands/doctor.ts` | 新增 cheerio/defuddle/playwright 檢查 |
| `CLAUDE.md` / `AGENTS.md` | 更新專案名稱與架構描述 |

---

## Task 1: 更名 pdf2api → doc2api

**Files:**
- Modify: `package.json`
- Modify: `src/version.ts`
- Modify: `src/index.ts`
- Modify: `src/commands/doctor.ts`
- Modify: `src/pipeline/extract.ts:83` (console.error 訊息)
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] **Step 1: 更新 package.json**

```json
{
  "name": "@carllee1983/doc2api",
  "version": "0.2.0",
  "description": "Convert API documentation (PDF, HTML) to OpenAPI 3.x specs — AI Agent collaboration tool",
  "bin": {
    "doc2api": "./dist/index.js"
  },
  "keywords": ["pdf", "html", "openapi", "api-docs", "cli", "ai-agent"],
}
```

只改 `name`、`version`、`description`、`bin` key、`keywords`，其餘不動。

- [ ] **Step 2: 更新 src/version.ts**

```typescript
export const VERSION = '0.2.0'
```

- [ ] **Step 3: 更新 src/index.ts 中所有 `pdf2api` 文字引用**

將 help 訊息中的 `pdf2api` 全部替換為 `doc2api`：

```typescript
console.error(`doc2api v${VERSION} — Convert API docs to OpenAPI 3.x

Usage:
  doc2api inspect <source>       Extract and classify content (PDF or URL)
  doc2api assemble <file.json>   Assemble endpoints into OpenAPI spec
  doc2api validate <file.json>   Validate an OpenAPI spec
  doc2api doctor                 Check environment dependencies

Flags:
  --json          Output in JSON format (for AI agents)
  -o, --output    Output file path
  --pages         Page range (e.g., 1-10) [PDF only]
  --crawl         Enable multi-page crawling [URL only]
  --max-depth     Crawl depth limit, default 2 [URL only]
  --max-pages     Max pages to crawl, default 50 [URL only]
  --browser       Force Playwright for fetching [URL only]
  --stdin         Read input from stdin
  --format        Output format: yaml (default) or json`)
```

也更新錯誤訊息：
```typescript
// line 48
console.error('Error: doc2api inspect requires a source (file path or URL)')
// line 82
console.error('Error: doc2api assemble requires a file path or --stdin')
// line 114
console.error('Error: doc2api validate requires a file path')
// line 146
console.error(`Unknown command: ${command}. Run "doc2api help" for usage.`)
```

- [ ] **Step 4: 更新 src/commands/doctor.ts 中的 `pdf2api` 引用**

```typescript
// line 21
checks.push({ name: 'doc2api', status: 'ok', detail: `v${VERSION}` })
```

```typescript
// DoctorData interface 更名欄位
interface DoctorData {
  readonly version: string  // 原 pdf2apiVersion
  readonly python: boolean
  readonly pdfplumber: boolean
  readonly checks: readonly Check[]
}
```

```typescript
// return 改用新欄位名
return ok({
  version: VERSION,
  python: pyStatus.python,
  pdfplumber: pyStatus.pdfplumber,
  checks,
})
```

- [ ] **Step 5: 更新 src/pipeline/extract.ts 中的 warning 訊息**

```typescript
// line 83
console.error('[doc2api] Warning: pdfplumber not available, table extraction disabled')
```

- [ ] **Step 6: 更新 CLAUDE.md、AGENTS.md、README.md 中的 pdf2api → doc2api**

搜尋替換所有 `pdf2api` 為 `doc2api`，保留 git history 中的舊名引用。

- [ ] **Step 7: 執行測試確認無破壞**

Run: `bun test`
Expected: 所有現有測試通過

Run: `bun run typecheck`
Expected: 無型別錯誤

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: 更名 pdf2api → doc2api，版本升至 0.2.0"
```

---

## Task 2: 安裝依賴 + HTML fixture 準備

**Files:**
- Modify: `package.json` (新增 dependencies)
- Create: `tests/fixtures/html/static-api-doc.html`
- Create: `tests/fixtures/html/spa-shell.html`
- Create: `tests/fixtures/html/readme-doc.html`
- Create: `tests/fixtures/html/multi-page/index.html`
- Create: `tests/fixtures/html/multi-page/users.html`
- Create: `tests/fixtures/html/multi-page/orders.html`

- [ ] **Step 1: 安裝 cheerio 和 defuddle**

Run: `bun add cheerio defuddle`

- [ ] **Step 2: 建立靜態 API 文檔 fixture**

Create `tests/fixtures/html/static-api-doc.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head><title>Example API Documentation</title></head>
<body>
  <nav><a href="/">Home</a><a href="/docs">Docs</a></nav>
  <main>
    <h1>Example API</h1>
    <p>Welcome to the Example API documentation.</p>

    <h2>Authentication</h2>
    <p>All requests require a Bearer token in the Authorization header.</p>

    <h2>GET /users</h2>
    <p>Returns a list of users.</p>
    <h3>Parameters</h3>
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td>page</td><td>integer</td><td>No</td><td>Page number</td></tr>
        <tr><td>limit</td><td>integer</td><td>No</td><td>Items per page</td></tr>
      </tbody>
    </table>
    <h3>Response</h3>
    <pre><code>{
  "users": [
    { "id": 1, "name": "Alice", "email": "alice@example.com" }
  ],
  "total": 100
}</code></pre>

    <h2>POST /users</h2>
    <p>Create a new user.</p>
    <h3>Request Body</h3>
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td>name</td><td>string</td><td>Yes</td><td>User name</td></tr>
        <tr><td>email</td><td>string</td><td>Yes</td><td>User email</td></tr>
      </tbody>
    </table>

    <h2>Error Codes</h2>
    <table>
      <thead><tr><th>Status Code</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td>400</td><td>Bad Request</td></tr>
        <tr><td>401</td><td>Unauthorized</td></tr>
        <tr><td>404</td><td>Not Found</td></tr>
        <tr><td>500</td><td>Internal Server Error</td></tr>
      </tbody>
    </table>
  </main>
  <footer>Copyright 2026</footer>
</body>
</html>
```

- [ ] **Step 3: 建立 SPA 空殼 fixture**

Create `tests/fixtures/html/spa-shell.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>API Docs</title>
  <script src="/static/js/main.abc123.js"></script>
</head>
<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
</body>
</html>
```

- [ ] **Step 4: 建立 ReadMe.io 風格 fixture**

Create `tests/fixtures/html/readme-doc.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>API Reference - ReadMe</title>
  <meta name="generator" content="readme">
</head>
<body>
  <nav class="rm-Sidebar"><a href="/docs/authentication">Auth</a></nav>
  <article class="rm-Article">
    <h1>Get User</h1>
    <div class="rm-APIMethod">
      <span class="rm-APIMethod-type">GET</span>
      <span class="rm-APIMethod-path">/api/v1/users/{id}</span>
    </div>
    <p>Retrieve a single user by ID.</p>
    <div class="rm-ParamsTable">
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td>id</td><td>string</td><td>Yes</td><td>User ID</td></tr>
        </tbody>
      </table>
    </div>
    <div class="rm-CodeResponse">
      <pre><code>{
  "id": "usr_123",
  "name": "Alice",
  "email": "alice@example.com"
}</code></pre>
    </div>
  </article>
  <footer>Powered by ReadMe</footer>
</body>
</html>
```

- [ ] **Step 5: 建立多頁爬取 fixture**

Create `tests/fixtures/html/multi-page/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head><title>Multi-Page API Docs</title></head>
<body>
  <nav>
    <a href="/docs/users">Users API</a>
    <a href="/docs/orders">Orders API</a>
    <a href="https://external.com/other">External Link</a>
    <a href="/login">Login</a>
  </nav>
  <main>
    <h1>API Documentation</h1>
    <p>Welcome to the multi-page API documentation.</p>
  </main>
</body>
</html>
```

Create `tests/fixtures/html/multi-page/users.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head><title>Users API</title></head>
<body>
  <main>
    <h1>Users API</h1>
    <h2>GET /users</h2>
    <p>List all users.</p>
    <h2>POST /users</h2>
    <p>Create a user.</p>
  </main>
</body>
</html>
```

Create `tests/fixtures/html/multi-page/orders.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head><title>Orders API</title></head>
<body>
  <main>
    <h1>Orders API</h1>
    <h2>GET /orders</h2>
    <p>List all orders.</p>
    <h2>POST /orders</h2>
    <p>Create an order.</p>
  </main>
</body>
</html>
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: 安裝 cheerio/defuddle 依賴，新增 HTML 測試 fixture"
```

---

## Task 3: SPA 偵測器

**Files:**
- Create: `src/pipeline/fetcher/spa-detector.ts`
- Create: `tests/pipeline/fetcher/spa-detector.test.ts`

- [ ] **Step 1: 寫 SPA 偵測測試**

Create `tests/pipeline/fetcher/spa-detector.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { detectSpa } from '../../../src/pipeline/fetcher/spa-detector'

describe('detectSpa', () => {
  test('returns false for static HTML with content', () => {
    const html = `
      <html><body>
        <h1>API Documentation</h1>
        <p>This is a full page with plenty of text content for the documentation.</p>
        <h2>GET /users</h2>
        <p>Returns a list of users with pagination support and filtering options.</p>
      </body></html>
    `
    expect(detectSpa(html)).toBe(false)
  })

  test('returns true for empty root div', () => {
    const html = `
      <html><body>
        <div id="root"></div>
        <script src="/app.js"></script>
      </body></html>
    `
    expect(detectSpa(html)).toBe(true)
  })

  test('returns true for empty app div', () => {
    const html = `
      <html><body>
        <div id="app"></div>
      </body></html>
    `
    expect(detectSpa(html)).toBe(true)
  })

  test('returns true for noscript tag', () => {
    const html = `
      <html><body>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="root"></div>
      </body></html>
    `
    expect(detectSpa(html)).toBe(true)
  })

  test('returns true for body with very little text', () => {
    const html = `
      <html><body>
        <script src="/bundle.js"></script>
        <style>body { margin: 0; }</style>
        Loading...
      </body></html>
    `
    expect(detectSpa(html)).toBe(true)
  })

  test('returns false for page with noscript but also content', () => {
    const html = `
      <html><body>
        <noscript>Enable JS for full experience</noscript>
        <h1>API Documentation</h1>
        <p>This page has real content rendered server-side with enough text to pass the threshold.</p>
        <h2>Endpoints</h2>
        <p>The following endpoints are available for use in your application integration.</p>
      </body></html>
    `
    expect(detectSpa(html)).toBe(false)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/pipeline/fetcher/spa-detector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 SPA 偵測器**

Create `src/pipeline/fetcher/spa-detector.ts`:

```typescript
import * as cheerio from 'cheerio'

export function detectSpa(html: string): boolean {
  const $ = cheerio.load(html)

  const hasEmptyRoot = hasEmptySpaContainer($)
  if (hasEmptyRoot) return true

  const hasNoscript = $('noscript').length > 0
  const bodyText = getBodyTextContent($)

  if (hasNoscript && bodyText.length < 200) return true
  if (bodyText.length < 200) return true

  return false
}

function hasEmptySpaContainer($: cheerio.CheerioAPI): boolean {
  for (const id of ['root', 'app', '__next']) {
    const el = $(`#${id}`)
    if (el.length > 0 && el.text().trim().length === 0) {
      return true
    }
  }
  return false
}

function getBodyTextContent($: cheerio.CheerioAPI): string {
  const body = $('body').clone()
  body.find('script, style, noscript').remove()
  return body.text().replace(/\s+/g, ' ').trim()
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/pipeline/fetcher/spa-detector.test.ts`
Expected: 所有 6 個測試通過

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/fetcher/spa-detector.ts tests/pipeline/fetcher/spa-detector.test.ts
git commit -m "feat: [html] 新增 SPA 偵測器"
```

---

## Task 4: HTTP Fetcher

**Files:**
- Create: `src/pipeline/fetcher/http-fetcher.ts`
- Create: `tests/pipeline/fetcher/http-fetcher.test.ts`

- [ ] **Step 1: 寫 HTTP fetcher 測試**

Create `tests/pipeline/fetcher/http-fetcher.test.ts`:

```typescript
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
    const result = await fetchHtml('http://localhost:19999/nonexistent')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E5001')
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
      const result = await fetchHtml(`http://localhost:${server.port}/`)
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
      const result = await fetchHtml(`http://localhost:${server.port}/old`)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.html).toContain('Redirected')
      }
    } finally {
      server.stop()
    }
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/pipeline/fetcher/http-fetcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 HTTP fetcher**

Create `src/pipeline/fetcher/http-fetcher.ts`:

```typescript
import { ok, fail } from '../../output/result'
import type { Result } from '../../types/result'

export interface FetchResult {
  readonly html: string
  readonly url: string
  readonly statusCode: number
}

export async function fetchHtml(url: string): Promise<Result<FetchResult>> {
  try {
    new URL(url)
  } catch {
    return fail('E5001', 'FETCH_FAILED', `Invalid URL: ${url}`, {
      suggestion: 'Provide a valid URL starting with http:// or https://',
    })
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'doc2api/0.2.0',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      return fail('E5001', 'FETCH_FAILED', `HTTP ${response.status} for ${url}`, {
        context: { url, statusCode: response.status },
      })
    }

    const html = await response.text()

    return ok({
      html,
      url: response.url,
      statusCode: response.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('E5001', 'FETCH_FAILED', `Failed to fetch ${url}: ${message}`, {
      context: { url },
    })
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/pipeline/fetcher/http-fetcher.test.ts`
Expected: 所有 4 個測試通過

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/fetcher/http-fetcher.ts tests/pipeline/fetcher/http-fetcher.test.ts
git commit -m "feat: [html] 新增 HTTP fetcher"
```

---

## Task 5: Browser Fetcher（Playwright，optional）

**Files:**
- Create: `src/pipeline/fetcher/browser-fetcher.ts`

- [ ] **Step 1: 實作 browser fetcher（無測試，因為依賴 Playwright 安裝）**

Create `src/pipeline/fetcher/browser-fetcher.ts`:

```typescript
import { ok, fail } from '../../output/result'
import type { Result } from '../../types/result'
import type { FetchResult } from './http-fetcher'

export async function checkPlaywright(): Promise<boolean> {
  try {
    await import('playwright')
    return true
  } catch {
    return false
  }
}

export async function fetchWithBrowser(url: string): Promise<Result<FetchResult>> {
  let playwright: typeof import('playwright')

  try {
    playwright = await import('playwright')
  } catch {
    return fail('E5002', 'BROWSER_REQUIRED', 'Playwright is required for SPA rendering but not installed', {
      suggestion: 'Install Playwright: bun add playwright && bunx playwright install chromium',
      context: { url },
    })
  }

  let browser: import('playwright').Browser | null = null

  try {
    browser = await playwright.chromium.launch({ headless: true })
    const page = await browser.newPage()

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    const html = await page.content()

    return ok({
      html,
      url: page.url(),
      statusCode: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('E5001', 'FETCH_FAILED', `Browser fetch failed for ${url}: ${message}`, {
      context: { url },
    })
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
```

- [ ] **Step 2: Type check**

Run: `bun run typecheck`
Expected: 無型別錯誤（Playwright 用 dynamic import，不需要編譯時型別）

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/fetcher/browser-fetcher.ts
git commit -m "feat: [html] 新增 Playwright browser fetcher（optional dep）"
```

---

## Task 6: Parser 介面 + 框架偵測

**Files:**
- Create: `src/pipeline/parser/types.ts`
- Create: `src/pipeline/parser/detect.ts`
- Create: `tests/pipeline/parser/detect.test.ts`

- [ ] **Step 1: 定義 HtmlParser 介面**

Create `src/pipeline/parser/types.ts`:

```typescript
import type { RawPage } from '../extract'

export interface HtmlParser {
  readonly name: string
  detect(html: string): boolean
  parse(html: string, url: string): readonly RawPage[]
}
```

- [ ] **Step 2: 寫框架偵測測試**

Create `tests/pipeline/parser/detect.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { detectFramework } from '../../../src/pipeline/parser/detect'

describe('detectFramework', () => {
  test('detects ReadMe.io by meta generator', () => {
    const html = '<html><head><meta name="generator" content="readme"></head><body></body></html>'
    expect(detectFramework(html)).toBe('readme')
  })

  test('detects ReadMe.io by rm-Article class', () => {
    const html = '<html><body><article class="rm-Article">content</article></body></html>'
    expect(detectFramework(html)).toBe('readme')
  })

  test('detects Docusaurus', () => {
    const html = '<html><head><meta name="generator" content="Docusaurus v3.0"></head><body></body></html>'
    expect(detectFramework(html)).toBe('docusaurus')
  })

  test('detects GitBook', () => {
    const html = '<html><head><meta name="generator" content="GitBook"></head><body></body></html>'
    expect(detectFramework(html)).toBe('gitbook')
  })

  test('detects Redoc', () => {
    const html = '<html><body><div class="redoc-wrap">content</div></body></html>'
    expect(detectFramework(html)).toBe('redoc')
  })

  test('detects Slate', () => {
    const html = '<html><body><div class="tocify-wrapper">nav</div><div class="page-wrapper">content</div></body></html>'
    expect(detectFramework(html)).toBe('slate')
  })

  test('returns generic for unknown framework', () => {
    const html = '<html><body><h1>API Docs</h1></body></html>'
    expect(detectFramework(html)).toBe('generic')
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `bun test tests/pipeline/parser/detect.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: 實作框架偵測**

Create `src/pipeline/parser/detect.ts`:

```typescript
import * as cheerio from 'cheerio'
import type { HtmlParser } from './types'

export type FrameworkId = 'readme' | 'docusaurus' | 'gitbook' | 'redoc' | 'slate' | 'generic'

interface FrameworkRule {
  readonly id: FrameworkId
  readonly detect: (html: string, $: cheerio.CheerioAPI) => boolean
}

const FRAMEWORK_RULES: readonly FrameworkRule[] = [
  {
    id: 'readme',
    detect: (_html, $) =>
      $('meta[name="generator"][content*="readme" i]').length > 0 ||
      $('.rm-Article').length > 0,
  },
  {
    id: 'docusaurus',
    detect: (_html, $) => $('meta[name="generator"][content*="Docusaurus" i]').length > 0,
  },
  {
    id: 'gitbook',
    detect: (_html, $) => $('meta[name="generator"][content*="GitBook" i]').length > 0,
  },
  {
    id: 'redoc',
    detect: (_html, $) => $('.redoc-wrap').length > 0 || $('redoc').length > 0,
  },
  {
    id: 'slate',
    detect: (_html, $) => $('.tocify-wrapper').length > 0,
  },
]

export function detectFramework(html: string): FrameworkId {
  const $ = cheerio.load(html)

  for (const rule of FRAMEWORK_RULES) {
    if (rule.detect(html, $)) {
      return rule.id
    }
  }

  return 'generic'
}

export function selectParser(
  frameworkId: FrameworkId,
  parsers: readonly HtmlParser[],
  fallback: HtmlParser,
): HtmlParser {
  return parsers.find((p) => p.name === frameworkId) ?? fallback
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `bun test tests/pipeline/parser/detect.test.ts`
Expected: 所有 7 個測試通過

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/parser/types.ts src/pipeline/parser/detect.ts tests/pipeline/parser/detect.test.ts
git commit -m "feat: [html] 新增 HtmlParser 介面與框架偵測"
```

---

## Task 7: 通用 Parser（Defuddle + Cheerio）

**Files:**
- Create: `src/pipeline/parser/generic-parser.ts`
- Create: `tests/pipeline/parser/generic-parser.test.ts`

- [ ] **Step 1: 寫通用 parser 測試**

Create `tests/pipeline/parser/generic-parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/pipeline/parser/generic-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作通用 parser**

Create `src/pipeline/parser/generic-parser.ts`:

```typescript
import * as cheerio from 'cheerio'
import { Defuddle } from 'defuddle'
import { JSDOM } from 'jsdom'
import type { Table } from '../../types/chunk'
import type { RawPage } from '../extract'
import type { HtmlParser } from './types'

function extractTables(html: string): readonly Table[] {
  const $ = cheerio.load(html)
  const tables: Table[] = []

  $('table').each((_, tableEl) => {
    const headers: string[] = []
    $(tableEl)
      .find('thead th, thead td')
      .each((__, th) => {
        headers.push($(th).text().trim())
      })

    if (headers.length === 0) {
      const firstRow = $(tableEl).find('tr').first()
      firstRow.find('th, td').each((__, cell) => {
        headers.push($(cell).text().trim())
      })
    }

    const rows: string[][] = []
    const bodyRows = headers.length > 0
      ? $(tableEl).find('tbody tr')
      : $(tableEl).find('tr').slice(1)

    bodyRows.each((__, tr) => {
      const row: string[] = []
      $(tr)
        .find('td, th')
        .each((___, cell) => {
          row.push($(cell).text().trim())
        })
      if (row.length > 0) {
        rows.push(row)
      }
    })

    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows })
    }
  })

  return tables
}

function extractMarkdown(html: string): string {
  try {
    const dom = new JSDOM(html)
    const result = new Defuddle(dom.window.document).parse()
    return result.markdown ?? result.content ?? ''
  } catch {
    const $ = cheerio.load(html)
    $('script, style, nav, footer, header').remove()
    return $('body').text().replace(/\s+/g, ' ').trim()
  }
}

export const genericParser: HtmlParser = {
  name: 'generic',

  detect(): boolean {
    return true
  },

  parse(html: string, _url: string): readonly RawPage[] {
    const text = extractMarkdown(html)
    const tables = extractTables(html)

    return [
      {
        pageNumber: 1,
        text,
        tables,
      },
    ]
  },
}
```

**注意**：Defuddle 需要 DOM 環境。若 `jsdom` 不可用或 Defuddle 整合有問題，fallback 到 Cheerio 純文字提取。安裝 jsdom：

Run: `bun add jsdom && bun add -d @types/jsdom`

如果 Defuddle 不支援 jsdom，改用 `linkedom`：

Run: `bun add linkedom`

並替換 JSDOM 部分：

```typescript
import { parseHTML } from 'linkedom'

function extractMarkdown(html: string): string {
  try {
    const { document } = parseHTML(html)
    const result = new Defuddle(document).parse()
    return result.markdown ?? result.content ?? ''
  } catch {
    // cheerio fallback...
  }
}
```

**根據實際可用性選擇 DOM 實作**。測試時確認哪個能正常運作。

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/pipeline/parser/generic-parser.test.ts`
Expected: 所有 4 個測試通過

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/parser/generic-parser.ts tests/pipeline/parser/generic-parser.test.ts
git commit -m "feat: [html] 新增通用 HTML parser（Defuddle + Cheerio）"
```

---

## Task 8: ReadMe.io 專用 Parser

**Files:**
- Create: `src/pipeline/parser/readme-parser.ts`
- Create: `tests/pipeline/parser/readme-parser.test.ts`

- [ ] **Step 1: 寫 ReadMe parser 測試**

Create `tests/pipeline/parser/readme-parser.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { readmeParser } from '../../../src/pipeline/parser/readme-parser'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/pipeline/parser/readme-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 ReadMe parser**

Create `src/pipeline/parser/readme-parser.ts`:

```typescript
import * as cheerio from 'cheerio'
import type { Table } from '../../types/chunk'
import type { RawPage } from '../extract'
import type { HtmlParser } from './types'

function extractTables($: cheerio.CheerioAPI, container: cheerio.Cheerio<cheerio.Element>): readonly Table[] {
  const tables: Table[] = []

  container.find('table').each((_, tableEl) => {
    const headers: string[] = []
    $(tableEl)
      .find('thead th, thead td')
      .each((__, th) => {
        headers.push($(th).text().trim())
      })

    const rows: string[][] = []
    $(tableEl)
      .find('tbody tr')
      .each((__, tr) => {
        const row: string[] = []
        $(tr)
          .find('td')
          .each((___, td) => {
            row.push($(td).text().trim())
          })
        if (row.length > 0) rows.push(row)
      })

    if (headers.length > 0) {
      tables.push({ headers, rows })
    }
  })

  return tables
}

export const readmeParser: HtmlParser = {
  name: 'readme',

  detect(html: string): boolean {
    const $ = cheerio.load(html)
    return (
      $('meta[name="generator"][content*="readme" i]').length > 0 ||
      $('.rm-Article').length > 0
    )
  },

  parse(html: string, _url: string): readonly RawPage[] {
    const $ = cheerio.load(html)
    const article = $('.rm-Article')
    const container = article.length > 0 ? article : $('body')

    const parts: string[] = []

    // Title
    const title = container.find('h1').first().text().trim()
    if (title) parts.push(`# ${title}`)

    // Endpoint method + path
    const methodEl = container.find('.rm-APIMethod-type, .rm-MethodType')
    const pathEl = container.find('.rm-APIMethod-path, .rm-MethodPath')
    if (methodEl.length > 0 && pathEl.length > 0) {
      parts.push(`${methodEl.text().trim()} ${pathEl.text().trim()}`)
    }

    // Description paragraphs
    container.find('p').each((_, p) => {
      const text = $(p).text().trim()
      if (text) parts.push(text)
    })

    // Code blocks (response examples)
    container.find('pre code, .rm-CodeResponse pre').each((_, code) => {
      const text = $(code).text().trim()
      if (text) parts.push(`\`\`\`json\n${text}\n\`\`\``)
    })

    const tables = extractTables($, container)
    const text = parts.join('\n\n')

    return [
      {
        pageNumber: 1,
        text,
        tables,
      },
    ]
  },
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/pipeline/parser/readme-parser.test.ts`
Expected: 所有 5 個測試通過

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/parser/readme-parser.ts tests/pipeline/parser/readme-parser.test.ts
git commit -m "feat: [html] 新增 ReadMe.io 專用 parser"
```

---

## Task 9: Crawler（多頁爬取）

**Files:**
- Create: `src/pipeline/fetcher/crawler.ts`
- Create: `tests/pipeline/fetcher/crawler.test.ts`

- [ ] **Step 1: 寫 crawler 測試**

Create `tests/pipeline/fetcher/crawler.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { normalizeUrl, filterLinks, type CrawlOptions } from '../../../src/pipeline/fetcher/crawler'

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
  }

  test('keeps same-domain links under entry path', () => {
    const links = [
      'https://example.com/docs/users',
      'https://example.com/docs/orders',
    ]
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([
      'https://example.com/docs/users',
      'https://example.com/docs/orders',
    ])
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/pipeline/fetcher/crawler.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 crawler 核心邏輯**

Create `src/pipeline/fetcher/crawler.ts`:

```typescript
import * as cheerio from 'cheerio'
import { ok, fail } from '../../output/result'
import type { Result } from '../../types/result'
import { fetchHtml, type FetchResult } from './http-fetcher'
import { detectSpa } from './spa-detector'
import { checkPlaywright, fetchWithBrowser } from './browser-fetcher'

export interface CrawlOptions {
  readonly entryUrl: string
  readonly maxDepth: number
  readonly maxPages: number
  readonly concurrency: number
}

export interface CrawlResult {
  readonly pages: readonly FetchedPage[]
  readonly urls: readonly string[]
}

export interface FetchedPage {
  readonly url: string
  readonly html: string
  readonly pageNumber: number
}

const EXCLUDED_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|pdf|zip)$/i
const EXCLUDED_PATHS = /\/(login|signin|signup|register|logout|auth)\b/i

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    let normalized = parsed.toString()
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1)
    }
    return normalized
  } catch {
    return url
  }
}

export function filterLinks(links: readonly string[], options: CrawlOptions): readonly string[] {
  const entryParsed = new URL(options.entryUrl)
  const entryHost = entryParsed.hostname
  const entryPrefix = entryParsed.pathname.replace(/\/$/, '')
  const seen = new Set<string>()

  return links.filter((link) => {
    if (link.startsWith('javascript:') || link === '#') return false

    try {
      const parsed = new URL(link, options.entryUrl)
      if (parsed.hostname !== entryHost) return false
      if (!parsed.pathname.startsWith(entryPrefix)) return false
      if (EXCLUDED_EXTENSIONS.test(parsed.pathname)) return false
      if (EXCLUDED_PATHS.test(parsed.pathname)) return false

      const normalized = normalizeUrl(parsed.toString())
      if (seen.has(normalized)) return false
      seen.add(normalized)

      return true
    } catch {
      return false
    }
  })
}

function extractLinks(html: string, baseUrl: string): readonly string[] {
  const $ = cheerio.load(html)
  const links: string[] = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    try {
      const resolved = new URL(href, baseUrl).toString()
      links.push(resolved)
    } catch {
      // skip invalid URLs
    }
  })

  return links
}

async function fetchPage(
  url: string,
  forceBrowser: boolean,
): Promise<Result<{ html: string; url: string }>> {
  if (forceBrowser) {
    return fetchWithBrowser(url)
  }

  const result = await fetchHtml(url)
  if (!result.ok) return result

  if (detectSpa(result.data.html)) {
    const hasPw = await checkPlaywright()
    if (!hasPw) {
      return fail('E5002', 'BROWSER_REQUIRED', 'SPA detected but Playwright not installed', {
        suggestion: 'Install Playwright: bun add playwright && bunx playwright install chromium',
        context: { url },
      })
    }
    return fetchWithBrowser(url)
  }

  return ok({ html: result.data.html, url: result.data.url })
}

export async function crawl(
  options: CrawlOptions,
  forceBrowser = false,
): Promise<Result<CrawlResult>> {
  const visited = new Set<string>()
  const pages: FetchedPage[] = []
  let queue: { url: string; depth: number }[] = [
    { url: normalizeUrl(options.entryUrl), depth: 0 },
  ]

  while (queue.length > 0 && pages.length < options.maxPages) {
    const batch = queue.splice(0, options.concurrency)
    const results = await Promise.allSettled(
      batch
        .filter((item) => {
          const normalized = normalizeUrl(item.url)
          if (visited.has(normalized)) return false
          visited.add(normalized)
          return true
        })
        .map(async (item) => {
          const result = await fetchPage(item.url, forceBrowser)
          return { ...item, result }
        }),
    )

    for (const settled of results) {
      if (settled.status !== 'fulfilled') continue
      const { result, depth } = settled.value

      if (!result.ok) continue
      if (pages.length >= options.maxPages) break

      pages.push({
        url: result.data.url,
        html: result.data.html,
        pageNumber: pages.length + 1,
      })

      if (depth < options.maxDepth) {
        const links = extractLinks(result.data.html, result.data.url)
        const filtered = filterLinks(links, options)
        const newLinks = filtered
          .filter((link) => !visited.has(normalizeUrl(link)))
          .map((link) => ({ url: link, depth: depth + 1 }))
        queue = [...queue, ...newLinks]
      }
    }
  }

  if (pages.length === 0) {
    return fail('E5003', 'CRAWL_FAILED', `No pages could be fetched from ${options.entryUrl}`, {
      context: { entryUrl: options.entryUrl },
    })
  }

  return ok({
    pages,
    urls: pages.map((p) => p.url),
  })
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/pipeline/fetcher/crawler.test.ts`
Expected: 所有 7 個測試通過

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/fetcher/crawler.ts tests/pipeline/fetcher/crawler.test.ts
git commit -m "feat: [html] 新增多頁爬取器（URL 過濾、去重、深度控制）"
```

---

## Task 10: ExtractHtml 主進入點

**Files:**
- Create: `src/pipeline/extract-html.ts`
- Create: `tests/pipeline/extract-html.test.ts`

- [ ] **Step 1: 寫整合測試**

Create `tests/pipeline/extract-html.test.ts`:

```typescript
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
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rawPages).toHaveLength(1)
        expect(result.data.rawPages[0].text).toContain('GET /users')
        expect(result.data.rawPages[0].tables).toHaveLength(1)
        expect(result.data.pages).toBe(1)
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
        urls: [
          `http://localhost:${server.port}/users`,
          `http://localhost:${server.port}/orders`,
        ],
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rawPages).toHaveLength(2)
        expect(result.data.rawPages[0].pageNumber).toBe(1)
        expect(result.data.rawPages[1].pageNumber).toBe(2)
        expect(result.data.pages).toBe(2)
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/pipeline/extract-html.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 ExtractHtml**

Create `src/pipeline/extract-html.ts`:

```typescript
import { ok, fail } from '../output/result'
import type { Result } from '../types/result'
import type { ExtractResult, RawPage } from './extract'
import { fetchHtml } from './fetcher/http-fetcher'
import { detectSpa } from './fetcher/spa-detector'
import { checkPlaywright, fetchWithBrowser } from './fetcher/browser-fetcher'
import { crawl, type CrawlOptions } from './fetcher/crawler'
import { detectFramework, selectParser } from './parser/detect'
import { genericParser } from './parser/generic-parser'
import { readmeParser } from './parser/readme-parser'
import type { HtmlParser } from './parser/types'

const REGISTERED_PARSERS: readonly HtmlParser[] = [readmeParser]

export interface HtmlExtractOptions {
  readonly urls: readonly string[]
  readonly crawl?: {
    readonly entryUrl: string
    readonly maxDepth?: number
    readonly maxPages?: number
  }
  readonly forceBrowser?: boolean
}

async function fetchSinglePage(
  url: string,
  forceBrowser: boolean,
): Promise<Result<{ html: string; url: string }>> {
  if (forceBrowser) {
    return fetchWithBrowser(url)
  }

  const result = await fetchHtml(url)
  if (!result.ok) return result

  if (detectSpa(result.data.html)) {
    const hasPw = await checkPlaywright()
    if (!hasPw) {
      return fail('E5002', 'BROWSER_REQUIRED', 'SPA detected but Playwright not installed', {
        suggestion: 'Install Playwright: bun add playwright && bunx playwright install chromium',
        context: { url },
      })
    }
    return fetchWithBrowser(url)
  }

  return ok({ html: result.data.html, url: result.data.url })
}

function parsePage(html: string, url: string, pageNumber: number): readonly RawPage[] {
  const frameworkId = detectFramework(html)
  const parser = selectParser(frameworkId, REGISTERED_PARSERS, genericParser)
  const pages = parser.parse(html, url)

  return pages.map((page, index) => ({
    ...page,
    pageNumber: pageNumber + index,
  }))
}

export async function extractHtml(options: HtmlExtractOptions): Promise<Result<ExtractResult>> {
  if (options.crawl) {
    const crawlOptions: CrawlOptions = {
      entryUrl: options.crawl.entryUrl,
      maxDepth: options.crawl.maxDepth ?? 2,
      maxPages: options.crawl.maxPages ?? 50,
      concurrency: 3,
    }

    const crawlResult = await crawl(crawlOptions, options.forceBrowser)
    if (!crawlResult.ok) return crawlResult

    const allPages: RawPage[] = []
    for (const fetched of crawlResult.data.pages) {
      const parsed = parsePage(fetched.html, fetched.url, allPages.length + 1)
      allPages.push(...parsed)
    }

    return ok({
      pages: allPages.length,
      rawPages: allPages,
      hasTables: allPages.some((p) => p.tables.length > 0),
    })
  }

  if (options.urls.length === 0) {
    return fail('E5005', 'NO_CONTENT', 'No URLs provided for extraction', {
      suggestion: 'Provide at least one URL or use --crawl with an entry URL',
    })
  }

  const allPages: RawPage[] = []

  for (const url of options.urls) {
    const fetchResult = await fetchSinglePage(url, options.forceBrowser ?? false)
    if (!fetchResult.ok) {
      console.error(`[doc2api] Warning: Failed to fetch ${url}: ${fetchResult.error.message}`)
      continue
    }

    const parsed = parsePage(fetchResult.data.html, fetchResult.data.url, allPages.length + 1)
    allPages.push(...parsed)
  }

  if (allPages.length === 0) {
    return fail('E5005', 'NO_CONTENT', 'No content could be extracted from any URL', {
      context: { urls: options.urls },
    })
  }

  return ok({
    pages: allPages.length,
    rawPages: allPages,
    hasTables: allPages.some((p) => p.tables.length > 0),
  })
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/pipeline/extract-html.test.ts`
Expected: 所有 3 個測試通過

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/extract-html.ts tests/pipeline/extract-html.test.ts
git commit -m "feat: [html] 新增 extractHtml 主進入點"
```

---

## Task 11: CLI 整合 — inspect 命令支援 HTML source

**Files:**
- Modify: `src/index.ts`
- Modify: `src/commands/inspect.ts`

- [ ] **Step 1: 更新 src/index.ts 的 parseArgs 加入新 flags**

在 `parseArgs` 的 `options` 中加入：

```typescript
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    output: { type: 'string', short: 'o' },
    pages: { type: 'string' },
    stdin: { type: 'boolean', default: false },
    format: { type: 'string', default: 'yaml' },
    outdir: { type: 'string' },
    crawl: { type: 'boolean', default: false },
    'max-depth': { type: 'string' },
    'max-pages': { type: 'string' },
    browser: { type: 'boolean', default: false },
  },
})
```

- [ ] **Step 2: 更新 inspect 命令的路由邏輯**

修改 `src/index.ts` 中 inspect 區塊，加入來源偵測：

```typescript
if (command === 'inspect') {
  const source = positionals[1]
  if (!source) {
    console.error('Error: doc2api inspect requires a source (file path or URL)')
    process.exit(3)
  }

  const isUrl = source.startsWith('http://') || source.startsWith('https://')
  const isUrlList = !isUrl && source.endsWith('.txt')
  const isPdf = !isUrl && !isUrlList

  if (isPdf) {
    const pathError = validateFilePath(source)
    if (pathError) {
      console.error(`Error: ${pathError}`)
      process.exit(3)
    }

    const pagesValue = values.pages
    if (pagesValue) {
      const pagesError = validatePages(pagesValue)
      if (pagesError) {
        console.error(`Error: ${pagesError}`)
        process.exit(3)
      }
    }

    const result = await runInspect(resolve(source), {
      json: jsonMode,
      pages: pagesValue,
      outdir: values.outdir,
    })
    console.log(formatOutput(result, jsonMode))
    process.exit(result.ok ? 0 : 1)
  } else {
    const result = await runInspectHtml(source, {
      json: jsonMode,
      isUrl,
      isUrlList,
      crawl: values.crawl ?? false,
      maxDepth: values['max-depth'] ? Number.parseInt(values['max-depth'], 10) : 2,
      maxPages: values['max-pages'] ? Number.parseInt(values['max-pages'], 10) : 50,
      browser: values.browser ?? false,
      outdir: values.outdir,
    })
    console.log(formatOutput(result, jsonMode))
    process.exit(result.ok ? 0 : 1)
  }
}
```

加入新 import：

```typescript
import { runInspectHtml } from './commands/inspect-html'
```

- [ ] **Step 3: 建立 src/commands/inspect-html.ts**

Create `src/commands/inspect-html.ts`:

```typescript
import { basename } from 'node:path'
import { resolve } from 'node:path'
import type { Result } from '../types/result'
import type { Chunk, ChunkType, InspectData } from '../types/chunk'
import { ok, fail } from '../output/result'
import { extractHtml, type HtmlExtractOptions } from '../pipeline/extract-html'
import { chunkPages } from '../pipeline/chunk'
import { classifyChunks } from '../pipeline/classify'
import { CHUNK_TYPES } from '../types/chunk'

export interface InspectHtmlFlags {
  readonly json: boolean
  readonly isUrl: boolean
  readonly isUrlList: boolean
  readonly crawl: boolean
  readonly maxDepth: number
  readonly maxPages: number
  readonly browser: boolean
  readonly outdir?: string
}

async function readUrlList(filePath: string): Promise<readonly string[]> {
  const content = await Bun.file(resolve(filePath)).text()
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

export async function runInspectHtml(
  source: string,
  flags: InspectHtmlFlags,
): Promise<Result<InspectData>> {
  const options: HtmlExtractOptions = {
    urls: [],
    forceBrowser: flags.browser,
  }

  if (flags.isUrlList) {
    const urls = await readUrlList(source)
    if (urls.length === 0) {
      return fail('E5005', 'NO_CONTENT', `No URLs found in ${source}`, {
        suggestion: 'Add URLs to the file, one per line',
      })
    }
    options = { ...options, urls }
  } else if (flags.crawl) {
    options = {
      ...options,
      urls: [source],
      crawl: {
        entryUrl: source,
        maxDepth: flags.maxDepth,
        maxPages: flags.maxPages,
      },
    }
  } else {
    options = { ...options, urls: [source] }
  }

  const extractResult = await extractHtml(options)
  if (!extractResult.ok) return extractResult

  const { pages, rawPages } = extractResult.data
  const rawChunks = chunkPages(rawPages)
  const chunks = classifyChunks(rawChunks)

  const byType = Object.fromEntries(
    CHUNK_TYPES.map((type) => [type, 0]),
  ) as Record<ChunkType, number>

  for (const chunk of chunks) {
    byType[chunk.type] = byType[chunk.type] + 1
  }

  const sourceName = flags.isUrlList ? basename(source) : source

  return ok({
    source: sourceName,
    pages,
    language: detectLanguage(chunks),
    chunks,
    stats: {
      total_chunks: chunks.length,
      by_type: byType,
    },
  })
}

function detectLanguage(chunks: readonly Chunk[]): string {
  const allText = chunks.map((c) => c.raw_text).join('')
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]/g
  const cjkMatches = allText.match(cjkPattern)

  if (cjkMatches && cjkMatches.length > allText.length * 0.05) {
    return 'zh-TW'
  }

  return 'en'
}
```

**注意**：`options` 在上面被宣告為 `const`，但之後有重新賦值。改用 `let`：

```typescript
let options: HtmlExtractOptions = {
  urls: [],
  forceBrowser: flags.browser,
}
```

- [ ] **Step 4: 執行 typecheck 和現有測試**

Run: `bun run typecheck`
Expected: 無型別錯誤

Run: `bun test`
Expected: 所有測試通過

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/commands/inspect-html.ts
git commit -m "feat: [html] CLI inspect 命令支援 URL 和 URL 清單"
```

---

## Task 12: Doctor 命令擴充

**Files:**
- Modify: `src/commands/doctor.ts`

- [ ] **Step 1: 更新 doctor 命令加入 HTML 相關檢查**

修改 `src/commands/doctor.ts`：

```typescript
import { ok } from '../output/result'
import { checkPdfplumber } from '../bridge/pdfplumber'
import { checkPlaywright } from '../pipeline/fetcher/browser-fetcher'
import type { Result } from '../types/result'
import { VERSION } from '../version'

interface Check {
  readonly name: string
  readonly status: 'ok' | 'warn' | 'fail'
  readonly detail: string
}

interface DoctorData {
  readonly version: string
  readonly python: boolean
  readonly pdfplumber: boolean
  readonly playwright: boolean
  readonly checks: readonly Check[]
}

export async function runDoctor(): Promise<Result<DoctorData>> {
  const checks: Check[] = []

  checks.push({ name: 'doc2api', status: 'ok', detail: `v${VERSION}` })

  const pyStatus = await checkPdfplumber()

  checks.push({
    name: 'python3',
    status: pyStatus.python ? 'ok' : 'warn',
    detail: pyStatus.python ? `Python ${pyStatus.pythonVersion}` : 'not found',
  })

  checks.push({
    name: 'pdfplumber',
    status: pyStatus.pdfplumber ? 'ok' : 'warn',
    detail: pyStatus.pdfplumber ? 'available' : 'not installed (PDF table extraction disabled)',
  })

  checks.push({ name: 'cheerio', status: 'ok', detail: 'available (bundled)' })
  checks.push({ name: 'defuddle', status: 'ok', detail: 'available (bundled)' })

  const hasPlaywright = await checkPlaywright()
  checks.push({
    name: 'playwright',
    status: hasPlaywright ? 'ok' : 'warn',
    detail: hasPlaywright
      ? 'available'
      : 'not installed (SPA rendering disabled, run: bun add playwright && bunx playwright install chromium)',
  })

  return ok({
    version: VERSION,
    python: pyStatus.python,
    pdfplumber: pyStatus.pdfplumber,
    playwright: hasPlaywright,
    checks,
  })
}
```

- [ ] **Step 2: 執行 typecheck**

Run: `bun run typecheck`
Expected: 無型別錯誤

- [ ] **Step 3: Commit**

```bash
git add src/commands/doctor.ts
git commit -m "feat: [doctor] 擴充檢查 cheerio/defuddle/playwright 狀態"
```

---

## Task 13: 全部測試 + Typecheck + Lint

**Files:** 無新增，驗證整體

- [ ] **Step 1: 執行所有測試**

Run: `bun test`
Expected: 所有測試通過（含新增的 HTML 測試和原有的 PDF 測試）

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: 無錯誤

- [ ] **Step 3: Lint**

Run: `bun run check`
Expected: 無錯誤。如有 lint 問題：

Run: `bun run check:fix`

- [ ] **Step 4: 修復任何失敗**

根據錯誤訊息逐一修復，直到所有三項都通過。

- [ ] **Step 5: 最終 commit**

```bash
git add -A
git commit -m "chore: 修正 lint 和型別檢查問題"
```

如果沒有問題需要修正，跳過此 commit。
