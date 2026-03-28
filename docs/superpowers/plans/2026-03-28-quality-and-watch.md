# v0.3.0 實作計畫：結構化 extractContent、上下文感知分類、Watch 模式

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升 doc2api 的分類輸出品質（結構化 content + 上下文感知），並新增 Watch 模式支援 AI Agent 迭代工作流。

**Architecture:** 三個獨立功能依序實作。功能一修改型別系統和 extractContent，功能二新增 context-refine 後處理層，功能三新增 watch 指令和 watcher 模組。每個功能獨立可測試、獨立可 commit。

**Tech Stack:** Bun, TypeScript (strict mode), Biome linter, `node:fs` watch API

---

## 檔案結構

### 新增檔案
- `src/pipeline/extractors.ts` — 每種 ChunkType 的結構化 content 提取器
- `src/pipeline/context-refine.ts` — 上下文感知後處理層
- `src/watcher.ts` — 檔案監聽邏輯（debounce、防迴圈、事件分發）
- `src/commands/watch.ts` — watch 指令處理
- `tests/pipeline/extractors.test.ts` — extractor 單元測試
- `tests/pipeline/context-refine.test.ts` — context-refine 單元測試
- `tests/watcher.test.ts` — watcher 單元測試
- `tests/commands/watch.test.ts` — watch 指令整合測試

### 修改檔案
- `src/types/chunk.ts` — 新增 ChunkContent 聯合型別，修改 Chunk.content 型別
- `src/pipeline/classify.ts` — extractContent 改為呼叫 extractors.ts，匯出 extractContent 供 context-refine 使用
- `src/commands/inspect.ts` — classifyChunks 後串接 contextRefine
- `src/commands/inspect-html.ts` — classifyChunks 後串接 contextRefine
- `src/index.ts` — 註冊 watch 指令、新增 --verbose 和 --debounce flags
- `src/version.ts` — 版本號 0.2.0 → 0.3.0

---

## Task 1: ChunkContent 型別定義

**Files:**
- Modify: `src/types/chunk.ts`

- [ ] **Step 1: 在 `src/types/chunk.ts` 新增 content 型別定義**

在 `Chunk` interface 前面新增：

```typescript
export interface EndpointContent {
  readonly kind: 'endpoint'
  readonly method: string
  readonly path: string
  readonly summary: string | null
}

export interface ParameterContent {
  readonly kind: 'parameter'
  readonly parameters: readonly {
    readonly name: string
    readonly type: string | null
    readonly required: boolean | null
    readonly description: string | null
  }[]
}

export interface ResponseContent {
  readonly kind: 'response'
  readonly statusCode: number | null
  readonly body: string | null
}

export interface AuthContent {
  readonly kind: 'auth'
  readonly scheme: string | null
  readonly location: string | null
  readonly description: string
}

export interface ErrorCodesContent {
  readonly kind: 'error_codes'
  readonly codes: readonly {
    readonly status: number
    readonly message: string | null
  }[]
}

export type ChunkContent =
  | EndpointContent
  | ParameterContent
  | ResponseContent
  | AuthContent
  | ErrorCodesContent
```

每個 content 型別加上 `kind` discriminant，讓下游可以用 discriminated union narrowing。

- [ ] **Step 2: 修改 Chunk interface 的 content 型別**

將 `src/types/chunk.ts` 中：

```typescript
readonly content: string | null
```

改為：

```typescript
readonly content: ChunkContent | null
```

- [ ] **Step 3: 執行 typecheck 確認破壞點**

Run: `bun run typecheck`

Expected: 型別錯誤出現在 `src/pipeline/classify.ts`（extractContent 回傳 `string | null`），這是預期中的——Task 2 會修復。

- [ ] **Step 4: Commit 型別定義**

```bash
git add src/types/chunk.ts
git commit -m "feat: [types] 新增 ChunkContent 結構化型別定義"
```

---

## Task 2: Endpoint Extractor

**Files:**
- Create: `src/pipeline/extractors.ts`
- Create: `tests/pipeline/extractors.test.ts`
- Modify: `src/pipeline/classify.ts`

- [ ] **Step 1: 寫 endpoint extractor 的 failing test**

建立 `tests/pipeline/extractors.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test'
import { extractEndpoint } from '../../src/pipeline/extractors'

describe('extractEndpoint()', () => {
  test('extracts method and path from simple endpoint', () => {
    const result = extractEndpoint('POST /api/v1/transfer', null)
    expect(result).toEqual({
      kind: 'endpoint',
      method: 'POST',
      path: '/api/v1/transfer',
      summary: null,
    })
  })

  test('extracts method, path and summary', () => {
    const result = extractEndpoint(
      'GET /users/{id} - Retrieve a single user by ID',
      null,
    )
    expect(result).toEqual({
      kind: 'endpoint',
      method: 'GET',
      path: '/users/{id}',
      summary: 'Retrieve a single user by ID',
    })
  })

  test('extracts summary from text before endpoint', () => {
    const result = extractEndpoint(
      'Create a new order\nPOST /api/orders',
      null,
    )
    expect(result).toEqual({
      kind: 'endpoint',
      method: 'POST',
      path: '/api/orders',
      summary: 'Create a new order',
    })
  })

  test('returns null when no endpoint found', () => {
    const result = extractEndpoint('Some random text', null)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 執行測試確認 fail**

Run: `bun test tests/pipeline/extractors.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: 實作 extractEndpoint**

建立 `src/pipeline/extractors.ts`：

