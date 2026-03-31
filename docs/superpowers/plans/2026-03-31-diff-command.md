# diff 指令 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `diff` command to doc2api that compares classified chunks (from inspect) against an OpenAPI spec and reports missing endpoints.

**Architecture:** New command module `src/commands/diff.ts` following the same pattern as validate/assemble. A `normalizePath()` utility handles path matching. Types in `src/types/diff.ts`. CLI routing added to `src/index.ts`.

**Tech Stack:** Bun, TypeScript, js-yaml (existing transitive dep for YAML parsing), existing `extractEndpoint()` from `src/pipeline/extractors.ts`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/types/diff.ts` | `DiffData`, `DiffEndpoint`, `RelatedChunk`, `DiffFlags` types |
| Create | `src/commands/diff.ts` | `runDiff()` — core diff logic |
| Modify | `src/types/config.ts` | Add `DiffFlags` export (or inline in diff.ts — see types task) |
| Modify | `src/index.ts` | Add `diff` command routing + `--confidence` flag |
| Create | `tests/commands/diff.test.ts` | Unit tests |

---

### Task 1: Types

**Files:**
- Create: `src/types/diff.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// src/types/diff.ts
import type { ChunkType } from './chunk'

export interface RelatedChunk {
  readonly id: string
  readonly type: ChunkType
  readonly confidence: number
}

export interface DiffEndpoint {
  readonly method: string
  readonly path: string
  readonly chunkId: string
  readonly confidence: number
  readonly relatedChunks: readonly RelatedChunk[]
}

export interface DiffSummary {
  readonly totalDocEndpoints: number
  readonly totalSpecEndpoints: number
  readonly missingCount: number
}

export interface DiffData {
  readonly summary: DiffSummary
  readonly missing: readonly DiffEndpoint[]
}

