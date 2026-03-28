import { describe, expect, test } from 'bun:test'
import {
  extractAuth,
  extractEndpoint,
  extractErrorCodes,
  extractParameters,
  extractResponse,
} from '../../src/pipeline/extractors'

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
    const result = extractEndpoint('GET /users/{id} - Retrieve a single user by ID', null)
    expect(result).toEqual({
      kind: 'endpoint',
      method: 'GET',
      path: '/users/{id}',
      summary: 'Retrieve a single user by ID',
    })
  })

  test('extracts summary from text before endpoint', () => {
    const result = extractEndpoint('Create a new order\nPOST /api/orders', null)
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
      parameters: [{ name: 'user_id', type: 'string', required: true, description: '使用者 ID' }],
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
      parameters: [{ name: 'id', type: 'string', required: null, description: null }],
    })
  })

  test('returns null when no table', () => {
    const result = extractParameters('some text', null)
    expect(result).toBeNull()
  })
})

describe('extractResponse()', () => {
  test('extracts status code and JSON body', () => {
    const result = extractResponse('Response: 200\n{ "id": "123", "name": "test" }', null)
    expect(result).toEqual({
      kind: 'response',
      statusCode: 200,
      body: '{ "id": "123", "name": "test" }',
    })
  })

  test('extracts JSON body without status code', () => {
    const result = extractResponse('{ "code": 0, "data": { "token": "abc" } }', null)
    expect(result).toEqual({
      kind: 'response',
      statusCode: null,
      body: '{ "code": 0, "data": { "token": "abc" } }',
    })
  })

  test('extracts status code from text pattern', () => {
    const result = extractResponse('HTTP 201 Created\n{"id": "new-item"}', null)
    expect(result).toEqual({
      kind: 'response',
      statusCode: 201,
      body: '{"id": "new-item"}',
    })
  })

  test('returns null when no JSON found', () => {
    const result = extractResponse('No JSON here', null)
    expect(result).toBeNull()
  })
})

describe('extractAuth()', () => {
  test('extracts bearer token auth', () => {
    const result = extractAuth('Authentication: Use Bearer token in Authorization header', null)
    expect(result).toEqual({
      kind: 'auth',
      scheme: 'bearer',
      location: 'header',
      description: 'Authentication: Use Bearer token in Authorization header',
    })
  })

  test('extracts API key auth', () => {
    const result = extractAuth('Pass your API key in the X-API-Key header', null)
    expect(result).toEqual({
      kind: 'auth',
      scheme: 'apiKey',
      location: 'header',
      description: 'Pass your API key in the X-API-Key header',
    })
  })

  test('extracts OAuth2', () => {
    const result = extractAuth('This API uses OAuth 2.0 for authorization', null)
    expect(result).toEqual({
      kind: 'auth',
      scheme: 'oauth2',
      location: null,
      description: 'This API uses OAuth 2.0 for authorization',
    })
  })

  test('returns null when no auth pattern found', () => {
    const result = extractAuth('Regular documentation text', null)
    expect(result).toBeNull()
  })
})

describe('extractErrorCodes()', () => {
  test('extracts error codes from table', () => {
    const table = {
      headers: ['Error Code', 'Message'],
      rows: [
        ['400', 'Bad Request'],
        ['401', 'Unauthorized'],
        ['500', 'Internal Server Error'],
      ],
    }
    const result = extractErrorCodes('', table)
    expect(result).toEqual({
      kind: 'error_codes',
      codes: [
        { status: 400, message: 'Bad Request' },
        { status: 401, message: 'Unauthorized' },
        { status: 500, message: 'Internal Server Error' },
      ],
    })
  })

  test('handles table without explicit error code header', () => {
    const table = {
      headers: ['Status', 'Description'],
      rows: [
        ['404', 'Not Found'],
        ['429', 'Too Many Requests'],
      ],
    }
    const result = extractErrorCodes('', table)
    expect(result).toEqual({
      kind: 'error_codes',
      codes: [
        { status: 404, message: 'Not Found' },
        { status: 429, message: 'Too Many Requests' },
      ],
    })
  })

  test('returns null when no table', () => {
    const result = extractErrorCodes('some text', null)
    expect(result).toBeNull()
  })
})
