import { describe, expect, test } from 'bun:test'
import { chunkPages } from '../../src/pipeline/chunk'
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
    const pages: RawPage[] = [
      { pageNumber: 3, text: 'Content on page three.', tables: [] },
    ]

    const chunks = chunkPages(pages)
    expect(chunks.every((c) => c.page === 3)).toBe(true)
  })

  test('handles empty pages', () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: '', tables: [] },
    ]

    const chunks = chunkPages(pages)
    expect(chunks).toHaveLength(0)
  })
})
