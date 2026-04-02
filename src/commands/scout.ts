import * as cheerio from 'cheerio'
import { ok } from '../output/result'
import { crawl } from '../pipeline/fetcher/crawler'
import type { CrawlOptions } from '../pipeline/fetcher/crawler'
import { scorePageForApi } from '../pipeline/scout-scorer'
import type { ScoutScore } from '../pipeline/scout-scorer'
import type { Result } from '../types/result'

export interface ScoutFlags {
  readonly maxDepth: number
  readonly maxPages: number
  readonly browser: boolean
  readonly requestDelay: number
  readonly noRobots: boolean
  readonly allowPrivate?: boolean
  readonly save?: string
  readonly all?: boolean
  readonly maxRetries?: number
}

export interface ScoutPage {
  readonly url: string
  readonly title: string
  readonly score: number
  readonly isApi: boolean
  readonly signals: readonly string[]
}

export interface ScoutData {
  readonly entry: string
  readonly totalPages: number
  readonly apiPages: number
  readonly pages: readonly ScoutPage[]
}

function extractTitle(html: string): string {
  const $ = cheerio.load(html)
  return $('title').text().trim() || $('h1').first().text().trim() || '(untitled)'
}

function extractText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, footer, header').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

export async function runScout(url: string, flags: ScoutFlags): Promise<Result<ScoutData>> {
  const crawlOpts: CrawlOptions = {
    entryUrl: url,
    maxDepth: flags.maxDepth,
    maxPages: flags.maxPages,
    concurrency: 3,
    requestDelay: flags.requestDelay,
    respectRobotsTxt: !flags.noRobots,
    resume: false,
    maxRetries: flags.maxRetries ?? 3,
  }

  const crawlResult = await crawl(crawlOpts, flags.browser, flags.allowPrivate)
  if (!crawlResult.ok) return crawlResult

  const pages: ScoutPage[] = crawlResult.data.pages.map((page) => {
    const title = extractTitle(page.html)
    const text = extractText(page.html)
    const scored: ScoutScore = scorePageForApi(page.url, text)

    return {
      url: page.url,
      title,
      score: scored.score,
      isApi: scored.isApi,
      signals: scored.signals,
    }
  })

  const sorted = [...pages].sort((a, b) => b.score - a.score)
  const apiPages = sorted.filter((p) => p.isApi).length

  if (flags.save) {
    const pagesToSave = flags.all ? sorted : sorted.filter((p) => p.isApi)
    const lines = [
      `# Scout: ${url}`,
      `# Generated: ${new Date().toISOString().slice(0, 10)}`,
      `# API pages: ${apiPages} / ${sorted.length}`,
      ...pagesToSave.map((p) => p.url),
      '',
    ]
    await Bun.write(flags.save, lines.join('\n'))
  }

  return ok({
    entry: url,
    totalPages: sorted.length,
    apiPages,
    pages: sorted,
  })
}
