import { describe, expect, test } from 'bun:test'
import { validateSubmission } from '../../src/session/submit-validator'

describe('validateSubmission', () => {
  test('valid endpoint passes with no warnings', () => {
    const result = validateSubmission({
      method: 'GET',
      path: '/users',
      responses: { '200': { description: 'OK' } },
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual([])
  })

  test('missing method returns warning', () => {
    const result = validateSubmission({
      path: '/users',
      responses: {},
    })
    expect(result.valid).toBe(false)
    expect(result.warnings).toContain('Missing required field: method')
  })

  test('missing path returns warning', () => {
    const result = validateSubmission({
      method: 'GET',
      responses: {},
    })
    expect(result.valid).toBe(false)
    expect(result.warnings).toContain('Missing required field: path')
  })

  test('invalid HTTP method returns warning', () => {
    const result = validateSubmission({
      method: 'FETCH',
      path: '/users',
      responses: {},
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('Invalid HTTP method: FETCH')
  })

  test('path not starting with / returns warning', () => {
    const result = validateSubmission({
      method: 'GET',
      path: 'users',
      responses: {},
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('Path should start with /: users')
  })

  test('parameter missing name returns warning', () => {
    const result = validateSubmission({
      method: 'GET',
      path: '/users',
      parameters: [{ in: 'query', schema: { type: 'string' } }],
      responses: {},
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('Parameter [0] missing "name"')
  })

  test('parameter missing in returns warning', () => {
    const result = validateSubmission({
      method: 'GET',
      path: '/users',
      parameters: [{ name: 'id', schema: { type: 'string' } }],
      responses: {},
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('Parameter [0] missing "in"')
  })

  test('multiple warnings accumulate', () => {
    const result = validateSubmission({
      method: 'FETCH',
      path: 'users',
      responses: {},
    })
    expect(result.warnings).toHaveLength(2)
  })
})
