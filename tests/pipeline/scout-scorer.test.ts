import { describe, expect, test } from 'bun:test'
import { scorePageForApi } from '../../src/pipeline/scout-scorer'

describe('scorePageForApi()', () => {
  test('high score for page with HTTP method endpoints', () => {
    const result = scorePageForApi(
      'https://example.com/api/v3/payments',
      'POST /v3/payments/request\nGET /v3/payments/{id}\nReturns payment details.',
    )
    expect(result.score).toBeGreaterThanOrEqual(0.6)
    expect(result.isApi).toBe(true)
    expect(result.signals).toContain('http_method')
  })

  test('positive signal for URL containing api keyword', () => {
    const result = scorePageForApi(
      'https://example.com/api/reference',
      'Welcome to our API documentation.',
    )
    expect(result.signals).toContain('url_pattern')
  })

  test('positive signal for parameter table keywords', () => {
    const result = scorePageForApi(
      'https://example.com/docs/create',
      'Parameter: name (required, string). Request body contains the payload.',
    )
    expect(result.signals).toContain('param_keywords')
  })

  test('negative signal for FAQ page', () => {
    const result = scorePageForApi(
      'https://example.com/faq',
      'Frequently asked questions about our service.',
    )
    expect(result.score).toBeLessThan(0.3)
    expect(result.isApi).toBe(false)
    expect(result.signals).toContain('exclude_url')
  })

  test('negative signal for changelog page', () => {
    const result = scorePageForApi(
      'https://example.com/changelog',
      'Version 2.0 released with new features.',
    )
    expect(result.isApi).toBe(false)
  })

  test('low score for generic content with no signals', () => {
    const result = scorePageForApi(
      'https://example.com/about',
      'We are a company that builds things.',
    )
    expect(result.score).toBeLessThanOrEqual(0.3)
    expect(result.isApi).toBe(false)
  })

  test('combined signals stack correctly', () => {
    const result = scorePageForApi(
      'https://example.com/api/users',
      'GET /users\nParameter: id (required). Response: { "name": "..." }',
    )
    expect(result.score).toBeGreaterThanOrEqual(0.8)
    expect(result.signals).toContain('http_method')
    expect(result.signals).toContain('url_pattern')
    expect(result.signals).toContain('param_keywords')
  })

  test('threshold boundary: score exactly at 0.3 is not API', () => {
    const result = scorePageForApi(
      'https://example.com/api/overview',
      'Welcome to our platform overview.',
    )
    expect(result.isApi).toBe(result.score > 0.3)
  })
})
