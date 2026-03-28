import * as cheerio from 'cheerio'
import type { Table } from '../../types/chunk'
import type { RawPage } from '../extract'
import type { HtmlParser } from './types'

const NOISE_SELECTORS = [
  'script',
  'style',
  'nav',
  'footer',
  'header',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
] as const

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'

function extractSingleTable($: cheerio.CheerioAPI, tableEl: cheerio.AnyNode): Table {
  const headers: string[] = []
  const rows: string[][] = []

  // Try thead first
  $(tableEl)
    .find('thead tr th')
    .each((_j, th) => {
      headers.push($(th).text().trim())
    })

  $(tableEl)
    .find('tbody tr')
    .each((_j, tr) => {
      const row: string[] = []
      $(tr)
        .find('td')
        .each((_k, td) => {
          row.push($(td).text().trim())
        })
      if (row.length > 0) {
        rows.push(row)
      }
    })

  // If no thead headers, try using first tr row as headers
  if (headers.length === 0) {
    const allRows: string[][] = []
    $(tableEl)
      .find('tr')
      .each((_j, tr) => {
        const cells: string[] = []
        $(tr)
          .find('td, th')
          .each((_k, cell) => {
            cells.push($(cell).text().trim())
          })
        if (cells.length > 0) {
          allRows.push(cells)
        }
      })

    if (allRows.length > 0) {
      const [firstRow, ...rest] = allRows
      return { headers: firstRow, rows: rest }
    }
  }

  return { headers, rows }
}

function extractTablesFromElement(
  $: cheerio.CheerioAPI,
  el: cheerio.AnyNode,
): readonly Table[] {
  const tables: Table[] = []

  // If the element itself is a table, extract it directly
  if ($(el).is('table')) {
    tables.push(extractSingleTable($, el))
    return tables
  }

  $(el)
    .find('table')
    .each((_i, tableEl) => {
      tables.push(extractSingleTable($, tableEl))
    })

  return tables
}

function elementText($: cheerio.CheerioAPI, el: cheerio.AnyNode): string {
  return $(el).text().replace(/\s+/g, ' ').trim()
}

export const genericParser: HtmlParser = {
  name: 'generic',

  detect(_html: string): boolean {
    return true
  },

  parse(html: string, _url: string): readonly RawPage[] {
    const $ = cheerio.load(html)

    // Remove noise elements
    for (const selector of NOISE_SELECTORS) {
      $(selector).remove()
    }

    const body = $('body')
    const headings = body.find(HEADING_SELECTOR)

    // No headings — fall back to single page
    if (headings.length === 0) {
      const text = body.text().replace(/\s+/g, ' ').trim()
      const tables = extractTablesFromElement($, body[0])
      return [{ pageNumber: 1, text, tables }]
    }

    // Build sections: each heading + its following siblings until next heading
    const pages: RawPage[] = []
    let pageNumber = 1

    headings.each((_i, headingEl) => {
      const $heading = $(headingEl)
      const headingText = elementText($, headingEl)

      // Collect sibling elements between this heading and the next heading
      const contentParts: string[] = [headingText]
      const sectionTables: Array<cheerio.AnyNode> = []

      let $sibling = $heading.next()
      while ($sibling.length > 0 && !$sibling.is(HEADING_SELECTOR)) {
        contentParts.push(elementText($, $sibling[0]))
        // Collect table elements within this sibling
        $sibling.find('table').each((_j, tbl) => {
          sectionTables.push(tbl)
        })
        if ($sibling.is('table')) {
          sectionTables.push($sibling[0])
        }
        $sibling = $sibling.next()
      }

      const text = contentParts
        .filter((t) => t.length > 0)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      // Extract tables for this section using a temporary wrapper
      const tables: Table[] = []
      for (const tblEl of sectionTables) {
        const sectionTbls = extractTablesFromElement($, tblEl)
        tables.push(...sectionTbls)
      }

      pages.push({ pageNumber, text, tables })
      pageNumber++
    })

    return pages
  },
}
