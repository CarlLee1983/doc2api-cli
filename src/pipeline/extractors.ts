import type {
  AuthContent,
  EndpointContent,
  ErrorCodesContent,
  ParameterContent,
  ResponseContent,
  Table,
} from '../types/chunk'

const ENDPOINT_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[a-zA-Z0-9_\-\/{}.]+)/i

export function extractEndpoint(rawText: string, _table: Table | null): EndpointContent | null {
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
    summary =
      after
        .replace(/^[-—]\s*/, '')
        .split('\n')[0]
        .trim() || null
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

export function extractParameters(_rawText: string, table: Table | null): ParameterContent | null {
  if (!table || table.rows.length === 0) return null

  const nameIdx = findColumnIndex(table.headers, NAME_HEADERS)
  if (nameIdx === -1) return null

  const typeIdx = findColumnIndex(table.headers, TYPE_HEADERS)
  const reqIdx = findColumnIndex(table.headers, REQUIRED_HEADERS)
  const descIdx = findColumnIndex(table.headers, DESC_HEADERS)

  const parameters = table.rows.map((row) => ({
    name: row[nameIdx]?.trim() ?? '',
    type: typeIdx >= 0 ? row[typeIdx]?.trim() || null : null,
    required: reqIdx >= 0 ? TRUTHY_VALUES.test(row[reqIdx]?.trim() ?? '') : null,
    description: descIdx >= 0 ? row[descIdx]?.trim() || null : null,
  }))

  return { kind: 'parameter', parameters }
}

const BEARER_PATTERN = /\b(bearer\s+token|bearer\s+auth)/i
const API_KEY_PATTERN = /\b(api[_\s]?key)/i
const OAUTH_PATTERN = /\b(oauth\s*2?\.?0?)/i
const JWT_PATTERN = /\bjwt\b/i
const HEADER_LOCATION = /\bheader\b|\bAuthorization\b/
const QUERY_LOCATION = /\b(query\s+param|query\s+string|\?.*=)/i

export function extractAuth(rawText: string, _table: Table | null): AuthContent | null {
  let scheme: string | null = null

  if (BEARER_PATTERN.test(rawText)) {
    scheme = 'bearer'
  } else if (OAUTH_PATTERN.test(rawText)) {
    scheme = 'oauth2'
  } else if (JWT_PATTERN.test(rawText)) {
    scheme = 'bearer'
  } else if (API_KEY_PATTERN.test(rawText)) {
    scheme = 'apiKey'
  } else {
    return null
  }

  let location: string | null = null
  if (HEADER_LOCATION.test(rawText)) {
    location = 'header'
  } else if (QUERY_LOCATION.test(rawText)) {
    location = 'query'
  }

  return { kind: 'auth', scheme, location, description: rawText.trim() }
}

const STATUS_COL_PATTERN = /^[1-5]\d{2}$/

export function extractErrorCodes(_rawText: string, table: Table | null): ErrorCodesContent | null {
  if (!table || table.rows.length === 0) return null

  const statusIdx = table.rows[0].findIndex((cell) => STATUS_COL_PATTERN.test(cell.trim()))
  if (statusIdx === -1) return null

  const messageIdx = statusIdx === 0 ? 1 : 0

  const codes = table.rows
    .filter((row) => STATUS_COL_PATTERN.test(row[statusIdx]?.trim() ?? ''))
    .map((row) => ({
      status: Number.parseInt(row[statusIdx].trim(), 10),
      message: messageIdx < row.length ? row[messageIdx]?.trim() || null : null,
    }))

  if (codes.length === 0) return null

  return { kind: 'error_codes', codes }
}

const STATUS_CODE_PATTERN = /\b(?:HTTP\s+|status\s+)?([1-5]\d{2})\b/i

const MAX_JSON_SCAN = 50_000

function findJsonBlock(text: string): string | null {
  const scanText = text.length > MAX_JSON_SCAN ? text.slice(0, MAX_JSON_SCAN) : text
  const start = scanText.search(/[{[]/)
  if (start === -1) return null

  const open = scanText[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < scanText.length; i++) {
    const ch = scanText[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === open) depth++
    else if (ch === close) depth--
    if (depth === 0) return scanText.slice(start, i + 1)
  }

  return null
}

export function extractResponse(rawText: string, _table: Table | null): ResponseContent | null {
  const body = findJsonBlock(rawText)
  if (!body) return null

  const jsonStart = rawText.indexOf(body)
  // Only search for status code in text before the JSON block
  const textBeforeJson = rawText.slice(0, jsonStart)
  const statusMatch = textBeforeJson.match(STATUS_CODE_PATTERN)
  const statusCode = statusMatch ? Number.parseInt(statusMatch[1], 10) : null

  return {
    kind: 'response',
    statusCode,
    body: body.trim(),
  }
}
