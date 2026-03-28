import type { Chunk, ChunkContent, ChunkType } from '../types/chunk'
import type { RawChunk } from './chunk'
import {
  extractAuth,
  extractEndpoint,
  extractErrorCodes,
  extractParameters,
  extractResponse,
} from './extractors'

interface ClassifyRule {
  readonly type: ChunkType
  readonly test: (chunk: RawChunk) => number // Returns confidence 0-1
}

const ENDPOINT_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[a-zA-Z0-9_\-\/{}.]+/i
const AUTH_PATTERN =
  /\b(auth(?:entication|orization)|bearer\s+token|api[_\s]?key|oauth|jwt|session\s+token)/i
const RESPONSE_PATTERN = /\b(response|回應)[:\s].*[{[\]]/i
const JSON_BLOCK_PATTERN = /[{[]\s*"[^"]+"\s*:/
const ERROR_CODE_HEADERS = /\b(error[_\s]?code|status[_\s]?code|錯誤碼|狀態碼)/i
const PARAM_TABLE_HEADERS = /\b(name|parameter|參數|型別|type|required|必填|field|欄位)/i

const rules: readonly ClassifyRule[] = [
  {
    type: 'endpoint_definition',
    test: (chunk) => {
      if (ENDPOINT_PATTERN.test(chunk.raw_text)) {
        return 0.9
      }
      return 0
    },
  },
  {
    type: 'error_codes',
    test: (chunk) => {
      if (chunk.table) {
        const headerStr = chunk.table.headers.join(' ')
        if (ERROR_CODE_HEADERS.test(headerStr)) {
          return 0.9
        }
        const hasStatusCodes = chunk.table.rows.some((row) =>
          row.some((cell) => /^[1-5]\d{2}$/.test(cell)),
        )
        if (hasStatusCodes) {
          return 0.7
        }
      }
      return 0
    },
  },
  {
    type: 'parameter_table',
    test: (chunk) => {
      if (chunk.table) {
        const headerStr = chunk.table.headers.join(' ')
        if (PARAM_TABLE_HEADERS.test(headerStr)) {
          return 0.85
        }
        return 0.5
      }
      return 0
    },
  },
  {
    type: 'auth_description',
    test: (chunk) => {
      if (AUTH_PATTERN.test(chunk.raw_text)) {
        return 0.85
      }
      return 0
    },
  },
  {
    type: 'response_example',
    test: (chunk) => {
      if (RESPONSE_PATTERN.test(chunk.raw_text)) {
        return 0.85
      }
      if (JSON_BLOCK_PATTERN.test(chunk.raw_text)) {
        return 0.6
      }
      return 0
    },
  },
]

export function classifyChunks(rawChunks: readonly RawChunk[]): readonly Chunk[] {
  return rawChunks.map((raw) => {
    let bestType: ChunkType = 'general_text'
    let bestConfidence = 0.3

    for (const rule of rules) {
      const confidence = rule.test(raw)
      if (confidence > bestConfidence) {
        bestType = rule.type
        bestConfidence = confidence
      }
    }

    return {
      id: raw.id,
      page: raw.page,
      type: bestType,
      confidence: bestConfidence,
      content: bestType === 'general_text' ? null : extractContent(raw, bestType),
      raw_text: raw.raw_text,
      table: raw.table,
    }
  })
}

export function extractContent(
  chunk: RawChunk,
  type: ChunkType,
): ChunkContent | null {
  if (type === 'endpoint_definition') {
    return extractEndpoint(chunk.raw_text, chunk.table)
  }
  if (type === 'parameter_table') {
    return extractParameters(chunk.raw_text, chunk.table)
  }
  if (type === 'response_example') {
    return extractResponse(chunk.raw_text, chunk.table)
  }
  if (type === 'auth_description') {
    return extractAuth(chunk.raw_text, chunk.table)
  }
  if (type === 'error_codes') {
    return extractErrorCodes(chunk.raw_text, chunk.table)
  }
  return null
}
