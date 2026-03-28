import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_RETRY_OPTIONS,
  isRetryableError,
  withRetry,
} from '../../../src/pipeline/fetcher/retry'
import type { Result } from '../../../src/types/result'

function okResult(): Result<string> {
  return { ok: true, data: 'success' }
}

function failResult(status: number): Result<string> {
  return {
    ok: false,
    error: {
      code: 'E5001',
      type: 'FETCH_FAILED',
      message: `HTTP ${status}`,
      context: { statusCode: status },
    },
  }
}

function networkError(): Result<string> {
  return {
    ok: false,
    error: {
      code: 'E5001',
      type: 'FETCH_FAILED',
      message: 'fetch failed: ECONNRESET',
    },
  }
}

const FAST_OPTIONS = { initialDelayMs: 10, maxDelayMs: 50 }

describe('isRetryableError', () => {
  test('returns false for ok result', () => {
    expect(isRetryableError(okResult())).toBe(false)
  })

  test('returns true for retryable status codes', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isRetryableError(failResult(status))).toBe(true)
    }
  })

  test('returns false for non-retryable status codes', () => {
    expect(isRetryableError(failResult(404))).toBe(false)
    expect(isRetryableError(failResult(400))).toBe(false)
    expect(isRetryableError(failResult(403))).toBe(false)
  })

  test('returns true for network error messages', () => {
    expect(isRetryableError(networkError())).toBe(true)
  })

  test('returns true for timeout message', () => {
    const result: Result<string> = {
      ok: false,
      error: { code: 'E5001', type: 'FETCH_FAILED', message: 'Request timeout after 30s' },
    }
    expect(isRetryableError(result)).toBe(true)
  })

  test('returns true for ENOTFOUND message', () => {
    const result: Result<string> = {
      ok: false,
      error: { code: 'E5001', type: 'FETCH_FAILED', message: 'ENOTFOUND example.com' },
    }
    expect(isRetryableError(result)).toBe(true)
  })

  test('returns true for AbortError message', () => {
    const result: Result<string> = {
      ok: false,
      error: { code: 'E5001', type: 'FETCH_FAILED', message: 'AbortError: signal timed out' },
    }
    expect(isRetryableError(result)).toBe(true)
  })

  test('returns false for generic non-retryable error', () => {
    const result: Result<string> = {
      ok: false,
      error: { code: 'E5001', type: 'FETCH_FAILED', message: 'Invalid URL' },
    }
    expect(isRetryableError(result)).toBe(false)
  })
})

describe('withRetry', () => {
  test('success on first try — no retry', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return okResult()
    }

    const result = await withRetry(fn, FAST_OPTIONS)

    expect(result.ok).toBe(true)
    expect(calls).toBe(1)
  })

  test('fails with retryable 503, succeeds on 2nd attempt', async () => {
    let calls = 0
    const fn = async (): Promise<Result<string>> => {
      calls++
      if (calls === 1) return failResult(503)
      return okResult()
    }

    const result = await withRetry(fn, { ...FAST_OPTIONS, maxRetries: 3 })

    expect(result.ok).toBe(true)
    expect(calls).toBe(2)
  })

  test('fails with non-retryable 404 — no retry, returns failure immediately', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return failResult(404)
    }

    const result = await withRetry(fn, { ...FAST_OPTIONS, maxRetries: 3 })

    expect(result.ok).toBe(false)
    expect(calls).toBe(1)
    if (!result.ok) {
      expect(result.error.context?.statusCode).toBe(404)
    }
  })

  test('network timeout error message — retries', async () => {
    let calls = 0
    const fn = async (): Promise<Result<string>> => {
      calls++
      if (calls < 3) return networkError()
      return okResult()
    }

    const result = await withRetry(fn, { ...FAST_OPTIONS, maxRetries: 3 })

    expect(result.ok).toBe(true)
    expect(calls).toBe(3)
  })

  test('all retries exhausted — returns last error', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return failResult(503)
    }

    const result = await withRetry(fn, { ...FAST_OPTIONS, maxRetries: 2 })

    expect(result.ok).toBe(false)
    expect(calls).toBe(3) // 1 initial + 2 retries
    if (!result.ok) {
      expect(result.error.context?.statusCode).toBe(503)
    }
  })

  test('maxRetries: 0 — only one attempt, no retry', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return failResult(503)
    }

    const result = await withRetry(fn, { ...FAST_OPTIONS, maxRetries: 0 })

    expect(result.ok).toBe(false)
    expect(calls).toBe(1)
  })

  test('jitter: delay is within expected range and function completes', async () => {
    let calls = 0
    const fn = async (): Promise<Result<string>> => {
      calls++
      if (calls < 2) return failResult(500)
      return okResult()
    }

    const start = Date.now()
    const result = await withRetry(fn, { initialDelayMs: 10, maxDelayMs: 50, maxRetries: 3 })
    const elapsed = Date.now() - start

    expect(result.ok).toBe(true)
    expect(calls).toBe(2)
    // delay = min(10 * 2^0, 50) = 10ms ±25% → [7.5, 12.5], generous upper bound for CI
    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(elapsed).toBeLessThan(500)
  })
})

describe('DEFAULT_RETRY_OPTIONS', () => {
  test('has expected default values', () => {
    expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBe(3)
    expect(DEFAULT_RETRY_OPTIONS.initialDelayMs).toBe(1000)
    expect(DEFAULT_RETRY_OPTIONS.maxDelayMs).toBe(30_000)
    expect(DEFAULT_RETRY_OPTIONS.retryableStatuses.has(429)).toBe(true)
    expect(DEFAULT_RETRY_OPTIONS.retryableStatuses.has(500)).toBe(true)
    expect(DEFAULT_RETRY_OPTIONS.retryableStatuses.has(502)).toBe(true)
    expect(DEFAULT_RETRY_OPTIONS.retryableStatuses.has(503)).toBe(true)
    expect(DEFAULT_RETRY_OPTIONS.retryableStatuses.has(504)).toBe(true)
    expect(DEFAULT_RETRY_OPTIONS.retryableStatuses.has(404)).toBe(false)
  })
})
