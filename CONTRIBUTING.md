# Contributing to doc2api

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Node.js 18+ (for compatibility)
- Python 3.8+ with `pdfplumber` (optional, for table extraction)

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
  pipeline/       # PDF extraction and chunking
  assembler/      # OpenAPI spec generation
  bridge/         # Python pdfplumber bridge
  commands/       # CLI command handlers
  output/         # Result formatting
  types/          # TypeScript type definitions
  validators/     # OpenAPI validation
tests/            # Mirror of src/ structure
bridge/           # Python bridge script
skills/           # AI Agent integration skills
```

## Code Standards

- Immutable patterns — never mutate, always create new objects
- Functions under 50 lines, files under 800 lines
- Use the `Result<T>` type for all fallible operations
- Validate all user input at system boundaries
- No `console.log` in library code

## Reporting Issues

Use GitHub Issues. Include:
- Steps to reproduce
- Expected vs actual behavior
- `doc2api doctor --json` output
