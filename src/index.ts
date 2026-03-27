#!/usr/bin/env bun
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { validateFilePath, validatePages } from './bridge/pdfplumber'
import { runAssemble } from './commands/assemble'
import { runDoctor } from './commands/doctor'
import { runInspect } from './commands/inspect'
import { runInspectHtml } from './commands/inspect-html'
import { runValidate } from './commands/validate'
import { formatOutput } from './output/formatter'
import { VERSION } from './version'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    output: { type: 'string', short: 'o' },
    pages: { type: 'string' },
    stdin: { type: 'boolean', default: false },
    format: { type: 'string', default: 'yaml' },
    outdir: { type: 'string' },
    crawl: { type: 'boolean', default: false },
    'max-depth': { type: 'string' },
    'max-pages': { type: 'string' },
    browser: { type: 'boolean', default: false },
  },
})

const command = positionals[0]
const jsonMode = values.json ?? false

async function main(): Promise<void> {
  if (!command || command === 'help') {
    console.error(`doc2api v${VERSION} — Convert API docs to OpenAPI 3.x

Usage:
  doc2api inspect <source>       Extract and classify content (PDF or URL)
  doc2api assemble <file.json>   Assemble endpoints into OpenAPI spec
  doc2api validate <file.json>   Validate an OpenAPI spec
  doc2api doctor                 Check environment dependencies

Flags:
  --json          Output in JSON format (for AI agents)
  -o, --output    Output file path
  --pages         Page range (e.g., 1-10)
  --stdin         Read input from stdin
  --format        Output format: yaml (default) or json
  --crawl         Crawl linked pages from the entry URL
  --max-depth     Max crawl depth (default: 2)
  --max-pages     Max pages to crawl (default: 50)
  --browser       Force Playwright browser for SPA rendering`)
    process.exit(command ? 0 : 1)
  }

  if (command === 'inspect') {
    const source = positionals[1]
    if (!source) {
      console.error('Error: doc2api inspect requires a source (file path or URL)')
      process.exit(3)
    }

    const isUrl = source.startsWith('http://') || source.startsWith('https://')
    const isUrlList = !isUrl && source.endsWith('.txt')
    const isPdf = !isUrl && !isUrlList

    if (isPdf) {
      const pathError = validateFilePath(source)
      if (pathError) {
        console.error(`Error: ${pathError}`)
        process.exit(3)
      }

      const pagesValue = values.pages
      if (pagesValue) {
        const pagesError = validatePages(pagesValue)
        if (pagesError) {
          console.error(`Error: ${pagesError}`)
          process.exit(3)
        }
      }

      const result = await runInspect(resolve(source), {
        json: jsonMode,
        pages: pagesValue,
        outdir: values.outdir,
      })
      console.log(formatOutput(result, jsonMode))
      process.exit(result.ok ? 0 : 1)
    } else {
      const result = await runInspectHtml(source, {
        json: jsonMode,
        isUrl,
        isUrlList,
        crawl: values.crawl ?? false,
        maxDepth: values['max-depth'] ? Number.parseInt(values['max-depth'], 10) : 2,
        maxPages: values['max-pages'] ? Number.parseInt(values['max-pages'], 10) : 50,
        browser: values.browser ?? false,
        outdir: values.outdir,
      })
      console.log(formatOutput(result, jsonMode))
      process.exit(result.ok ? 0 : 1)
    }
  }

  if (command === 'assemble') {
    const filePath = positionals[1]
    const useStdin = values.stdin ?? false

    if (!filePath && !useStdin) {
      console.error('Error: doc2api assemble requires a file path or --stdin')
      process.exit(3)
    }

    if (filePath) {
      const pathError = validateFilePath(filePath)
      if (pathError) {
        console.error(`Error: ${pathError}`)
        process.exit(3)
      }
    }

    const result = await runAssemble(filePath ? resolve(filePath) : '', {
      json: jsonMode,
      stdin: useStdin,
      output: values.output,
      format: (values.format ?? 'yaml') as 'yaml' | 'json',
    })

    if (result.ok && values.output) {
      const outputPath = values.output
      await Bun.write(resolve(outputPath), JSON.stringify(result.data.spec, null, 2))
      console.error(`Wrote OpenAPI spec to ${outputPath}`)
    }

    console.log(formatOutput(result, jsonMode))
    process.exit(result.ok ? 0 : 2)
  }

  if (command === 'validate') {
    const filePath = positionals[1]
    if (!filePath) {
      console.error('Error: doc2api validate requires a file path')
      process.exit(3)
    }

    const pathError = validateFilePath(filePath)
    if (pathError) {
      console.error(`Error: ${pathError}`)
      process.exit(3)
    }

    const result = await runValidate(resolve(filePath), { json: jsonMode })
    console.log(formatOutput(result, jsonMode))

    if (result.ok && !result.data.valid) {
      process.exit(4)
    }
    process.exit(result.ok ? 0 : 4)
  }

  if (command === 'doctor') {
    const result = await runDoctor()
    if (jsonMode) {
      console.log(formatOutput(result, true))
    } else if (result.ok) {
      for (const check of result.data.checks) {
        const icon = check.status === 'ok' ? 'ok' : check.status === 'warn' ? '!!' : 'FAIL'
        console.log(`  ${icon}  ${check.name}: ${check.detail}`)
      }
    }
    process.exit(0)
  }

  console.error(`Unknown command: ${command}. Run "doc2api help" for usage.`)
  process.exit(1)
}

main()
