import type { Result } from '../types/result'
import type { ValidateFlags } from '../types/config'
import type { ValidationResult } from '../validators/openapi-validator'
import { fail } from '../output/result'
import { validateSpec } from '../validators/openapi-validator'

export async function runValidate(
  specPath: string,
  flags: ValidateFlags,
): Promise<Result<ValidationResult>> {
  const file = Bun.file(specPath)
  if (!(await file.exists())) {
    return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${specPath}`, {
      suggestion: 'Check the file path and try again',
      context: { file: specPath },
    })
  }

  const rawContent = await file.text()
  let spec: unknown
  try {
    spec = JSON.parse(rawContent)
  } catch {
    return fail('E4001', 'INVALID_FORMAT', 'File is not valid JSON', {
      suggestion: 'Ensure the spec file contains valid JSON or YAML',
      context: { file: specPath },
    })
  }

  return validateSpec(spec)
}
