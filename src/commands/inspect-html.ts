import { basename, resolve } from 'node:path'
import type { Result } from '../types/result'
import type { Chunk, ChunkType, InspectData } from '../types/chunk'
import { ok, fail } from '../output/result'
import { extractHtml, type HtmlExtractOptions } from '../pipeline/extract-html'
import { chunkPages } from '../pipeline/chunk'
import { classifyChunks } from '../pipeline/classify'
import { CHUNK_TYPES } from '../types/chunk'

export interface InspectHtmlFlags {
  readonly json: boolean
  readonly isUrl: boolean
  readonly isUrlList: boolean
  readonly crawl: boolean
  readonly maxDepth: number
  readonly maxPages: number
  readonly browser: boolean
  readonly outdir?: string
}

async function readUrlList(filePath: string): Promise<readonly string[]> {
  const content = await Bun.file(resolve(filePath)).text()
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

export async function runInspectHtml(
  source: string,
  flags: InspectHtmlFlags,
): Promise<Result<InspectData>> {
  let options: HtmlExtractOptions = {
    urls: [],
    forceBrowser: flags.browser,
  }

  if (flags.isUrlList) {
    const urls = await readUrlList(source)
    if (urls.length === 0) {
      return fail('E5005', 'NO_CONTENT', `No URLs found in ${source}`, {
        suggestion: 'Add URLs to the file, one per line',
      })
    }
    options = { ...options, urls }
  } else if (flags.crawl) {
    options = {
      ...options,
      urls: [source],
      crawl: {
        entryUrl: source,
        maxDepth: flags.maxDepth,
        maxPages: flags.maxPages,
      },
    }
  } else {
    options = { ...options, urls: [source] }
  }

  const extractResult = await extractHtml(options)
  if (!extractResult.ok) return extractResult

  const { pages, rawPages } = extractResult.data
  const rawChunks = chunkPages(rawPages)
  const chunks = classifyChunks(rawChunks)

  const byType = Object.fromEntries(
    CHUNK_TYPES.map((type) => [type, 0]),
  ) as Record<ChunkType, number>

  for (const chunk of chunks) {
    byType[chunk.type] = byType[chunk.type] + 1
  }

  const sourceName = flags.isUrlList ? basename(source) : source

  return ok({
    source: sourceName,
    pages,
    language: detectLanguage(chunks),
    chunks,
    stats: {
      total_chunks: chunks.length,
      by_type: byType,
    },
  })
}

function detectLanguage(chunks: readonly Chunk[]): string {
  const allText = chunks.map((c) => c.raw_text).join('')
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]/g
  const cjkMatches = allText.match(cjkPattern)

  if (cjkMatches && cjkMatches.length > allText.length * 0.05) {
    return 'zh-TW'
  }

  return 'en'
}
