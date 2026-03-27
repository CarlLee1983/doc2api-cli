export type LogLevel = 'warn' | 'error'

const PREFIX = '[doc2api]'

export function warn(message: string): void {
  console.error(`${PREFIX} Warning: ${message}`)
}

export function error(message: string): void {
  console.error(`${PREFIX} Error: ${message}`)
}
