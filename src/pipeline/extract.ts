import { getDocumentProxy } from 'unpdf'
import { checkPdfplumber, extractTables } from '../bridge/pdfplumber'
import { warn } from '../output/logger'
import { fail, ok } from '../output/result'
import type { Table } from '../types/chunk'
import type { Result } from '../types/result'
import type { ResultStream } from '../types/stream'

export interface RawPage {
  readonly pageNumber: number
  readonly text: string
  readonly tables: readonly Table[]
}

export interface ExtractResult {
  readonly pages: number
  readonly rawPages: readonly RawPage[]
  readonly hasTables: boolean
}

export interface ExtractOptions {
  readonly pages?: string
  readonly maxFileSizeMb?: number
}

export const MAX_PDF_SIZE_MB = 100

export function parsePageRange(pages: string, totalPages: number): readonly number[] {
  const match = pages.match(/^(\d+)(?:-(\d+))?$/)
  if (!match) return []
  const start = Math.max(1, Number.parseInt(match[1], 10))
  const end = Math.min(totalPages, match[2] ? Number.parseInt(match[2], 10) : start)
  const result: number[] = []
  for (let i = start; i <= end; i++) {
    result.push(i)
  }
  return result
}

export async function extractText(
  pdfPath: string,
  options?: ExtractOptions,
): Promise<Result<ExtractResult>> {
  const file = Bun.file(pdfPath)

  if (!(await file.exists())) {
    return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${pdfPath}`, {
      suggestion: 'Check the file path and try again',
      context: { file: pdfPath },
    })
  }

  const maxBytes = (options?.maxFileSizeMb ?? MAX_PDF_SIZE_MB) * 1024 * 1024
  if (file.size > maxBytes) {
    return fail(
      'E3003',
      'FILE_TOO_LARGE',
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${options?.maxFileSizeMb ?? MAX_PDF_SIZE_MB}MB)`,
      {
        suggestion: 'Use --pages to extract specific page ranges',
        context: { file: pdfPath, size: file.size },
      },
    )
  }

  const buffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(buffer)

  // Quick PDF magic number check
  const header = new TextDecoder().decode(uint8.slice(0, 5))
  if (!header.startsWith('%PDF')) {
    return fail('E3002', 'NOT_PDF', `File is not a valid PDF: ${pdfPath}`, {
      suggestion: 'Provide a valid PDF file',
      context: { file: pdfPath, header },
    })
  }

  try {
    const doc = await getDocumentProxy(uint8)
    const rawPages: RawPage[] = []

    const pageNumbers = options?.pages
      ? parsePageRange(options.pages, doc.numPages)
      : Array.from({ length: doc.numPages }, (_, i) => i + 1)

    for (const i of pageNumbers) {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .filter((item) => 'str' in item)
        .map((item) => (item as { str: string }).str)
        .join(' ')

      rawPages.push({
        pageNumber: i,
        text,
        tables: [],
      })
    }

    // Try pdfplumber for table extraction
    const tablesResult = await tryExtractTables(pdfPath, options?.pages)
    const pagesWithTables = mergeTables(rawPages, tablesResult)
    const hasTables = pagesWithTables.some((p) => p.tables.length > 0)

    return ok({
      pages: pageNumbers.length,
      rawPages: pagesWithTables,
      hasTables,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('E1001', 'EXTRACT_FAILED', `Failed to extract PDF content: ${message}`, {
      context: { file: pdfPath },
    })
  }
}

export async function* extractTextStream(
  pdfPath: string,
  options?: ExtractOptions,
): ResultStream<RawPage> {
  const file = Bun.file(pdfPath)

  if (!(await file.exists())) {
    yield fail('E3001', 'FILE_NOT_FOUND', `File not found: ${pdfPath}`, {
      suggestion: 'Check the file path and try again',
      context: { file: pdfPath },
    })
    return
  }

  const maxBytes = (options?.maxFileSizeMb ?? MAX_PDF_SIZE_MB) * 1024 * 1024
  if (file.size > maxBytes) {
    yield fail(
      'E3003',
      'FILE_TOO_LARGE',
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${options?.maxFileSizeMb ?? MAX_PDF_SIZE_MB}MB)`,
      {
        suggestion: 'Use --pages to extract specific page ranges',
        context: { file: pdfPath, size: file.size },
      },
    )
    return
  }

  const buffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(buffer)

  const header = new TextDecoder().decode(uint8.slice(0, 5))
  if (!header.startsWith('%PDF')) {
    yield fail('E3002', 'NOT_PDF', `File is not a valid PDF: ${pdfPath}`, {
      suggestion: 'Provide a valid PDF file',
      context: { file: pdfPath, header },
    })
    return
  }

  let doc: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    doc = await getDocumentProxy(uint8)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    yield fail('E1001', 'EXTRACT_FAILED', `Failed to extract PDF content: ${message}`, {
      context: { file: pdfPath },
    })
    return
  }

  const pageNumbers = options?.pages
    ? parsePageRange(options.pages, doc.numPages)
    : Array.from({ length: doc.numPages }, (_, i) => i + 1)

  // Get tables upfront — they are small relative to text
  const tablesResult = await tryExtractTables(pdfPath, options?.pages)

  for (const i of pageNumbers) {
    try {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .filter((item) => 'str' in item)
        .map((item) => (item as { str: string }).str)
        .join(' ')

      const rawPage: RawPage = {
        pageNumber: i,
        text,
        tables: tablesResult.get(i) ?? [],
      }

      yield ok(rawPage)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      yield fail('E1001', 'EXTRACT_FAILED', `Failed to extract page ${i}: ${message}`, {
        context: { file: pdfPath, page: i },
      })
    }
  }
}

async function tryExtractTables(
  pdfPath: string,
  pages?: string,
): Promise<ReadonlyMap<number, readonly Table[]>> {
  const status = await checkPdfplumber()
  if (!status.python || !status.pdfplumber) {
    warn('pdfplumber not available, table extraction disabled')
    return new Map()
  }

  const result = await extractTables(pdfPath, pages)
  if (!result.ok || !result.tables) {
    return new Map()
  }

  const tablesByPage = new Map<number, readonly Table[]>()

  for (const t of result.tables) {
    const existing = tablesByPage.get(t.page) ?? []
    tablesByPage.set(t.page, [
      ...existing,
      { headers: [...t.headers], rows: t.rows.map((r) => [...r]) },
    ])
  }

  return tablesByPage
}

function mergeTables(
  pages: readonly RawPage[],
  tablesByPage: ReadonlyMap<number, readonly Table[]>,
): readonly RawPage[] {
  return pages.map((page) => ({
    ...page,
    tables: tablesByPage.get(page.pageNumber) ?? [],
  }))
}
