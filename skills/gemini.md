# pdf2api — PDF API Doc to OpenAPI Converter

## What You Can Do

Convert PDF-format API documentation into OpenAPI 3.x specs using a three-step pipeline:
1. **inspect** — Extract and classify PDF content into structured chunks
2. **assemble** — Convert your analysis into a valid OpenAPI spec
3. **validate** — Verify the spec is correct

## Workflow

### Step 1: Inspect the PDF

```bash
pdf2api inspect <file.pdf> --json
```

This returns structured chunks with types and confidence scores. Review the output:

- `endpoint_definition` (confidence 0.8+) — HTTP method + path
- `parameter_table` (confidence 0.8+) — Request/response parameters
- `response_example` (confidence 0.8+) — Response body examples
- `auth_description` — Authentication method
- `error_codes` — Error code table
- `general_text` — Documentation prose

### Step 2: Analyze Chunks

Using your LLM capabilities, analyze the chunks to extract:

1. **Endpoints**: From `endpoint_definition` chunks, identify method + path
2. **Parameters**: From `parameter_table` chunks, extract field names, types, required status
3. **Responses**: From `response_example` chunks, parse JSON examples
4. **Auth**: From `auth_description` chunks, identify security scheme
5. **Errors**: From `error_codes` chunks, map status codes to descriptions

**For Chinese parameter names**: Keep the original as `description`, infer an English `field name`.
**For missing base URL**: Ask the user or infer from document title/headers.
**Low confidence chunks** (< 0.5): Skip or ask user to verify.

### Step 3: Build the AssembleInput JSON

Structure your analysis into this format:

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
      "requestBody": {
        "properties": {
          "name": { "type": "string", "description": "Resource name" }
        },
        "required": ["name"]
      },
      "responses": {
        "200": { "description": "Success", "example": { "id": "123" } }
      }
    }
  ]
}
```

### Step 4: Assemble

```bash
pdf2api assemble endpoints.json -o spec.yaml --format json
```

Or pipe directly:

```bash
echo '<json>' | pdf2api assemble --stdin -o spec.yaml
```

### Step 5: Validate

```bash
pdf2api validate spec.yaml --json
```

Fix any validation errors and re-run until it passes.

## Chunk Type to OpenAPI Mapping

| Chunk Type | OpenAPI Location |
|---|---|
| endpoint_definition | paths[path][method] |
| parameter_table | parameters / requestBody.properties |
| response_example | responses[code].content |
| auth_description | components.securitySchemes |
| error_codes | responses[4xx/5xx] |

## Environment Check

Run `pdf2api doctor --json` first to verify pdfplumber is available for table extraction.
