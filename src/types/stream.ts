import type { Result } from './result'

export type ResultStream<T> = AsyncGenerator<Result<T>, void, undefined>
