import { fail, ok } from '../output/result'
import type { Result } from '../types/result'
import type { ExtractResult, RawPage } from './extract'
import { checkPlaywright, fetchWithBrowser } from './fetcher/browser-fetcher'
import { crawl } from './fetcher/crawler'
import type { CrawlOptions } from './fetcher/crawler'
import { fetchHtml } from './fetcher/http-fetcher'
import { detectSpa } from './fetcher/spa-detector'
import { detectFramework, selectParser } from './parser/detect'
import { genericParser } from './parser/generic-parser'
import { readmeParser } from './parser/readme-parser'

export interface HtmlExtractOptions {
  readonly urls: readonly string[]
  readonly crawl?: {
    readonly entryUrl: string
    readonly maxDepth?: number
    readonly maxPages?: number
  }
  readonly forceBrowser?: boolean
}

const SPECIALIZED_PARSERS = [readmeParser] as const

async function fetchPageHtml(
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
    if (hasPw) {
      return fetchWithBrowser(url)
    }
    console.error('[doc2api] Warning: SPA detected but Playwright not installed, using static HTML')
  }

  return ok({ html: result.data.html, url: result.data.url })
}

function parseHtml(html: string, url: string, pageNumberOffset: number): readonly RawPage[] {
  const frameworkId = detectFramework(html)
  const parser = selectParser(frameworkId, SPECIALIZED_PARSERS, genericParser)
  const pages = parser.parse(html, url)

  return pages.map((page) => ({
    ...page,
    pageNumber: page.pageNumber + pageNumberOffset,
  }))
}

export async function extractHtml(options: HtmlExtractOptions): Promise<Result<ExtractResult>> {
  const { urls, crawl: crawlOptions, forceBrowser = false } = options

  if (urls.length === 0 && !crawlOptions) {
    return fail('E5005', 'NO_URLS', 'No URLs provided for HTML extraction', {
      suggestion: 'Provide at least one URL in the urls array or a crawl.entryUrl',
    })
  }

  const allRawPages: RawPage[] = []

  if (crawlOptions) {
    const opts: CrawlOptions = {
      entryUrl: crawlOptions.entryUrl,
      maxDepth: crawlOptions.maxDepth ?? 2,
      maxPages: crawlOptions.maxPages ?? 20,
      concurrency: 3,
    }

    const crawlResult = await crawl(opts, forceBrowser)
    if (!crawlResult.ok) return crawlResult

    for (const page of crawlResult.data.pages) {
      const parsed = parseHtml(page.html, page.url, allRawPages.length)
      allRawPages.push(...parsed)
    }
  } else {
    for (const url of urls) {
      const fetchResult = await fetchPageHtml(url, forceBrowser)
      if (!fetchResult.ok) {
        console.error(`[doc2api] Warning: failed to fetch ${url}: ${fetchResult.error.message}`)
        continue
      }

      const parsed = parseHtml(fetchResult.data.html, fetchResult.data.url, allRawPages.length)
      allRawPages.push(...parsed)
    }
  }

  if (allRawPages.length === 0) {
    return fail('E5005', 'NO_PAGES', 'All URLs failed to fetch or produced no content', {
      suggestion: 'Check the URLs are accessible and return valid HTML',
    })
  }

  const hasTables = allRawPages.some((p) => p.tables.length > 0)

  return ok({
    pages: allRawPages.length,
    rawPages: allRawPages,
    hasTables,
  })
}
