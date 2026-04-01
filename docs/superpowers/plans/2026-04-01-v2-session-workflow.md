# v2 Session Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-based workflow to doc2api so AI Agents can process API documentation one endpoint group at a time, with submit/validate/resume support.

**Architecture:** New `group` pipeline stage clusters chunks by endpoint. A `session` module manages state persistence, cursor-based iteration, and endpoint submission. CLI gets a `session` subcommand group routed through a refactored command router.

**Tech Stack:** Bun, TypeScript (strict), Biome linter, bun:test

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/types/group.ts` | `EndpointGroup`, `PreambleGroup`, `GroupedResult` types |
| `src/types/session.ts` | `Session`, `SubmittedEndpoint` types |
| `src/pipeline/group.ts` | `groupChunks()` — clusters refined chunks into endpoint groups |
| `src/session/session-store.ts` | Read/write session JSON to `.doc2api/sessions/`, atomic writes |
| `src/session/session-manager.ts` | Session lifecycle: create, next, submit, skip, current, finish, discard |
| `src/session/submit-validator.ts` | Validate `EndpointDef` submissions, return warnings |
| `src/commands/session.ts` | `runSession()` — route session subcommands |
| `src/cli/router.ts` | Extracted command routing logic from `index.ts` |
| `tests/pipeline/group.test.ts` | Unit tests for grouping |
| `tests/session/session-store.test.ts` | Unit tests for store |
| `tests/session/session-manager.test.ts` | Unit tests for manager |
| `tests/session/submit-validator.test.ts` | Unit tests for validation |
| `tests/commands/session.test.ts` | Integration tests for session CLI flow |

### Modified files

| File | Change |
|------|--------|
| `src/index.ts` | Slim down to thin entry point, delegate to `cli/router.ts` |
| `src/lib.ts` | Export `groupChunks` and group types |
| `src/types/config.ts` | Add `SessionFlags` type |
| `skills/SKILL.md` | Add session workflow documentation |

---

### Task 1: Group types

**Files:**
- Create: `src/types/group.ts`

- [ ] **Step 1: Create group type definitions**

```typescript
// src/types/group.ts
import type { Chunk } from './chunk'

export interface EndpointGroup {
  readonly groupId: string
  readonly anchor: Chunk
  readonly related: readonly Chunk[]
  readonly summary: string
}

export interface PreambleGroup {
  readonly groupId: '_preamble'
  readonly chunks: readonly Chunk[]
}

export interface GroupedResult {
  readonly preamble: PreambleGroup
  readonly groups: readonly EndpointGroup[]
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bun run typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/types/group.ts
git commit -m "feat: [v2] 新增 EndpointGroup 型別定義"
```

---

### Task 2: Group pipeline stage

**Files:**
- Create: `tests/pipeline/group.test.ts`
- Create: `src/pipeline/group.ts`

- [ ] **Step 1: Write failing tests for groupChunks**

```typescript
// tests/pipeline/group.test.ts
import { describe, expect, test } from 'bun:test'
import { groupChunks } from '../../src/pipeline/group'
import type { Chunk } from '../../src/types/chunk'

function makeChunk(overrides: Partial<Chunk> & { id: string; type: Chunk['type'] }): Chunk {
  return {
    page: 1,
    confidence: 0.8,
    content: null,
    raw_text: 'text',
    table: null,
    ...overrides,
  }
}

function makeEndpoint(id: string, method: string, path: string): Chunk {
  return makeChunk({
    id,
    type: 'endpoint_definition',
    content: { kind: 'endpoint', method, path, summary: null },
  })
}

describe('groupChunks', () => {
  test('empty input returns empty groups and empty preamble', () => {
    const result = groupChunks([])
    expect(result.preamble.groupId).toBe('_preamble')
    expect(result.preamble.chunks).toEqual([])
    expect(result.groups).toEqual([])
  })

  test('chunks before first endpoint go to preamble', () => {
    const chunks: readonly Chunk[] = [
      makeChunk({ id: 'c1', type: 'auth_description' }),
      makeChunk({ id: 'c2', type: 'general_text' }),
    ]
    const result = groupChunks(chunks)
    expect(result.preamble.chunks).toHaveLength(2)
    expect(result.groups).toEqual([])
  })

  test('single endpoint with related chunks forms one group', () => {
    const chunks: readonly Chunk[] = [
      makeEndpoint('e1', 'GET', '/users'),
      makeChunk({ id: 'p1', type: 'parameter_table' }),
      makeChunk({ id: 'r1', type: 'response_example' }),
    ]
    const result = groupChunks(chunks)
    expect(result.preamble.chunks).toEqual([])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].anchor.id).toBe('e1')
    expect(result.groups[0].related).toHaveLength(2)
    expect(result.groups[0].summary).toBe('GET /users')
  })

