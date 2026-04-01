import { resolve } from 'node:path'
import { validateFilePath, validatePages } from '../bridge/pdfplumber'
import { runAssemble } from '../commands/assemble'
import { runDiff } from '../commands/diff'
import { runDoctor } from '../commands/doctor'
import { runInspect } from '../commands/inspect'
import { runInspectHtml } from '../commands/inspect-html'
import { runSession } from '../commands/session'
import { runValidate } from '../commands/validate'
import { runWatch } from '../commands/watch'
import { formatOutput } from '../output/formatter'
import { VERSION } from '../version'

export interface ParsedArgs {
  readonly command: string | undefined
  readonly positionals: readonly string[]
  readonly values: Record<string, string | boolean | undefined>
}

function formatAsYaml(data: unknown): string {
  // js-yaml is available as a transitive dependency via @readme/openapi-parser
  // biome-ignore lint/suspicious/noExplicitAny: dynamic require for optional transitive dep
  const yaml = require('js-yaml') as { dump: (data: any, opts?: any) => string }
  return yaml.dump(data, { lineWidth: 100, noRefs: true })
}

function parsePositiveInt(value: string | undefined, name: string, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 0) {
    console.error(`Error: --${name} must be a non-negative integer, got "${value}"`)
    process.exit(3)
  }
  return parsed
}

