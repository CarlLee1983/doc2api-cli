import type { Result } from '../types/result'

export function formatOutput<T>(result: Result<T>, jsonMode: boolean): string {
  if (jsonMode) {
    return JSON.stringify(result, null, 2)
  }

  if (result.ok) {
    return formatHumanSuccess(result.data)
  }

  return formatHumanError(result.error)
}

function formatHumanSuccess(data: unknown): string {
  if (data === null || data === undefined) {
    return 'Done.'
  }

  if (typeof data === 'object') {
    const obj = data as Readonly<Record<string, unknown>>
    const lines: string[] = []

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        lines.push(`${key}: ${value.length} items`)
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`${key}: ${JSON.stringify(value)}`)
      } else {
        lines.push(`${key}: ${value}`)
      }
    }

    return lines.join('\n')
  }

  return String(data)
}

function formatHumanError(error: {
  code: string
  type: string
  message: string
  suggestion?: string
}): string {
  const lines = [`Error [${error.code}]: ${error.message}`]

  if (error.suggestion) {
    lines.push(`Suggestion: ${error.suggestion}`)
  }

  return lines.join('\n')
}
