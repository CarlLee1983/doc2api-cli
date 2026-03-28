import type { Table } from '../types/chunk'
import type { Result } from '../types/result'
import type { RawPage } from './extract'

export interface RawChunk {
  readonly id: string
  readonly page: number
  readonly raw_text: string
  readonly table: Table | null
}

export const MAX_CHUNK_CHARS = 8000

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

  return splitOversizedChunks(allChunks, nextId)
}

export async function* chunkPagesStream(
  pages: AsyncIterable<Result<RawPage>>,
): AsyncGenerator<RawChunk, void, undefined> {
  const nextId = createIdGenerator()

  for await (const pageResult of pages) {
    if (!pageResult.ok) continue

    const page = pageResult.data
    const textChunks = splitByHeadings(page.text, page.pageNumber, nextId)
    const tableChunks: RawChunk[] = page.tables.map((table) => ({
      id: nextId(),
      page: page.pageNumber,
      raw_text: formatTableAsText(table),
      table,
    }))

    const allChunks = [...textChunks, ...tableChunks]
    const split = splitOversizedChunks(allChunks, nextId)

    for (const chunk of split) {
      yield chunk
    }
  }
}

function groupSegments(
  segments: readonly string[],
  delimiter: string,
  maxLen: number,
): readonly string[] {
  const groups: string[] = []
  let current = ''
  for (const seg of segments) {
    const candidate = current ? `${current}${delimiter}${seg}` : seg
    if (candidate.length > maxLen && current) {
      groups.push(current)
      current = seg
    } else {
      current = candidate
    }
  }
  if (current) groups.push(current)
  return groups
}

function hardCut(text: string): readonly string[] {
  const pieces: string[] = []
  let remaining = text
  while (remaining.length > MAX_CHUNK_CHARS) {
    pieces.push(remaining.slice(0, MAX_CHUNK_CHARS))
    remaining = remaining.slice(MAX_CHUNK_CHARS)
  }
  if (remaining) pieces.push(remaining)
  return pieces
}

export function splitOversizedChunk(chunk: RawChunk, nextId: () => string): readonly RawChunk[] {
  // Try splitting by paragraph boundary first
  const byParagraph = groupSegments(chunk.raw_text.split('\n\n'), '\n\n', MAX_CHUNK_CHARS)

  // For each paragraph group, split by line if still too large, then hard cut
  const pieces: string[] = []
  for (const para of byParagraph) {
    if (para.length <= MAX_CHUNK_CHARS) {
      pieces.push(para)
    } else {
      const byLine = groupSegments(para.split('\n'), '\n', MAX_CHUNK_CHARS)
      for (const line of byLine) {
        if (line.length <= MAX_CHUNK_CHARS) {
          pieces.push(line)
        } else {
          const cuts = hardCut(line)
          for (const cut of cuts) {
            pieces.push(cut)
          }
        }
      }
    }
  }

  return pieces.map((text, index) => ({
    id: index === 0 ? chunk.id : nextId(),
    page: chunk.page,
    raw_text: text,
    table: index === 0 ? chunk.table : null,
  }))
}

function splitOversizedChunks(
  chunks: readonly RawChunk[],
  nextId: () => string,
): readonly RawChunk[] {
  return chunks.flatMap((chunk) =>
    chunk.raw_text.length > MAX_CHUNK_CHARS ? splitOversizedChunk(chunk, nextId) : [chunk],
  )
}

function splitByHeadings(
  text: string,
  pageNumber: number,
  nextId: () => string,
): readonly RawChunk[] {
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
