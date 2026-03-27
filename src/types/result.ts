export interface AppError {
  readonly code: string
  readonly type: string
  readonly message: string
  readonly suggestion?: string
  readonly context?: Record<string, unknown>
}

export interface SuccessResult<T> {
  readonly ok: true
  readonly data: T
}

export interface FailResult {
  readonly ok: false
  readonly error: AppError
}

export type Result<T> = SuccessResult<T> | FailResult
