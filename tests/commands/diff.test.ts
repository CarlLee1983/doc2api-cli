import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { normalizePath } from '../../src/commands/diff'
import { runDiff } from '../../src/commands/diff'
import type { Chunk, InspectData } from '../../src/types/chunk'

describe('normalizePath()', () => {
  test('removes trailing slash', () => {
    expect(normalizePath('/orders/')).toBe('/orders')
  })

  test('preserves root slash', () => {
    expect(normalizePath('/')).toBe('/')
  })

  test('normalizes {param} to {_}', () => {
    expect(normalizePath('/orders/{orderId}')).toBe('/orders/{_}')
  })

  test('normalizes :param to {_}', () => {
    expect(normalizePath('/orders/:id')).toBe('/orders/{_}')
  })

  test('normalizes multiple params', () => {
    expect(normalizePath('/users/{userId}/orders/{orderId}')).toBe('/users/{_}/orders/{_}')
  })

  test('lowercases path', () => {
    expect(normalizePath('/Orders/Create')).toBe('/orders/create')
  })

  test('applies all rules together', () => {
    expect(normalizePath('/Users/{userId}/Orders/')).toBe('/users/{_}/orders')
  })
})

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures')

function makeChunk(overrides: Partial<Chunk> & { id: string; raw_text: string }): Chunk {
  return {
    page: 1,
    type: 'general_text',
    confidence: 0.9,
    content: null,
    table: null,
    ...overrides,
  }
}

function makeInspectData(chunks: readonly Chunk[]): InspectData {
  return {
    source: 'test.pdf',
    pages: 1,
    language: 'en',
    chunks,
    stats: {
      total_chunks: chunks.length,
      by_type: {
        endpoint_definition: chunks.filter((c) => c.type === 'endpoint_definition').length,
        parameter_table: chunks.filter((c) => c.type === 'parameter_table').length,
        response_example: chunks.filter((c) => c.type === 'response_example').length,
        auth_description: chunks.filter((c) => c.type === 'auth_description').length,
        error_codes: chunks.filter((c) => c.type === 'error_codes').length,
        general_text: chunks.filter((c) => c.type === 'general_text').length,
      },
    },
  }
}

function writeFixture(name: string, content: string): string {
  const path = resolve(FIXTURE_DIR, name)
  Bun.write(path, content)
  return path
}

describe('runDiff()', () => {
  const flags = { json: false, confidence: 0.5 }

  test('returns missing endpoints not in spec', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /v1/orders — List orders',
      }),
      makeChunk({
        id: 'chunk-002',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'POST /v1/orders — Create order',
      }),
    ]
    const inspectPath = writeFixture('diff-inspect.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/v1/orders': {
            get: { responses: { '200': { description: 'OK' } } },
          },
        },
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.summary.totalDocEndpoints).toBe(2)
    expect(result.data.summary.missingCount).toBe(1)
    expect(result.data.missing[0].method).toBe('POST')
    expect(result.data.missing[0].path).toBe('/v1/orders')
  })

  test('returns empty missing when all endpoints match', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /users',
      }),
    ]
    const inspectPath = writeFixture(
      'diff-inspect-match.json',
      JSON.stringify(makeInspectData(chunks)),
    )
    const specPath = writeFixture(
      'diff-spec-match.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: { '/users': { get: { responses: { '200': { description: 'OK' } } } } },
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.summary.missingCount).toBe(0)
    expect(result.data.missing).toEqual([])
  })

  test('matches endpoints with different param names', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /orders/{orderId}',
      }),
    ]
    const inspectPath = writeFixture('diff-param.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec-param.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/orders/{id}': {
            get: { responses: { '200': { description: 'OK' } } },
          },
        },
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.summary.missingCount).toBe(0)
  })

  test('collects related chunks after endpoint', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'POST /v1/payments',
      }),
      makeChunk({
        id: 'chunk-002',
        type: 'parameter_table',
        confidence: 0.85,
        raw_text: 'amount | integer | required',
      }),
      makeChunk({
        id: 'chunk-003',
        type: 'response_example',
        confidence: 0.8,
        raw_text: '{"status": "ok"}',
      }),
    ]
    const inspectPath = writeFixture('diff-related.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec-empty.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.missing[0].relatedChunks).toHaveLength(2)
    expect(result.data.missing[0].relatedChunks[0].type).toBe('parameter_table')
    expect(result.data.missing[0].relatedChunks[1].type).toBe('response_example')
  })

  test('filters chunks below confidence threshold', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.3,
        raw_text: 'GET /low-confidence',
      }),
    ]
    const inspectPath = writeFixture('diff-low-conf.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture(
      'diff-spec-empty2.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      }),
    )

    const result = await runDiff(inspectPath, specPath, { ...flags, confidence: 0.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.summary.totalDocEndpoints).toBe(0)
  })

  test('returns error for invalid inspect JSON', async () => {
    const inspectPath = writeFixture('diff-bad.json', 'not json')
    const specPath = writeFixture(
      'diff-spec-ok.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      }),
    )

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('E6001')
  })

  test('returns error for invalid spec file', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /test',
      }),
    ]
    const inspectPath = writeFixture('diff-ok.json', JSON.stringify(makeInspectData(chunks)))
    const specPath = writeFixture('diff-bad-spec.json', 'not json or yaml')

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('E6002')
  })

  test('returns error for non-existent inspect file', async () => {
    const result = await runDiff('/no/such/file.json', '/no/spec.json', flags)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('E3001')
  })
})