export async function route(args: ParsedArgs): Promise<void> {
  const { command, positionals, values } = args
  const jsonMode = values.json ?? false

  if (values.version) {
    console.error(`doc2api v${VERSION}`)
    process.exit(0)
  }

  if (!command || command === 'help' || values.help) {
    console.error(`doc2api v${VERSION} — Convert API docs to OpenAPI 3.x

Usage:
  doc2api inspect <source>       Extract and classify content (PDF or URL)
  doc2api assemble <file.json>   Assemble endpoints into OpenAPI spec
  doc2api validate <file.json>   Validate an OpenAPI spec
  doc2api diff <inspect.json> <spec.yaml>  Compare chunks against spec
  doc2api doctor                 Check environment dependencies
  doc2api watch <source>         Watch source and auto-rebuild
  doc2api session <subcommand>   Session-based workflow for AI Agents

Flags:
  --json          Output in JSON format (for AI agents)
  -o, --output    Output file path
  --pages         Page range (e.g., 1-10)
  --stdin         Read input from stdin
  --format        Output format: yaml (default) or json
  --crawl         Crawl linked pages from the entry URL
  --max-depth     Max crawl depth (default: 2)
  --max-pages     Max pages to crawl (default: 50)
  --browser       Force Playwright browser for SPA rendering
  --verbose         Verbose output (for watch mode)
  --debounce        Debounce delay in ms (default: 300)
  --request-delay   Delay between crawl batches in ms (default: 200)
  --no-robots       Ignore robots.txt (default: respect it)
  --checkpoint-dir  Directory for crawl checkpoints (enables resume)
  --resume          Resume interrupted crawl from checkpoint
  --max-retries     Max retries for failed requests (default: 3)
  --confidence    Endpoint confidence threshold (0-1, default: 0.5)`)
    process.exit(command || values.help ? 0 : 1)
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

      const pagesValue = values.pages as string | undefined
      if (pagesValue) {
        const pagesError = validatePages(pagesValue)
        if (pagesError) {
          console.error(`Error: ${pagesError}`)
          process.exit(3)
        }
      }

      const result = await runInspect(resolve(source), {
        json: jsonMode as boolean,
        pages: pagesValue,
        outdir: values.outdir as string | undefined,
      })
      console.log(formatOutput(result, jsonMode as boolean))
      process.exit(result.ok ? 0 : 1)
    } else {
      const maxDepth = parsePositiveInt(values['max-depth'] as string | undefined, 'max-depth', 2)
      const maxPages = parsePositiveInt(values['max-pages'] as string | undefined, 'max-pages', 50)
      const requestDelay = parsePositiveInt(values['request-delay'] as string | undefined, 'request-delay', 200)
      const maxRetries = parsePositiveInt(values['max-retries'] as string | undefined, 'max-retries', 3)

      const result = await runInspectHtml(source, {
        json: jsonMode as boolean,
        isUrl,
        isUrlList,
        crawl: (values.crawl ?? false) as boolean,
        maxDepth,
        maxPages,
        browser: (values.browser ?? false) as boolean,
        outdir: values.outdir as string | undefined,
        requestDelay,
        noRobots: (values['no-robots'] ?? false) as boolean,
        checkpointDir: values['checkpoint-dir'] as string | undefined,
        resume: (values.resume ?? false) as boolean,
        maxRetries,
      })
      console.log(formatOutput(result, jsonMode as boolean))
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
      json: jsonMode as boolean,
      stdin: useStdin as boolean,
      output: values.output as string | undefined,
      format: ((values.format ?? 'yaml') as 'yaml' | 'json'),
    })

    if (result.ok && values.output) {
      const outputPath = values.output as string
      const format = values.format ?? 'yaml'
      const content =
        format === 'json'
          ? JSON.stringify(result.data.spec, null, 2)
          : formatAsYaml(result.data.spec)
      await Bun.write(resolve(outputPath), content)
      console.error(`Wrote OpenAPI spec to ${outputPath}`)
    }

    console.log(formatOutput(result, jsonMode as boolean))
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

    const result = await runValidate(resolve(filePath), { json: jsonMode as boolean })
    console.log(formatOutput(result, jsonMode as boolean))

    if (!result.ok) {
      process.exit(1)
    }
    if (!result.data.valid) {
      process.exit(4)
    }
    process.exit(0)
  }

  if (command === 'diff') {
    const inspectPath = positionals[1]
    const specPath = positionals[2]

    if (!inspectPath || !specPath) {
      console.error('Error: doc2api diff requires <inspect.json> <spec.yaml>')
      process.exit(3)
    }

    const confidenceStr = values.confidence as string | undefined
    let confidence = 0.5
    if (confidenceStr !== undefined) {
      confidence = Number.parseFloat(confidenceStr)
      if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
        console.error(
          `Error: --confidence must be a number between 0 and 1, got "${confidenceStr}"`,
        )
        process.exit(3)
      }
    }

    const result = await runDiff(resolve(inspectPath), resolve(specPath), {
      json: jsonMode as boolean,
      output: values.output as string | undefined,
      confidence,
    })

    if (result.ok) {
      const { summary, missing } = result.data
      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        if (summary.totalDocEndpoints === 0) {
          console.error('⚠ No endpoint chunks found — is this the right inspect output?')
        }
        if (summary.missingCount === 0) {
          console.log(`✓ All ${summary.totalDocEndpoints} documented endpoints found in spec.`)
        } else {
          console.log(
            `Missing endpoints (${summary.missingCount} of ${summary.totalDocEndpoints}):`,
          )
          for (const ep of missing) {
            const related =
              ep.relatedChunks.length > 0
                ? `(${ep.relatedChunks.length} related: ${ep.relatedChunks.map((r) => r.type).join(', ')})`
                : '(0 related)'
            console.log(`  ${ep.method} ${ep.path}  ${related}`)
          }
        }
      }

      if (values.output) {
        await Bun.write(resolve(values.output as string), JSON.stringify(result.data, null, 2))
        console.error(`Wrote diff report to ${values.output}`)
      }

      process.exit(summary.missingCount > 0 ? 1 : 0)
    }

    console.log(formatOutput(result, jsonMode as boolean))
    process.exit(2)
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

  if (command === 'watch') {
    const source = positionals[1]
    if (!source) {
      console.error('Error: doc2api watch requires a source (file path or URL)')
      process.exit(3)
    }

    const isUrl = source.startsWith('http://') || source.startsWith('https://')
    const isUrlList = !isUrl && source.endsWith('.txt')
    if (!isUrl && !isUrlList) {
      const pathError = validateFilePath(source)
      if (pathError) {
        console.error(`Error: ${pathError}`)
        process.exit(3)
      }
    }

    const debounceMs = parsePositiveInt(values.debounce as string | undefined, 'debounce', 300)
    const watchRequestDelay = parsePositiveInt(values['request-delay'] as string | undefined, 'request-delay', 200)
    const watchMaxRetries = parsePositiveInt(values['max-retries'] as string | undefined, 'max-retries', 3)

    const handle = await runWatch(source, {
      output: (values.output ?? values.outdir ?? '.') as string,
      verbose: (values.verbose ?? false) as boolean,
      debounce: debounceMs,
      pages: values.pages as string | undefined,
      requestDelay: watchRequestDelay,
      noRobots: (values['no-robots'] ?? false) as boolean,
      maxRetries: watchMaxRetries,
    })

    // Graceful shutdown on Ctrl+C
    process.on('SIGINT', () => {
      handle.stop()
      console.error('\nWatch stopped.')
      process.exit(0)
    })

    // Keep process alive
    await new Promise(() => {})
  }

  if (command === 'session') {
    const subcommand = positionals[1]
    const result = await runSession(subcommand, positionals.slice(2), values)
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }

  console.error(`Unknown command: ${command}. Run "doc2api help" for usage.`)
  process.exit(1)
}