```typescript
import type {
  AuthContent,
  ChunkContent,
  EndpointContent,
  ErrorCodesContent,
  ParameterContent,
  ResponseContent,
  Table,
} from '../types/chunk'

const ENDPOINT_PATTERN =
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[a-zA-Z0-9_\-\/{}.]+)/i

export function extractEndpoint(
  rawText: string,
  _table: Table | null,
): EndpointContent | null {
  const match = rawText.match(ENDPOINT_PATTERN)
  if (!match) return null

  const method = match[1].toUpperCase()
  const path = match[2]

  const matchStart = match.index ?? 0
  const matchEnd = matchStart + match[0].length

  const before = rawText.slice(0, matchStart).trim()
  const after = rawText.slice(matchEnd).trim()

  let summary: string | null = null
  if (after.startsWith('-') || after.startsWith('—')) {
    summary = after.replace(/^[-—]\s*/, '').split('\n')[0].trim() || null
  } else if (before && !ENDPOINT_PATTERN.test(before)) {
    summary = before.split('\n').pop()?.trim() || null
  }

  return { kind: 'endpoint', method, path, summary }
}
```

- [ ] **Step 4: 執行測試確認 pass**

Run: `bun test tests/pipeline/extractors.test.ts`

Expected: 4 tests PASS

- [ ] **Step 5: 更新 classify.ts 使用新的 extractEndpoint**

修改 `src/pipeline/classify.ts` 中的 `extractContent` 函式：

將：

```typescript
function extractContent(chunk: RawChunk, type: ChunkType): string | null {
  if (type === 'endpoint_definition') {
    const match = chunk.raw_text.match(ENDPOINT_PATTERN)
    return match ? match[0].trim() : null
  }

  return null
}
```

改為：

```typescript
import { extractEndpoint } from './extractors'
import type { ChunkContent } from '../types/chunk'

export function extractContent(
  chunk: RawChunk,
  type: ChunkType,
): ChunkContent | null {
  if (type === 'endpoint_definition') {
    return extractEndpoint(chunk.raw_text, chunk.table)
  }

  return null
}
```

注意：`extractContent` 改為 `export`，供 context-refine 使用。

- [ ] **Step 6: 執行全部測試確認無 regression**

Run: `bun test`

Expected: 全部 PASS（既有 classify 測試中 content 斷言已從 string 變為 object，需更新 — 如果有斷言 content 值的測試需要調整）

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/extractors.ts tests/pipeline/extractors.test.ts src/pipeline/classify.ts
git commit -m "feat: [extractors] 實作 endpoint 結構化提取器"
```

---

## Task 3: Parameter Table Extractor

**Files:**
- Modify: `src/pipeline/extractors.ts`
- Modify: `tests/pipeline/extractors.test.ts`
- Modify: `src/pipeline/classify.ts`

- [ ] **Step 1: 寫 parameter extractor 的 failing test**

在 `tests/pipeline/extractors.test.ts` 新增：

```typescript
import { extractParameters } from '../../src/pipeline/extractors'

