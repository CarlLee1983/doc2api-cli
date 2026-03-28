import type {
  AuthContent,
  ChunkContent,
  EndpointContent,
  ErrorCodesContent,
  ParameterContent,
  ResponseContent,
  Table,
} from '../types/chunk'

const ENDPOINT_PATTERN =
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[a-zA-Z0-9_\-\/{}.]+)/i

export function extractEndpoint(
  rawText: string,
  _table: Table | null,
): EndpointContent | null {
  const match = rawText.match(ENDPOINT_PATTERN)
  if (!match) return null

  const method = match[1].toUpperCase()
  const path = match[2]

  const matchStart = match.index ?? 0
  const matchEnd = matchStart + match[0].length

  const before = rawText.slice(0, matchStart).trim()
  const after = rawText.slice(matchEnd).trim()

  let summary: string | null = null
  if (after.startsWith('-') || after.startsWith('—')) {
    summary = after.replace(/^[-—]\s*/, '').split('\n')[0].trim() || null
  } else if (before && !ENDPOINT_PATTERN.test(before)) {
    summary = before.split('\n').pop()?.trim() || null
  }

  return { kind: 'endpoint', method, path, summary }
}

const NAME_HEADERS = /^(name|parameter|參數|field|欄位)$/i
const TYPE_HEADERS = /^(type|型別|data\s*type|類型)$/i
const REQUIRED_HEADERS = /^(required|必填|必要)$/i
const DESC_HEADERS = /^(description|說明|描述|備註|detail)$/i
const TRUTHY_VALUES = /^(yes|true|是|required|必填|✓|v)$/i

function findColumnIndex(headers: readonly string[], pattern: RegExp): number {
  return headers.findIndex((h) => pattern.test(h.trim()))
}

export function extractParameters(
  _rawText: string,
  table: Table | null,
): ParameterContent | null {
  if (!table || table.rows.length === 0) return null

  const nameIdx = findColumnIndex(table.headers, NAME_HEADERS)
  if (nameIdx === -1) return null

  const typeIdx = findColumnIndex(table.headers, TYPE_HEADERS)
  const reqIdx = findColumnIndex(table.headers, REQUIRED_HEADERS)
  const descIdx = findColumnIndex(table.headers, DESC_HEADERS)

  const parameters = table.rows.map((row) => ({
    name: row[nameIdx]?.trim() ?? '',
    type: typeIdx >= 0 ? (row[typeIdx]?.trim() || null) : null,
    required: reqIdx >= 0 ? TRUTHY_VALUES.test(row[reqIdx]?.trim() ?? '') : null,
    description: descIdx >= 0 ? (row[descIdx]?.trim() || null) : null,
  }))

  return { kind: 'parameter', parameters }
}

const STATUS_CODE_PATTERN = /\b(?:HTTP\s+|status\s+)?([1-5]\d{2})\b/i
const JSON_BODY_PATTERN = /(\{[\s\S]*\}|\[[\s\S]*\])/

export function extractResponse(
  rawText: string,
  _table: Table | null,
): ResponseContent | null {
  const jsonMatch = rawText.match(JSON_BODY_PATTERN)
  if (!jsonMatch) return null

  const statusMatch = rawText.match(STATUS_CODE_PATTERN)
  const statusCode = statusMatch ? Number.parseInt(statusMatch[1], 10) : null

  return {
    kind: 'response',
    statusCode,
    body: jsonMatch[1].trim(),
  }
}
