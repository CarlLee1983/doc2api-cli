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

function extractTables($: cheerio.CheerioAPI): readonly Table[] {
  const tables: Table[] = []

  $('table').each((_i, el) => {
    const headers: string[] = []
    const rows: string[][] = []

    $(el)
      .find('thead tr th')
      .each((_j, th) => {
        headers.push($(th).text().trim())
      })

    $(el)
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

    tables.push({ headers, rows })
  })

  return tables
}

function extractText($: cheerio.CheerioAPI): string {
  // Clone to avoid mutating the original
  const $clone = cheerio.load($.html())

  // Remove noise elements
  for (const selector of NOISE_SELECTORS) {
    $clone(selector).remove()
  }

  return $clone('body').text().replace(/\s+/g, ' ').trim()
}

export const genericParser: HtmlParser = {
  name: 'generic',

  detect(_html: string): boolean {
    return true
  },

  parse(html: string, _url: string): readonly RawPage[] {
    const $ = cheerio.load(html)
    const text = extractText($)
    const tables = extractTables($)

    return [
      {
        pageNumber: 1,
        text,
        tables,
      },
    ]
  },
}