  test('multiple endpoints split into separate groups', () => {
    const chunks: readonly Chunk[] = [
      makeEndpoint('e1', 'GET', '/users'),
      makeChunk({ id: 'p1', type: 'parameter_table' }),
      makeEndpoint('e2', 'POST', '/users'),
      makeChunk({ id: 'r2', type: 'response_example' }),
    ]
    const result = groupChunks(chunks)
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].anchor.id).toBe('e1')
    expect(result.groups[0].related).toHaveLength(1)
    expect(result.groups[1].anchor.id).toBe('e2')
    expect(result.groups[1].related).toHaveLength(1)
  })

  test('preamble + endpoints mixed correctly', () => {
    const chunks: readonly Chunk[] = [
      makeChunk({ id: 'a1', type: 'auth_description' }),
      makeEndpoint('e1', 'DELETE', '/users/{id}'),
      makeChunk({ id: 'err1', type: 'error_codes' }),
    ]
    const result = groupChunks(chunks)
    expect(result.preamble.chunks).toHaveLength(1)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].related).toHaveLength(1)
  })

  test('groupId is sequential g-001, g-002, ...', () => {
    const chunks: readonly Chunk[] = [
      makeEndpoint('e1', 'GET', '/a'),
      makeEndpoint('e2', 'GET', '/b'),
      makeEndpoint('e3', 'GET', '/c'),
    ]
    const result = groupChunks(chunks)
    expect(result.groups.map((g) => g.groupId)).toEqual(['g-001', 'g-002', 'g-003'])
  })

  test('summary extracts method and path from endpoint content', () => {
    const chunks: readonly Chunk[] = [
      makeEndpoint('e1', 'PUT', '/items/{id}'),
    ]
    const result = groupChunks(chunks)
    expect(result.groups[0].summary).toBe('PUT /items/{id}')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline/group.test.ts`
Expected: FAIL — `Cannot find module '../../src/pipeline/group'`

- [ ] **Step 3: Implement groupChunks**

```typescript
// src/pipeline/group.ts
import type { Chunk } from '../types/chunk'
import type { EndpointGroup, GroupedResult, PreambleGroup } from '../types/group'

function buildSummary(anchor: Chunk): string {
  if (anchor.content && anchor.content.kind === 'endpoint') {
    return `${anchor.content.method} ${anchor.content.path}`
  }
  return anchor.raw_text.slice(0, 80)
}

function formatGroupId(index: number): string {
  return `g-${String(index + 1).padStart(3, '0')}`
}

export function groupChunks(chunks: readonly Chunk[]): GroupedResult {
  const preambleChunks: Chunk[] = []
  const groups: EndpointGroup[] = []

  let currentAnchor: Chunk | null = null
  let currentRelated: Chunk[] = []

  for (const chunk of chunks) {
    if (chunk.type === 'endpoint_definition') {
      // Flush previous group
      if (currentAnchor) {
        groups.push({
          groupId: formatGroupId(groups.length),
          anchor: currentAnchor,
          related: currentRelated,
          summary: buildSummary(currentAnchor),
        })
      }
      currentAnchor = chunk
      currentRelated = []
    } else if (currentAnchor) {
      currentRelated.push(chunk)
    } else {
      preambleChunks.push(chunk)
    }
  }

  // Flush last group
  if (currentAnchor) {
    groups.push({
      groupId: formatGroupId(groups.length),
      anchor: currentAnchor,
      related: currentRelated,
      summary: buildSummary(currentAnchor),
    })
  }

  const preamble: PreambleGroup = {
    groupId: '_preamble',
    chunks: preambleChunks,
  }

  return { preamble, groups }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/pipeline/group.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/group.ts tests/pipeline/group.test.ts
git commit -m "feat: [v2] 實作 groupChunks pipeline 階段"
```

---

### Task 3: Session types

**Files:**
- Create: `src/types/session.ts`
- Modify: `src/types/config.ts`

- [ ] **Step 1: Create session type definitions**

```typescript
// src/types/session.ts
import type { EndpointDef } from './endpoint'
import type { EndpointGroup, PreambleGroup } from './group'

export interface SubmittedEndpoint {
  readonly groupId: string
  readonly endpoints: readonly EndpointDef[]
  readonly submittedAt: string
}

export interface Session {
  readonly id: string
  readonly source: string
  readonly createdAt: string
  readonly preamble: PreambleGroup
  readonly groups: readonly EndpointGroup[]
  readonly cursor: number
  readonly submitted: readonly SubmittedEndpoint[]
  readonly skipped: readonly string[]
  readonly status: 'active' | 'finished'
}
```

- [ ] **Step 2: Add SessionFlags to config.ts**

Add to the end of `src/types/config.ts`:

```typescript
export interface SessionFlags {
  readonly output?: string
  readonly format: 'yaml' | 'json'
  readonly pages?: string
  readonly crawl: boolean
  readonly maxDepth: number
  readonly maxPages: number
  readonly browser: boolean
  readonly requestDelay: number
  readonly noRobots: boolean
  readonly maxRetries: number
}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/session.ts src/types/config.ts
git commit -m "feat: [v2] 新增 Session 和 SessionFlags 型別定義"
```

---

### Task 4: Session store

**Files:**
- Create: `tests/session/session-store.test.ts`
- Create: `src/session/session-store.ts`

- [ ] **Step 1: Write failing tests for session store**

```typescript
// tests/session/session-store.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findActiveSession,
  readSession,
  removeSession,
  writeSession,
} from '../../src/session/session-store'
import type { Session } from '../../src/types/session'

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 'test-id',
    source: 'test.pdf',
    createdAt: '2026-04-01T00:00:00.000Z',
    preamble: { groupId: '_preamble', chunks: [] },
    groups: [],
    cursor: 0,
    submitted: [],
    skipped: [],
    status: 'active',
    ...overrides,
  }
}

describe('session-store', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  })

  test('writeSession + readSession roundtrip', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    const session = makeSession()
    await writeSession(tempDir, session)
    const loaded = await readSession(tempDir, 'test-id')
    expect(loaded).toEqual(session)
  })

  test('readSession returns null for missing session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    const loaded = await readSession(tempDir, 'nonexistent')
    expect(loaded).toBeNull()
  })

  test('findActiveSession returns active session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    const session = makeSession()
    await writeSession(tempDir, session)
    const found = await findActiveSession(tempDir)
    expect(found).toEqual(session)
  })

  test('findActiveSession ignores finished sessions', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await writeSession(tempDir, makeSession({ status: 'finished' }))
    const found = await findActiveSession(tempDir)
    expect(found).toBeNull()
  })

  test('removeSession deletes the file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await writeSession(tempDir, makeSession())
    await removeSession(tempDir, 'test-id')
    const loaded = await readSession(tempDir, 'test-id')
    expect(loaded).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/session/session-store.test.ts`
Expected: FAIL — `Cannot find module '../../src/session/session-store'`

- [ ] **Step 3: Implement session store**

```typescript
// src/session/session-store.ts
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { Session } from '../types/session'

const SESSIONS_DIR = '.doc2api/sessions'

function sessionsPath(baseDir: string): string {
  return join(baseDir, SESSIONS_DIR)
}

function sessionFilePath(baseDir: string, sessionId: string): string {
  return join(sessionsPath(baseDir), `${sessionId}.json`)
}

export async function writeSession(baseDir: string, session: Session): Promise<void> {
  const dir = sessionsPath(baseDir)
  await mkdir(dir, { recursive: true })
  const filePath = sessionFilePath(baseDir, session.id)
  const tmpPath = `${filePath}.tmp`
  await Bun.write(tmpPath, JSON.stringify(session, null, 2))
  const file = Bun.file(tmpPath)
  await Bun.write(filePath, file)
  await unlink(tmpPath)
}

export async function readSession(baseDir: string, sessionId: string): Promise<Session | null> {
  const filePath = sessionFilePath(baseDir, sessionId)
  const file = Bun.file(filePath)
  if (!(await file.exists())) return null
  const text = await file.text()
  return JSON.parse(text) as Session
}

export async function findActiveSession(baseDir: string): Promise<Session | null> {
  const dir = sessionsPath(baseDir)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return null
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const sessionId = entry.replace('.json', '')
    const session = await readSession(baseDir, sessionId)
    if (session && session.status === 'active') return session
  }

  return null
}

