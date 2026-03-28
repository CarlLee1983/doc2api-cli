---
name: doc2api
description: Convert API documentation (PDF, HTML) to OpenAPI 3.x specs. Use when a user provides a PDF or URL containing API docs and wants to generate an OpenAPI specification, or when working with doc2api CLI commands (inspect, assemble, validate, doctor, watch). Triggers on tasks like "convert this API PDF to OpenAPI", "extract endpoints from this URL", "generate spec from documentation".
---

# doc2api — API Documentation to OpenAPI Converter

Convert PDF and HTML API documentation into OpenAPI 3.0.3 specs. The CLI extracts and classifies content — the AI Agent provides semantic understanding between extraction and assembly.

## Prerequisites

```bash
doc2api doctor --json
```

Verify `python` and `pdfplumber` are available for PDF table extraction (table extraction is disabled without them; text extraction still works). For HTML sources, verify `playwright` is installed if you need JavaScript-rendered pages.

## Workflow

### 1. Inspect the source

```bash
# PDF source
doc2api inspect <file.pdf> --json
doc2api inspect <file.pdf> --json --pages 1-20   # large PDFs: process specific pages

# HTML source (single URL)
doc2api inspect https://docs.example.com/api --json

# HTML source (crawl linked pages)
doc2api inspect https://docs.example.com/api --json --crawl --max-depth 3 --max-pages 100

# HTML source (URL list file)
doc2api inspect urls.txt --json

# Crawler options
--request-delay 500    # ms between batches (default: 200)
--no-robots            # ignore robots.txt
--max-retries 5        # retry failed requests (default: 3)
--checkpoint-dir ./cp  # enable resume on interruption
--resume               # resume from checkpoint
```

Returns chunks with type and confidence:

- `endpoint_definition` — HTTP method + path (confidence 0.8+ = reliable)
- `parameter_table` — request/response parameters
- `response_example` — response body examples
- `auth_description` — authentication details
- `error_codes` — error code table
- `general_text` — documentation prose

**Skip chunks with confidence < 0.5** or ask user to verify.

### 1.5. Watch mode (optional)

```bash
# Watch source for changes and auto-rebuild
doc2api watch api-doc.pdf -o output/ --verbose
doc2api watch https://docs.example.com -o output/
```

### 2. Analyze chunks and build AssembleInput

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
- **Chinese parameter names**: keep original as `description`, infer English field name
- **Missing base URL**: ask user or infer from document title/headers
- Write JSON to a file (e.g. `endpoints.json`) or pipe via stdin

### 3. Assemble

```bash
doc2api assemble endpoints.json -o spec.json --format json
echo '<json>' | doc2api assemble --stdin -o spec.json
```

### 4. Validate

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

Exit codes: 0=success, 1=error, 2=assemble fail, 3=input validation, 4=spec validation fail.

## Chunk size limits

Chunks are automatically split at 8000 characters (~2000 tokens) to fit within LLM context windows.
Each chunk includes: id, type, confidence, raw_text, page number, and optional structured content.
