import { fail, ok } from '../output/result'
import { extractEndpoint } from '../pipeline/extractors'
import type { Chunk, ChunkType, InspectData } from '../types/chunk'
import type { DiffData, DiffEndpoint, DiffFlags, RelatedChunk } from '../types/diff'
import type { Result } from '../types/result'

export function normalizePath(path: string): string {
  let normalized = path

  // 1. Remove trailing slash (but keep root /)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  // 2. Unify path parameters to {_}
  normalized = normalized
    .replace(/\{[^}]+\}/g, '{_}')
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{_}')

  // 3. Lowercase
  normalized = normalized.toLowerCase()

  return normalized
}

const RELATED_TYPES: ReadonlySet<ChunkType> = new Set([
  'parameter_table',
  'response_example',
  'error_codes',
  'auth_description',
])

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

function makeEndpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`
}

function collectRelatedChunks(
  chunks: readonly Chunk[],
  startIndex: number,
): readonly RelatedChunk[] {
  const related: RelatedChunk[] = []
  for (let i = startIndex + 1; i < chunks.length; i++) {
    if (chunks[i].type === 'endpoint_definition') break
    if (RELATED_TYPES.has(chunks[i].type)) {
      related.push({
        id: chunks[i].id,
        type: chunks[i].type,
        confidence: chunks[i].confidence,
      })
    }
  }
  return related
}

function parseSpecEndpoints(spec: Record<string, unknown>): ReadonlySet<string> {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined
  if (!paths) return new Set()

  const keys = new Set<string>()
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of Object.keys(methods)) {
      if (HTTP_METHODS.has(method.toLowerCase())) {
        keys.add(makeEndpointKey(method, path))
      }
    }
  }
  return keys
}

function parseYamlOrJson(content: string): unknown {
  // Try JSON first
  try {
    return JSON.parse(content)
  } catch {
    // Fall through to YAML
  }

  // Try YAML (js-yaml is available as transitive dep)
  try {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic require for optional transitive dep
    const yaml = require('js-yaml') as { load: (s: string) => any }
    return yaml.load(content)
  } catch {
    return null
  }
}

export async function runDiff(
  inspectPath: string,
  specPath: string,
  flags: DiffFlags,
): Promise<Result<DiffData>> {
  // Read inspect file
  const inspectFile = Bun.file(inspectPath)
  if (!(await inspectFile.exists())) {
    return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${inspectPath}`, {
      suggestion: 'Check the file path and try again',
      context: { file: inspectPath },
    })
  }

  const inspectRaw = await inspectFile.text()
  let inspectData: InspectData
  try {
    const parsed = JSON.parse(inspectRaw)
    if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
      return fail('E6001', 'INVALID_INSPECT_JSON', 'Inspect JSON missing "chunks" array', {
        suggestion: 'Provide output from "doc2api inspect --json"',
        context: { file: inspectPath },
      })
    }
    inspectData = parsed as InspectData
  } catch {
    return fail('E6001', 'INVALID_INSPECT_JSON', `Failed to parse inspect JSON: ${inspectPath}`, {
      suggestion: 'Provide valid JSON output from "doc2api inspect --json"',
      context: { file: inspectPath },
    })
  }

  // Read spec file
  const specFile = Bun.file(specPath)
  if (!(await specFile.exists())) {
    return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${specPath}`, {
      suggestion: 'Check the file path and try again',
      context: { file: specPath },
    })
  }

  const specRaw = await specFile.text()
  const specParsed = parseYamlOrJson(specRaw)
  if (!specParsed || typeof specParsed !== 'object') {
    return fail('E6002', 'INVALID_SPEC_FILE', `Failed to parse spec file: ${specPath}`, {
      suggestion: 'Provide a valid OpenAPI 3.x spec in JSON or YAML format',
      context: { file: specPath },
    })
  }

  const spec = specParsed as Record<string, unknown>
  const specEndpoints = parseSpecEndpoints(spec)

  // Extract doc endpoints
  const docEndpoints: DiffEndpoint[] = []
  for (let i = 0; i < inspectData.chunks.length; i++) {
    const chunk = inspectData.chunks[i]
    if (chunk.type !== 'endpoint_definition') continue
    if (chunk.confidence < flags.confidence) continue

    const extracted = extractEndpoint(chunk.raw_text, chunk.table)
    if (!extracted) continue

    const key = makeEndpointKey(extracted.method, extracted.path)
    if (!specEndpoints.has(key)) {
      docEndpoints.push({
        method: extracted.method,
        path: extracted.path,
        chunkId: chunk.id,
        confidence: chunk.confidence,
        relatedChunks: collectRelatedChunks(inspectData.chunks, i),
      })
    }
  }

  // Count total doc endpoints (above confidence threshold)
  let totalDocEndpoints = 0
  for (const chunk of inspectData.chunks) {
    if (chunk.type !== 'endpoint_definition') continue
    if (chunk.confidence < flags.confidence) continue
    if (extractEndpoint(chunk.raw_text, chunk.table)) {
      totalDocEndpoints++
    }
  }

  return ok({
    summary: {
      totalDocEndpoints,
      totalSpecEndpoints: specEndpoints.size,
      missingCount: docEndpoints.length,
    },
    missing: docEndpoints,
  })
}
