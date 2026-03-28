import { basename } from 'node:path'
import { ok } from '../output/result'
import { chunkPages } from '../pipeline/chunk'
import { classifyChunks } from '../pipeline/classify'
import { contextRefine } from '../pipeline/context-refine'
import { detectLanguage } from '../pipeline/detect-language'
import { extractText } from '../pipeline/extract'
import type { Chunk, ChunkType, InspectData } from '../types/chunk'
import { CHUNK_TYPES } from '../types/chunk'
import type { InspectFlags } from '../types/config'
import type { Result } from '../types/result'

export async function runInspect(
  pdfPath: string,
  flags: InspectFlags,
): Promise<Result<InspectData>> {
  const extractResult = await extractText(pdfPath, { pages: flags.pages })

  if (!extractResult.ok) {
    return extractResult
  }

  const { pages, rawPages } = extractResult.data
  const rawChunks = chunkPages(rawPages)
  const classified = classifyChunks(rawChunks)
  const chunks = contextRefine(classified)

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

export function countByType(chunks: readonly Chunk[]): Record<ChunkType, number> {
  const counts: Record<string, number> = {}
  for (const type of CHUNK_TYPES) {
    counts[type] = 0
  }
  for (const chunk of chunks) {
    counts[chunk.type] = (counts[chunk.type] ?? 0) + 1
  }
  return counts as Record<ChunkType, number>
}
