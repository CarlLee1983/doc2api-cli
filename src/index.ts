#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { runInspect } from './commands/inspect'
import { formatOutput } from './output/formatter'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    json: { type: 'boolean', default: false },
    output: { type: 'string', short: 'o' },
    pages: { type: 'string' },
    stdin: { type: 'boolean', default: false },
    format: { type: 'string', default: 'yaml' },
    outdir: { type: 'string' },
  },
})

const command = positionals[0]
const jsonMode = values.json as boolean

async function main(): Promise<void> {
  if (!command || command === 'help') {
    console.error(`pdf2api v0.1.0 — Convert PDF API docs to OpenAPI 3.x

Usage:
  pdf2api inspect <file.pdf>    Extract and classify PDF content
  pdf2api assemble <file.json>  Assemble endpoints into OpenAPI spec
  pdf2api validate <file.yaml>  Validate an OpenAPI spec
  pdf2api doctor                Check environment dependencies

Flags:
  --json          Output in JSON format (for AI agents)
  -o, --output    Output file path
  --pages         Page range (e.g., 1-10)
  --stdin         Read input from stdin
  --format        Output format: yaml (default) or json`)
    process.exit(command ? 0 : 1)
  }

  if (command === 'inspect') {
    const filePath = positionals[1]
    if (!filePath) {
      console.error('Error: pdf2api inspect requires a file path')
      process.exit(3)
    }

    const result = await runInspect(resolve(filePath), {
      json: jsonMode,
      pages: values.pages as string | undefined,
      outdir: values.outdir as string | undefined,
    })

    console.log(formatOutput(result, jsonMode))
    process.exit(result.ok ? 0 : 1)
  }

  console.error(`Unknown command: ${command}. Run "pdf2api help" for usage.`)
  process.exit(1)
}

main()
