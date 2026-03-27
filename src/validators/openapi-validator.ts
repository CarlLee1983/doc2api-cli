import { validate } from '@readme/openapi-parser'
import type { Result } from '../types/result'
import { ok, fail } from '../output/result'

export interface ValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

export async function validateSpec(spec: unknown): Promise<Result<ValidationResult>> {
  try {
    const result = await validate(structuredClone(spec) as Record<string, unknown>)
    if (!result.valid) {
      const errors = result.errors?.map((e: { message: string }) => e.message) ?? []
      return fail('E4001', 'VALIDATION_FAILED', errors[0] ?? 'OpenAPI spec is invalid', {
        suggestion: 'Fix the OpenAPI spec errors and try again',
      })
    }
    return ok({ valid: true, errors: [], warnings: [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('E4001', 'VALIDATION_FAILED', message, {
      suggestion: 'Fix the OpenAPI spec errors and try again',
    })
  }
}
