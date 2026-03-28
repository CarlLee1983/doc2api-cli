# doc2api

Convert API documentation (PDF, HTML) to OpenAPI 3.x specs — designed for AI Agent collaboration.

## Install

```bash
# Requires Bun runtime (https://bun.sh)
npm install -g @carllee1983/doc2api

# Optional: enable table extraction
pip install pdfplumber

# Optional: enable SPA rendering for JavaScript-heavy sites
bunx playwright install chromium
```

## Quick Start

```bash
# Check environment
doc2api doctor

# Extract structured chunks from a PDF
doc2api inspect api-doc.pdf --json --pages 1-10

# Extract from HTML documentation
doc2api inspect https://docs.example.com/api --json --crawl

# Watch mode: auto-rebuild on changes
doc2api watch api-doc.pdf -o output/

# Assemble endpoints into OpenAPI spec
doc2api assemble endpoints.json -o spec.json

# Validate the spec
doc2api validate spec.json
```

## AI Agent Integration

This CLI is designed to work with AI Agents. The CLI handles extraction and OpenAPI assembly — the Agent handles the semantic understanding in between.

See [`skills/SKILL.md`](skills/SKILL.md) for the universal AI Agent skill — works with Claude Code, Gemini CLI, Cursor, Codex, and any agent that supports skill files.

## Commands

### `inspect`

Extract and classify content into structured chunks. Accepts a PDF file, a single URL, or a plain-text file containing one URL per line.

```bash
doc2api inspect <source> [flags]

# Sources: PDF file, URL, URL list (.txt)
doc2api inspect api-doc.pdf --json --pages 1-10
doc2api inspect https://docs.example.com --json --crawl --max-depth 3
doc2api inspect urls.txt --json
```

Output includes chunk types: `endpoint_definition`, `parameter_table`, `response_example`, `auth_description`, `error_codes`, `general_text`.

Chunks longer than 8000 characters are automatically split to stay within AI context limits.

### `watch`

Watch a source for changes and automatically rebuild chunks and the OpenAPI spec.

```bash
doc2api watch <source> [flags]

# Watch PDF or URL for changes, auto-rebuild chunks and spec
doc2api watch api-doc.pdf -o output/ --verbose
doc2api watch https://docs.example.com -o output/ --crawl
```

### `assemble`

Convert endpoint definitions into an OpenAPI 3.x spec.

```bash
doc2api assemble <file.json> [-o output.json] [--format json|yaml]
doc2api assemble --stdin [-o output.json]
```

### `validate`

Validate an OpenAPI spec.

```bash
doc2api validate <file.json> [--json]
```

### `doctor`

Check environment dependencies.

```bash
doc2api doctor [--json]
```

## Flags Reference

| Flag | Description |
|------|-------------|
| `--json` | JSON output (for AI agents) |
| `-o, --output` | Output file path |
| `--pages` | Page range for PDF (e.g., `1-10`) |
| `--crawl` | Crawl linked pages from entry URL |
| `--max-depth` | Max crawl depth (default: 2) |
| `--max-pages` | Max pages to crawl (default: 50) |
| `--browser` | Force Playwright for SPA rendering |
| `--request-delay` | Delay between crawl batches in ms (default: 200) |
| `--no-robots` | Ignore robots.txt |
| `--checkpoint-dir` | Directory for crawl checkpoints (enables resume) |
| `--resume` | Resume interrupted crawl from checkpoint |
| `--max-retries` | Max retries for failed requests (default: 3) |
| `--verbose` | Verbose output (watch mode) |
| `--debounce` | Debounce delay in ms (default: 300, watch mode) |

| `--version` | Print version and exit |
| `--help` | Print usage and exit |

PDF files are capped at 100MB. Use `--pages` to process a subset of a large document.

## Error Reference

All commands return structured errors in `--json` mode with `code`, `type`, `message`, and optional `suggestion`.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (pipeline failure, fetch error, unknown command) |
| 2 | Assembly failure |
| 3 | Input validation error (bad arguments, invalid file path) |
| 4 | OpenAPI spec validation failure |

### Error Codes

| Code | Type | Description |
|------|------|-------------|
| E1001 | EXTRACT_FAILED | PDF content extraction failed |
| E2001 | INVALID_INPUT | Input is not valid JSON |
| E2002 | MISSING_FIELDS | Required fields missing from AssembleInput |
| E3001 | FILE_NOT_FOUND | File or directory not found |
| E3002 | NOT_PDF / checkpoint_write_error | Invalid file format or checkpoint I/O error |
| E3003 | checkpoint_read_error | Failed to read checkpoint file |
| E3004 | checkpoint_parse_error | Failed to parse checkpoint JSON |
| E3005 | checkpoint_invalid | Checkpoint file is not a valid object |
| E3006 | checkpoint_version_mismatch | Checkpoint version mismatch |
| E4001 | VALIDATION_FAILED / INVALID_FORMAT | OpenAPI spec validation error or invalid JSON |
| E5001 | FETCH_FAILED | HTTP fetch failure (timeout, SSRF blocked, status error) |
| E5003 | CRAWL_FAILED | All crawled pages failed to fetch |
| E5005 | NO_CONTENT / NO_URLS / NO_PAGES | No usable content extracted |

## Programmatic API

Use doc2api as a library in your Bun/TypeScript project:

```bash
bun add @carllee1983/doc2api
```

```typescript
import {
  extractText, chunkPages, classifyChunks, contextRefine,
  buildOpenApiSpec, collectStream, streamPipeline,
  ok, fail,
} from '@carllee1983/doc2api'
import type { Chunk, AssembleInput, Result } from '@carllee1983/doc2api'

// Batch: extract → chunk → classify → refine
const extracted = await extractText('./api-docs.pdf')
if (!extracted.ok) throw new Error(extracted.error.message)

const chunks = chunkPages(extracted.data.rawPages)
const classified = classifyChunks(chunks)
const refined = contextRefine(classified)

// Or streaming (memory-efficient for large documents):
const chunks = await collectStream(streamPipeline('./api-docs.pdf'))

// After AI Agent analyzes chunks and builds AssembleInput:
const spec = buildOpenApiSpec(assembleInput)
```

## Security

- **SSRF protection**: Private/internal IPs blocked (10.x, 172.16-31.x, 192.168.x, CGN 100.64-127.x, localhost, link-local)
- **Input validation**: File paths reject null bytes, `..` traversal, and flag injection (`-` prefix)
- **File size limits**: 100MB PDF, 10MB HTTP response, 50MB stdin
- **No arbitrary code execution**: Python bridge communicates via JSON over stdout only

## Architecture

```
Source (PDF/HTML) ──► extract ──► chunk ──► classify ──► context-refine ──► [AI Agent] ──► assemble ──► OpenAPI spec
```

The pipeline is split into discrete steps so AI Agents can inject semantic understanding between extraction and assembly.

For large documents, the pipeline supports streaming via async generators — pages are processed incrementally without loading everything into memory.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run check
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

[MIT](LICENSE)
