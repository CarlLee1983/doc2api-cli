# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                    # Run all tests (Bun native test runner)
bun test tests/bridge/      # Run tests in a specific directory
bun test --filter "chunk"   # Run tests matching a pattern
bun run typecheck           # TypeScript strict mode check (tsc --noEmit)
bun run check               # Biome lint
bun run check:fix           # Biome auto-fix
bun run build               # Build to dist/ (ESM, Bun target)
bun run src/index.ts        # Run CLI directly without building
```

## Architecture

Pipeline-based CLI that converts PDF API documentation to OpenAPI 3.x specs, designed as a middle layer for AI Agent workflows:

```
PDF ──► extract ──► chunk ──► classify ──► [AI Agent fills gaps] ──► assemble ──► OpenAPI spec
```

### Pipeline stages (src/pipeline/)

1. **extract.ts** — PDF to raw pages via `unpdf`. Optionally extracts tables through the Python bridge.
2. **chunk.ts** — Splits pages into chunks by heading patterns (markdown headers, HTTP methods, section titles). Uses closure-based ID generator (`chunk-001`, `chunk-002`, ...).
3. **classify.ts** — Rule-based confidence scoring into 6 chunk types: `endpoint_definition`, `parameter_table`, `response_example`, `auth_description`, `error_codes`, `general_text`.

### Python bridge (src/bridge/pdfplumber.ts ↔ bridge/extract_tables.py)

TypeScript spawns `python3` via `Bun.spawn()`, communicates via JSON over stdout. Gracefully degrades if Python/pdfplumber unavailable — table extraction is disabled but text extraction continues.

### Command handlers (src/commands/)

Each command is a function returning `Promise<Result<T>>`. CLI entry point (`src/index.ts`) routes commands via `parseArgs` with strict mode.

### Assembly (src/assembler/)

- **openapi-builder.ts** — Converts `AssembleInput` (typed endpoint definitions) into OpenAPI 3.0.3 spec.
- **schema-inferrer.ts** — Derives JSON Schema from example values (depth-limited to 10).

## Key patterns

### Result type (src/types/result.ts + src/output/result.ts)

All fallible operations return `Result<T> = SuccessResult<T> | FailResult`. Use `ok(data)` and `fail(code, type, message, options?)` helpers. Errors carry structured codes (`E1xxx`=extract, `E2xxx`=input, `E3xxx`=file, `E4xxx`=validation), type strings, and optional `suggestion`/`context`.

### Input validation (src/bridge/pdfplumber.ts)

`validateFilePath()` and `validatePages()` are reused by both the CLI entry point and the bridge layer. File paths reject null bytes and `..` traversal. Pages must match `/^\d+(-\d+)?$/`.

### Version

Single source of truth in `src/version.ts`. Referenced by `src/index.ts` and `src/commands/doctor.ts`.

## Code style (enforced by Biome)

- No semicolons, single quotes, trailing commas, 100-char line width
- `readonly` on all interface properties and arrays
- Immutable patterns — never mutate, always spread/create new objects
- `Result<T>` for all error paths — no thrown exceptions in library code
- Type assertions (`as`) avoided; use proper type narrowing

## Testing conventions

Tests mirror `src/` structure under `tests/`. Fixtures live in `tests/fixtures/`. Pattern:

```typescript
import { describe, expect, test } from 'bun:test'
// Discriminated union narrowing for Result assertions:
if (result.ok) { expect(result.data...) }
if (!result.ok) { expect(result.error.type).toBe('...') }
```
