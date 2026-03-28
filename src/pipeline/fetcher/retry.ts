import type { Result } from '../../types/result'

export interface RetryOptions {
  readonly maxRetries: number
  readonly initialDelayMs: number
  readonly maxDelayMs: number
  readonly retryableStatuses: ReadonlySet<number>
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  retryableStatuses: new Set([429, 500, 502, 503, 504]),
}

const RETRYABLE_ERRORS = ['timeout', 'ECONNRESET', 'ENOTFOUND', 'AbortError', 'fetch failed']

export function isRetryableError(result: Result<unknown>): boolean {
  if (result.ok) return false

  const { error } = result
  const statusCode = error.context?.statusCode

  if (typeof statusCode === 'number' && DEFAULT_RETRY_OPTIONS.retryableStatuses.has(statusCode)) {
    return true
  }

  const messageLower = error.message.toLowerCase()
  return RETRYABLE_ERRORS.some((e) => messageLower.includes(e.toLowerCase()))
}

export async function withRetry<T>(
  fn: () => Promise<Result<T>>,
  options?: Partial<RetryOptions>,
): Promise<Result<T>> {
  const opts: RetryOptions = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
    retryableStatuses: options?.retryableStatuses ?? DEFAULT_RETRY_OPTIONS.retryableStatuses,
  }

  let lastResult: Result<T> | undefined

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    lastResult = await fn()

    if (lastResult.ok) return lastResult

    const retryable = isRetryableError(lastResult)
    if (!retryable) return lastResult

    const isLastAttempt = attempt === opts.maxRetries
    if (isLastAttempt) break

    const baseDelay = Math.min(opts.initialDelayMs * 2 ** attempt, opts.maxDelayMs)
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1)
    const delay = Math.max(0, Math.round(baseDelay + jitter))

    await new Promise<void>((resolve) => setTimeout(resolve, delay))
  }

  return lastResult as Result<T>
}
