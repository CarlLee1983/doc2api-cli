# pdf2api

Convert PDF API documentation to OpenAPI 3.x specs — designed for AI Agent collaboration.

## Install

```bash
# Requires Bun runtime (https://bun.sh)
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
pdf2api assemble endpoints.json -o spec.json

# Validate the spec
pdf2api validate spec.json
```

## AI Agent Integration

This CLI is designed to work with AI Agents. The CLI handles PDF extraction and OpenAPI assembly — the Agent handles the semantic understanding in between.

See [`skills/SKILL.md`](skills/SKILL.md) for the universal AI Agent skill — works with Claude Code, Gemini CLI, Cursor, Codex, and any agent that supports skill files.

## Commands

### `inspect`

Extract and classify PDF content into structured chunks.

```bash
pdf2api inspect <file.pdf> [--json] [--pages 1-10]
```

Output includes chunk types: `endpoint_definition`, `parameter_table`, `response_example`, `auth_description`, `error_codes`, `general_text`.

### `assemble`

Convert endpoint definitions into an OpenAPI 3.x spec.

```bash
pdf2api assemble <file.json> [-o output.json] [--format json|yaml]
pdf2api assemble --stdin [-o output.json]
```

### `validate`

Validate an OpenAPI spec.

```bash
pdf2api validate <file.json> [--json]
```

### `doctor`

Check environment dependencies.

```bash
pdf2api doctor [--json]
```

## Architecture

```
PDF ──► inspect ──► chunks (JSON) ──► [AI Agent] ──► endpoints.json ──► assemble ──► OpenAPI spec
```

The pipeline is split into discrete steps so AI Agents can inject semantic understanding between extraction and assembly.

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
