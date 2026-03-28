import * as cheerio from 'cheerio'
import { fail, ok } from '../../output/result'
import type { Result } from '../../types/result'
import { loadCheckpoint, removeCheckpoint, saveCheckpoint } from './checkpoint'
import type { CrawlState } from './checkpoint'
import { fetchPage } from './fetch-page'
import { PERMISSIVE_RULES, fetchRobotsTxt } from './robots'
import type { RobotsRules } from './robots'

export interface CrawlOptions {
  readonly entryUrl: string
  readonly maxDepth: number
  readonly maxPages: number
  readonly concurrency: number
  readonly requestDelay: number
  readonly respectRobotsTxt: boolean
  readonly checkpointDir?: string
  readonly resume: boolean
  readonly maxRetries: number
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

export async function crawl(
  options: CrawlOptions,
  forceBrowser = false,
  allowPrivate = false,
): Promise<Result<CrawlResult>> {
  const visited = new Set<string>()
  const pages: FetchedPage[] = []
  let queue: { url: string; depth: number }[] = [{ url: normalizeUrl(options.entryUrl), depth: 0 }]

  // Fetch robots.txt rules
  const robotsRules: RobotsRules = options.respectRobotsTxt
    ? await fetchRobotsTxt(options.entryUrl)
    : PERMISSIVE_RULES

  // Apply crawl-delay from robots.txt as minimum requestDelay
  const effectiveDelay = Math.max(options.requestDelay, (robotsRules.crawlDelay ?? 0) * 1000)

  // Restore checkpoint state if resuming
  if (options.resume && options.checkpointDir) {
    const loaded = await loadCheckpoint(options.checkpointDir, options.entryUrl)
    if (loaded.ok && loaded.data) {
      for (const url of loaded.data.visited) visited.add(url)
      queue = [...loaded.data.queue]
    }
  }

  while (queue.length > 0 && pages.length < options.maxPages) {
    const batch = queue.slice(0, options.concurrency)
    queue = queue.slice(options.concurrency)
    const results = await Promise.allSettled(
      batch
        .filter((item) => {
          const normalized = normalizeUrl(item.url)
          if (visited.has(normalized)) return false
          // Check robots.txt
          try {
            const path = new URL(normalized).pathname
            if (!robotsRules.isAllowed(path)) return false
          } catch {
            /* skip invalid URLs */
          }
          visited.add(normalized)
          return true
        })
        .map(async (item) => {
          const result = await fetchPage(item.url, {
            forceBrowser,
            allowPrivate,
            maxRetries: options.maxRetries,
          })
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

    // Save checkpoint after each batch
    if (options.checkpointDir) {
      const state: CrawlState = {
        version: 1,
        entryUrl: options.entryUrl,
        visited: [...visited],
        queue: queue.map((item) => ({ url: item.url, depth: item.depth })),
        timestamp: new Date().toISOString(),
      }
      await saveCheckpoint(state, options.checkpointDir)
    }

    if (effectiveDelay > 0 && queue.length > 0) {
      await sleep(effectiveDelay)
    }
  }

  // Clean up checkpoint on successful completion
  if (options.checkpointDir) {
    await removeCheckpoint(options.checkpointDir, options.entryUrl)
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
