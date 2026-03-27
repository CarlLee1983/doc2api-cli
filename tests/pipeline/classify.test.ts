import { describe, expect, test } from 'bun:test'
import { classifyChunks } from '../../src/pipeline/classify'
import type { RawChunk } from '../../src/pipeline/chunk'

describe('classifyChunks()', () => {
  test('classifies endpoint definitions', () => {
    const chunks: RawChunk[] = [
      { id: 'c1', page: 1, raw_text: 'POST /api/v1/transfer', table: null },
      { id: 'c2', page: 1, raw_text: 'GET /users/{id}', table: null },
    ]

    const classified = classifyChunks(chunks)
    expect(classified[0].type).toBe('endpoint_definition')
    expect(classified[1].type).toBe('endpoint_definition')
    expect(classified[0].confidence).toBeGreaterThan(0.7)
  })

  test('classifies parameter tables', () => {
    const chunks: RawChunk[] = [
      {
        id: 'c1',
        page: 1,
        raw_text: 'Name | Type | Required\namount | number | yes',
        table: {
          headers: ['Name', 'Type', 'Required'],
          rows: [['amount', 'number', 'yes']],
        },
      },
    ]

    const classified = classifyChunks(chunks)
    expect(classified[0].type).toBe('parameter_table')
  })

  test('classifies response examples', () => {
    const chunks: RawChunk[] = [
      {
        id: 'c1',
        page: 1,
        raw_text: 'Response: { "code": 200, "data": { "id": "123" } }',
        table: null,
      },
    ]

    const classified = classifyChunks(chunks)
    expect(classified[0].type).toBe('response_example')
  })

  test('classifies auth descriptions', () => {
    const chunks: RawChunk[] = [
      {
        id: 'c1',
        page: 1,
        raw_text: 'Authentication: Use Bearer token in Authorization header',
        table: null,
      },
    ]

    const classified = classifyChunks(chunks)
    expect(classified[0].type).toBe('auth_description')
  })

  test('classifies error code tables', () => {
    const chunks: RawChunk[] = [
      {
        id: 'c1',
        page: 1,
        raw_text: 'Error Code | Message\n400 | Bad Request\n401 | Unauthorized',
        table: {
          headers: ['Error Code', 'Message'],
          rows: [
            ['400', 'Bad Request'],
            ['401', 'Unauthorized'],
          ],
        },
      },
    ]

    const classified = classifyChunks(chunks)
    expect(classified[0].type).toBe('error_codes')
  })

  test('defaults to general_text for unrecognized content', () => {
    const chunks: RawChunk[] = [
      { id: 'c1', page: 1, raw_text: 'This is some general documentation text.', table: null },
    ]

    const classified = classifyChunks(chunks)
    expect(classified[0].type).toBe('general_text')
  })
})
