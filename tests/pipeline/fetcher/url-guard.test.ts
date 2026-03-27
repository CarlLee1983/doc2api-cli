import { describe, expect, test } from 'bun:test'
import { validateUrl } from '../../../src/pipeline/fetcher/url-guard'

describe('validateUrl', () => {
  test('accepts valid public URL', () => {
    const result = validateUrl('https://example.com/docs')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.hostname).toBe('example.com')
    }
  })

  test('accepts http URL', () => {
    const result = validateUrl('http://api.example.com/v1')
    expect(result.ok).toBe(true)
  })

  test('rejects invalid URL', () => {
    const result = validateUrl('not-a-url')
    if (!result.ok) {
      expect(result.error.type).toBe('FETCH_FAILED')
    }
  })

  test('rejects ftp protocol', () => {
    const result = validateUrl('ftp://files.example.com/doc.pdf')
    if (!result.ok) {
      expect(result.error.type).toBe('FETCH_FAILED')
      expect(result.error.message).toContain('Unsupported protocol')
    }
  })

  test('rejects file protocol', () => {
    const result = validateUrl('file:///etc/passwd')
    if (!result.ok) {
      expect(result.error.type).toBe('FETCH_FAILED')
    }
  })

  describe('SSRF: blocks private/internal addresses', () => {
    const blockedHosts = [
      'http://localhost/admin',
      'http://127.0.0.1/metadata',
      'http://127.0.0.100/secret',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://10.0.0.1/',
      'http://10.255.255.255/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.0.1/',
      'http://192.168.1.100/',
      'http://169.254.169.254/latest/meta-data/',
      'http://169.254.1.1/',
    ]

    for (const url of blockedHosts) {
      test(`blocks ${url}`, () => {
        const result = validateUrl(url)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error.type).toBe('SSRF_BLOCKED')
        }
      })
    }
  })

  describe('SSRF: allows legitimate addresses', () => {
    const allowedUrls = [
      'https://api.stripe.com/v1',
      'https://172.32.0.1/',
      'https://11.0.0.1/',
      'https://192.167.1.1/',
      'https://8.8.8.8/',
    ]

    for (const url of allowedUrls) {
      test(`allows ${url}`, () => {
        const result = validateUrl(url)
        expect(result.ok).toBe(true)
      })
    }
  })
})
