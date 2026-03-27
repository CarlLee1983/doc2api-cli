import { describe, expect, test } from 'bun:test'
import { inferSchema } from '../../src/assembler/schema-inferrer'

describe('inferSchema()', () => {
  test('infers string type', () => {
    expect(inferSchema('hello')).toEqual({ type: 'string' })
  })
  test('infers number type for integer', () => {
    expect(inferSchema(42)).toEqual({ type: 'integer' })
  })
  test('infers number type for float', () => {
    expect(inferSchema(3.14)).toEqual({ type: 'number' })
  })
  test('infers boolean type', () => {
    expect(inferSchema(true)).toEqual({ type: 'boolean' })
  })
  test('infers array type with item schema', () => {
    expect(inferSchema([1, 2, 3])).toEqual({ type: 'array', items: { type: 'integer' } })
  })
  test('infers object type with properties', () => {
    expect(inferSchema({ name: 'John', age: 30 })).toEqual({
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
    })
  })
  test('handles nested objects', () => {
    expect(inferSchema({ user: { id: 1, name: 'John' } })).toEqual({
      type: 'object',
      properties: {
        user: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
      },
    })
  })
  test('handles null', () => {
    expect(inferSchema(null)).toEqual({ type: 'string', nullable: true })
  })
})