export async function removeSession(baseDir: string, sessionId: string): Promise<void> {
  const filePath = sessionFilePath(baseDir, sessionId)
  try {
    await unlink(filePath)
  } catch {
    // File already gone, no-op
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/session/session-store.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/session-store.ts tests/session/session-store.test.ts
git commit -m "feat: [v2] 實作 session store 持久化層"
```

---

### Task 5: Submit validator

**Files:**
- Create: `tests/session/submit-validator.test.ts`
- Create: `src/session/submit-validator.ts`

- [ ] **Step 1: Write failing tests for submit validator**

```typescript
// tests/session/submit-validator.test.ts
import { describe, expect, test } from 'bun:test'
import { validateSubmission } from '../../src/session/submit-validator'

describe('validateSubmission', () => {
  test('valid endpoint passes with no warnings', () => {
    const result = validateSubmission({
      method: 'GET',
      path: '/users',
      responses: { '200': { description: 'OK' } },
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual([])
  })

  test('missing method returns warning', () => {
    const result = validateSubmission({
      path: '/users',
      responses: {},
    })
    expect(result.valid).toBe(false)
    expect(result.warnings).toContain('Missing required field: method')
  })

  test('missing path returns warning', () => {
    const result = validateSubmission({
      method: 'GET',
      responses: {},
    })
    expect(result.valid).toBe(false)
    expect(result.warnings).toContain('Missing required field: path')
  })

  test('invalid HTTP method returns warning', () => {
    const result = validateSubmission({
      method: 'FETCH',
      path: '/users',
      responses: {},
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('Invalid HTTP method: FETCH')
  })

  test('path not starting with / returns warning', () => {
    const result = validateSubmission({
      method: 'GET',
      path: 'users',
      responses: {},
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('Path should start with /: users')
  })

  test('parameter missing name returns warning', () => {
    const result = validateSubmission({
      method: 'GET',
      path: '/users',
      parameters: [{ in: 'query', schema: { type: 'string' } }],
      responses: {},
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('Parameter [0] missing "name"')
  })

  test('parameter missing in returns warning', () => {
    const result = validateSubmission({
      method: 'GET',
      path: '/users',
      parameters: [{ name: 'id', schema: { type: 'string' } }],
      responses: {},
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('Parameter [0] missing "in"')
  })

  test('multiple warnings accumulate', () => {
    const result = validateSubmission({
      method: 'FETCH',
      path: 'users',
      responses: {},
    })
    expect(result.warnings).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/session/submit-validator.test.ts`
Expected: FAIL — `Cannot find module '../../src/session/submit-validator'`

- [ ] **Step 3: Implement submit validator**

```typescript
// src/session/submit-validator.ts
export interface ValidationResult {
  readonly valid: boolean
  readonly warnings: readonly string[]
}

const VALID_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE',
])

export function validateSubmission(data: Record<string, unknown>): ValidationResult {
  const warnings: string[] = []

  const method = data.method
  const path = data.path

  if (typeof method !== 'string' || !method) {
    warnings.push('Missing required field: method')
  }

  if (typeof path !== 'string' || !path) {
    warnings.push('Missing required field: path')
  }

  const hasCriticalError = warnings.length > 0
  if (hasCriticalError) {
    return { valid: false, warnings }
  }

  if (!VALID_METHODS.has((method as string).toUpperCase())) {
    warnings.push(`Invalid HTTP method: ${method}`)
  }

  if (!(path as string).startsWith('/')) {
    warnings.push(`Path should start with /: ${path}`)
  }

  const parameters = data.parameters
  if (Array.isArray(parameters)) {
    for (const [i, param] of parameters.entries()) {
      if (typeof param !== 'object' || param === null) continue
      const p = param as Record<string, unknown>
      if (typeof p.name !== 'string' || !p.name) {
        warnings.push(`Parameter [${i}] missing "name"`)
      }
      if (typeof p.in !== 'string' || !p.in) {
        warnings.push(`Parameter [${i}] missing "in"`)
      }
    }
  }

  return { valid: true, warnings }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/session/submit-validator.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/submit-validator.ts tests/session/submit-validator.test.ts
git commit -m "feat: [v2] 實作 submit-validator 提交驗證邏輯"
```

---

### Task 6: Session manager

**Files:**
- Create: `tests/session/session-manager.test.ts`
- Create: `src/session/session-manager.ts`

- [ ] **Step 1: Write failing tests for session manager**

```typescript
// tests/session/session-manager.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createSession,
  currentGroup,
  discardSession,
  finishSession,
  nextGroup,
  sessionStatus,
  skipGroup,
  submitEndpoints,
} from '../../src/session/session-manager'
import type { EndpointGroup, PreambleGroup } from '../../src/types/group'
import type { Chunk } from '../../src/types/chunk'

function makeChunk(id: string, type: Chunk['type']): Chunk {
  return {
    id,
    page: 1,
    type,
    confidence: 0.8,
    content: type === 'endpoint_definition'
      ? { kind: 'endpoint', method: 'GET', path: '/test', summary: null }
      : null,
    raw_text: 'text',
    table: null,
  }
}

const testPreamble: PreambleGroup = {
  groupId: '_preamble',
  chunks: [makeChunk('auth1', 'auth_description')],
}

const testGroups: readonly EndpointGroup[] = [
  {
    groupId: 'g-001',
    anchor: makeChunk('e1', 'endpoint_definition'),
    related: [makeChunk('p1', 'parameter_table')],
    summary: 'GET /users',
  },
  {
    groupId: 'g-002',
    anchor: makeChunk('e2', 'endpoint_definition'),
    related: [makeChunk('r2', 'response_example')],
    summary: 'POST /users',
  },
]

describe('session-manager', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  })

  test('createSession creates an active session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    const result = await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.status).toBe('active')
      expect(result.data.groups).toHaveLength(2)
      expect(result.data.cursor).toBe(0)
    }
  })

  test('createSession fails if active session exists', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    const result = await createSession(tempDir, 'other.pdf', testPreamble, testGroups)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E7002')
    }
  })

  test('nextGroup returns groups in order', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    const r1 = await nextGroup(tempDir)
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      expect(r1.data.group.groupId).toBe('g-001')
      expect(r1.data.progress).toBe('1/2')
    }
  })

  test('nextGroup advances cursor', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    const r2 = await nextGroup(tempDir)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.data.group.groupId).toBe('g-002')
      expect(r2.data.progress).toBe('2/2')
    }
  })

  test('nextGroup returns E7003 when exhausted', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    await nextGroup(tempDir)
    const r3 = await nextGroup(tempDir)
    expect(r3.ok).toBe(false)
    if (!r3.ok) expect(r3.error.code).toBe('E7003')
  })

  test('currentGroup returns current without advancing', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    const c1 = await currentGroup(tempDir)
    const c2 = await currentGroup(tempDir)
    expect(c1.ok).toBe(true)
    expect(c2.ok).toBe(true)
    if (c1.ok && c2.ok) {
      expect(c1.data.group.groupId).toBe(c2.data.group.groupId)
    }
  })

  test('skipGroup advances cursor without submission', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    await skipGroup(tempDir)
    const status = await sessionStatus(tempDir)
    expect(status.ok).toBe(true)
    if (status.ok) {
      expect(status.data.skipped).toBe(1)
    }
  })

  test('submitEndpoints stores endpoints for current group', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    const result = await submitEndpoints(tempDir, 'g-001', [{
      method: 'GET',
      path: '/users',
      responses: { '200': { description: 'OK' } },
    }])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.accepted).toBe(true)
      expect(result.data.remaining).toBe(1)
    }
  })

  test('sessionStatus returns correct counts', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    const status = await sessionStatus(tempDir)
    expect(status.ok).toBe(true)
    if (status.ok) {
      expect(status.data.total).toBe(2)
      expect(status.data.processed).toBe(0)
      expect(status.data.remaining).toBe(2)
      expect(status.data.status).toBe('active')
    }
  })

  test('finishSession assembles spec from submitted endpoints', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    await submitEndpoints(tempDir, 'g-001', [{
      method: 'GET',
      path: '/users',
      responses: { '200': { description: 'OK' } },
    }])
    await nextGroup(tempDir)
    await submitEndpoints(tempDir, 'g-002', [{
      method: 'POST',
      path: '/users',
      responses: { '201': { description: 'Created' } },
    }])
    const result = await finishSession(tempDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.spec.paths).toBeDefined()
      expect(result.data.endpointCount).toBe(2)
    }
  })

  test('discardSession removes the session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    const result = await discardSession(tempDir)
    expect(result.ok).toBe(true)
    const status = await sessionStatus(tempDir)
    expect(status.ok).toBe(false)
    if (!status.ok) expect(status.error.code).toBe('E7001')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/session/session-manager.test.ts`
Expected: FAIL — `Cannot find module '../../src/session/session-manager'`

- [ ] **Step 3: Implement session manager**

```typescript
// src/session/session-manager.ts
import { randomUUID } from 'node:crypto'
import { buildOpenApiSpec } from '../assembler/openapi-builder'
import type { AssembleData } from '../commands/assemble'
import { fail, ok } from '../output/result'
import type { EndpointDef } from '../types/endpoint'
import type { EndpointGroup, PreambleGroup } from '../types/group'
import type { Result } from '../types/result'
import type { Session, SubmittedEndpoint } from '../types/session'
import { findActiveSession, readSession, removeSession, writeSession } from './session-store'
import { validateSubmission } from './submit-validator'

interface NextGroupData {
  readonly group: EndpointGroup
  readonly progress: string
}

interface SubmitData {
  readonly groupId: string
  readonly accepted: boolean
  readonly warnings: readonly string[]
  readonly remaining: number
}

interface StatusData {
  readonly sessionId: string
  readonly source: string
  readonly total: number
  readonly processed: number
  readonly skipped: number
  readonly remaining: number
  readonly status: 'active' | 'finished'
}

function noActiveSession(): Result<never> {
  return fail('E7001', 'NO_ACTIVE_SESSION', 'No active session found', {
    suggestion: 'Run "doc2api session start <source>" to create a session',
  })
}

async function getActive(baseDir: string): Promise<Result<Session>> {
  const session = await findActiveSession(baseDir)
  if (!session) return noActiveSession()
  return ok(session)
}

export async function createSession(
  baseDir: string,
  source: string,
  preamble: PreambleGroup,
  groups: readonly EndpointGroup[],
): Promise<Result<Session>> {
  const existing = await findActiveSession(baseDir)
  if (existing) {
    return fail('E7002', 'SESSION_ALREADY_ACTIVE', `An active session already exists for "${existing.source}"`, {
      suggestion: 'Run "doc2api session discard" to remove it, or "doc2api session finish" to complete it',
    })
  }

  const session: Session = {
    id: randomUUID(),
    source,
    createdAt: new Date().toISOString(),
    preamble,
    groups,
    cursor: 0,
    submitted: [],
    skipped: [],
    status: 'active',
  }

  await writeSession(baseDir, session)
  return ok(session)
}

export async function nextGroup(baseDir: string): Promise<Result<NextGroupData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data
  if (session.cursor >= session.groups.length) {
    return fail('E7003', 'SESSION_EXHAUSTED', 'All groups have been processed', {
      suggestion: 'Run "doc2api session finish" to assemble the final spec',
    })
  }

  const group = session.groups[session.cursor]
  const updated: Session = {
    ...session,
    cursor: session.cursor + 1,
  }
  await writeSession(baseDir, updated)

  return ok({
    group,
    progress: `${session.cursor + 1}/${session.groups.length}`,
  })
}

