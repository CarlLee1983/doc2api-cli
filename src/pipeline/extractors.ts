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
