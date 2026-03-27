import * as cheerio from 'cheerio'

export function detectSpa(html: string): boolean {
  const $ = cheerio.load(html)

  const hasEmptyRoot = hasEmptySpaContainer($)
  if (hasEmptyRoot) return true

  const hasNoscript = $('noscript').length > 0
  const bodyText = getBodyTextContent($)

  if (hasNoscript && bodyText.length < 150) return true
  if (bodyText.length < 150) return true

  return false
}

function hasEmptySpaContainer($: cheerio.CheerioAPI): boolean {
  for (const id of ['root', 'app', '__next']) {
    const el = $(`#${id}`)
    if (el.length > 0 && el.text().trim().length === 0) {
      return true
    }
  }
  return false
}

function getBodyTextContent($: cheerio.CheerioAPI): string {
  const body = $('body').clone()
  body.find('script, style, noscript').remove()
  return body.text().replace(/\s+/g, ' ').trim()
}