export async function currentGroup(baseDir: string): Promise<Result<NextGroupData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data
  const index = session.cursor > 0 ? session.cursor - 1 : 0
  if (session.groups.length === 0) {
    return fail('E7003', 'SESSION_EXHAUSTED', 'No groups in this session', {
      suggestion: 'Run "doc2api session finish" to assemble the final spec',
    })
  }

  const group = session.groups[index]
  return ok({
    group,
    progress: `${index + 1}/${session.groups.length}`,
  })
}

export async function skipGroup(baseDir: string): Promise<Result<{ readonly remaining: number }>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data
  const index = session.cursor > 0 ? session.cursor - 1 : 0
  const groupId = session.groups[index]?.groupId

  const updated: Session = {
    ...session,
    skipped: groupId ? [...session.skipped, groupId] : session.skipped,
  }
  await writeSession(baseDir, updated)

  const remaining = session.groups.length - session.cursor
  return ok({ remaining })
}

export async function submitEndpoints(
  baseDir: string,
  groupId: string,
  endpoints: readonly EndpointDef[],
): Promise<Result<SubmitData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data

  const allWarnings: string[] = []
  for (const ep of endpoints) {
    const validation = validateSubmission(ep as unknown as Record<string, unknown>)
    allWarnings.push(...validation.warnings)
  }

  const submission: SubmittedEndpoint = {
    groupId,
    endpoints,
    submittedAt: new Date().toISOString(),
  }

  // Replace existing submission for same groupId, or append
  const existingIndex = session.submitted.findIndex((s) => s.groupId === groupId)
  const newSubmitted = existingIndex >= 0
    ? session.submitted.map((s, i) => (i === existingIndex ? submission : s))
    : [...session.submitted, submission]

  const updated: Session = {
    ...session,
    submitted: newSubmitted,
  }
  await writeSession(baseDir, updated)

  const remaining = session.groups.length - session.cursor
  return ok({
    groupId,
    accepted: true,
    warnings: allWarnings,
    remaining,
  })
}

