import { describe, expect, test } from 'bun:test'
import { groupChunks } from '../../src/pipeline/group'
import type { Chunk } from '../../src/types/chunk'

function makeChunk(overrides: Partial<Chunk> & { id: string; type: Chunk['type'] }): Chunk {
  return {
    page: 1,
    confidence: 0.8,
    content: null,
    raw_text: 'text',
    table: null,
    ...overrides,
  }
}

function makeEndpoint(id: string, method: string, path: string): Chunk {
  return makeChunk({
    id,
    type: 'endpoint_definition',
    content: { kind: 'endpoint', method, path, summary: null },
  })
}

describe('groupChunks', () => {
  test('empty input returns empty groups and empty preamble', () => {
    const result = groupChunks([])
    expect(result.preamble.groupId).toBe('_preamble')
    expect(result.preamble.chunks).toEqual([])
    expect(result.groups).toEqual([])
  })

  test('chunks before first endpoint go to preamble', () => {
    const chunks: readonly Chunk[] = [
      makeChunk({ id: 'c1', type: 'auth_description' }),
      makeChunk({ id: 'c2', type: 'general_text' }),
    ]
    const result = groupChunks(chunks)
    expect(result.preamble.chunks).toHaveLength(2)
    expect(result.groups).toEqual([])
  })

  test('single endpoint with related chunks forms one group', () => {
    const chunks: readonly Chunk[] = [
      makeEndpoint('e1', 'GET', '/users'),
      makeChunk({ id: 'p1', type: 'parameter_table' }),
      makeChunk({ id: 'r1', type: 'response_example' }),
    ]
    const result = groupChunks(chunks)
    expect(result.preamble.chunks).toEqual([])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].anchor.id).toBe('e1')
    expect(result.groups[0].related).toHaveLength(2)
    expect(result.groups[0].summary).toBe('GET /users')
  })

  test('multiple endpoints split into separate groups', () => {
    const chunks: readonly Chunk[] = [
      makeEndpoint('e1', 'GET', '/users'),
      makeChunk({ id: 'p1', type: 'parameter_table' }),
      makeEndpoint('e2', 'POST', '/users'),
      makeChunk({ id: 'r2', type: 'response_example' }),
    ]
    const result = groupChunks(chunks)
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].anchor.id).toBe('e1')
    expect(result.groups[0].related).toHaveLength(1)
    expect(result.groups[1].anchor.id).toBe('e2')
    expect(result.groups[1].related).toHaveLength(1)
  })

  test('preamble + endpoints mixed correctly', () => {
    const chunks: readonly Chunk[] = [
      makeChunk({ id: 'a1', type: 'auth_description' }),
      makeEndpoint('e1', 'DELETE', '/users/{id}'),
      makeChunk({ id: 'err1', type: 'error_codes' }),
    ]
    const result = groupChunks(chunks)
    expect(result.preamble.chunks).toHaveLength(1)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].related).toHaveLength(1)
  })

  test('groupId is sequential g-001, g-002, ...', () => {
    const chunks: readonly Chunk[] = [
      makeEndpoint('e1', 'GET', '/a'),
      makeEndpoint('e2', 'GET', '/b'),
      makeEndpoint('e3', 'GET', '/c'),
    ]
    const result = groupChunks(chunks)
    expect(result.groups.map((g) => g.groupId)).toEqual(['g-001', 'g-002', 'g-003'])
  })

  test('summary extracts method and path from endpoint content', () => {
    const chunks: readonly Chunk[] = [
      makeEndpoint('e1', 'PUT', '/items/{id}'),
    ]
    const result = groupChunks(chunks)
    expect(result.groups[0].summary).toBe('PUT /items/{id}')
  })
})
