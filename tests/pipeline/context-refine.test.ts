import { describe, expect, test } from 'bun:test'
import type { Chunk } from '../../src/types/chunk'
import { contextRefine } from '../../src/pipeline/context-refine'

describe('contextRefine()', () => {
  test('promotes JSON block after endpoint to response_example', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'endpoint_definition',
        confidence: 0.9,
        content: { kind: 'endpoint', method: 'GET', path: '/users', summary: null },
        raw_text: 'GET /users',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: '{ "data": [{ "id": 1, "name": "Alice" }] }',
        table: null,
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('response_example')
    expect(refined[1].confidence).toBe(0.75)
    expect(refined[1].content).not.toBeNull()
    if (refined[1].content?.kind === 'response') {
      expect(refined[1].content.body).toContain('"data"')
    }
  })

  test('promotes table after endpoint to parameter_table', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'endpoint_definition',
        confidence: 0.9,
        content: { kind: 'endpoint', method: 'POST', path: '/orders', summary: null },
        raw_text: 'POST /orders',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'amount | number\ncurrency | string',
        table: {
          headers: ['field', 'type'],
          rows: [['amount', 'number'], ['currency', 'string']],
        },
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('parameter_table')
    expect(refined[1].confidence).toBe(0.7)
  })

  test('extends auth description to following chunk with auth keywords', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'auth_description',
        confidence: 0.85,
        content: { kind: 'auth', scheme: 'bearer', location: 'header', description: 'Use Bearer token' },
        raw_text: 'Use Bearer token in Authorization header',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'The token expires after 24 hours. Refresh tokens are issued on login.',
        table: null,
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('auth_description')
    expect(refined[1].confidence).toBe(0.65)
  })

  test('does not downgrade already-classified chunks', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'endpoint_definition',
        confidence: 0.9,
        content: { kind: 'endpoint', method: 'GET', path: '/health', summary: null },
        raw_text: 'GET /health',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'auth_description',
        confidence: 0.85,
        content: { kind: 'auth', scheme: 'bearer', location: 'header', description: 'Auth info' },
        raw_text: 'Authentication: Bearer token required',
        table: null,
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('auth_description')
    expect(refined[1].confidence).toBe(0.85)
  })

  test('boosts low-confidence chunk between endpoint-related chunks', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'endpoint_definition',
        confidence: 0.9,
        content: { kind: 'endpoint', method: 'GET', path: '/users', summary: null },
        raw_text: 'GET /users',
        table: null,
      },
      {
        id: 'c2',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'Returns a list of all active users in the system.',
        table: null,
      },
      {
        id: 'c3',
        page: 1,
        type: 'parameter_table',
        confidence: 0.85,
        content: { kind: 'parameter', parameters: [{ name: 'page', type: 'number', required: false, description: null }] },
        raw_text: 'page | number',
        table: { headers: ['Name', 'Type'], rows: [['page', 'number']] },
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined[1].type).toBe('general_text')
    expect(refined[1].confidence).toBe(0.4)
  })

  test('returns unchanged chunks when no context rules apply', () => {
    const chunks: Chunk[] = [
      {
        id: 'c1',
        page: 1,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'Introduction to our API.',
        table: null,
      },
      {
        id: 'c2',
        page: 2,
        type: 'general_text',
        confidence: 0.3,
        content: null,
        raw_text: 'Contact support for help.',
        table: null,
      },
    ]

    const refined = contextRefine(chunks)
    expect(refined).toEqual(chunks)
  })
})