export async function sessionStatus(baseDir: string): Promise<Result<StatusData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data
  return ok({
    sessionId: session.id,
    source: session.source,
    total: session.groups.length,
    processed: session.submitted.length,
    skipped: session.skipped.length,
    remaining: session.groups.length - session.cursor,
    status: session.status,
  })
}

export async function finishSession(baseDir: string): Promise<Result<AssembleData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data

  const allEndpoints: EndpointDef[] = []
  for (const sub of session.submitted) {
    allEndpoints.push(...sub.endpoints)
  }

  const spec = buildOpenApiSpec({
    info: { title: session.source, version: '1.0.0' },
    endpoints: allEndpoints,
  })

  const updated: Session = {
    ...session,
    status: 'finished',
  }
  await writeSession(baseDir, updated)

  return ok({
    spec,
    endpointCount: allEndpoints.length,
    pathCount: Object.keys(spec.paths).length,
  })
}

export async function discardSession(baseDir: string): Promise<Result<{ readonly discarded: boolean }>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  await removeSession(baseDir, result.data.id)
  return ok({ discarded: true })
}

export async function getPreamble(baseDir: string): Promise<Result<PreambleGroup>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result
  return ok(result.data.preamble)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/session/session-manager.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/session/session-manager.ts tests/session/session-manager.test.ts
git commit -m "feat: [v2] 實作 session-manager 生命週期管理"
```

---

### Task 7: CLI router extraction

**Files:**
- Create: `src/cli/router.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create router.ts with extracted routing logic**

Extract the command routing from `src/index.ts` into `src/cli/router.ts`. The router receives parsed args and dispatches to command handlers.

```typescript
// src/cli/router.ts
import { resolve } from 'node:path'
import { validateFilePath, validatePages } from '../bridge/pdfplumber'
import { runAssemble } from '../commands/assemble'
import { runDiff } from '../commands/diff'
import { runDoctor } from '../commands/doctor'
import { runInspect } from '../commands/inspect'
import { runInspectHtml } from '../commands/inspect-html'
import { runSession } from '../commands/session'
import { runValidate } from '../commands/validate'
import { runWatch } from '../commands/watch'
import { formatOutput } from '../output/formatter'
import { VERSION } from '../version'

interface ParsedArgs {
  readonly command: string | undefined
  readonly positionals: readonly string[]
  readonly values: Record<string, string | boolean | undefined>
}

function formatAsYaml(data: unknown): string {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic require for optional transitive dep
  const yaml = require('js-yaml') as { dump: (data: any, opts?: any) => string }
  return yaml.dump(data, { lineWidth: 100, noRefs: true })
}

export function parsePositiveInt(
  value: string | undefined,
  name: string,
  defaultValue: number,
): number {
  if (!value) return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 0) {
    console.error(`Error: --${name} must be a non-negative integer, got "${value}"`)
    process.exit(3)
  }
  return parsed
}

export async function route(args: ParsedArgs): Promise<void> {
  const { command, positionals, values } = args
  const jsonMode = (values.json as boolean) ?? false

  if (values.version) {
    console.error(`doc2api v${VERSION}`)
    process.exit(0)
  }

  if (!command || command === 'help' || values.help) {
    console.error(`doc2api v${VERSION} — Convert API docs to OpenAPI 3.x

Usage:
  doc2api inspect <source>       Extract and classify content (PDF or URL)
  doc2api assemble <file.json>   Assemble endpoints into OpenAPI spec
  doc2api validate <file.json>   Validate an OpenAPI spec
  doc2api diff <inspect.json> <spec.yaml>  Compare chunks against spec
  doc2api session <subcommand>   Session-based workflow for AI Agents
  doc2api doctor                 Check environment dependencies
  doc2api watch <source>         Watch source and auto-rebuild

