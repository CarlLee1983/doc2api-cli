import { describe, expect, test } from 'bun:test'
import { extractEndpoint, extractParameters } from '../../src/pipeline/extractors'

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

describe('extractParameters()', () => {
  test('extracts parameters from table with standard headers', () => {
    const table = {
      headers: ['Name', 'Type', 'Required', 'Description'],
      rows: [
        ['amount', 'number', 'yes', 'Transfer amount'],
        ['currency', 'string', 'no', 'Currency code'],
      ],
    }
    const result = extractParameters('', table)
    expect(result).toEqual({
      kind: 'parameter',
      parameters: [
        { name: 'amount', type: 'number', required: true, description: 'Transfer amount' },
        { name: 'currency', type: 'string', required: false, description: 'Currency code' },
      ],
    })
  })

  test('handles Chinese headers', () => {
    const table = {
      headers: ['參數', '型別', '必填', '說明'],
      rows: [['user_id', 'string', '是', '使用者 ID']],
    }
    const result = extractParameters('', table)
    expect(result).toEqual({
      kind: 'parameter',
      parameters: [
        { name: 'user_id', type: 'string', required: true, description: '使用者 ID' },
      ],
    })
  })

  test('handles missing columns gracefully', () => {
    const table = {
      headers: ['Name', 'Type'],
      rows: [['id', 'string']],
    }
    const result = extractParameters('', table)
    expect(result).toEqual({
      kind: 'parameter',
      parameters: [
        { name: 'id', type: 'string', required: null, description: null },
      ],
    })
  })

  test('returns null when no table', () => {
    const result = extractParameters('some text', null)
    expect(result).toBeNull()
  })
})
