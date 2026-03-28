import { describe, expect, test } from 'bun:test'
import { MAX_CHUNK_CHARS, chunkPages, splitOversizedChunk } from '../../src/pipeline/chunk'
import type { RawChunk } from '../../src/pipeline/chunk'
import type { RawPage } from '../../src/pipeline/extract'

describe('chunkPages()', () => {
  test('splits text by heading patterns', () => {
    const pages: RawPage[] = [
      {
        pageNumber: 1,
        text: 'API Overview This is the overview section. Authentication Use Bearer token for auth. GET /api/users Returns list of users.',
        tables: [],
      },
    ]

    const chunks = chunkPages(pages)
    expect(chunks.length).toBeGreaterThan(1)
  })

  test('creates separate chunks for tables', () => {
    const pages: RawPage[] = [
      {
        pageNumber: 1,
        text: 'Parameters for the endpoint',
        tables: [
          {
            headers: ['Name', 'Type', 'Required'],
            rows: [['id', 'string', 'yes']],
          },
        ],
      },
    ]

    const chunks = chunkPages(pages)
    const tableChunks = chunks.filter((c) => c.table !== null)
    expect(tableChunks).toHaveLength(1)
    expect(tableChunks[0].table?.headers).toEqual(['Name', 'Type', 'Required'])
  })

  test('assigns unique IDs to chunks', () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'First section content here.', tables: [] },
      { pageNumber: 2, text: 'Second section content here.', tables: [] },
    ]

    const chunks = chunkPages(pages)
    const ids = chunks.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  test('preserves page number from source', () => {
    const pages: RawPage[] = [{ pageNumber: 3, text: 'Content on page three.', tables: [] }]

    const chunks = chunkPages(pages)
    expect(chunks.every((c) => c.page === 3)).toBe(true)
  })

  test('handles empty pages', () => {
    const pages: RawPage[] = [{ pageNumber: 1, text: '', tables: [] }]

    const chunks = chunkPages(pages)
    expect(chunks).toHaveLength(0)
  })
})

describe('splitOversizedChunk()', () => {
  function makeIdGenerator(): () => string {
    let counter = 100
    return (): string => `chunk-${String(counter++).padStart(3, '0')}`
  }

  function makeChunk(text: string, id = 'chunk-001', page = 1): RawChunk {
    return { id, page, raw_text: text, table: null }
  }

  test('short chunk is returned as-is (single element)', () => {
    const chunk = makeChunk('short text')
    const result = splitOversizedChunk(chunk, makeIdGenerator())
    expect(result).toHaveLength(1)
    expect(result[0].raw_text).toBe('short text')
    expect(result[0].id).toBe('chunk-001')
  })

  test('chunk exactly at MAX_CHUNK_CHARS is not split further by splitOversizedChunk', () => {
    const text = 'a'.repeat(MAX_CHUNK_CHARS)
    const chunk = makeChunk(text)
    // splitOversizedChunk always processes the chunk; if it has no delimiters it hard-cuts
    // but at exactly the limit, groupSegments keeps it whole
    const result = splitOversizedChunk(chunk, makeIdGenerator())
    expect(result).toHaveLength(1)
    expect(result[0].raw_text).toBe(text)
  })

  test('chunk with paragraph boundaries splits at \\n\\n', () => {
    const para = 'x'.repeat(5000)
    const text = `${para}\n\n${para}`
    const chunk = makeChunk(text)
    const result = splitOversizedChunk(chunk, makeIdGenerator())
    expect(result.length).toBeGreaterThan(1)
    for (const c of result) {
      expect(c.raw_text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    }
    // All text is preserved
    const joined = result.map((c) => c.raw_text).join('\n\n')
    expect(joined).toBe(text)
  })

  test('chunk with only single newlines splits at \\n when paragraphs are too big', () => {
    // One big paragraph with single newlines inside
    const line = 'y'.repeat(2000)
    const text = `${line}\n${line}\n${line}\n${line}\n${line}`
    const chunk = makeChunk(text)
    const result = splitOversizedChunk(chunk, makeIdGenerator())
    expect(result.length).toBeGreaterThan(1)
    for (const c of result) {
      expect(c.raw_text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    }
    const joined = result.map((c) => c.raw_text).join('\n')
    expect(joined).toBe(text)
  })

  test('chunk with no newlines is hard-cut', () => {
    const text = 'z'.repeat(MAX_CHUNK_CHARS * 2 + 500)
    const chunk = makeChunk(text)
    const result = splitOversizedChunk(chunk, makeIdGenerator())
    expect(result.length).toBeGreaterThan(1)
    for (const c of result) {
      expect(c.raw_text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    }
    // Concatenated text equals original
    const joined = result.map((c) => c.raw_text).join('')
    expect(joined).toBe(text)
  })

  test('first sub-chunk keeps original id, subsequent get new ids', () => {
    const text = 'a'.repeat(MAX_CHUNK_CHARS + 1)
    const chunk = makeChunk(text, 'chunk-042')
    const nextId = makeIdGenerator()
    const result = splitOversizedChunk(chunk, nextId)
    expect(result[0].id).toBe('chunk-042')
    for (let i = 1; i < result.length; i++) {
      expect(result[i].id).not.toBe('chunk-042')
    }
  })

  test('all sub-chunks inherit the original page number', () => {
    const text = 'b'.repeat(MAX_CHUNK_CHARS * 2 + 1)
    const chunk = makeChunk(text, 'chunk-001', 7)
    const result = splitOversizedChunk(chunk, makeIdGenerator())
    for (const c of result) {
      expect(c.page).toBe(7)
    }
  })

  test('table is kept on first sub-chunk only', () => {
    const table = { headers: ['A'], rows: [['1']] }
    const text = 'c'.repeat(MAX_CHUNK_CHARS * 2 + 1)
    const chunk: RawChunk = { id: 'chunk-001', page: 1, raw_text: text, table }
    const result = splitOversizedChunk(chunk, makeIdGenerator())
    expect(result[0].table).toBe(table)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].table).toBeNull()
    }
  })

  test('chunkPages splits oversized chunks', () => {
    const text = 'd'.repeat(MAX_CHUNK_CHARS + 1)
    const pages: RawPage[] = [{ pageNumber: 1, text, tables: [] }]
    const chunks = chunkPages(pages)
    for (const c of chunks) {
      expect(c.raw_text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    }
  })
})