describe('runDiff() YAML spec', () => {
  const flags = { json: false, confidence: 0.5 }

  test('parses YAML spec correctly', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /v1/products',
      }),
    ]
    const inspectPath = writeFixture(
      'diff-yaml-inspect.json',
      JSON.stringify(makeInspectData(chunks)),
    )
    const yamlContent = `openapi: "3.0.3"
info:
  title: Test
  version: "1.0.0"
paths:
  /v1/products:
    get:
      responses:
        "200":
          description: OK
`
    const specPath = writeFixture('diff-spec.yaml', yamlContent)

    const result = await runDiff(inspectPath, specPath, flags)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.summary.missingCount).toBe(0)
  })
})

describe('runDiff() integration', () => {
  test('full scenario: 3 endpoints, 1 missing with related chunks', async () => {
    const chunks = [
      makeChunk({
        id: 'chunk-001',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'GET /api/users — List all users',
      }),
      makeChunk({
        id: 'chunk-002',
        type: 'parameter_table',
        confidence: 0.85,
        raw_text: 'page | integer | optional',
      }),
      makeChunk({
        id: 'chunk-003',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'POST /api/users — Create a user',
      }),
      makeChunk({
        id: 'chunk-004',
        type: 'response_example',
        confidence: 0.8,
        raw_text: '{"id": 1, "name": "test"}',
      }),
      makeChunk({
        id: 'chunk-005',
        type: 'endpoint_definition',
        confidence: 0.9,
        raw_text: 'DELETE /api/users/{userId}',
      }),
      makeChunk({
        id: 'chunk-006',
        type: 'general_text',
        confidence: 0.3,
        raw_text: 'This endpoint is dangerous.',
      }),
    ]

    const inspectPath = writeFixture(
      'diff-integration.json',
      JSON.stringify(makeInspectData(chunks)),
    )
    const specPath = writeFixture(
      'diff-integration-spec.json',
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Users API', version: '1.0.0' },
        paths: {
          '/api/users': {
            get: { responses: { '200': { description: 'OK' } } },
          },
          '/api/users/{id}': {
            delete: { responses: { '204': { description: 'No Content' } } },
          },
        },
      }),
    )

    const result = await runDiff(inspectPath, specPath, { json: false, confidence: 0.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 3 doc endpoints, 2 in spec, 1 missing
    expect(result.data.summary.totalDocEndpoints).toBe(3)
    expect(result.data.summary.totalSpecEndpoints).toBe(2)
    expect(result.data.summary.missingCount).toBe(1)

    // Missing: POST /api/users with 1 related chunk (response_example)
    expect(result.data.missing[0].method).toBe('POST')
    expect(result.data.missing[0].path).toBe('/api/users')
    expect(result.data.missing[0].relatedChunks).toHaveLength(1)
    expect(result.data.missing[0].relatedChunks[0].type).toBe('response_example')

    // DELETE matched despite different param name ({userId} vs {id})
  })
})
