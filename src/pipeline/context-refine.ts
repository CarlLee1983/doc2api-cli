import type { Chunk, ChunkContent, ChunkType } from '../types/chunk'
import { extractAuth, extractErrorCodes, extractParameters, extractResponse } from './extractors'

const JSON_BLOCK_PATTERN = /[{[]\s*"[^"]+"\s*:/
const AUTH_EXTEND_PATTERN = /\b(token|key|secret|credential|refresh|expire|scope)/i

const ENDPOINT_RELATED_TYPES: ReadonlySet<ChunkType> = new Set([
  'endpoint_definition',
  'parameter_table',
  'response_example',
  'error_codes',
])

interface ContextRule {
  readonly apply: (
    chunk: Chunk,
    prev: Chunk | null,
    next: Chunk | null,
  ) => { readonly type: ChunkType; readonly confidence: number } | null
}

const contextRules: readonly ContextRule[] = [
  {
    // JSON block following an endpoint → response_example
    apply: (chunk, prev) => {
      if (chunk.type !== 'general_text' || !prev || prev.type !== 'endpoint_definition') {
        return null
      }
      if (!JSON_BLOCK_PATTERN.test(chunk.raw_text)) return null
      return { type: 'response_example', confidence: 0.75 }
    },
  },
  {
    // Table following an endpoint → parameter_table
    apply: (chunk, prev) => {
      if (
        chunk.type !== 'general_text' ||
        !chunk.table ||
        !prev ||
        prev.type !== 'endpoint_definition'
      ) {
        return null
      }
      return { type: 'parameter_table', confidence: 0.7 }
    },
  },
  {
    // Auth keyword following auth_description → extend auth
    apply: (chunk, prev) => {
      if (chunk.type !== 'general_text' || !prev || prev.type !== 'auth_description') {
        return null
      }
      if (!AUTH_EXTEND_PATTERN.test(chunk.raw_text)) return null
      return { type: 'auth_description', confidence: 0.65 }
    },
  },
  {
    // Low confidence between endpoint-related → boost
    apply: (chunk, prev, next) => {
      if (chunk.confidence >= 0.5) return null
      const prevRelated = prev && ENDPOINT_RELATED_TYPES.has(prev.type)
      const nextRelated = next && ENDPOINT_RELATED_TYPES.has(next.type)
      if (!prevRelated || !nextRelated) return null
      return { type: chunk.type, confidence: chunk.confidence + 0.1 }
    },
  },
]

function reExtractContent(
  rawText: string,
  table: Chunk['table'],
  type: ChunkType,
): ChunkContent | null {
  if (type === 'response_example') return extractResponse(rawText, table)
  if (type === 'parameter_table') return extractParameters(rawText, table)
  if (type === 'auth_description') return extractAuth(rawText, table)
  if (type === 'error_codes') return extractErrorCodes(rawText, table)
  return null
}

// Single-pass design: prev/next reference the original (pre-refined) chunks.
// A promoted chunk will not cascade to its neighbors in the same pass.
export function contextRefine(chunks: readonly Chunk[]): readonly Chunk[] {
  return chunks.map((chunk, i) => {
    const prev = i > 0 ? chunks[i - 1] : null
    const next = i < chunks.length - 1 ? chunks[i + 1] : null

    for (const rule of contextRules) {
      const result = rule.apply(chunk, prev, next)
      if (!result) continue

      // Only upgrade, never downgrade
      if (result.confidence <= chunk.confidence) continue

      const needsReExtract = result.type !== chunk.type
      const newContent = needsReExtract
        ? reExtractContent(chunk.raw_text, chunk.table, result.type)
        : chunk.content

      return {
        ...chunk,
        type: result.type,
        confidence: result.confidence,
        content: newContent,
      }
    }

    return chunk
  })
}
