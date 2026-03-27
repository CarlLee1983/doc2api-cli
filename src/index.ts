#!/usr/bin/env bun
import { parseArgs } from 'node:util'

const { positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
})

const command = positionals[0]

if (!command || command === 'help') {
  console.error(`pdf2api v0.1.0 — Convert PDF API docs to OpenAPI 3.x

Usage:
  pdf2api inspect <file.pdf>    Extract and classify PDF content
  pdf2api assemble <file.json>  Assemble endpoints into OpenAPI spec
  pdf2api validate <file.yaml>  Validate an OpenAPI spec
  pdf2api doctor                Check environment dependencies`)
  process.exit(command ? 0 : 1)
}

console.error(`Unknown command: ${command}`)
process.exit(1)