export interface DiffFlags {
  readonly json: boolean
  readonly output?: string
  readonly confidence: number
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run typecheck`
Expected: PASS (no errors related to diff.ts)

- [ ] **Step 3: Commit**

```bash
git add src/types/diff.ts
git commit -m "feat: [diff] 新增 DiffData 型別定義"
```

---

### Task 2: normalizePath utility + tests

**Files:**
- Create: `tests/commands/diff.test.ts`
- Create: `src/commands/diff.ts` (partial — only `normalizePath` exported for testing)

- [ ] **Step 1: Write failing tests for normalizePath**

```typescript
// tests/commands/diff.test.ts
import { describe, expect, test } from 'bun:test'
import { normalizePath } from '../../src/commands/diff'

describe('normalizePath()', () => {
  test('removes trailing slash', () => {
    expect(normalizePath('/orders/')).toBe('/orders')
  })

  test('preserves root slash', () => {
    expect(normalizePath('/')).toBe('/')
  })

  test('normalizes {param} to {_}', () => {
    expect(normalizePath('/orders/{orderId}')).toBe('/orders/{_}')
  })

  test('normalizes :param to {_}', () => {
    expect(normalizePath('/orders/:id')).toBe('/orders/{_}')
  })

  test('normalizes multiple params', () => {
    expect(normalizePath('/users/{userId}/orders/{orderId}')).toBe('/users/{_}/orders/{_}')
  })

  test('lowercases path', () => {
    expect(normalizePath('/Orders/Create')).toBe('/orders/create')
  })

  test('applies all rules together', () => {
    expect(normalizePath('/Users/{userId}/Orders/')).toBe('/users/{_}/orders')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/commands/diff.test.ts`
Expected: FAIL — `normalizePath` not found

- [ ] **Step 3: Implement normalizePath**

```typescript
// src/commands/diff.ts
export function normalizePath(path: string): string {
  let normalized = path

  // 1. Remove trailing slash (but keep root /)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  // 2. Unify path parameters to {_}
  normalized = normalized
    .replace(/\{[^}]+\}/g, '{_}')
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{_}')

  // 3. Lowercase
  normalized = normalized.toLowerCase()

  return normalized
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/commands/diff.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add src/commands/diff.ts tests/commands/diff.test.ts
git commit -m "feat: [diff] 實作 normalizePath 路徑正規化"
```

---

### Task 3: Core runDiff logic + tests

**Files:**
- Modify: `src/commands/diff.ts`
- Modify: `tests/commands/diff.test.ts`

- [ ] **Step 1: Write failing tests for runDiff**

Append to `tests/commands/diff.test.ts`:

```typescript
import { resolve } from 'node:path'
import { runDiff } from '../../src/commands/diff'
import type { Chunk, InspectData } from '../../src/types/chunk'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

function makeChunk(overrides: Partial<Chunk> & { id: string; raw_text: string }): Chunk {
  return {
    page: 1,
    type: 'general_text',
    confidence: 0.9,
    content: null,
    table: null,
    ...overrides,
  }
}

function makeInspectData(chunks: readonly Chunk[]): InspectData {
  return {
    source: 'test.pdf',
    pages: 1,
    language: 'en',
    chunks,
    stats: {
      total_chunks: chunks.length,
      by_type: {
        endpoint_definition: chunks.filter((c) => c.type === 'endpoint_definition').length,
        parameter_table: chunks.filter((c) => c.type === 'parameter_table').length,
        response_example: chunks.filter((c) => c.type === 'response_example').length,
        auth_description: chunks.filter((c) => c.type === 'auth_description').length,
        error_codes: chunks.filter((c) => c.type === 'error_codes').length,
        general_text: chunks.filter((c) => c.type === 'general_text').length,
      },
    },
  }
}

function writeFixture(name: string, content: string): string {
  const path = resolve(FIXTURE_DIR, name)
  Bun.write(path, content)
  return path
}

describe('runDiff()', () => {
  const flags = { json: false, confidence: 0.5 }

  test('returns missing endpoints not in spec', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /v1/orders — List orders',
      }),
      makeChunk({
        id: 'chunk-002',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'POST /v1/orders — Create order',
      }),
    ]
    const inspectPath = writeFixture('diff-inspect.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/v1/orders': {
            get: { responses: { '200': { description: 'OK' } } },
          },
        },
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.summary.totalDocEndpoints).toBe(2)
    expect(result.data.summary.missingCount).toBe(1)
    expect(result.data.missing[0].method).toBe('POST')
    expect(result.data.missing[0].path).toBe('/v1/orders')
  })

  test('returns empty missing when all endpoints match', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /users',
      }),
    ]
    const inspectPath = writeFixture('diff-inspect-match.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec-match.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: { '/users': { get: { responses: { '200': { description: 'OK' } } } } },
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.summary.missingCount).toBe(0)
    expect(result.data.missing).toEqual([])
  })

  test('matches endpoints with different param names', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /orders/{orderId}',
      }),
    ]
    const inspectPath = writeFixture('diff-param.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec-param.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/orders/{id}': {
            get: { responses: { '200': { description: 'OK' } } },
          },
        },
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.summary.missingCount).toBe(0)
  })

  test('collects related chunks after endpoint', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'POST /v1/payments',
      }),
      makeChunk({
        id: 'chunk-002',
        type: 'parameter_table',
        confidence: 0.85,
        raw_text: 'amount | integer | required',
      }),
      makeChunk({
        id: 'chunk-003',
        type: 'response_example',
        confidence: 0.8,
        raw_text: '{"status": "ok"}',
      }),
    ]
    const inspectPath = writeFixture('diff-related.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec-empty.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.missing[0].relatedChunks).toHaveLength(2)
    expect(result.data.missing[0].relatedChunks[0].type).toBe('parameter_table')
    expect(result.data.missing[0].relatedChunks[1].type).toBe('response_example')
  })

  test('filters chunks below confidence threshold', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.3,
        raw_text: 'GET /low-confidence',
      }),
    ]
    const inspectPath = writeFixture('diff-low-conf.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec-empty2.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      }),
    )

    const result = await runDiff(inspectPath, specPath, { ...flags, confidence: 0.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.summary.totalDocEndpoints).toBe(0)
  })

  test('returns error for invalid inspect JSON', async () => {
    const inspectPath = writeFixture('diff-bad.json', 'not json')
    const specPath = writeFixture(
      'diff-spec-ok.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('E6001')
  })

  test('returns error for invalid spec file', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /test',
      }),
    ]
    const inspectPath = writeFixture('diff-ok.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture('diff-bad-spec.json', 'not json or yaml')

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('E6002')
  })

  test('returns error for non-existent inspect file', async () => {
    const result = await runDiff('/no/such/file.json', '/no/spec.json', flags)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('E3001')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/commands/diff.test.ts`
Expected: FAIL — `runDiff` not exported

- [ ] **Step 3: Implement runDiff**

Add to `src/commands/diff.ts` (after `normalizePath`):

```typescript
import { fail, ok } from '../output/result'
import type { Chunk, ChunkType, InspectData } from '../types/chunk'
import type { DiffData, DiffEndpoint, DiffFlags, RelatedChunk } from '../types/diff'
import type { Result } from '../types/result'
import { extractEndpoint } from '../pipeline/extractors'

const RELATED_TYPES: ReadonlySet<ChunkType> = new Set([
  'parameter_table',
  'response_example',
  'error_codes',
  'auth_description',
])

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

function makeEndpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`
}

function collectRelatedChunks(
  chunks: readonly Chunk[],
  startIndex: number,
): readonly RelatedChunk[] {
  const related: RelatedChunk[] = []
  for (let i = startIndex + 1; i < chunks.length; i++) {
    if (chunks[i].type === 'endpoint_definition') break
    if (RELATED_TYPES.has(chunks[i].type)) {
      related.push({
        id: chunks[i].id,
        type: chunks[i].type,
        confidence: chunks[i].confidence,
      })
    }
  }
  return related
}

function parseSpecEndpoints(spec: Record<string, unknown>): ReadonlySet<string> {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined
  if (!paths) return new Set()

  const keys = new Set<string>()
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of Object.keys(methods)) {
      if (HTTP_METHODS.has(method.toLowerCase())) {
        keys.add(makeEndpointKey(method, path))
      }
    }
  }
  return keys
}

function parseYamlOrJson(content: string): unknown {
  // Try JSON first
  try {
    return JSON.parse(content)
  } catch {
    // Fall through to YAML
  }

  // Try YAML (js-yaml is available as transitive dep)
  try {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic require for optional transitive dep
    const yaml = require('js-yaml') as { load: (s: string) => any }
    return yaml.load(content)
  } catch {
    return null
  }
}

export async function runDiff(
  inspectPath: string,
  specPath: string,
  flags: DiffFlags,
): Promise<Result<DiffData>> {
  // Read inspect file
  const inspectFile = Bun.file(inspectPath)
  if (!(await inspectFile.exists())) {
    return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${inspectPath}`, {
      suggestion: 'Check the file path and try again',
      context: { file: inspectPath },
    })
  }

  const inspectRaw = await inspectFile.text()
  let inspectData: InspectData
  try {
    const parsed = JSON.parse(inspectRaw)
    if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
      return fail('E6001', 'INVALID_INSPECT_JSON', 'Inspect JSON missing "chunks" array', {
        suggestion: 'Provide output from "doc2api inspect --json"',
        context: { file: inspectPath },
      })
    }
    inspectData = parsed as InspectData
  } catch {
    return fail('E6001', 'INVALID_INSPECT_JSON', `Failed to parse inspect JSON: ${inspectPath}`, {
      suggestion: 'Provide valid JSON output from "doc2api inspect --json"',
      context: { file: inspectPath },
    })
  }

  // Read spec file
  const specFile = Bun.file(specPath)
  if (!(await specFile.exists())) {
    return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${specPath}`, {
      suggestion: 'Check the file path and try again',
      context: { file: specPath },
    })
  }

  const specRaw = await specFile.text()
  const specParsed = parseYamlOrJson(specRaw)
  if (!specParsed || typeof specParsed !== 'object') {
    return fail('E6002', 'INVALID_SPEC_FILE', `Failed to parse spec file: ${specPath}`, {
      suggestion: 'Provide a valid OpenAPI 3.x spec in JSON or YAML format',
      context: { file: specPath },
    })
  }

  const spec = specParsed as Record<string, unknown>
  const specEndpoints = parseSpecEndpoints(spec)

  // Extract doc endpoints
  const docEndpoints: DiffEndpoint[] = []
  for (let i = 0; i < inspectData.chunks.length; i++) {
    const chunk = inspectData.chunks[i]
    if (chunk.type !== 'endpoint_definition') continue
    if (chunk.confidence < flags.confidence) continue

    const extracted = extractEndpoint(chunk.raw_text, chunk.table)
    if (!extracted) continue

    const key = makeEndpointKey(extracted.method, extracted.path)
    if (!specEndpoints.has(key)) {
      docEndpoints.push({
        method: extracted.method,
        path: extracted.path,
        chunkId: chunk.id,
        confidence: chunk.confidence,
        relatedChunks: collectRelatedChunks(inspectData.chunks, i),
      })
    }
  }

  // Count total doc endpoints (above confidence threshold)
  let totalDocEndpoints = 0
  for (const chunk of inspectData.chunks) {
    if (chunk.type !== 'endpoint_definition') continue
    if (chunk.confidence < flags.confidence) continue
    if (extractEndpoint(chunk.raw_text, chunk.table)) {
      totalDocEndpoints++
    }
  }

  return ok({
    summary: {
      totalDocEndpoints,
      totalSpecEndpoints: specEndpoints.size,
      missingCount: docEndpoints.length,
    },
    missing: docEndpoints,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/commands/diff.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/commands/diff.ts tests/commands/diff.test.ts
git commit -m "feat: [diff] 實作 runDiff 核心比對邏輯"
```

---

### Task 4: YAML spec support test

**Files:**
- Modify: `tests/commands/diff.test.ts`

- [ ] **Step 1: Write failing test for YAML spec input**

Append to `tests/commands/diff.test.ts`:

```typescript
describe('runDiff() YAML spec', () => {
  const flags = { json: false, confidence: 0.5 }

  test('parses YAML spec correctly', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /v1/products',
      }),
    ]
    const inspectPath = writeFixture('diff-yaml-inspect.json', JSON.stringify(makeInspectData(chunks)))
    const yamlContent = `openapi: "3.0.3"
info:
  title: Test
  version: "1.0.0"
paths:
  /v1/products:
    get:
      responses:
        "200":
          description: OK
`
    const specPath = writeFixture('diff-spec.yaml', yamlContent)

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.summary.missingCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test tests/commands/diff.test.ts --filter "YAML"`
Expected: PASS (YAML parsing was already implemented in runDiff via `parseYamlOrJson`)

- [ ] **Step 3: Commit**

```bash
git add tests/commands/diff.test.ts
git commit -m "test: [diff] 新增 YAML spec 解析測試"
```

---

### Task 5: CLI routing in index.ts

**Files:**
- Modify: `src/index.ts`
- Modify: `src/types/config.ts`

- [ ] **Step 1: Add DiffFlags to config.ts**

Append to `src/types/config.ts`:

```typescript
export interface DiffFlags {
  readonly json: boolean
  readonly output?: string
  readonly confidence: number
}
```

Wait — `DiffFlags` is already in `src/types/diff.ts`. Use it from there instead. No change to config.ts needed.

- [ ] **Step 2: Add confidence flag to parseArgs and diff command routing**

In `src/index.ts`, add the import:

```typescript
import { runDiff } from './commands/diff'
```

Add `confidence` to the `parseArgs` options object:

```typescript
    confidence: { type: 'string' },
```

Add the diff command block after the `validate` block (after line 217), before the `doctor` block:

```typescript
  if (command === 'diff') {
    const inspectPath = positionals[1]
    const specPath = positionals[2]

    if (!inspectPath || !specPath) {
      console.error('Error: doc2api diff requires <inspect.json> <spec.yaml>')
      process.exit(3)
    }

    const confidenceStr = values.confidence
    let confidence = 0.5
    if (confidenceStr !== undefined) {
      confidence = Number.parseFloat(confidenceStr)
      if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
        console.error(
          `Error: --confidence must be a number between 0 and 1, got "${confidenceStr}"`,
        )
        process.exit(3)
      }
    }

    const result = await runDiff(resolve(inspectPath), resolve(specPath), {
      json: jsonMode,
      output: values.output,
      confidence,
    })

    if (result.ok) {
      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        const { summary, missing } = result.data
        if (summary.totalDocEndpoints === 0) {
          console.error(
            '⚠ No endpoint chunks found — is this the right inspect output?',
          )
        }
        if (summary.missingCount === 0) {
          console.log(
            `✓ All ${summary.totalDocEndpoints} documented endpoints found in spec.`,
          )
        } else {
          console.log(
            `Missing endpoints (${summary.missingCount} of ${summary.totalDocEndpoints}):`,
          )
          for (const ep of missing) {
            const related =
              ep.relatedChunks.length > 0
                ? `(${ep.relatedChunks.length} related: ${ep.relatedChunks.map((r) => r.type).join(', ')})`
                : '(0 related)'
            console.log(`  ${ep.method} ${ep.path}  ${related}`)
          }
        }
      }

      if (values.output) {
        await Bun.write(resolve(values.output), JSON.stringify(result.data, null, 2))
        console.error(`Wrote diff report to ${values.output}`)
      }

      process.exit(summary.missingCount > 0 ? 1 : 0)
    }

    console.log(formatOutput(result, jsonMode))
    process.exit(2)
  }
```

- [ ] **Step 3: Update help text**

In the help block, add the diff line after validate:

```
  doc2api diff <inspect.json> <spec.yaml>  Compare chunks against spec
```

And add the `--confidence` flag in the flags section:

```
  --confidence    Endpoint confidence threshold (0-1, default: 0.5)
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Manual smoke test**

Run: `bun run src/index.ts diff --help`
Expected: shows help with diff listed

Run: `bun run src/index.ts diff`
Expected: error message "doc2api diff requires <inspect.json> <spec.yaml>"

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: [diff] 新增 diff 指令 CLI 路由與格式化輸出"
```

---

### Task 6: E2E integration test

**Files:**
- Modify: `tests/commands/diff.test.ts`

- [ ] **Step 1: Write integration test simulating full pipeline**

Append to `tests/commands/diff.test.ts`:

```typescript
describe('runDiff() integration', () => {
  test('full scenario: 3 endpoints, 1 missing with related chunks', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /api/users — List all users',
      }),
      makeChunk({
        id: 'chunk-002',
        type: 'parameter_table',
        confidence: 0.85,
        raw_text: 'page | integer | optional',
      }),
      makeChunk({
        id: 'chunk-003',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'POST /api/users — Create a user',
      }),
      makeChunk({
        id: 'chunk-004',
        type: 'response_example',
        confidence: 0.8,
        raw_text: '{"id": 1, "name": "test"}',
      }),
      makeChunk({
        id: 'chunk-005',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'DELETE /api/users/{userId}',
      }),
      makeChunk({
        id: 'chunk-006',
        type: 'general_text',
        confidence: 0.3,
        raw_text: 'This endpoint is dangerous.',
      }),
    ]

    const inspectPath = writeFixture('diff-integration.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-integration-spec.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Users API', version: '1.0.0' },
        paths: {
          '/api/users': {
            get: { responses: { '200': { description: 'OK' } } },
          },
          '/api/users/{id}': {
            delete: { responses: { '204': { description: 'No Content' } } },
          },
        },
      }),
    )

    const result = await runDiff(inspectPath, specPath, { json: false, confidence: 0.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 3 doc endpoints, 2 in spec, 1 missing
    expect(result.data.summary.totalDocEndpoints).toBe(3)
    expect(result.data.summary.totalSpecEndpoints).toBe(2)
    expect(result.data.summary.missingCount).toBe(1)

    // Missing: POST /api/users with 1 related chunk (response_example)
    expect(result.data.missing[0].method).toBe('POST')
    expect(result.data.missing[0].path).toBe('/api/users')
    expect(result.data.missing[0].relatedChunks).toHaveLength(1)
    expect(result.data.missing[0].relatedChunks[0].type).toBe('response_example')

    // DELETE matched despite different param name ({userId} vs {id})
  })
})
```

- [ ] **Step 2: Run all diff tests**

Run: `bun test tests/commands/diff.test.ts`
Expected: PASS — all tests green

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: PASS — no regressions

- [ ] **Step 4: Run lint**

Run: `bun run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/commands/diff.test.ts
git commit -m "test: [diff] 新增整合測試覆蓋完整比對場景"
```

---

### Task 7: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add diff to command list**

In the `## Commands` section, add:

```bash
bun run src/index.ts diff <inspect.json> <spec.yaml>  # Compare chunks vs spec
```

- [ ] **Step 2: Add diff to architecture description**

In the `### Command handlers` section, add:

```
- **diff.ts** — Chunk-vs-spec comparison. Reads InspectData JSON + OpenAPI YAML/JSON, reports missing endpoints with related chunks.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: [diff] 更新 AGENTS.md 新增 diff 指令說明"
```
