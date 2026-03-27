import { describe, expect, test } from 'bun:test'
import { buildOpenApiSpec } from '../../src/assembler/openapi-builder'
import type { AssembleInput } from '../../src/types/endpoint'

describe('buildOpenApiSpec()', () => {
  const minimalInput: AssembleInput = {
    info: { title: 'Test API', version: '1.0.0' },
    endpoints: [
      { path: '/users', method: 'get', summary: 'List users', responses: { '200': { description: 'Success' } } },
    ],
  }

  test('generates valid OpenAPI 3.0.3 structure', () => {
    const spec = buildOpenApiSpec(minimalInput)
    expect(spec.openapi).toBe('3.0.3')
    expect(spec.info.title).toBe('Test API')
    expect(spec.info.version).toBe('1.0.0')
  })

  test('maps endpoints to paths', () => {
    const spec = buildOpenApiSpec(minimalInput)
    expect(spec.paths['/users']).toBeDefined()
    expect(spec.paths['/users'].get).toBeDefined()
    expect(spec.paths['/users'].get.summary).toBe('List users')
  })

  test('includes servers when provided', () => {
    const input: AssembleInput = { ...minimalInput, servers: [{ url: 'https://api.example.com' }] }
    const spec = buildOpenApiSpec(input)
    expect(spec.servers).toHaveLength(1)
    expect(spec.servers[0].url).toBe('https://api.example.com')
  })

  test('maps requestBody correctly', () => {
    const input: AssembleInput = {
      info: { title: 'Test', version: '1.0.0' },
      endpoints: [{
        path: '/users', method: 'post', summary: 'Create user',
        requestBody: {
          properties: { name: { type: 'string', description: 'User name' }, age: { type: 'integer' } },
          required: ['name'],
        },
        responses: { '201': { description: 'Created' } },
      }],
    }
    const spec = buildOpenApiSpec(input)
    const post = spec.paths['/users'].post
    expect(post.requestBody).toBeDefined()
    expect(post.requestBody.content['application/json'].schema.properties.name.type).toBe('string')
    expect(post.requestBody.content['application/json'].schema.required).toEqual(['name'])
  })

  test('maps parameters correctly', () => {
    const input: AssembleInput = {
      info: { title: 'Test', version: '1.0.0' },
      endpoints: [{
        path: '/users/{id}', method: 'get',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      }],
    }
    const spec = buildOpenApiSpec(input)
    expect(spec.paths['/users/{id}'].get.parameters).toHaveLength(1)
    expect(spec.paths['/users/{id}'].get.parameters[0].name).toBe('id')
  })

  test('merges multiple endpoints on same path', () => {
    const input: AssembleInput = {
      info: { title: 'Test', version: '1.0.0' },
      endpoints: [
        { path: '/users', method: 'get', responses: { '200': { description: 'List' } } },
        { path: '/users', method: 'post', responses: { '201': { description: 'Created' } } },
      ],
    }
    const spec = buildOpenApiSpec(input)
    expect(spec.paths['/users'].get).toBeDefined()
    expect(spec.paths['/users'].post).toBeDefined()
  })
})
