---
name: doc2api
description: Convert API documentation (PDF, HTML) to OpenAPI 3.x specs. Use when a user provides a PDF or URL containing API docs and wants to generate an OpenAPI specification. Triggers on: "convert this API PDF to OpenAPI", "extract endpoints from this URL", "generate spec from documentation", "inspect this HTML docs site", "crawl API documentation", "scout API docs site", "discover API pages", "assemble OpenAPI from endpoints", "validate OpenAPI spec", "start a session to process API docs", "process endpoints one at a time". Also use when working with doc2api CLI commands (scout, inspect, assemble, validate, session, doctor, watch).
---

# doc2api — API Documentation to OpenAPI Converter

Convert PDF and HTML API documentation into OpenAPI 3.0.3 specs. The CLI extracts and classifies content — the AI Agent provides semantic understanding between extraction and assembly.

```
PDF/HTML ──► inspect ──► [AI analyzes chunks] ──► assemble ──► validate ──► OpenAPI spec
```

## Prerequisites

```bash
doc2api doctor --json
```

Verify `python` and `pdfplumber` for PDF table extraction (gracefully degrades without them). Verify `playwright` for JavaScript-rendered HTML pages (`--browser` flag).

## Workflow

### 0. Scout the site (optional, for HTML sources)

Before a full extraction, scout the site to discover which pages contain API documentation:

```bash
# Discover pages and see API relevance scores
doc2api scout https://docs.example.com/api --json

# Save API-relevant URLs to a file
doc2api scout https://docs.example.com/api --save urls.txt

# Then inspect using the curated URL list
doc2api inspect urls.txt --json
```

Scout output (with `--json`):
```json
{
  "ok": true,
  "data": {
    "entry": "https://docs.example.com/api",
    "totalPages": 12,
    "apiPages": 8,
    "pages": [
      { "url": "...", "title": "...", "score": 0.8, "isApi": true, "signals": ["http_method", "url_pattern"] }
    ]
  }
}
```

Scoring signals: `http_method` (page contains GET/POST/etc patterns), `url_pattern` (URL contains /api/), `param_keywords` (parameter/required/response), `exclude_url` (FAQ/changelog/blog penalty). Pages with score > 0.3 are classified as API pages.

### 1. Inspect the source

```bash
# PDF
doc2api inspect <file.pdf> --json
doc2api inspect <file.pdf> --json --pages 1-20

# HTML (single URL)
doc2api inspect https://docs.example.com/api --json
doc2api inspect https://docs.example.com/api --json --browser  # SPA rendering

# HTML (crawl)
doc2api inspect https://docs.example.com/api --json --crawl --max-depth 3 --max-pages 100

# HTML (URL list)
doc2api inspect urls.txt --json

# Crawler options
--request-delay 500    # ms between batches (default: 200)
--no-robots            # ignore robots.txt
--max-retries 5        # retry failed requests (default: 3)
--checkpoint-dir ./cp  # enable resume on interruption
--resume               # resume from checkpoint
```

Inspect output structure (with `--json`):

```json
{
  "ok": true,
  "data": {
    "source": "api-doc.pdf",
    "pages": 42,
    "language": "zh-TW",
    "chunks": [
      {
        "id": "p3-c1",
        "page": 3,
        "type": "endpoint_definition",
        "confidence": 0.9,
        "content": { "kind": "endpoint", "method": "POST", "path": "/v1/orders", "summary": "建立訂單" },
        "raw_text": "POST /v1/orders\n建立新訂單...",
        "table": null
      }
    ],
    "stats": {
      "total_chunks": 87,
      "by_type": { "endpoint_definition": 12, "parameter_table": 15, "response_example": 10, "auth_description": 2, "error_codes": 3, "general_text": 45 }
    }
  }
}
```

Chunk types and usage:

| Type | Meaning | Confidence guideline |
|---|---|---|
| `endpoint_definition` | HTTP method + path | 0.8+ = reliable |
| `parameter_table` | Request/response parameters | 0.7+ = reliable |
| `response_example` | Response body examples | 0.7+ = reliable |
| `auth_description` | Authentication details | 0.6+ = reliable |
| `error_codes` | Error code table | 0.7+ = reliable |
| `general_text` | Documentation prose | N/A |

**Skip chunks with confidence < 0.5** or ask user to verify. Chunks auto-split at 8000 chars (~2000 tokens).

Structured `content` field provides parsed data when available (endpoint method/path, parameter lists, auth schemes, error codes). Fall back to `raw_text` when `content` is null.

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
    "related": [{ "id": "p5-c2", "type": "parameter_table", "raw_text": "..." }],
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

### 2. Watch mode (optional)

```bash
doc2api watch api-doc.pdf -o output/ --verbose
doc2api watch https://docs.example.com -o output/ --debounce 500
```

Auto-rebuilds on source changes. Use `--debounce` to control rebuild delay (default: 300ms).

### 3. Analyze chunks and build AssembleInput

Map chunks to the required JSON structure. Every endpoint **must** have `path` and `method`. `info.title` and `info.version` are required.

```json
{
  "info": {
    "title": "API Name",
    "version": "1.0.0",
    "description": "..."
  },
  "servers": [{ "url": "https://api.example.com/v1" }],
  "endpoints": [
    {
      "path": "/resource",
      "method": "post",
      "summary": "Create resource",
      "parameters": [
        { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
      ],
      "requestBody": {
        "properties": {
          "name": { "type": "string", "description": "Resource name" }
        },
        "required": ["name"]
      },
      "responses": {
        "200": { "description": "Success", "example": { "id": "123" } },
        "400": { "description": "Bad request" }
      },
      "tags": ["resources"],
      "security": [{ "bearerAuth": [] }]
    }
  ],
  "securitySchemes": {
    "bearerAuth": { "type": "http", "scheme": "bearer" }
  }
}
```

Tips:
- **Chinese parameter names**: keep original as `description`, infer English field name for the property key
- **Missing base URL**: ask user or infer from document title/headers
- **Use structured content**: prefer `chunk.content` over parsing `raw_text` when available
- Write JSON to a file (e.g. `endpoints.json`) or pipe via stdin

### 4. Assemble

```bash
doc2api assemble endpoints.json -o spec.json --format json
doc2api assemble endpoints.json -o spec.yaml              # YAML output (default)
echo '<json>' | doc2api assemble --stdin -o spec.json
```

### 5. Validate

```bash
doc2api validate spec.json --json
```

Fix errors and re-run until it passes.

## Chunk type to OpenAPI mapping

| Chunk Type | OpenAPI Location |
|---|---|
| endpoint_definition | paths[path][method] |
| parameter_table | parameters / requestBody.properties |
| response_example | responses[code].content |
| auth_description | components.securitySchemes |
| error_codes | responses[4xx/5xx] |

## Error handling

All commands return structured JSON in `--json` mode:

```json
{ "ok": false, "error": { "code": "E2002", "type": "MISSING_FIELDS", "message": "...", "suggestion": "..." } }
```

Error code ranges: `E1xxx`=extraction, `E2xxx`=input, `E3xxx`=file, `E4xxx`=validation, `E5xxx`=fetch/crawl, `E6xxx`=diff, `E7xxx`=session.

Exit codes: 0=success, 1=error, 2=assemble fail, 3=input validation, 4=spec validation fail.
