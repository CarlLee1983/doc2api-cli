import { warn } from '../output/logger'
import { fail, ok } from '../output/result'
import type { Result } from '../types/result'
import type { ExtractResult, RawPage } from './extract'
import { crawl } from './fetcher/crawler'
import type { CrawlOptions } from './fetcher/crawler'
import { fetchPage } from './fetcher/fetch-page'
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
  readonly allowPrivate?: boolean
}

const SPECIALIZED_PARSERS = [readmeParser] as const

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
  const { urls, crawl: crawlOptions, forceBrowser = false, allowPrivate = false } = options

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

    const crawlResult = await crawl(opts, forceBrowser, allowPrivate)
    if (!crawlResult.ok) return crawlResult

    for (const page of crawlResult.data.pages) {
      const parsed = parseHtml(page.html, page.url, allRawPages.length)
      allRawPages.push(...parsed)
    }
  } else {
    for (const url of urls) {
      const fetchResult = await fetchPage(url, { forceBrowser, allowPrivate })
      if (!fetchResult.ok) {
        warn(`failed to fetch ${url}: ${fetchResult.error.message}`)
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
