---
name: pdf2api
description: Convert PDF API documentation to OpenAPI 3.x specs. Use when a user provides a PDF containing API docs and wants to generate an OpenAPI specification, or when working with pdf2api CLI commands (inspect, assemble, validate, doctor). Triggers on tasks like "convert this API PDF to OpenAPI", "extract endpoints from PDF", "generate spec from documentation".
---

# pdf2api — PDF to OpenAPI Converter

Convert PDF API documentation into OpenAPI 3.0.3 specs. The CLI extracts and classifies content — the AI Agent provides semantic understanding between extraction and assembly.

## Prerequisites

```bash
pdf2api doctor --json
```

Verify `python` and `pdfplumber` are available. Table extraction is disabled without them (text extraction still works).

## Workflow

### 1. Inspect the PDF

```bash
pdf2api inspect <file.pdf> --json
pdf2api inspect <file.pdf> --json --pages 1-20   # large PDFs: process specific pages
```

Returns chunks with type and confidence:

- `endpoint_definition` — HTTP method + path (confidence 0.8+ = reliable)
- `parameter_table` — request/response parameters
- `response_example` — response body examples
- `auth_description` — authentication details
- `error_codes` — error code table
- `general_text` — documentation prose

**Skip chunks with confidence < 0.5** or ask user to verify.

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
pdf2api assemble endpoints.json -o spec.json --format json
echo '<json>' | pdf2api assemble --stdin -o spec.json
```

### 4. Validate

```bash
pdf2api validate spec.json --json
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
