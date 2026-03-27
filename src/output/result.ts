import type { AppError, FailResult, Result, SuccessResult } from '../types/result'

export function ok<T>(data: T): SuccessResult<T> {
  return { ok: true, data }
}

export function fail(
  code: string,
  type: string,
  message: string,
  options?: { suggestion?: string; context?: Record<string, unknown> },
): FailResult {
  const error: AppError = {
    code,
    type,
    message,
    ...options,
  }
  return { ok: false, error }
}
