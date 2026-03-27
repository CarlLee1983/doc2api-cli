import { describe, expect, test } from 'bun:test'
import { detectFramework } from '../../../src/pipeline/parser/detect'

describe('detectFramework', () => {
  test('detects ReadMe.io by meta generator', () => {
    const html = '<html><head><meta name="generator" content="readme"></head><body></body></html>'
    expect(detectFramework(html)).toBe('readme')
  })

  test('detects ReadMe.io by rm-Article class', () => {
    const html = '<html><body><article class="rm-Article">content</article></body></html>'
    expect(detectFramework(html)).toBe('readme')
  })

  test('detects Docusaurus', () => {
    const html =
      '<html><head><meta name="generator" content="Docusaurus v3.0"></head><body></body></html>'
    expect(detectFramework(html)).toBe('docusaurus')
  })

  test('detects GitBook', () => {
    const html = '<html><head><meta name="generator" content="GitBook"></head><body></body></html>'
    expect(detectFramework(html)).toBe('gitbook')
  })

  test('detects Redoc', () => {
    const html = '<html><body><div class="redoc-wrap">content</div></body></html>'
    expect(detectFramework(html)).toBe('redoc')
  })

  test('detects Slate', () => {
    const html =
      '<html><body><div class="tocify-wrapper">nav</div><div class="page-wrapper">content</div></body></html>'
    expect(detectFramework(html)).toBe('slate')
  })

  test('returns generic for unknown framework', () => {
    const html = '<html><body><h1>API Docs</h1></body></html>'
    expect(detectFramework(html)).toBe('generic')
  })
})