describe('extractParameters()', () => {
  test('extracts parameters from table with standard headers', () => {
    const table = {
      headers: ['Name', 'Type', 'Required', 'Description'],
      rows: [
        ['amount', 'number', 'yes', 'Transfer amount'],
        ['currency', 'string', 'no', 'Currency code'],
      ],
    }
    const result = extractParameters('', table)
    expect(result).toEqual({
      kind: 'parameter',
      parameters: [
        { name: 'amount', type: 'number', required: true, description: 'Transfer amount' },
        { name: 'currency', type: 'string', required: false, description: 'Currency code' },
      ],
    })
  })

  test('handles Chinese headers', () => {
    const table = {
      headers: ['參數', '型別', '必填', '說明'],
      rows: [['user_id', 'string', '是', '使用者 ID']],
    }
    const result = extractParameters('', table)
    expect(result).toEqual({
      kind: 'parameter',
      parameters: [
        { name: 'user_id', type: 'string', required: true, description: '使用者 ID' },
      ],
    })
  })

  test('handles missing columns gracefully', () => {
    const table = {
      headers: ['Name', 'Type'],
      rows: [['id', 'string']],
    }
    const result = extractParameters('', table)
    expect(result).toEqual({
      kind: 'parameter',
      parameters: [
        { name: 'id', type: 'string', required: null, description: null },
      ],
    })
  })

  test('returns null when no table', () => {
    const result = extractParameters('some text', null)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 執行測試確認 fail**

Run: `bun test tests/pipeline/extractors.test.ts --filter "extractParameters"`

Expected: FAIL

- [ ] **Step 3: 實作 extractParameters**

在 `src/pipeline/extractors.ts` 新增：

```typescript
const NAME_HEADERS = /^(name|parameter|參數|field|欄位)$/i
const TYPE_HEADERS = /^(type|型別|data\s*type|類型)$/i
const REQUIRED_HEADERS = /^(required|必填|必要)$/i
const DESC_HEADERS = /^(description|說明|描述|備註|detail)$/i
const TRUTHY_VALUES = /^(yes|true|是|required|必填|✓|v)$/i

function findColumnIndex(
  headers: readonly string[],
  pattern: RegExp,
): number {
  return headers.findIndex((h) => pattern.test(h.trim()))
}

export function extractParameters(
  _rawText: string,
  table: Table | null,
): ParameterContent | null {
  if (!table || table.rows.length === 0) return null

  const nameIdx = findColumnIndex(table.headers, NAME_HEADERS)
  if (nameIdx === -1) return null

  const typeIdx = findColumnIndex(table.headers, TYPE_HEADERS)
  const reqIdx = findColumnIndex(table.headers, REQUIRED_HEADERS)
  const descIdx = findColumnIndex(table.headers, DESC_HEADERS)

  const parameters = table.rows.map((row) => ({
    name: row[nameIdx]?.trim() ?? '',
    type: typeIdx >= 0 ? (row[typeIdx]?.trim() || null) : null,
    required: reqIdx >= 0 ? TRUTHY_VALUES.test(row[reqIdx]?.trim() ?? '') : null,
    description: descIdx >= 0 ? (row[descIdx]?.trim() || null) : null,
  }))

  return { kind: 'parameter', parameters }
}
```

- [ ] **Step 4: 執行測試確認 pass**

Run: `bun test tests/pipeline/extractors.test.ts --filter "extractParameters"`

Expected: 4 tests PASS

- [ ] **Step 5: 在 classify.ts 的 extractContent 加入 parameter_table 分支**

在 `src/pipeline/classify.ts` 的 `extractContent` 函式中加入：

```typescript
import { extractEndpoint, extractParameters } from './extractors'

export function extractContent(
  chunk: RawChunk,
  type: ChunkType,
): ChunkContent | null {
  if (type === 'endpoint_definition') {
    return extractEndpoint(chunk.raw_text, chunk.table)
  }
  if (type === 'parameter_table') {
    return extractParameters(chunk.raw_text, chunk.table)
  }

  return null
}
```

- [ ] **Step 6: 執行全部測試**

Run: `bun test`

Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/extractors.ts tests/pipeline/extractors.test.ts src/pipeline/classify.ts
git commit -m "feat: [extractors] 實作 parameter table 結構化提取器"
```

---

## Task 4: Response Example Extractor

**Files:**
- Modify: `src/pipeline/extractors.ts`
- Modify: `tests/pipeline/extractors.test.ts`
- Modify: `src/pipeline/classify.ts`

- [ ] **Step 1: 寫 response extractor 的 failing test**

在 `tests/pipeline/extractors.test.ts` 新增：

```typescript
import { extractResponse } from '../../src/pipeline/extractors'

describe('extractResponse()', () => {
  test('extracts status code and JSON body', () => {
    const result = extractResponse(
      'Response: 200\n{ "id": "123", "name": "test" }',
      null,
    )
    expect(result).toEqual({
      kind: 'response',
      statusCode: 200,
      body: '{ "id": "123", "name": "test" }',
    })
  })

  test('extracts JSON body without status code', () => {
    const result = extractResponse(
      '{ "code": 0, "data": { "token": "abc" } }',
      null,
    )
    expect(result).toEqual({
      kind: 'response',
      statusCode: null,
      body: '{ "code": 0, "data": { "token": "abc" } }',
    })
  })

  test('extracts status code from text pattern', () => {
    const result = extractResponse(
      'HTTP 201 Created\n{"id": "new-item"}',
      null,
    )
    expect(result).toEqual({
      kind: 'response',
      statusCode: 201,
      body: '{"id": "new-item"}',
    })
  })

  test('returns null when no JSON found', () => {
    const result = extractResponse('No JSON here', null)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 執行測試確認 fail**

Run: `bun test tests/pipeline/extractors.test.ts --filter "extractResponse"`

Expected: FAIL

- [ ] **Step 3: 實作 extractResponse**

在 `src/pipeline/extractors.ts` 新增：

```typescript
const STATUS_CODE_PATTERN = /\b(?:HTTP\s+|status\s+)?([1-5]\d{2})\b/i
const JSON_BODY_PATTERN = /(\{[\s\S]*\}|\[[\s\S]*\])/

export function extractResponse(
  rawText: string,
  _table: Table | null,
): ResponseContent | null {
  const jsonMatch = rawText.match(JSON_BODY_PATTERN)
  if (!jsonMatch) return null

  const statusMatch = rawText.match(STATUS_CODE_PATTERN)
  const statusCode = statusMatch ? Number.parseInt(statusMatch[1], 10) : null

  return {
    kind: 'response',
    statusCode,
    body: jsonMatch[1].trim(),
  }
}
```

- [ ] **Step 4: 執行測試確認 pass**

Run: `bun test tests/pipeline/extractors.test.ts --filter "extractResponse"`

Expected: 4 tests PASS

- [ ] **Step 5: 在 classify.ts 的 extractContent 加入 response_example 分支**

```typescript
if (type === 'response_example') {
  return extractResponse(chunk.raw_text, chunk.table)
}
```

- [ ] **Step 6: 執行全部測試**

Run: `bun test`

Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/extractors.ts tests/pipeline/extractors.test.ts src/pipeline/classify.ts
git commit -m "feat: [extractors] 實作 response example 結構化提取器"
```

---

## Task 5: Auth & Error Codes Extractors

**Files:**
- Modify: `src/pipeline/extractors.ts`
- Modify: `tests/pipeline/extractors.test.ts`
- Modify: `src/pipeline/classify.ts`

- [ ] **Step 1: 寫 auth extractor 的 failing test**

在 `tests/pipeline/extractors.test.ts` 新增：

```typescript
import { extractAuth, extractErrorCodes } from '../../src/pipeline/extractors'

describe('extractAuth()', () => {
  test('extracts bearer token auth', () => {
    const result = extractAuth(
      'Authentication: Use Bearer token in Authorization header',
      null,
    )
    expect(result).toEqual({
      kind: 'auth',
      scheme: 'bearer',
      location: 'header',
      description: 'Authentication: Use Bearer token in Authorization header',
    })
  })

  test('extracts API key auth', () => {
    const result = extractAuth(
      'Pass your API key in the X-API-Key header',
      null,
    )
    expect(result).toEqual({
      kind: 'auth',
      scheme: 'apiKey',
      location: 'header',
      description: 'Pass your API key in the X-API-Key header',
    })
  })

  test('extracts OAuth2', () => {
    const result = extractAuth(
      'This API uses OAuth 2.0 for authorization',
      null,
    )
    expect(result).toEqual({
      kind: 'auth',
      scheme: 'oauth2',
      location: null,
      description: 'This API uses OAuth 2.0 for authorization',
    })
  })

  test('returns null when no auth pattern found', () => {
    const result = extractAuth('Regular documentation text', null)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 寫 error codes extractor 的 failing test**

```typescript
describe('extractErrorCodes()', () => {
  test('extracts error codes from table', () => {
    const table = {
      headers: ['Error Code', 'Message'],
      rows: [
        ['400', 'Bad Request'],
        ['401', 'Unauthorized'],
        ['500', 'Internal Server Error'],
      ],
    }
    const result = extractErrorCodes('', table)
    expect(result).toEqual({
      kind: 'error_codes',
      codes: [
        { status: 400, message: 'Bad Request' },
        { status: 401, message: 'Unauthorized' },
        { status: 500, message: 'Internal Server Error' },
      ],
    })
  })

  test('handles table without explicit error code header', () => {
    const table = {
      headers: ['Status', 'Description'],
      rows: [
        ['404', 'Not Found'],
        ['429', 'Too Many Requests'],
      ],
    }
    const result = extractErrorCodes('', table)
    expect(result).toEqual({
      kind: 'error_codes',
      codes: [
        { status: 404, message: 'Not Found' },
        { status: 429, message: 'Too Many Requests' },
      ],
    })
  })

  test('returns null when no table', () => {
    const result = extractErrorCodes('some text', null)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: 執行測試確認 fail**

Run: `bun test tests/pipeline/extractors.test.ts --filter "extractAuth|extractErrorCodes"`

Expected: FAIL

- [ ] **Step 4: 實作 extractAuth**

在 `src/pipeline/extractors.ts` 新增：

```typescript
const BEARER_PATTERN = /\b(bearer\s+token|bearer\s+auth)/i
const API_KEY_PATTERN = /\b(api[_\s]?key)/i
const OAUTH_PATTERN = /\b(oauth\s*2?\.?0?)/i
const JWT_PATTERN = /\bjwt\b/i
const HEADER_LOCATION = /\b(header|Authorization)/i
const QUERY_LOCATION = /\b(query\s+param|query\s+string|\?.*=)/i

export function extractAuth(
  rawText: string,
  _table: Table | null,
): AuthContent | null {
  let scheme: string | null = null

  if (BEARER_PATTERN.test(rawText)) {
    scheme = 'bearer'
  } else if (OAUTH_PATTERN.test(rawText)) {
    scheme = 'oauth2'
  } else if (JWT_PATTERN.test(rawText)) {
    scheme = 'bearer'
  } else if (API_KEY_PATTERN.test(rawText)) {
    scheme = 'apiKey'
  } else {
    return null
  }

  let location: string | null = null
  if (HEADER_LOCATION.test(rawText)) {
    location = 'header'
  } else if (QUERY_LOCATION.test(rawText)) {
    location = 'query'
  }

  return { kind: 'auth', scheme, location, description: rawText.trim() }
}
```

- [ ] **Step 5: 實作 extractErrorCodes**

在 `src/pipeline/extractors.ts` 新增：

```typescript
const STATUS_COL_PATTERN = /^[1-5]\d{2}$/

export function extractErrorCodes(
  _rawText: string,
  table: Table | null,
): ErrorCodesContent | null {
  if (!table || table.rows.length === 0) return null

  const statusIdx = table.rows[0].findIndex((cell) =>
    STATUS_COL_PATTERN.test(cell.trim()),
  )
  if (statusIdx === -1) return null

  const messageIdx = statusIdx === 0 ? 1 : 0

  const codes = table.rows
    .filter((row) => STATUS_COL_PATTERN.test(row[statusIdx]?.trim() ?? ''))
    .map((row) => ({
      status: Number.parseInt(row[statusIdx].trim(), 10),
      message: messageIdx < row.length ? (row[messageIdx]?.trim() || null) : null,
    }))

  if (codes.length === 0) return null

  return { kind: 'error_codes', codes }
}
```

- [ ] **Step 6: 執行測試確認 pass**

Run: `bun test tests/pipeline/extractors.test.ts --filter "extractAuth|extractErrorCodes"`

Expected: 7 tests PASS

- [ ] **Step 7: 在 classify.ts 的 extractContent 加入剩餘分支**

`src/pipeline/classify.ts` 的 `extractContent` 最終版本：

```typescript
import {
  extractAuth,
  extractEndpoint,
  extractErrorCodes,
  extractParameters,
  extractResponse,
} from './extractors'
import type { ChunkContent } from '../types/chunk'

export function extractContent(
  chunk: RawChunk,
  type: ChunkType,
): ChunkContent | null {
  if (type === 'endpoint_definition') {
    return extractEndpoint(chunk.raw_text, chunk.table)
  }
  if (type === 'parameter_table') {
    return extractParameters(chunk.raw_text, chunk.table)
  }
  if (type === 'response_example') {
    return extractResponse(chunk.raw_text, chunk.table)
  }
  if (type === 'auth_description') {
    return extractAuth(chunk.raw_text, chunk.table)
  }
  if (type === 'error_codes') {
    return extractErrorCodes(chunk.raw_text, chunk.table)
  }
  return null
}
```

- [ ] **Step 8: 執行全部測試 + typecheck**

Run: `bun test && bun run typecheck`

Expected: 全部 PASS，無型別錯誤

- [ ] **Step 9: Commit**

```bash
git add src/pipeline/extractors.ts tests/pipeline/extractors.test.ts src/pipeline/classify.ts
git commit -m "feat: [extractors] 實作 auth 與 error codes 結構化提取器"
```

---

## Task 6: 上下文感知分類 — contextRefine

**Files:**
- Create: `src/pipeline/context-refine.ts`
- Create: `tests/pipeline/context-refine.test.ts`

- [ ] **Step 1: 寫 contextRefine 的 failing tests**

建立 `tests/pipeline/context-refine.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test'
import type { Chunk } from '../../src/types/chunk'
import { contextRefine } from '../../src/pipeline/context-refine'

describe('contextRefine()', () => {
  test('promotes JSON block after endpoint to response_example', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'endpoint_definition',
        confidence: 0.9,
        content: { kind: 'endpoint', method: 'GET', path: '/users', summary: null },
        raw_text: 'GET /users',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: '{ "data": [{ "id": 1, "name": "Alice" }] }',
        table: null,
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('response_example')
    expect(refined[1].confidence).toBe(0.75)
    expect(refined[1].content).not.toBeNull()
    if (refined[1].content?.kind === 'response') {
      expect(refined[1].content.body).toContain('"data"')
    }
  })

  test('promotes table after endpoint to parameter_table', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'endpoint_definition',
        confidence: 0.9,
        content: { kind: 'endpoint', method: 'POST', path: '/orders', summary: null },
        raw_text: 'POST /orders',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'amount | number\ncurrency | string',
        table: {
          headers: ['field', 'type'],
          rows: [['amount', 'number'], ['currency', 'string']],
        },
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('parameter_table')
    expect(refined[1].confidence).toBe(0.7)
  })

  test('extends auth description to following chunk with auth keywords', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'auth_description',
        confidence: 0.85,
        content: { kind: 'auth', scheme: 'bearer', location: 'header', description: 'Use Bearer token' },
        raw_text: 'Use Bearer token in Authorization header',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'The token expires after 24 hours. Refresh tokens are issued on login.',
        table: null,
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('auth_description')
    expect(refined[1].confidence).toBe(0.65)
  })

  test('does not downgrade already-classified chunks', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'endpoint_definition',
        confidence: 0.9,
        content: { kind: 'endpoint', method: 'GET', path: '/health', summary: null },
        raw_text: 'GET /health',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'auth_description',
        confidence: 0.85,
        content: { kind: 'auth', scheme: 'bearer', location: 'header', description: 'Auth info' },
        raw_text: 'Authentication: Bearer token required',
        table: null,
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('auth_description')
    expect(refined[1].confidence).toBe(0.85)
  })

  test('boosts low-confidence chunk between endpoint-related chunks', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'endpoint_definition',
        confidence: 0.9,
        content: { kind: 'endpoint', method: 'GET', path: '/users', summary: null },
        raw_text: 'GET /users',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'Returns a list of all active users in the system.',
        table: null,
      },
      {
        id: 'c3',
        page: 1,
        type: 'parameter_table',
        confidence: 0.85,
        content: { kind: 'parameter', parameters: [{ name: 'page', type: 'number', required: false, description: null }] },
        raw_text: 'page | number',
        table: { headers: ['Name', 'Type'], rows: [['page', 'number']] },
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('general_text')
    expect(refined[1].confidence).toBe(0.4)
  })

  test('returns unchanged chunks when no context rules apply', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'Introduction to our API.',
        table: null,
      },
      {
        id: 'c2',
        page: 2,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'Contact support for help.',
        table: null,
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined).toEqual(chunks)
  })
})
```

- [ ] **Step 2: 執行測試確認 fail**

Run: `bun test tests/pipeline/context-refine.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: 實作 contextRefine**

建立 `src/pipeline/context-refine.ts`：

```typescript
import type { Chunk, ChunkContent, ChunkType } from '../types/chunk'
import { extractAuth, extractErrorCodes, extractParameters, extractResponse } from './extractors'

const JSON_BLOCK_PATTERN = /[{[]\s*"[^"]+"\s*:/
const AUTH_EXTEND_PATTERN = /\b(token|key|secret|credential|refresh|expire|scope)/i

const ENDPOINT_RELATED_TYPES: ReadonlySet<ChunkType> = new Set([
  'endpoint_definition',
  'parameter_table',
  'response_example',
  'error_codes',
])

interface ContextRule {
  readonly apply: (
    chunk: Chunk,
    prev: Chunk | null,
    next: Chunk | null,
  ) => { readonly type: ChunkType; readonly confidence: number } | null
}

const contextRules: readonly ContextRule[] = [
  {
    // JSON block following an endpoint → response_example
    apply: (chunk, prev) => {
      if (
        chunk.type !== 'general_text' ||
        !prev ||
        prev.type !== 'endpoint_definition'
      ) {
        return null
      }
      if (!JSON_BLOCK_PATTERN.test(chunk.raw_text)) return null
      return { type: 'response_example', confidence: 0.75 }
    },
  },
  {
    // Table following an endpoint → parameter_table
    apply: (chunk, prev) => {
      if (
        chunk.type !== 'general_text' ||
        !chunk.table ||
        !prev ||
        prev.type !== 'endpoint_definition'
      ) {
        return null
      }
      return { type: 'parameter_table', confidence: 0.7 }
    },
  },
  {
    // Auth keyword following auth_description → extend auth
    apply: (chunk, prev) => {
      if (
        chunk.type !== 'general_text' ||
        !prev ||
        prev.type !== 'auth_description'
      ) {
        return null
      }
      if (!AUTH_EXTEND_PATTERN.test(chunk.raw_text)) return null
      return { type: 'auth_description', confidence: 0.65 }
    },
  },
  {
    // Low confidence between endpoint-related → boost
    apply: (chunk, prev, next) => {
      if (chunk.confidence >= 0.5) return null
      const prevRelated = prev && ENDPOINT_RELATED_TYPES.has(prev.type)
      const nextRelated = next && ENDPOINT_RELATED_TYPES.has(next.type)
      if (!prevRelated || !nextRelated) return null
      return { type: chunk.type, confidence: chunk.confidence + 0.1 }
    },
  },
]

function reExtractContent(
  rawText: string,
  table: Chunk['table'],
  type: ChunkType,
): ChunkContent | null {
  if (type === 'response_example') return extractResponse(rawText, table)
  if (type === 'parameter_table') return extractParameters(rawText, table)
  if (type === 'auth_description') return extractAuth(rawText, table)
  if (type === 'error_codes') return extractErrorCodes(rawText, table)
  return null
}

export function contextRefine(
  chunks: readonly Chunk[],
): readonly Chunk[] {
  return chunks.map((chunk, i) => {
    const prev = i > 0 ? chunks[i - 1] : null
    const next = i < chunks.length - 1 ? chunks[i + 1] : null

    for (const rule of contextRules) {
      const result = rule.apply(chunk, prev, next)
      if (!result) continue

      // Only upgrade, never downgrade
      if (result.confidence <= chunk.confidence) continue

      const needsReExtract = result.type !== chunk.type
      const newContent = needsReExtract
        ? reExtractContent(chunk.raw_text, chunk.table, result.type)
        : chunk.content

      return {
        ...chunk,
        type: result.type,
        confidence: result.confidence,
        content: newContent,
      }
    }

    return chunk
  })
}
```

- [ ] **Step 4: 執行測試確認 pass**

Run: `bun test tests/pipeline/context-refine.test.ts`

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/context-refine.ts tests/pipeline/context-refine.test.ts
git commit -m "feat: [pipeline] 實作上下文感知分類 contextRefine"
```

---

## Task 7: 串接 contextRefine 到 inspect pipeline

**Files:**
- Modify: `src/commands/inspect.ts`
- Modify: `src/commands/inspect-html.ts`

- [ ] **Step 1: 修改 inspect.ts 串接 contextRefine**

在 `src/commands/inspect.ts` 中：

加入 import：
```typescript
import { contextRefine } from '../pipeline/context-refine'
```

將：
```typescript
const chunks = classifyChunks(rawChunks)
```

改為：
```typescript
const classified = classifyChunks(rawChunks)
const chunks = contextRefine(classified)
```

- [ ] **Step 2: 修改 inspect-html.ts 串接 contextRefine**

在 `src/commands/inspect-html.ts` 中：

加入 import：
```typescript
import { contextRefine } from '../pipeline/context-refine'
```

將：
```typescript
const chunks = classifyChunks(rawChunks)
```

改為：
```typescript
const classified = classifyChunks(rawChunks)
const chunks = contextRefine(classified)
```

- [ ] **Step 3: 執行全部測試 + typecheck**

Run: `bun test && bun run typecheck`

Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/commands/inspect.ts src/commands/inspect-html.ts
git commit -m "feat: [pipeline] 串接 contextRefine 至 inspect pipeline"
```

---

## Task 8: Watcher 模組

**Files:**
- Create: `src/watcher.ts`
- Create: `tests/watcher.test.ts`

- [ ] **Step 1: 寫 watcher 的 failing tests**

建立 `tests/watcher.test.ts`：

```typescript
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWatcher, type WatcherEvent } from '../src/watcher'

describe('createWatcher()', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test('detects source file changes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'))
    const sourceFile = join(tempDir, 'test.pdf')
    await writeFile(sourceFile, 'initial content')

    const events: WatcherEvent[] = []
    const watcher = createWatcher({
      sourceFile,
      outputDir: tempDir,
      debounceMs: 50,
      onEvent: (event) => {
        events.push(event)
      },
    })

    // Wait for watcher to initialize
    await new Promise((r) => setTimeout(r, 100))

    // Trigger a change
    await writeFile(sourceFile, 'updated content')
    await new Promise((r) => setTimeout(r, 200))

    watcher.close()

    const sourceEvents = events.filter((e) => e.type === 'source_changed')
    expect(sourceEvents.length).toBeGreaterThanOrEqual(1)
  })

  test('detects output JSON changes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'))
    const sourceFile = join(tempDir, 'test.pdf')
    await writeFile(sourceFile, 'content')

    const events: WatcherEvent[] = []
    const watcher = createWatcher({
      sourceFile,
      outputDir: tempDir,
      debounceMs: 50,
      onEvent: (event) => {
        events.push(event)
      },
    })

    await new Promise((r) => setTimeout(r, 100))

    // Write a JSON file to output dir
    const jsonFile = join(tempDir, 'endpoints.json')
    await writeFile(jsonFile, '{"endpoints": []}')
    await new Promise((r) => setTimeout(r, 200))

    watcher.close()

    const jsonEvents = events.filter((e) => e.type === 'json_changed')
    expect(jsonEvents.length).toBeGreaterThanOrEqual(1)
  })

  test('ignores self-written files', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'))
    const sourceFile = join(tempDir, 'test.pdf')
    await writeFile(sourceFile, 'content')

    const events: WatcherEvent[] = []
    const watcher = createWatcher({
      sourceFile,
      outputDir: tempDir,
      debounceMs: 50,
      onEvent: (event) => {
        events.push(event)
      },
    })

    await new Promise((r) => setTimeout(r, 100))

    // Mark file as self-written, then write it
    const outFile = join(tempDir, 'chunks.json')
    watcher.markSelfWritten(outFile)
    await writeFile(outFile, '{}')
    await new Promise((r) => setTimeout(r, 200))

    watcher.close()

    const jsonEvents = events.filter((e) => e.type === 'json_changed')
    expect(jsonEvents.length).toBe(0)
  })

  test('close stops watching', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'))
    const sourceFile = join(tempDir, 'test.pdf')
    await writeFile(sourceFile, 'content')

    const events: WatcherEvent[] = []
    const watcher = createWatcher({
      sourceFile,
      outputDir: tempDir,
      debounceMs: 50,
      onEvent: (event) => {
        events.push(event)
      },
    })

    await new Promise((r) => setTimeout(r, 100))
    watcher.close()

    await writeFile(sourceFile, 'post-close change')
    await new Promise((r) => setTimeout(r, 200))

    expect(events.length).toBe(0)
  })
})
```

- [ ] **Step 2: 執行測試確認 fail**

Run: `bun test tests/watcher.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: 實作 watcher**

建立 `src/watcher.ts`：

```typescript
import { watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'

export interface WatcherEvent {
  readonly type: 'source_changed' | 'json_changed'
  readonly filePath: string
}

export interface WatcherOptions {
  readonly sourceFile: string
  readonly outputDir: string
  readonly debounceMs: number
  readonly onEvent: (event: WatcherEvent) => void
}

export interface Watcher {
  readonly close: () => void
  readonly markSelfWritten: (filePath: string) => void
}

const SELF_WRITE_WINDOW_MS = 500

export function createWatcher(options: WatcherOptions): Watcher {
  const { sourceFile, outputDir, debounceMs, onEvent } = options
  const selfWritten = new Map<string, number>()
  const watchers: FSWatcher[] = []
  let debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function isSelfWritten(filePath: string): boolean {
    const timestamp = selfWritten.get(filePath)
    if (!timestamp) return false
    if (Date.now() - timestamp < SELF_WRITE_WINDOW_MS) return true
    selfWritten.delete(filePath)
    return false
  }

  function debouncedEmit(key: string, event: WatcherEvent): void {
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key)
        onEvent(event)
      }, debounceMs),
    )
  }

  // Watch source file (watch the directory containing it)
  const sourceDir = sourceFile.slice(0, sourceFile.lastIndexOf('/')) || '.'
  const sourceBasename = basename(sourceFile)

  const sourceWatcher = watch(sourceDir, (eventType, filename) => {
    if (filename !== sourceBasename) return
    if (isSelfWritten(sourceFile)) return
    debouncedEmit('source', { type: 'source_changed', filePath: sourceFile })
  })
  watchers.push(sourceWatcher)

  // Watch output directory for JSON changes
  const outputWatcher = watch(outputDir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.json')) return
    const fullPath = join(outputDir, filename)
    if (isSelfWritten(fullPath)) return
    debouncedEmit(`json:${filename}`, { type: 'json_changed', filePath: fullPath })
  })
  watchers.push(outputWatcher)

  return {
    close() {
      for (const w of watchers) {
        w.close()
      }
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer)
      }
      debounceTimers = new Map()
    },
    markSelfWritten(filePath: string) {
      selfWritten.set(filePath, Date.now())
    },
  }
}
```

- [ ] **Step 4: 執行測試確認 pass**

Run: `bun test tests/watcher.test.ts`

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/watcher.ts tests/watcher.test.ts
git commit -m "feat: [watcher] 實作檔案監聽模組（debounce、防迴圈）"
```

