import { validate } from '@readme/openapi-parser'
import { fail, ok } from '../output/result'
import type { Result } from '../types/result'

export interface ValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

export async function validateSpec(spec: unknown): Promise<Result<ValidationResult>> {
  try {
    const specDoc = structuredClone(spec) as Parameters<typeof validate>[0]
    const result = await validate(specDoc)
    if (!result.valid) {
      const rawErrors = Array.isArray(result.errors) ? result.errors : []
      const errors = rawErrors.map((e: unknown) =>
        typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : String(e),
      )
      return ok({ valid: false, errors, warnings: [] })
    }
    return ok({ valid: true, errors: [], warnings: [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('E4001', 'VALIDATION_FAILED', message, {
      suggestion: 'Fix the OpenAPI spec errors and try again',
    })
  }
}
