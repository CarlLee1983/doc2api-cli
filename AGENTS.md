# AGENTS.md

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

Pipeline-based CLI that converts API documentation (PDF, HTML) to OpenAPI 3.x specs, designed as a middle layer for AI Agent workflows:

```
PDF ──► extract ──► chunk ──► classify ──► [AI Agent fills gaps] ──► assemble ──► OpenAPI spec
```

### Pipeline stages (src/pipeline/)

1. **extract.ts** — PDF to raw pages via `unpdf`. Supports `--pages` for range filtering and 100MB file size limit. Optionally extracts tables through the Python bridge. Streaming variant: `extractTextStream`.
2. **extract-html.ts** — HTML to raw pages. Supports single URLs, URL lists (.txt), and crawling with depth/page limits.
3. **chunk.ts** — Splits pages into chunks by heading patterns. Auto-splits oversized chunks at 8000 chars (`MAX_CHUNK_CHARS`). Uses closure-based ID generator. Streaming variant: `chunkPagesStream`.
4. **classify.ts** — Rule-based confidence scoring into 6 chunk types: `endpoint_definition`, `parameter_table`, `response_example`, `auth_description`, `error_codes`, `general_text`. Streaming variant: `classifyChunkStream`.
5. **context-refine.ts** — Post-classification pass using neighbor context to promote/adjust chunk types (e.g., table after endpoint → parameter_table). Streaming variant: `contextRefineStream` (3-element sliding window).

### Python bridge (src/bridge/pdfplumber.ts ↔ bridge/extract_tables.py)

TypeScript spawns `python3` via `Bun.spawn()`, communicates via JSON over stdout. Gracefully degrades if Python/pdfplumber unavailable — table extraction is disabled but text extraction continues.

### HTML fetcher subsystem (src/pipeline/fetcher/)

- **http-fetcher.ts** — HTTP fetch with 10MB response limit, 30s timeout, SSRF protection via url-guard.
- **browser-fetcher.ts** — Playwright-based rendering for SPAs. Optional dependency.
- **fetch-page.ts** — Orchestrates http vs browser fetch. Supports retry via `withRetry`.
- **crawler.ts** — BFS crawler with configurable depth/pages/concurrency/delay. Integrates robots.txt, checkpoint/resume, and retry.
- **retry.ts** — Generic retry with exponential backoff + jitter (5xx, 429, network errors).
- **robots.ts** — robots.txt fetching and parsing with prefix matching. Fail-open on errors.
- **checkpoint.ts** — Crawl state persistence with atomic write for resume support.
- **url-guard.ts** — SSRF protection blocking private/internal IPs including CGN ranges.
- **spa-detector.ts** — Lightweight SPA detection (empty containers, noscript tags).

### HTML parser subsystem (src/pipeline/parser/)

- **detect.ts** — Framework detection from HTML content.
- **generic-parser.ts** — Default HTML parser using cheerio.
- **readme-parser.ts** — Specialized parser for Readme.com documentation sites.

### Streaming pipeline (src/pipeline/stream.ts)

Async generator variants of each pipeline stage for memory-efficient processing. `streamPipeline()` composes all stages. `collectStream()` drains a stream into an array for batch consumers.

### Command handlers (src/commands/)

Each command is a function returning `Promise<Result<T>>`. CLI entry point (`src/index.ts`) routes commands via `parseArgs` with strict mode.

- **inspect.ts** — PDF inspection. Passes `--pages` to extractText.
- **inspect-html.ts** — HTML inspection. Handles single URL, URL list, and crawl modes.
- **watch.ts** — File watcher with debounced rebuild. Monitors source and output directory.
- **assemble.ts** — OpenAPI assembly from JSON input (file or stdin, 50MB limit).
- **validate.ts** — OpenAPI spec validation.
- **doctor.ts** — Environment dependency check.

### Assembly (src/assembler/)

- **openapi-builder.ts** — Converts `AssembleInput` (typed endpoint definitions) into OpenAPI 3.0.3 spec.
- **schema-inferrer.ts** — Derives JSON Schema from example values (depth-limited to 10).

## Key patterns

### Result type (src/types/result.ts + src/output/result.ts)

All fallible operations return `Result<T> = SuccessResult<T> | FailResult`. Use `ok(data)` and `fail(code, type, message, options?)` helpers. Errors carry structured codes (`E1xxx`=extract, `E2xxx`=input, `E3xxx`=file, `E4xxx`=validation, `E5xxx`=fetch/crawl), type strings, and optional `suggestion`/`context`.

### Input validation (src/bridge/pdfplumber.ts)

`validateFilePath()` and `validatePages()` are reused by both the CLI entry point and the bridge layer. File paths reject null bytes, `..` traversal, and hyphen-prefixed filenames (flag injection prevention). Pages must match `/^\d+(-\d+)?$/`.

### Version

Single source of truth in `src/version.ts`. Referenced by `src/index.ts` and `src/commands/doctor.ts`.

## Code style (enforced by Biome)

- No semicolons, single quotes, trailing commas, 100-char line width
- `readonly` on all interface properties and arrays
- Immutable patterns — never mutate, always spread/create new objects
- `Result<T>` for all error paths — no thrown exceptions in library code
- Type assertions (`as`) avoided; use proper type narrowing
- Streaming functions use `async function*` generators returning `AsyncGenerator<T>` or `ResultStream<T>`

## Testing conventions

Tests mirror `src/` structure under `tests/`. Fixtures live in `tests/fixtures/`. Pattern:

```typescript
import { describe, expect, test } from 'bun:test'
// Discriminated union narrowing for Result assertions:
if (result.ok) { expect(result.data...) }
if (!result.ok) { expect(result.error.type).toBe('...') }
```