Flags:
  --json          Output in JSON format (for AI agents)
  -o, --output    Output file path
  --pages         Page range (e.g., 1-10)
  --stdin         Read input from stdin
  --format        Output format: yaml (default) or json
  --crawl         Crawl linked pages from the entry URL
  --max-depth     Max crawl depth (default: 2)
  --max-pages     Max pages to crawl (default: 50)
  --browser       Force Playwright browser for SPA rendering
  --verbose         Verbose output (for watch mode)
  --debounce        Debounce delay in ms (default: 300)
  --request-delay   Delay between crawl batches in ms (default: 200)
  --no-robots       Ignore robots.txt (default: respect it)
  --checkpoint-dir  Directory for crawl checkpoints (enables resume)
  --resume          Resume interrupted crawl from checkpoint
  --max-retries     Max retries for failed requests (default: 3)
  --confidence    Endpoint confidence threshold (0-1, default: 0.5)`)
    process.exit(command || values.help ? 0 : 1)
  }

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

      const pagesValue = values.pages as string | undefined
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
        outdir: values.outdir as string | undefined,
      })
      console.log(formatOutput(result, jsonMode))
      process.exit(result.ok ? 0 : 1)
    } else {
      const maxDepth = parsePositiveInt(values['max-depth'] as string | undefined, 'max-depth', 2)
      const maxPages = parsePositiveInt(values['max-pages'] as string | undefined, 'max-pages', 50)
      const requestDelay = parsePositiveInt(values['request-delay'] as string | undefined, 'request-delay', 200)
      const maxRetries = parsePositiveInt(values['max-retries'] as string | undefined, 'max-retries', 3)

      const result = await runInspectHtml(source, {
        json: jsonMode,
        isUrl,
        isUrlList,
        crawl: (values.crawl as boolean) ?? false,
        maxDepth,
        maxPages,
        browser: (values.browser as boolean) ?? false,
        outdir: values.outdir as string | undefined,
        requestDelay,
        noRobots: (values['no-robots'] as boolean) ?? false,
        checkpointDir: values['checkpoint-dir'] as string | undefined,
        resume: (values.resume as boolean) ?? false,
        maxRetries,
      })
      console.log(formatOutput(result, jsonMode))
      process.exit(result.ok ? 0 : 1)
    }
  }

  if (command === 'assemble') {
    const filePath = positionals[1]
    const useStdin = (values.stdin as boolean) ?? false

    if (!filePath && !useStdin) {
      console.error('Error: doc2api assemble requires a file path or --stdin')
      process.exit(3)
    }

    if (filePath) {
      const pathError = validateFilePath(filePath)
      if (pathError) {
        console.error(`Error: ${pathError}`)
        process.exit(3)
      }
    }

    const result = await runAssemble(filePath ? resolve(filePath) : '', {
      json: jsonMode,
      stdin: useStdin,
      output: values.output as string | undefined,
      format: ((values.format as string) ?? 'yaml') as 'yaml' | 'json',
    })

    if (result.ok && values.output) {
      const outputPath = values.output as string
      const format = (values.format as string) ?? 'yaml'
      const content =
        format === 'json'
          ? JSON.stringify(result.data.spec, null, 2)
          : formatAsYaml(result.data.spec)
      await Bun.write(resolve(outputPath), content)
      console.error(`Wrote OpenAPI spec to ${outputPath}`)
    }

    console.log(formatOutput(result, jsonMode))
    process.exit(result.ok ? 0 : 2)
  }

  if (command === 'validate') {
    const filePath = positionals[1]
    if (!filePath) {
      console.error('Error: doc2api validate requires a file path')
      process.exit(3)
    }

    const pathError = validateFilePath(filePath)
    if (pathError) {
      console.error(`Error: ${pathError}`)
      process.exit(3)
    }

    const result = await runValidate(resolve(filePath), { json: jsonMode })
    console.log(formatOutput(result, jsonMode))

    if (!result.ok) {
      process.exit(1)
    }
    if (!result.data.valid) {
      process.exit(4)
    }
    process.exit(0)
  }

  if (command === 'diff') {
    const inspectPath = positionals[1]
    const specPath = positionals[2]

    if (!inspectPath || !specPath) {
      console.error('Error: doc2api diff requires <inspect.json> <spec.yaml>')
      process.exit(3)
    }

    const confidenceStr = values.confidence as string | undefined
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
      output: values.output as string | undefined,
      confidence,
    })

    if (result.ok) {
      const { summary, missing } = result.data
      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        if (summary.totalDocEndpoints === 0) {
          console.error('Warning: No endpoint chunks found — is this the right inspect output?')
        }
        if (summary.missingCount === 0) {
          console.log(`All ${summary.totalDocEndpoints} documented endpoints found in spec.`)
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
        await Bun.write(resolve(values.output as string), JSON.stringify(result.data, null, 2))
        console.error(`Wrote diff report to ${values.output}`)
      }

      process.exit(summary.missingCount > 0 ? 1 : 0)
    }

    console.log(formatOutput(result, jsonMode))
    process.exit(2)
  }

  if (command === 'doctor') {
    const result = await runDoctor()
    if (jsonMode) {
      console.log(formatOutput(result, true))
    } else if (result.ok) {
      for (const check of result.data.checks) {
        const icon = check.status === 'ok' ? 'ok' : check.status === 'warn' ? '!!' : 'FAIL'
        console.log(`  ${icon}  ${check.name}: ${check.detail}`)
      }
    }
    process.exit(0)
  }

  if (command === 'watch') {
    const source = positionals[1]
    if (!source) {
      console.error('Error: doc2api watch requires a source (file path or URL)')
      process.exit(3)
    }

    const isUrl = source.startsWith('http://') || source.startsWith('https://')
    const isUrlList = !isUrl && source.endsWith('.txt')
    if (!isUrl && !isUrlList) {
      const pathError = validateFilePath(source)
      if (pathError) {
        console.error(`Error: ${pathError}`)
        process.exit(3)
      }
    }

    const debounceMs = parsePositiveInt(values.debounce as string | undefined, 'debounce', 300)
    const watchRequestDelay = parsePositiveInt(values['request-delay'] as string | undefined, 'request-delay', 200)
    const watchMaxRetries = parsePositiveInt(values['max-retries'] as string | undefined, 'max-retries', 3)

    const handle = await runWatch(source, {
      output: (values.output as string) ?? (values.outdir as string) ?? '.',
      verbose: (values.verbose as boolean) ?? false,
      debounce: debounceMs,
      pages: values.pages as string | undefined,
      requestDelay: watchRequestDelay,
      noRobots: (values['no-robots'] as boolean) ?? false,
      maxRetries: watchMaxRetries,
    })

    process.on('SIGINT', () => {
      handle.stop()
      console.error('\nWatch stopped.')
      process.exit(0)
    })

    await new Promise(() => {})
  }

  if (command === 'session') {
    const subcommand = positionals[1]
    const result = await runSession(subcommand, positionals.slice(2), values)
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }

  console.error(`Unknown command: ${command}. Run "doc2api help" for usage.`)
  process.exit(1)
}
```

- [ ] **Step 2: Slim down index.ts**

Replace all of `src/index.ts` with:

```typescript
#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { route } from './cli/router'

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
    verbose: { type: 'boolean', default: false },
    debounce: { type: 'string' },
    'request-delay': { type: 'string' },
    'no-robots': { type: 'boolean', default: false },
    'checkpoint-dir': { type: 'string' },
    resume: { type: 'boolean', default: false },
    'max-retries': { type: 'string' },
    confidence: { type: 'string' },
    version: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

route({
  command: positionals[0],
  positionals,
  values: values as Record<string, string | boolean | undefined>,
})
```

