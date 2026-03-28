import { describe, expect, test } from 'bun:test'
import { extractEndpoint } from '../../src/pipeline/extractors'

describe('extractEndpoint()', () => {
  test('extracts method and path from simple endpoint', () => {
    const result = extractEndpoint('POST /api/v1/transfer', null)
    expect(result).toEqual({
      kind: 'endpoint',
      method: 'POST',
      path: '/api/v1/transfer',
      summary: null,
    })
  })

  test('extracts method, path and summary', () => {
    const result = extractEndpoint(
      'GET /users/{id} - Retrieve a single user by ID',
      null,
    )
    expect(result).toEqual({
      kind: 'endpoint',
      method: 'GET',
      path: '/users/{id}',
      summary: 'Retrieve a single user by ID',
    })
  })

  test('extracts summary from text before endpoint', () => {
    const result = extractEndpoint(
      'Create a new order\nPOST /api/orders',
      null,
    )
    expect(result).toEqual({
      kind: 'endpoint',
      method: 'POST',
      path: '/api/orders',
      summary: 'Create a new order',
    })
  })

  test('returns null when no endpoint found', () => {
    const result = extractEndpoint('Some random text', null)
    expect(result).toBeNull()
  })
})
