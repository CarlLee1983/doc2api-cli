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

# 1. Direct Pipeline (Best for small/medium documents)
doc2api inspect api-doc.pdf --json > inspect.json
doc2api assemble inspect.json -o spec.yaml

# 2. Session Workflow (Best for large documents & AI Agents)
doc2api session start api-doc.pdf
doc2api session next      # Get first group of endpoints
doc2api session submit endpoints.json
doc2api session finish -o spec.yaml

# 3. Compare with existing spec
doc2api diff inspect.json spec.yaml
```

## AI Agent Integration

This CLI is designed to work with AI Agents. The CLI handles extraction and OpenAPI assembly — the Agent handles the semantic understanding in between.

See [`skills/SKILL.md`](skills/SKILL.md) for the universal AI Agent skill — works with Claude Code, Gemini CLI, Cursor, Codex, and any agent that supports skill files.

## Commands

### `session`

Session-based workflow for processing large documents by feeding one endpoint group at a time. Ideal for AI Agents to avoid context window limits.

```bash
doc2api session start <source> [flags]  # Start a new session
doc2api session preamble                # Get global auth/info chunks
doc2api session next                    # Get next endpoint group
doc2api session submit <file.json>      # Submit analysis for current group
doc2api session status                  # Check progress
doc2api session finish -o spec.yaml     # Finalize and export OpenAPI spec
doc2api session discard                 # Abandon current session
```

Session state is persisted locally, allowing you to resume work at any time.

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
```

### `assemble`

Convert endpoint definitions into an OpenAPI 3.x spec.

```bash
doc2api assemble <file.json> [-o output.json] [--format json|yaml]
doc2api assemble --stdin [-o output.json]
```

### `diff`

Compare documented endpoints against an existing OpenAPI spec. Reports missing endpoints and links them to their parameter tables and response examples.

```bash
doc2api diff <inspect.json> <spec.yaml> [flags]

# Compare and exit 1 if missing endpoints found
doc2api diff output/inspect.json spec.yaml --confidence 0.7
```

Paths are normalized (trailing slashes removed, path parameters unified) to ensure accurate matching.

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
| `--outdir` | Output directory for watch mode / batch inspect |
| `--pages` | Page range for PDF (e.g., `1-10`) |
| `--stdin` | Read input from stdin (assemble/session submit) |
| `--format` | Output format: `yaml` (default) or `json` |
| `--crawl` | Crawl linked pages from entry URL |
| `--max-depth` | Max crawl depth (default: 2) |
| `--max-pages` | Max pages to crawl (default: 50) |
| `--browser` | Force Playwright for SPA rendering |
| `--request-delay` | Delay between crawl batches in ms (default: 200) |
| `--no-robots` | Ignore robots.txt |
| `--checkpoint-dir` | Directory for crawl checkpoints (enables resume) |
| `--resume` | Resume interrupted crawl from checkpoint |
| `--max-retries` | Max retries for failed requests (default: 3) |
| `--confidence` | Endpoint confidence threshold (0-1, default: 0.5) |
| `--verbose` | Verbose output (watch mode) |
| `--debounce` | Debounce delay in ms (default: 300, watch mode) |
| `--version` | Print version and exit |
| `--help` | Print usage and exit |

## Error Reference

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (pipeline failure, fetch error, unknown command, or missing endpoints found in `diff`) |
| 2 | Assembly failure |
| 3 | Input validation error (bad arguments, invalid file path) |
| 4 | OpenAPI spec validation failure |

### Error Code Ranges

- `E1xxx`: Extraction failures (PDF/HTML)
- `E2xxx`: Input/JSON parsing errors
- `E3xxx`: File I/O or path errors
- `E4xxx`: OpenAPI validation errors
- `E5xxx`: Fetch/Crawl network errors
- `E6xxx`: Diff command errors
- `E7xxx`: Session workflow errors

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