---

## Task 9: Watch 指令

**Files:**
- Create: `src/commands/watch.ts`
- Create: `tests/commands/watch.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 寫 watch 指令的 failing test**

建立 `tests/commands/watch.test.ts`：

```typescript
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runWatch, type WatchHandle } from '../../src/commands/watch'

describe('runWatch()', () => {
  let tempDir: string
  let handle: WatchHandle | null = null

  afterEach(async () => {
    handle?.stop()
    handle = null
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test('runs initial pipeline and produces chunks.json', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watch-cmd-'))
    const pdfFixture = join(import.meta.dir, '../fixtures/simple-api.pdf')

    handle = await runWatch(pdfFixture, {
      output: tempDir,
      verbose: false,
      debounce: 100,
    })

    // Wait for initial run
    await new Promise((r) => setTimeout(r, 2000))

    const chunksFile = Bun.file(join(tempDir, 'chunks.json'))
    expect(await chunksFile.exists()).toBe(true)

    const content = await chunksFile.json()
    expect(content.chunks).toBeDefined()
    expect(content.chunks.length).toBeGreaterThan(0)
  })

  test('stop() cleanly shuts down', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watch-cmd-'))
    const pdfFixture = join(import.meta.dir, '../fixtures/simple-api.pdf')

    handle = await runWatch(pdfFixture, {
      output: tempDir,
      verbose: false,
      debounce: 100,
    })

    await new Promise((r) => setTimeout(r, 1000))
    handle.stop()

    // Should not throw
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: 執行測試確認 fail**

Run: `bun test tests/commands/watch.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: 實作 watch 指令**

建立 `src/commands/watch.ts`：

```typescript
import { mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { runAssemble } from './assemble'
import { runInspect } from './inspect'
import { runInspectHtml } from './inspect-html'
import { createWatcher, type Watcher } from '../watcher'
import type { InspectData } from '../types/chunk'

export interface WatchFlags {
  readonly output: string
  readonly verbose: boolean
  readonly debounce: number
  readonly pages?: string
}

export interface WatchHandle {
  readonly stop: () => void
}

function timestamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function summarize(data: InspectData): string {
  const s = data.stats.by_type
  const parts: string[] = []
  if (s.endpoint_definition > 0) parts.push(`${s.endpoint_definition} endpoints`)
  if (s.parameter_table > 0) parts.push(`${s.parameter_table} params`)
  if (s.response_example > 0) parts.push(`${s.response_example} responses`)
  if (s.auth_description > 0) parts.push(`${s.auth_description} auth`)
  if (s.error_codes > 0) parts.push(`${s.error_codes} errors`)
  return `${data.stats.total_chunks} chunks (${parts.join(', ')})`
}

async function runInspectPipeline(
  source: string,
  flags: WatchFlags,
): Promise<InspectData | null> {
  const isUrl = source.startsWith('http://') || source.startsWith('https://')
  const isUrlList = !isUrl && source.endsWith('.txt')
  const isPdf = !isUrl && !isUrlList

  if (isPdf) {
    const result = await runInspect(resolve(source), {
      json: true,
      pages: flags.pages,
    })
    return result.ok ? result.data : null
  }

  const result = await runInspectHtml(source, {
    json: true,
    isUrl,
    isUrlList,
    crawl: false,
    maxDepth: 2,
    maxPages: 50,
    browser: false,
  })
  return result.ok ? result.data : null
}

async function runAssemblePipeline(
  jsonPath: string,
): Promise<boolean> {
  const result = await runAssemble(resolve(jsonPath), {
    json: true,
    stdin: false,
    format: 'json',
  })
  return result.ok
}

export async function runWatch(
  source: string,
  flags: WatchFlags,
): Promise<WatchHandle> {
  const outputDir = resolve(flags.output)
  await mkdir(outputDir, { recursive: true })

  const chunksPath = resolve(outputDir, 'chunks.json')
  const specPath = resolve(outputDir, 'spec.json')

  let watcher: Watcher | null = null

  // Initial run
  const data = await runInspectPipeline(source, flags)
  if (data) {
    const content = JSON.stringify(data, null, 2)
    // Mark before writing to prevent self-trigger
    watcher?.markSelfWritten(chunksPath)
    await Bun.write(chunksPath, content)

    if (flags.verbose) {
      console.log(content)
    } else {
      console.error(`[${timestamp()}] ✓ inspect — ${summarize(data)}`)
    }
  }

  // Start watching
  watcher = createWatcher({
    sourceFile: resolve(source),
    outputDir,
    debounceMs: flags.debounce,
    onEvent: async (event) => {
      if (event.type === 'source_changed') {
        console.error(`[${timestamp()}] ↻ source changed, re-inspecting...`)
        const result = await runInspectPipeline(source, flags)
        if (result) {
          watcher?.markSelfWritten(chunksPath)
          await Bun.write(chunksPath, JSON.stringify(result, null, 2))
          if (flags.verbose) {
            console.log(JSON.stringify(result, null, 2))
          } else {
            console.error(`[${timestamp()}] ✓ inspect — ${summarize(result)}`)
          }
        } else {
          console.error(`[${timestamp()}] ✗ inspect failed`)
        }
      }

      if (event.type === 'json_changed') {
        // Skip spec.json (our own output) — but NOT chunks.json
        // because an AI Agent may edit chunks.json externally
        if (event.filePath === specPath) return

        console.error(`[${timestamp()}] ↻ ${basename(event.filePath)} changed, assembling...`)
        const success = await runAssemblePipeline(event.filePath)
        if (success) {
          watcher?.markSelfWritten(specPath)
          console.error(`[${timestamp()}] ✓ assemble + validate`)
        } else {
          console.error(`[${timestamp()}] ✗ assemble failed`)
        }
      }
    },
  })

  return {
    stop() {
      watcher?.close()
    },
  }
}
```

- [ ] **Step 4: 執行測試確認 pass**

Run: `bun test tests/commands/watch.test.ts`

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/watch.ts tests/commands/watch.test.ts
git commit -m "feat: [commands] 實作 watch 指令"
```

---

## Task 10: CLI 註冊 watch 指令 + 版本更新

**Files:**
- Modify: `src/index.ts`
- Modify: `src/version.ts`

- [ ] **Step 1: 更新 version.ts**

將 `src/version.ts` 中：

```typescript
export const VERSION = '0.2.0'
```

改為：

```typescript
export const VERSION = '0.3.0'
```

- [ ] **Step 2: 在 index.ts 新增 watch 相關 flags**

在 `src/index.ts` 的 `parseArgs` options 中新增：

```typescript
verbose: { type: 'boolean', default: false },
debounce: { type: 'string' },
```

- [ ] **Step 3: 在 index.ts 新增 watch 指令路由**

在 `src/index.ts` 頂部加入 import：

```typescript
import { runWatch } from './commands/watch'
```

在 help text 的 Usage 區塊加入：

```
  doc2api watch <source>         Watch source and auto-rebuild
```

在 Flags 區塊加入：

```
  --verbose     Verbose output (for watch mode)
  --debounce    Debounce delay in ms (default: 300)
```

在 `doctor` 指令區塊後面、`Unknown command` 之前加入：

```typescript
if (command === 'watch') {
  const source = positionals[1]
  if (!source) {
    console.error('Error: doc2api watch requires a source (file path or URL)')
    process.exit(3)
  }

  const debounceMs = parsePositiveInt(values.debounce, 'debounce', 300)

  const handle = await runWatch(source, {
    output: values.outdir ?? '.',
    verbose: values.verbose ?? false,
    debounce: debounceMs,
    pages: values.pages,
  })

  // Graceful shutdown on Ctrl+C
  process.on('SIGINT', () => {
    handle.stop()
    console.error('\nWatch stopped.')
    process.exit(0)
  })

  // Keep process alive
  await new Promise(() => {})
}
```

- [ ] **Step 4: 執行 typecheck + lint**

Run: `bun run typecheck && bun run check`

Expected: 無錯誤

- [ ] **Step 5: 執行全部測試**

Run: `bun test`

Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/version.ts
git commit -m "feat: [cli] 註冊 watch 指令、版本號更新至 v0.3.0"
```

---

## Task 11: 最終驗證

**Files:** None (verification only)

- [ ] **Step 1: 執行完整測試套件**

Run: `bun test`

Expected: 全部 PASS，無 skip、無 fail

- [ ] **Step 2: 執行 typecheck**

Run: `bun run typecheck`

Expected: 無型別錯誤

- [ ] **Step 3: 執行 lint**

Run: `bun run check`

Expected: 無 lint 錯誤

- [ ] **Step 4: 手動測試 inspect 指令確認結構化 content**

Run: `bun run src/index.ts inspect tests/fixtures/simple-api.pdf --json`

Expected: 輸出 JSON 中 chunks 的 content 欄位應包含 `kind` discriminant 的結構化物件（endpoint, parameter, response 等），而非 string。

- [ ] **Step 5: 確認 watch 指令啟動正常**

Run: `bun run src/index.ts watch tests/fixtures/simple-api.pdf --outdir /tmp/watch-test`

Expected: 顯示初始 inspect 摘要，進入監聽模式。Ctrl+C 乾淨退出。
