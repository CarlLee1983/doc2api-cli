import type { OpenApiSpec } from '../assembler/openapi-builder'
import { buildOpenApiSpec } from '../assembler/openapi-builder'
import { fail, ok } from '../output/result'
import type { AssembleFlags } from '../types/config'
import type { AssembleInput } from '../types/endpoint'
import type { Result } from '../types/result'

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

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return fail('E2001', 'INVALID_INPUT', 'Input is not valid JSON', {
      suggestion: 'Ensure the input file contains valid JSON matching the AssembleInput schema',
    })
  }

  const validationError = validateAssembleInput(parsed)
  if (validationError) {
    return fail('E2002', 'MISSING_FIELDS', validationError, {
      suggestion: 'See doc2api documentation for the expected input format',
    })
  }

  const input = parsed as AssembleInput

  const spec = buildOpenApiSpec(input)
  const pathCount = Object.keys(spec.paths).length

  return ok({ spec, endpointCount: input.endpoints.length, pathCount })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateAssembleInput(data: unknown): string | null {
  if (!isRecord(data)) {
    return 'Input must be a JSON object'
  }

  if (!isRecord(data.info)) {
    return 'Input must contain an "info" object'
  }

  if (typeof data.info.title !== 'string' || !data.info.title) {
    return 'Input info must contain a non-empty "title" string'
  }
  if (typeof data.info.version !== 'string' || !data.info.version) {
    return 'Input info must contain a non-empty "version" string'
  }

  if (!Array.isArray(data.endpoints) || data.endpoints.length === 0) {
    return 'Input must contain a non-empty "endpoints" array'
  }

  for (const [i, ep] of (data.endpoints as unknown[]).entries()) {
    if (!isRecord(ep)) {
      return `Endpoint [${i}] must be an object`
    }
    if (typeof ep.path !== 'string' || !ep.path) {
      return `Endpoint [${i}] missing "path"`
    }
    if (typeof ep.method !== 'string' || !ep.method) {
      return `Endpoint [${i}] missing "method"`
    }
  }

  return null
}

const STDIN_TIMEOUT_MS = 30_000
const STDIN_MAX_BYTES = 50 * 1024 * 1024

async function readStdin(): Promise<string> {
  const chunks: string[] = []
  const reader = Bun.stdin.stream().getReader()
  let totalBytes = 0

  const timer = setTimeout(() => {
    reader.cancel()
  }, STDIN_TIMEOUT_MS)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > STDIN_MAX_BYTES) {
        reader.cancel()
        throw new Error(`Stdin input exceeds maximum size (${STDIN_MAX_BYTES / 1024 / 1024}MB)`)
      }
      chunks.push(new TextDecoder().decode(value))
    }
  } finally {
    clearTimeout(timer)
  }

  return chunks.join('')
}
