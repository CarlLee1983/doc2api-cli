import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { chunkPages } from '../../src/pipeline/chunk'
import { classifyChunks } from '../../src/pipeline/classify'
import { contextRefine } from '../../src/pipeline/context-refine'
import { extractText } from '../../src/pipeline/extract'
import { collectStream, streamPipeline } from '../../src/pipeline/stream'

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')
const SIMPLE_PDF = resolve(FIXTURE_DIR, 'simple-api.pdf')

describe('streamPipeline()', () => {
  test('batch vs stream produce identical chunks', async () => {
    // Batch pipeline
    const extracted = await extractText(SIMPLE_PDF)
    expect(extracted.ok).toBe(true)
    if (!extracted.ok) return

    const batchChunks = contextRefine(classifyChunks(chunkPages(extracted.data.rawPages)))

    // Stream pipeline
    const streamChunks = await collectStream(streamPipeline(SIMPLE_PDF))

    expect(streamChunks).toHaveLength(batchChunks.length)

    for (let i = 0; i < batchChunks.length; i++) {
      const batch = batchChunks[i]
      const stream = streamChunks[i]
      expect(stream.id).toBe(batch.id)
      expect(stream.page).toBe(batch.page)
      expect(stream.type).toBe(batch.type)
      expect(stream.confidence).toBe(batch.confidence)
      expect(stream.raw_text).toBe(batch.raw_text)
    }
  })

  test('yields chunks with unique ids', async () => {
    const chunks = await collectStream(streamPipeline(SIMPLE_PDF))
    const ids = chunks.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  test('nonexistent file yields no chunks', async () => {
    const chunks = await collectStream(streamPipeline('/nonexistent/file.pdf'))
    expect(chunks).toHaveLength(0)
  })

  test('non-PDF file yields no chunks', async () => {
    const notPdf = resolve(FIXTURE_DIR, 'not-a-pdf.txt')
    const chunks = await collectStream(streamPipeline(notPdf))
    expect(chunks).toHaveLength(0)
  })

  test('yields chunks with valid chunk types', async () => {
    const chunks = await collectStream(streamPipeline(SIMPLE_PDF))
    const validTypes = new Set([
      'endpoint_definition',
      'parameter_table',
      'response_example',
      'auth_description',
      'error_codes',
      'general_text',
    ])
    for (const chunk of chunks) {
      expect(validTypes.has(chunk.type)).toBe(true)
      expect(chunk.confidence).toBeGreaterThanOrEqual(0)
      expect(chunk.confidence).toBeLessThanOrEqual(1)
    }
  })
})

describe('collectStream()', () => {
  test('drains an async generator into a readonly array', async () => {
    async function* gen(): AsyncGenerator<number, void, undefined> {
      yield 1
      yield 2
      yield 3
    }

    const result = await collectStream(gen())
    expect(result).toEqual([1, 2, 3])
  })

  test('returns empty array for empty generator', async () => {
    async function* empty(): AsyncGenerator<never, void, undefined> {}

    const result = await collectStream(empty())
    expect(result).toEqual([])
  })

  test('works with string values', async () => {
    async function* gen(): AsyncGenerator<string, void, undefined> {
      yield 'a'
      yield 'b'
    }

    const result = await collectStream(gen())
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('a')
    expect(result[1]).toBe('b')
  })
})
