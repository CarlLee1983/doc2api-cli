# Contributing to doc2api

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Node.js 18+ (for compatibility)
- Python 3.8+ with `pdfplumber` (optional, for table extraction)
- [Playwright](https://playwright.dev) (optional, for SPA rendering): `bunx playwright install chromium`

## Setup

```bash
git clone https://github.com/carllee1983/doc2api.git
cd doc2api
bun install
```

## Development Workflow

1. Create a feature branch from `main`
2. Write tests first (TDD)
3. Implement the feature
4. Ensure all checks pass:

```bash
bun test          # Run tests
bun run typecheck # TypeScript type check
bun run check     # Biome lint
```

## Commit Convention

```
<type>: [<scope>] <subject>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Examples:
- `feat: [pipeline] add YAML output support`
- `fix: [bridge] handle malformed PDF gracefully`
- `test: add edge case tests for schema inferrer`

## Project Structure

```
src/
  pipeline/           # Core extraction and processing pipeline
    fetcher/          # HTTP/browser fetching, crawling, retry, robots.txt
    parser/           # HTML parsing (generic + framework-specific)
    extract.ts        # PDF text extraction (batch + streaming)
    extract-html.ts   # HTML extraction orchestrator
    chunk.ts          # Content chunking with auto-split
    classify.ts       # Rule-based chunk classification
    context-refine.ts # Neighbor-aware classification refinement
    detect-language.ts # CJK language detection
    extractors.ts     # Content extractors (endpoint, params, auth, etc.)
    stream.ts         # Streaming pipeline composer
  assembler/          # OpenAPI spec generation
  bridge/             # Python pdfplumber bridge
  commands/           # CLI command handlers (inspect, watch, assemble, etc.)
  output/             # Result formatting and logging
  types/              # TypeScript type definitions
  validators/         # OpenAPI validation
  watcher.ts          # File system watcher for watch mode
tests/                # Mirror of src/ structure
bridge/               # Python bridge script
skills/               # AI Agent integration skills
```

## Code Standards

- Immutable patterns — never mutate, always create new objects
- Functions under 50 lines, files under 800 lines
- Use the `Result<T>` type for all fallible operations
- Validate all user input at system boundaries
- No `console.log` in library code
- Chunk splitting at 8000 chars for LLM compatibility
- Streaming patterns use `async function*` generators
- Retry and checkpoint patterns for network resilience

## Reporting Issues

Use GitHub Issues. Include:
- Steps to reproduce
- Expected vs actual behavior
- `doc2api doctor --json` output
