import type { RawPage } from './extract'
import type { Table } from '../types/chunk'

export interface RawChunk {
  readonly id: string
  readonly page: number
  readonly raw_text: string
  readonly table: Table | null
}

// Patterns that indicate section boundaries
const HEADING_PATTERNS = [
  /(?:^|\s)(#{1,3}\s)/,
  /(?:^|\s)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i,
  /(?:^|\s)(Authentication|Authorization|Parameters|Response|Error|Overview|Introduction)/i,
  /(?:^|\s)(API\s+\w+)/i,
]

function createIdGenerator(): () => string {
  let counter = 0
  return (): string => {
    counter++
    return `chunk-${String(counter).padStart(3, '0')}`
  }
}

export function chunkPages(pages: readonly RawPage[]): readonly RawChunk[] {
  const nextId = createIdGenerator()
  const allChunks: RawChunk[] = []

  for (const page of pages) {
    const textChunks = splitByHeadings(page.text, page.pageNumber, nextId)
    allChunks.push(...textChunks)

    for (const table of page.tables) {
      allChunks.push({
        id: nextId(),
        page: page.pageNumber,
        raw_text: formatTableAsText(table),
        table,
      })
    }
  }

  return allChunks
}

function splitByHeadings(text: string, pageNumber: number, nextId: () => string): readonly RawChunk[] {
  const trimmed = text.trim()
  if (!trimmed) {
    return []
  }

  const segments: string[] = []
  let remaining = trimmed

  for (const pattern of HEADING_PATTERNS) {
    const parts: string[] = []
    let current = remaining

    while (current.length > 0) {
      const match = current.match(pattern)
      if (!match || match.index === undefined || match.index === 0) {
        parts.push(current)
        break
      }

      const before = current.slice(0, match.index).trim()
      if (before) {
        parts.push(before)
      }
      current = current.slice(match.index).trim()
    }

    if (parts.length > 1) {
      segments.push(...parts)
      remaining = ''
      break
    }
  }

  if (remaining) {
    segments.push(remaining)
  }

  return segments
    .filter((s) => s.trim().length > 0)
    .map((s) => ({
      id: nextId(),
      page: pageNumber,
      raw_text: s.trim(),
      table: null,
    }))
}

function formatTableAsText(table: Table): string {
  const header = table.headers.join(' | ')
  const rows = table.rows.map((r) => r.join(' | ')).join('\n')
  return `${header}\n${rows}`
}
