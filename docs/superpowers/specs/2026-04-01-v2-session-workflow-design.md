# v2 Session Workflow Design

## Goal

Redesign doc2api's AI Agent collaboration experience around a session-based workflow. Instead of dumping all chunks at once and expecting the Agent to figure out relationships, doc2api groups chunks by endpoint and feeds them one at a time through a managed session.

## Core Pain Points Addressed

1. **Chunk relationships unclear** — flat chunk arrays force Agents to guess which parameter_table belongs to which endpoint
2. **No batch processing** — large documents overflow Agent context windows
3. **No interactive correction** — Agents can't validate intermediate results or retry failed interpretations

## Architecture

### New Pipeline Stage: group

Added after `context-refine`, the `group` stage clusters flat chunks into endpoint-centric groups.

```
extract → chunk → classify → context-refine → group → [session workflow]
```

Grouping logic:
1. Scan chunks sequentially; each `endpoint_definition` becomes a group anchor
2. All subsequent chunks (`parameter_table`, `response_example`, `error_codes`, `auth_description`, `general_text`) are collected into that group until the next `endpoint_definition` is encountered
3. Chunks before the first `endpoint_definition` go into a special `_preamble` group (auth info, general descriptions)

### Type Definitions

```typescript
interface EndpointGroup {
  readonly groupId: string
  readonly anchor: Chunk
  readonly related: readonly Chunk[]
  readonly summary: string  // auto-generated, e.g. "POST /api/v1/users"
}

interface PreambleGroup {
  readonly groupId: '_preamble'
  readonly chunks: readonly Chunk[]
}

type GroupedResult = {
  readonly preamble: PreambleGroup
  readonly groups: readonly EndpointGroup[]
}
```

### Session State

```typescript
interface Session {
  readonly id: string
  readonly source: string
  readonly createdAt: string
  readonly preamble: PreambleGroup
  readonly groups: readonly EndpointGroup[]
  readonly cursor: number
  readonly submitted: readonly SubmittedEndpoint[]
  readonly status: 'active' | 'finished'
}

interface SubmittedEndpoint {
  readonly groupId: string
  readonly endpoints: readonly EndpointDef[]
  readonly submittedAt: string
}
```

Persistence:
- Stored at `.doc2api/sessions/<session-id>.json`
- Atomic write on every state mutation (`next`, `submit`, `skip`)
- One active session per working directory
- If a session already exists for the same source, prompt to resume or rebuild

## CLI Commands

```bash
doc2api session start <source> [--pages 1-10] [--crawl] [--max-depth 2]
doc2api session preamble
doc2api session next
doc2api session submit <file.json>
doc2api session submit --stdin
doc2api session skip
doc2api session current
doc2api session status
doc2api session finish [-o spec.yaml] [--format yaml|json]
doc2api session discard
```

All commands output JSON by default (designed for Agent consumption).

### Command Output Examples

**session next:**
```json
{
  "ok": true,
  "data": {
    "groupId": "g-003",
    "progress": "3/12",
    "anchor": {},
    "related": [],
    "summary": "POST /api/v1/users"
  }
}
```

**session submit:**
```json
{
  "ok": true,
  "data": {
    "groupId": "g-003",
    "accepted": true,
    "warnings": [],
    "remaining": 9
  }
}
```

**session status:**
```json
{
  "ok": true,
  "data": {
    "sessionId": "abc-123",
    "source": "api-doc.pdf",
    "total": 12,
    "processed": 3,
    "skipped": 1,
    "remaining": 8,
    "status": "active"
  }
}
```

### Submit Validation

`submit` accepts `EndpointDef` JSON (reuses existing type). Validation:

1. Required fields: `method`, `path`
2. `method` is a valid HTTP method
3. `path` starts with `/`
4. If `parameters` present, each has `name` and `in`
5. Validation failures return warnings but still accept (Agent can re-submit the same group to overwrite the previous submission; cursor does not advance on submit — it advances on the next `next` or `skip` call)

## Existing Commands

| v1 Command | v2 Treatment |
|------------|-------------|
| `inspect` | Kept. Adds `--group` flag for grouped output |
| `assemble` | Kept. `session finish` calls it internally |
| `validate` | Kept unchanged |
| `diff` | Kept unchanged |
| `doctor` | Kept. Adds check for `.doc2api/` directory writability |
| `watch` | Kept unchanged |

## Refactoring

### index.ts decomposition

Extract `parseArgs` + command routing into `src/cli/router.ts`. `src/index.ts` becomes a thin entry point. Session subcommands route internally in `src/commands/session.ts`.

### New modules

```
src/
  pipeline/
    group.ts              # Grouping logic
  types/
    group.ts              # EndpointGroup, PreambleGroup, GroupedResult
    session.ts            # Session, SubmittedEndpoint
  session/
    session-manager.ts    # Session CRUD, state transitions
    session-store.ts      # Filesystem persistence, atomic write
    submit-validator.ts   # Submit validation logic
  commands/
    session.ts            # Session subcommand routing
  cli/
    router.ts             # Extracted command router
```

### lib.ts additions

```typescript
export { groupChunks } from './pipeline/group'
export type { EndpointGroup, PreambleGroup, GroupedResult } from './types/group'
```

Session management is CLI-only, not exposed via library API.

## Error Codes

| Code | Type | Description |
|------|------|-------------|
| E7001 | NO_ACTIVE_SESSION | No active session found |
| E7002 | SESSION_ALREADY_ACTIVE | An active session already exists |
| E7003 | SESSION_EXHAUSTED | All groups have been processed |
| E7004 | SUBMIT_VALIDATION | Submitted endpoint has format issues |
| E7005 | SESSION_FINISHED | Session is already finished |

## AI Agent Skill Update

The SKILL.md workflow becomes:

```
Phase 1: doc2api session start <source>
Phase 2: doc2api session preamble → understand auth and global info
Phase 3: Loop
  ├── doc2api session next → get one endpoint group
  ├── Agent analyzes anchor + related chunks → produces EndpointDef JSON
  ├── doc2api session submit <file> → validate and accumulate
  └── Repeat until remaining = 0
Phase 4: doc2api session finish -o spec.yaml
Phase 5: doc2api validate spec.yaml
```

Each iteration, the Agent's context only needs:
- Preamble info (loaded once as global context)
- A single endpoint group's chunks (replaced each iteration)

Error handling guidance in SKILL.md:
- `submit` returns warnings → Agent corrects and re-submits
- `next` returns a group that doesn't look like an endpoint → use `skip`
- Need to re-examine current group → use `current`

## Testing Strategy

### Unit Tests

| Module | Focus |
|--------|-------|
| `group.ts` | Correct grouping, preamble collection, consecutive endpoint splits, empty document |
| `session-manager.ts` | Lifecycle transitions (start→next→submit→finish), cursor advance, re-submit overwrite |
| `session-store.ts` | JSON read/write, atomic write, concurrent access protection |
| `submit-validator.ts` | Required fields, valid methods, path format, warnings collection |
| `router.ts` | Command routing dispatch |

### Integration Tests

1. Full session flow — `start` → `preamble` → `next` x N → `submit` x N → `finish`, verify final spec
2. Resume — `start` → `next` → process exit → `session next` resumes at correct position
3. `skip` and `current` — skip advances cursor, current does not
4. `discard` — state is cleared
5. Submit validation failure — returns warnings, does not advance cursor, allows re-submit

### Fixtures

Reuse existing PDF/HTML fixtures from `tests/fixtures/` for pipeline-to-group testing. Add a small session flow fixture (pre-grouped `GroupedResult` JSON).
