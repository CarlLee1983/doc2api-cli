import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { Table } from '../../types/chunk'
import type { RawPage } from '../extract'
import type { HtmlParser } from './types'

function extractTables(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
): readonly Table[] {
  const tables: Table[] = []

  container.find('table').each((_, tableEl) => {
    const headers: string[] = []
    $(tableEl)
      .find('thead th, thead td')
      .each((__, th) => {
        headers.push($(th).text().trim())
      })

    const rows: string[][] = []
    $(tableEl)
      .find('tbody tr')
      .each((__, tr) => {
        const row: string[] = []
        $(tr)
          .find('td')
          .each((___, td) => {
            row.push($(td).text().trim())
          })
        if (row.length > 0) rows.push(row)
      })

    if (headers.length > 0) {
      tables.push({ headers, rows })
    }
  })

  return tables
}

export const readmeParser: HtmlParser = {
  name: 'readme',

  detect(html: string): boolean {
    const $ = cheerio.load(html)
    const generator = $('meta[name="generator"]').attr('content') ?? ''
    return generator.toLowerCase().includes('readme') || $('.rm-Article').length > 0
  },

  parse(html: string, _url: string): readonly RawPage[] {
    const $ = cheerio.load(html)
    const article = $('.rm-Article')
    const container = article.length > 0 ? article : $('body')

    const parts: string[] = []

    // Title
    const title = container.find('h1').first().text().trim()
    if (title) parts.push(`# ${title}`)

    // Endpoint method + path
    const methodEl = container.find('.rm-APIMethod-type, .rm-MethodType')
    const pathEl = container.find('.rm-APIMethod-path, .rm-MethodPath')
    if (methodEl.length > 0 && pathEl.length > 0) {
      parts.push(`${methodEl.text().trim()} ${pathEl.text().trim()}`)
    }

    // Description paragraphs
    container.find('p').each((_, p) => {
      const text = $(p).text().trim()
      if (text) parts.push(text)
    })

    // Code blocks (response examples)
    container.find('pre code, .rm-CodeResponse pre').each((_, code) => {
      const text = $(code).text().trim()
      if (text) parts.push(`\`\`\`json\n${text}\n\`\`\``)
    })

    const tables = extractTables($, container)
    const text = parts.join('\n\n')

    return [
      {
        pageNumber: 1,
        text,
        tables,
      },
    ]
  },
}