- [ ] **Step 3: Run existing tests to ensure no regression**

Run: `bun test`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/router.ts src/index.ts
git commit -m "refactor: [v2] 抽取 CLI router，精簡 index.ts 入口"
```

---

### Task 8: Session command handler

**Files:**
- Create: `src/commands/session.ts`

- [ ] **Step 1: Implement session subcommand routing**

```typescript
// src/commands/session.ts
import { resolve } from 'node:path'
import { basename } from 'node:path'
import { fail, ok } from '../output/result'
import { chunkPages } from '../pipeline/chunk'
import { classifyChunks } from '../pipeline/classify'
import { contextRefine } from '../pipeline/context-refine'
import { extractText } from '../pipeline/extract'
import { groupChunks } from '../pipeline/group'
import {
  createSession,
  currentGroup,
  discardSession,
  finishSession,
  getPreamble,
  nextGroup,
  sessionStatus,
  skipGroup,
  submitEndpoints,
} from '../session/session-manager'
import type { EndpointDef } from '../types/endpoint'
import type { Result } from '../types/result'

const BASE_DIR = process.cwd()

export async function runSession(
  subcommand: string | undefined,
  args: readonly string[],
  values: Record<string, string | boolean | undefined>,
): Promise<Result<unknown>> {
  if (!subcommand) {
    return fail('E2001', 'INVALID_INPUT', 'Missing session subcommand', {
      suggestion: 'Available: start, preamble, next, submit, skip, current, status, finish, discard',
    })
  }

  switch (subcommand) {
    case 'start':
      return handleStart(args, values)
    case 'preamble':
      return getPreamble(BASE_DIR)
    case 'next':
      return nextGroup(BASE_DIR)
    case 'submit':
      return handleSubmit(args, values)
    case 'skip':
      return skipGroup(BASE_DIR)
    case 'current':
      return currentGroup(BASE_DIR)
    case 'status':
      return sessionStatus(BASE_DIR)
    case 'finish':
      return handleFinish(values)
    case 'discard':
      return discardSession(BASE_DIR)
    default:
      return fail('E2001', 'INVALID_INPUT', `Unknown session subcommand: ${subcommand}`, {
        suggestion: 'Available: start, preamble, next, submit, skip, current, status, finish, discard',
      })
  }
}

async function handleStart(
  args: readonly string[],
  values: Record<string, string | boolean | undefined>,
): Promise<Result<unknown>> {
  const source = args[0]
  if (!source) {
    return fail('E2001', 'INVALID_INPUT', 'session start requires a source file', {
      suggestion: 'Usage: doc2api session start <source.pdf>',
    })
  }

  const pagesValue = values.pages as string | undefined

  // Run pipeline: extract → chunk → classify → context-refine → group
  const extractResult = await extractText(resolve(source), { pages: pagesValue })
  if (!extractResult.ok) return extractResult

  const { rawPages } = extractResult.data
  const rawChunks = chunkPages(rawPages)
  const classified = classifyChunks(rawChunks)
  const refined = contextRefine(classified)
  const grouped = groupChunks(refined)

  const result = await createSession(BASE_DIR, basename(source), grouped.preamble, grouped.groups)
  if (!result.ok) return result

  return ok({
    sessionId: result.data.id,
    source: result.data.source,
    totalGroups: result.data.groups.length,
    preambleChunks: result.data.preamble.chunks.length,
  })
}

