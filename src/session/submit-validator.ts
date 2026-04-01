export interface ValidationResult {
  readonly valid: boolean
  readonly warnings: readonly string[]
}

const VALID_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE',
])

export function validateSubmission(data: Record<string, unknown>): ValidationResult {
  const warnings: string[] = []

  const method = data.method
  const path = data.path

  if (typeof method !== 'string' || !method) {
    warnings.push('Missing required field: method')
  }

  if (typeof path !== 'string' || !path) {
    warnings.push('Missing required field: path')
  }

  const hasCriticalError = warnings.length > 0
  if (hasCriticalError) {
    return { valid: false, warnings }
  }

  if (!VALID_METHODS.has((method as string).toUpperCase())) {
    warnings.push(`Invalid HTTP method: ${method}`)
  }

  if (!(path as string).startsWith('/')) {
    warnings.push(`Path should start with /: ${path}`)
  }

  const parameters = data.parameters
  if (Array.isArray(parameters)) {
    for (const [i, param] of parameters.entries()) {
      if (typeof param !== 'object' || param === null) continue
      const p = param as Record<string, unknown>
      if (typeof p.name !== 'string' || !p.name) {
        warnings.push(`Parameter [${i}] missing "name"`)
      }
      if (typeof p.in !== 'string' || !p.in) {
        warnings.push(`Parameter [${i}] missing "in"`)
      }
    }
  }

  return { valid: true, warnings }
}
