import { describe, expect, test } from 'bun:test'
import { type CrawlOptions, filterLinks, normalizeUrl } from '../../../src/pipeline/fetcher/crawler'

describe('normalizeUrl', () => {
  test('removes fragment', () => {
    expect(normalizeUrl('https://example.com/docs#section')).toBe('https://example.com/docs')
  })

  test('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/docs/')).toBe('https://example.com/docs')
  })

  test('preserves root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
})

describe('filterLinks', () => {
  const baseOptions: CrawlOptions = {
    entryUrl: 'https://example.com/docs',
    maxDepth: 2,
    maxPages: 50,
    concurrency: 3,
  }

  test('keeps same-domain links under entry path', () => {
    const links = ['https://example.com/docs/users', 'https://example.com/docs/orders']
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual(['https://example.com/docs/users', 'https://example.com/docs/orders'])
  })

  test('excludes external links', () => {
    const links = ['https://other.com/docs/users']
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([])
  })

  test('excludes links outside entry path prefix', () => {
    const links = ['https://example.com/blog/post']
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([])
  })

  test('excludes static assets', () => {
    const links = [
      'https://example.com/docs/style.css',
      'https://example.com/docs/app.js',
      'https://example.com/docs/logo.png',
    ]
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([])
  })

  test('excludes javascript: and # links', () => {
    const links = ['javascript:void(0)', '#section']
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual([])
  })

  test('deduplicates URLs', () => {
    const links = [
      'https://example.com/docs/users',
      'https://example.com/docs/users#params',
      'https://example.com/docs/users/',
    ]
    const result = filterLinks(links, baseOptions)
    expect(result).toEqual(['https://example.com/docs/users'])
  })
})