async function handleSubmit(
  args: readonly string[],
  values: Record<string, string | boolean | undefined>,
): Promise<Result<unknown>> {
  const useStdin = (values.stdin as boolean) ?? false
  const filePath = args[0]

  if (!filePath && !useStdin) {
    return fail('E2001', 'INVALID_INPUT', 'session submit requires a file path or --stdin', {
      suggestion: 'Usage: doc2api session submit <endpoints.json>',
    })
  }

  let rawJson: string
  if (useStdin) {
    const chunks: string[] = []
    const reader = Bun.stdin.stream().getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(new TextDecoder().decode(value))
      }
    } finally {
      reader.cancel()
    }
    rawJson = chunks.join('')
  } else {
    const file = Bun.file(resolve(filePath))
    if (!(await file.exists())) {
      return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${filePath}`)
    }
    rawJson = await file.text()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return fail('E2001', 'INVALID_INPUT', 'Submit file is not valid JSON')
  }

  // Support both { groupId, endpoints } and bare EndpointDef / EndpointDef[]
  let groupId: string
  let endpoints: readonly EndpointDef[]

  if (isRecord(parsed) && typeof parsed.groupId === 'string' && Array.isArray(parsed.endpoints)) {
    groupId = parsed.groupId
    endpoints = parsed.endpoints as EndpointDef[]
  } else if (Array.isArray(parsed)) {
    // Need to get current group to determine groupId
    const currentResult = await currentGroup(BASE_DIR)
    if (!currentResult.ok) return currentResult
    groupId = currentResult.data.group.groupId
    endpoints = parsed as EndpointDef[]
  } else if (isRecord(parsed) && typeof parsed.method === 'string') {
    const currentResult = await currentGroup(BASE_DIR)
    if (!currentResult.ok) return currentResult
    groupId = currentResult.data.group.groupId
    endpoints = [parsed as EndpointDef]
  } else {
    return fail('E2001', 'INVALID_INPUT', 'Submit JSON must be an EndpointDef, EndpointDef[], or { groupId, endpoints }')
  }

  return submitEndpoints(BASE_DIR, groupId, endpoints)
}

async function handleFinish(
  values: Record<string, string | boolean | undefined>,
): Promise<Result<unknown>> {
  const result = await finishSession(BASE_DIR)
  if (!result.ok) return result

  const outputPath = values.output as string | undefined
  if (outputPath) {
    const format = (values.format as string) ?? 'yaml'
    let content: string
    if (format === 'json') {
      content = JSON.stringify(result.data.spec, null, 2)
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic require for optional transitive dep
      const yaml = require('js-yaml') as { dump: (data: any, opts?: any) => string }
      content = yaml.dump(result.data.spec, { lineWidth: 100, noRefs: true })
    }
    await Bun.write(resolve(outputPath), content)
    console.error(`Wrote OpenAPI spec to ${outputPath}`)
  }

  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/session.ts
git commit -m "feat: [v2] 實作 session 子指令路由與 handler"
```

---

### Task 9: Session CLI integration tests

**Files:**
- Create: `tests/commands/session.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// tests/commands/session.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSession } from '../../src/commands/session'
import {
  createSession,
  nextGroup,
  submitEndpoints,
} from '../../src/session/session-manager'
import type { EndpointGroup, PreambleGroup } from '../../src/types/group'
import type { Chunk } from '../../src/types/chunk'

function makeChunk(id: string, type: Chunk['type']): Chunk {
  return {
    id,
    page: 1,
    type,
    confidence: 0.8,
    content: type === 'endpoint_definition'
      ? { kind: 'endpoint', method: 'GET', path: '/test', summary: null }
      : null,
    raw_text: 'text',
    table: null,
  }
}

describe('runSession', () => {
  test('missing subcommand returns error', async () => {
    const result = await runSession(undefined, [], {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E2001')
    }
  })

  test('unknown subcommand returns error', async () => {
    const result = await runSession('unknown', [], {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('Unknown session subcommand')
    }
  })

  test('submit without file or stdin returns error', async () => {
    const result = await runSession('submit', [], {})
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `bun test tests/commands/session.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/commands/session.test.ts
git commit -m "test: [v2] 新增 session 指令整合測試"
```

---

### Task 10: Export group types from lib.ts

**Files:**
- Modify: `src/lib.ts`

- [ ] **Step 1: Add group exports**

Add after the `// HTML pipeline` exports block in `src/lib.ts`:

```typescript
// Grouping pipeline
export { groupChunks } from './pipeline/group'
export type { EndpointGroup, PreambleGroup, GroupedResult } from './types/group'
```

- [ ] **Step 2: Run typecheck and all tests**

Run: `bun run typecheck && bun test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib.ts
git commit -m "feat: [v2] 從 lib.ts 匯出 groupChunks 和 group 型別"
```

---

### Task 11: Update version and .gitignore

**Files:**
- Modify: `src/version.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Bump version to 2.0.0**

Replace content of `src/version.ts`:

```typescript
export const VERSION = '2.0.0'
```

- [ ] **Step 2: Add .doc2api/ to .gitignore**

Append to `.gitignore`:

```
.doc2api/
```

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/version.ts .gitignore
git commit -m "chore: [v2] 版本升級至 2.0.0，.gitignore 加入 .doc2api/"
```

---

### Task 12: Full regression test

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Run linter**

Run: `bun run check`
Expected: PASS (or only pre-existing issues)

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: `dist/index.js` and `dist/lib.js` produced

- [ ] **Step 5: Verify CLI works**

Run: `bun run src/index.ts --help`
Expected: Help text includes `session` subcommand

Run: `bun run src/index.ts session`
Expected: JSON error response with suggestion listing subcommands

- [ ] **Step 6: Commit any fixes if needed**

---

### Task 13: Update SKILL.md with session workflow

**Files:**
- Modify: `skills/SKILL.md`

- [ ] **Step 1: Add session workflow section to SKILL.md**

After the existing "## Workflow" section's step 1 (Inspect), add a new section. Insert before "### 2. Watch mode":

```markdown
### Session Workflow (recommended for large documents)

For large documents or when context window is limited, use the session-based workflow that feeds one endpoint group at a time:

```bash
# 1. Start a session — runs the full pipeline and groups chunks by endpoint
doc2api session start <source.pdf>
doc2api session start <source.pdf> --pages 1-50

# 2. Read preamble (auth info, global descriptions)
doc2api session preamble

# 3. Process endpoint groups one at a time
doc2api session next          # Get next endpoint group
doc2api session current       # Re-read current group
doc2api session skip          # Skip non-endpoint group

# 4. Submit your analysis for each group
doc2api session submit endpoints.json
echo '<json>' | doc2api session submit --stdin

# 5. Check progress
doc2api session status

# 6. Assemble final spec from all submissions
doc2api session finish -o spec.yaml

# Other
doc2api session discard       # Abandon session
```

Session `next` output:

```json
{
  "ok": true,
  "data": {
    "groupId": "g-003",
    "progress": "3/12",
    "anchor": { "id": "p5-c1", "type": "endpoint_definition", "content": { "kind": "endpoint", "method": "POST", "path": "/v1/orders" }, "raw_text": "..." },
    "related": [ { "id": "p5-c2", "type": "parameter_table", "raw_text": "..." } ],
    "summary": "POST /v1/orders"
  }
}
```

Submit format — same `EndpointDef` as assemble input, or wrapped with groupId:

```json
{ "method": "POST", "path": "/v1/orders", "summary": "Create order", "responses": { "201": { "description": "Created" } } }
```

Or array: `[{ "method": "POST", ... }, ...]`

Or wrapped: `{ "groupId": "g-003", "endpoints": [{ "method": "POST", ... }] }`

Tips:
- Use `preamble` to understand auth before processing endpoints
- `submit` validates and returns warnings — fix and re-submit if needed
- Session state persists to disk — safe to interrupt and resume
- `status` shows processed/skipped/remaining counts
```

- [ ] **Step 2: Update the description frontmatter**

Update the `description` field in the YAML frontmatter to include session workflow triggers:

```yaml
description: Convert API documentation (PDF, HTML) to OpenAPI 3.x specs. Use when a user provides a PDF or URL containing API docs and wants to generate an OpenAPI specification. Triggers on: "convert this API PDF to OpenAPI", "extract endpoints from this URL", "generate spec from documentation", "inspect this HTML docs site", "crawl API documentation", "assemble OpenAPI from endpoints", "validate OpenAPI spec", "start a session to process API docs", "process endpoints one at a time". Also use when working with doc2api CLI commands (inspect, assemble, validate, session, doctor, watch).
```

- [ ] **Step 3: Update error code reference**

Add to the error handling section at the bottom:

```markdown
Error code ranges: `E1xxx`=extraction, `E2xxx`=input, `E3xxx`=file, `E4xxx`=validation, `E5xxx`=fetch/crawl, `E6xxx`=diff, `E7xxx`=session.
```

- [ ] **Step 4: Commit**

```bash
git add skills/SKILL.md
git commit -m "docs: [v2] 更新 SKILL.md 新增 session workflow 說明"
```
