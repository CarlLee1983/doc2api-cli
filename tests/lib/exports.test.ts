import { describe, expect, test } from 'bun:test'

describe('lib exports', () => {
  test('core pipeline functions are exported', async () => {
    const lib = await import('../../src/lib')
    expect(typeof lib.extractText).toBe('function')
    expect(typeof lib.chunkPages).toBe('function')
    expect(typeof lib.classifyChunks).toBe('function')
    expect(typeof lib.contextRefine).toBe('function')
  })

  test('streaming functions are exported', async () => {
    const lib = await import('../../src/lib')
    expect(typeof lib.streamPipeline).toBe('function')
    expect(typeof lib.collectStream).toBe('function')
  })

  test('assembly functions are exported', async () => {
    const lib = await import('../../src/lib')
    expect(typeof lib.buildOpenApiSpec).toBe('function')
    expect(typeof lib.inferSchema).toBe('function')
  })

  test('result helpers are exported', async () => {
    const lib = await import('../../src/lib')
    expect(typeof lib.ok).toBe('function')
    expect(typeof lib.fail).toBe('function')
  })

  test('ok() creates success result', async () => {
    const lib = await import('../../src/lib')
    const result = lib.ok({ value: 42 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ value: 42 })
    }
  })

  test('fail() creates error result', async () => {
    const lib = await import('../../src/lib')
    const result = lib.fail('E9999', 'TEST', 'test error')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E9999')
    }
  })
})
