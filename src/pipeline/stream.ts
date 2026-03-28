import type { Chunk } from '../types/chunk'
import { chunkPagesStream } from './chunk'
import { classifyChunkStream } from './classify'
import { contextRefineStream } from './context-refine'
import type { ExtractOptions } from './extract'
import { extractTextStream } from './extract'

export async function* streamPipeline(
  pdfPath: string,
  options?: ExtractOptions,
): AsyncGenerator<Chunk, void, undefined> {
  const pages = extractTextStream(pdfPath, options)
  const chunks = chunkPagesStream(pages)
  const classified = classifyChunkStream(chunks)
  yield* contextRefineStream(classified)
}

export async function collectStream<T>(stream: AsyncIterable<T>): Promise<readonly T[]> {
  const items: T[] = []
  for await (const item of stream) {
    items.push(item)
  }
  return items
}
