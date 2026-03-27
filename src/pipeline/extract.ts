import { getDocumentProxy } from 'unpdf'
import { checkPdfplumber, extractTables } from '../bridge/pdfplumber'
import { fail, ok } from '../output/result'
import type { Table } from '../types/chunk'
import type { Result } from '../types/result'

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

export async function extractText(pdfPath: string): Promise<Result<ExtractResult>> {
  const file = Bun.file(pdfPath)

  if (!(await file.exists())) {
    return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${pdfPath}`, {
      suggestion: 'Check the file path and try again',
      context: { file: pdfPath },
    })
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

    for (let i = 1; i <= doc.numPages; i++) {
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
    const tablesResult = await tryExtractTables(pdfPath)
    const pagesWithTables = mergeTables(rawPages, tablesResult)
    const hasTables = pagesWithTables.some((p) => p.tables.length > 0)

    return ok({
      pages: doc.numPages,
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

async function tryExtractTables(pdfPath: string): Promise<ReadonlyMap<number, readonly Table[]>> {
  const status = await checkPdfplumber()
  if (!status.python || !status.pdfplumber) {
    console.error('[doc2api] Warning: pdfplumber not available, table extraction disabled')
    return new Map()
  }

  const result = await extractTables(pdfPath)
  if (!result.ok || !result.tables) {
    return new Map()
  }

  const tablesByPage = new Map<number, Table[]>()

  for (const t of result.tables) {
    const existing = tablesByPage.get(t.page) ?? []
    existing.push({ headers: [...t.headers], rows: t.rows.map((r) => [...r]) })
    tablesByPage.set(t.page, existing)
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
