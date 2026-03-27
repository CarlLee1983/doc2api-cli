import * as cheerio from 'cheerio'
import { ok, fail } from '../../output/result'
import type { Result } from '../../types/result'
import { fetchHtml } from './http-fetcher'
import { detectSpa } from './spa-detector'
import { checkPlaywright, fetchWithBrowser } from './browser-fetcher'

export interface CrawlOptions {
  readonly entryUrl: string
  readonly maxDepth: number
  readonly maxPages: number
  readonly concurrency: number
}

export interface CrawlResult {
  readonly pages: readonly FetchedPage[]
  readonly urls: readonly string[]
}

export interface FetchedPage {
  readonly url: string
  readonly html: string
  readonly pageNumber: number
}

const EXCLUDED_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|pdf|zip)$/i
const EXCLUDED_PATHS = /\/(login|signin|signup|register|logout|auth)\b/i

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    let normalized = parsed.toString()
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1)
    }
    return normalized
  } catch {
    return url
  }
}

export function filterLinks(links: readonly string[], options: CrawlOptions): readonly string[] {
  const entryParsed = new URL(options.entryUrl)
  const entryHost = entryParsed.hostname
  const entryPrefix = entryParsed.pathname.replace(/\/$/, '')
  const seen = new Set<string>()

  return links.filter((link) => {
    if (link.startsWith('javascript:') || link.startsWith('#')) return false

    try {
      const parsed = new URL(link, options.entryUrl)
      if (parsed.hostname !== entryHost) return false
      if (!parsed.pathname.startsWith(entryPrefix)) return false
      if (EXCLUDED_EXTENSIONS.test(parsed.pathname)) return false
      if (EXCLUDED_PATHS.test(parsed.pathname)) return false

      const normalized = normalizeUrl(parsed.toString())
      if (seen.has(normalized)) return false
      seen.add(normalized)

      return true
    } catch {
      return false
    }
  })
}

function extractLinks(html: string, baseUrl: string): readonly string[] {
  const $ = cheerio.load(html)
  const links: string[] = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    try {
      const resolved = new URL(href, baseUrl).toString()
      links.push(resolved)
    } catch {
      // skip invalid URLs
    }
  })

  return links
}

async function fetchPage(
  url: string,
  forceBrowser: boolean,
): Promise<Result<{ html: string; url: string }>> {
  if (forceBrowser) {
    return fetchWithBrowser(url)
  }

  const result = await fetchHtml(url)
  if (!result.ok) return result

  if (detectSpa(result.data.html)) {
    const hasPw = await checkPlaywright()
    if (!hasPw) {
      return fail('E5002', 'BROWSER_REQUIRED', 'SPA detected but Playwright not installed', {
        suggestion: 'Install Playwright: bun add playwright && bunx playwright install chromium',
        context: { url },
      })
    }
    return fetchWithBrowser(url)
  }

  return ok({ html: result.data.html, url: result.data.url })
}

export async function crawl(
  options: CrawlOptions,
  forceBrowser = false,
): Promise<Result<CrawlResult>> {
  const visited = new Set<string>()
  const pages: FetchedPage[] = []
  let queue: { url: string; depth: number }[] = [
    { url: normalizeUrl(options.entryUrl), depth: 0 },
  ]

  while (queue.length > 0 && pages.length < options.maxPages) {
    const batch = queue.splice(0, options.concurrency)
    const results = await Promise.allSettled(
      batch
        .filter((item) => {
          const normalized = normalizeUrl(item.url)
          if (visited.has(normalized)) return false
          visited.add(normalized)
          return true
        })
        .map(async (item) => {
          const result = await fetchPage(item.url, forceBrowser)
          return { ...item, result }
        }),
    )

    for (const settled of results) {
      if (settled.status !== 'fulfilled') continue
      const { result, depth } = settled.value

      if (!result.ok) continue
      if (pages.length >= options.maxPages) break

      pages.push({
        url: result.data.url,
        html: result.data.html,
        pageNumber: pages.length + 1,
      })

      if (depth < options.maxDepth) {
        const links = extractLinks(result.data.html, result.data.url)
        const filtered = filterLinks(links, options)
        const newLinks = filtered
          .filter((link) => !visited.has(normalizeUrl(link)))
          .map((link) => ({ url: link, depth: depth + 1 }))
        queue = [...queue, ...newLinks]
      }
    }
  }

  if (pages.length === 0) {
    return fail('E5003', 'CRAWL_FAILED', `No pages could be fetched from ${options.entryUrl}`, {
      context: { entryUrl: options.entryUrl },
    })
  }

  return ok({
    pages,
    urls: pages.map((p) => p.url),
  })
}
