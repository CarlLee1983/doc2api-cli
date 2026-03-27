import { basename } from 'node:path'
import type { Result } from '../types/result'
import type { Chunk, ChunkType, InspectData } from '../types/chunk'
import type { InspectFlags } from '../types/config'
import { ok } from '../output/result'
import { extractText } from '../pipeline/extract'
import { chunkPages } from '../pipeline/chunk'
import { classifyChunks } from '../pipeline/classify'
import { CHUNK_TYPES } from '../types/chunk'

export async function runInspect(
  pdfPath: string,
  _flags: InspectFlags,
): Promise<Result<InspectData>> {
  const extractResult = await extractText(pdfPath)

  if (!extractResult.ok) {
    return extractResult
  }

  const { pages, rawPages } = extractResult.data
  const rawChunks = chunkPages(rawPages)
  const chunks = classifyChunks(rawChunks)

  const byType = countByType(chunks)

  return ok({
    source: basename(pdfPath),
    pages,
    language: detectLanguage(chunks),
    chunks,
    stats: {
      total_chunks: chunks.length,
      by_type: byType,
    },
  })
}

function countByType(chunks: readonly Chunk[]): Record<ChunkType, number> {
  const initial = Object.fromEntries(
    CHUNK_TYPES.map((type) => [type, 0]),
  ) as Record<ChunkType, number>

  return chunks.reduce(
    (counts, chunk) => ({
      ...counts,
      [chunk.type]: counts[chunk.type] + 1,
    }),
    initial,
  )
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
