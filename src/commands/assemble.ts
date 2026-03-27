import type { Result } from '../types/result'
import type { AssembleInput } from '../types/endpoint'
import type { AssembleFlags } from '../types/config'
import type { OpenApiSpec } from '../assembler/openapi-builder'
import { ok, fail } from '../output/result'
import { buildOpenApiSpec } from '../assembler/openapi-builder'

export interface AssembleData {
  readonly spec: OpenApiSpec
  readonly endpointCount: number
  readonly pathCount: number
}

export async function runAssemble(
  inputPath: string,
  flags: AssembleFlags,
): Promise<Result<AssembleData>> {
  let rawJson: string

  if (flags.stdin) {
    rawJson = await readStdin()
  } else {
    const file = Bun.file(inputPath)
    if (!(await file.exists())) {
      return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${inputPath}`, {
        suggestion: 'Check the file path and try again',
        context: { file: inputPath },
      })
    }
    rawJson = await file.text()
  }

  let input: AssembleInput
  try {
    input = JSON.parse(rawJson) as AssembleInput
  } catch {
    return fail('E2001', 'INVALID_INPUT', 'Input is not valid JSON', {
      suggestion: 'Ensure the input file contains valid JSON matching the AssembleInput schema',
    })
  }

  if (!input.info || !input.endpoints) {
    return fail('E2002', 'MISSING_FIELDS', 'Input must contain "info" and "endpoints" fields', {
      suggestion: 'See pdf2api documentation for the expected input format',
    })
  }

  const spec = buildOpenApiSpec(input)
  const pathCount = Object.keys(spec.paths).length

  return ok({ spec, endpointCount: input.endpoints.length, pathCount })
}

async function readStdin(): Promise<string> {
  const chunks: string[] = []
  const reader = Bun.stdin.stream().getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(new TextDecoder().decode(value))
  }
  return chunks.join('')
}
