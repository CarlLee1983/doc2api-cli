import { mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type { InspectData } from '../types/chunk'
import { type Watcher, createWatcher } from '../watcher'
import { runAssemble } from './assemble'
import { runInspect } from './inspect'
import { runInspectHtml } from './inspect-html'

export interface WatchFlags {
  readonly output: string
  readonly verbose: boolean
  readonly debounce: number
  readonly pages?: string
}

export interface WatchHandle {
  readonly stop: () => void
}

function timestamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function summarize(data: InspectData): string {
  const s = data.stats.by_type
  const parts: string[] = []
  if (s.endpoint_definition > 0) parts.push(`${s.endpoint_definition} endpoints`)
  if (s.parameter_table > 0) parts.push(`${s.parameter_table} params`)
  if (s.response_example > 0) parts.push(`${s.response_example} responses`)
  if (s.auth_description > 0) parts.push(`${s.auth_description} auth`)
  if (s.error_codes > 0) parts.push(`${s.error_codes} errors`)
  return `${data.stats.total_chunks} chunks (${parts.join(', ')})`
}

async function runInspectPipeline(source: string, flags: WatchFlags): Promise<InspectData | null> {
  const isUrl = source.startsWith('http://') || source.startsWith('https://')
  const isUrlList = !isUrl && source.endsWith('.txt')
  const isPdf = !isUrl && !isUrlList

  if (isPdf) {
    const result = await runInspect(resolve(source), {
      json: true,
      pages: flags.pages,
    })
    return result.ok ? result.data : null
  }

  const result = await runInspectHtml(source, {
    json: true,
    isUrl,
    isUrlList,
    crawl: false,
    maxDepth: 2,
    maxPages: 50,
    browser: false,
  })
  return result.ok ? result.data : null
}

async function runAssemblePipeline(jsonPath: string): Promise<boolean> {
  const result = await runAssemble(resolve(jsonPath), {
    json: true,
    stdin: false,
    format: 'json',
  })
  return result.ok
}

export async function runWatch(source: string, flags: WatchFlags): Promise<WatchHandle> {
  const outputDir = resolve(flags.output)
  await mkdir(outputDir, { recursive: true })

  const chunksPath = resolve(outputDir, 'chunks.json')
  const specPath = resolve(outputDir, 'spec.json')

  // Initial run
  const data = await runInspectPipeline(source, flags)
  if (data) {
    const content = JSON.stringify(data, null, 2)
    await Bun.write(chunksPath, content)

    if (flags.verbose) {
      console.log(content)
    } else {
      console.error(`[${timestamp()}] ✓ inspect — ${summarize(data)}`)
    }
  }

  // Create watcher after initial write so markSelfWritten is available
  const isUrl = source.startsWith('http://') || source.startsWith('https://')
  let watcher: Watcher | null = null

  watcher = createWatcher({
    sourceFile: isUrl ? null : resolve(source),
    outputDir,
    debounceMs: flags.debounce,
    onEvent: async (event) => {
      if (event.type === 'source_changed') {
        console.error(`[${timestamp()}] ↻ source changed, re-inspecting...`)
        const result = await runInspectPipeline(source, flags)
        if (result) {
          watcher?.markSelfWritten(chunksPath)
          await Bun.write(chunksPath, JSON.stringify(result, null, 2))
          if (flags.verbose) {
            console.log(JSON.stringify(result, null, 2))
          } else {
            console.error(`[${timestamp()}] ✓ inspect — ${summarize(result)}`)
          }
        } else {
          console.error(`[${timestamp()}] ✗ inspect failed`)
        }
      }

      if (event.type === 'json_changed') {
        // Skip spec.json (our own output) — but NOT chunks.json
        // because an AI Agent may edit chunks.json externally
        if (event.filePath === specPath) return

        console.error(`[${timestamp()}] ↻ ${basename(event.filePath)} changed, assembling...`)
        const success = await runAssemblePipeline(event.filePath)
        if (success) {
          watcher?.markSelfWritten(specPath)
          console.error(`[${timestamp()}] ✓ assemble + validate`)
        } else {
          console.error(`[${timestamp()}] ✗ assemble failed`)
        }
      }
    },
  })

  // Mark initial chunks.json write so watcher ignores it during startup grace period
  watcher.markSelfWritten(chunksPath)

  return {
    stop() {
      watcher?.close()
    },
  }
}
