# pdf2api

Convert PDF API documentation to OpenAPI 3.x specs — designed for AI Agent collaboration.

## Install

```bash
npm install -g @carllee1983/pdf2api

# Optional: enable table extraction
pip install pdfplumber
```

## Quick Start

```bash
# Check environment
pdf2api doctor

# Extract structured chunks from a PDF
pdf2api inspect api-doc.pdf --json

# Assemble endpoints into OpenAPI spec
pdf2api assemble endpoints.json -o spec.yaml

# Validate the spec
pdf2api validate spec.yaml
```

## AI Agent Integration

This CLI is designed to work with AI Agents. The CLI handles PDF extraction and OpenAPI assembly — the Agent handles the semantic understanding in between.

See `skills/` directory for ready-to-use skills:
- `skills/claude.md` — Claude Code
- `skills/gemini.md` — Gemini CLI
- `skills/cursor.md` — Cursor
- `skills/codex.md` — Codex

## Commands

### `inspect`

Extract and classify PDF content into structured chunks.

```bash
pdf2api inspect <file.pdf> [--json] [--pages 1-10]
```

### `assemble`

Convert endpoint definitions into an OpenAPI 3.x spec.

```bash
pdf2api assemble <file.json> [-o output.yaml] [--format json|yaml]
pdf2api assemble --stdin [-o output.yaml]
```

### `validate`

Validate an OpenAPI spec.

```bash
pdf2api validate <file.yaml> [--json]
```

### `doctor`

Check environment dependencies.

```bash
pdf2api doctor [--json]
```

## License

MIT
