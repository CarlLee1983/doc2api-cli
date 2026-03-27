import { fail, ok } from '../../output/result'
import type { Result } from '../../types/result'
import { VERSION } from '../../version'

export interface FetchResult {
  readonly html: string
  readonly url: string
  readonly statusCode: number
}

export async function fetchHtml(url: string): Promise<Result<FetchResult>> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fail('E5001', 'FETCH_FAILED', `Unsupported protocol: ${parsed.protocol}`, {
        suggestion: 'Only http:// and https:// URLs are supported',
      })
    }
  } catch {
    return fail('E5001', 'FETCH_FAILED', `Invalid URL: ${url}`, {
      suggestion: 'Provide a valid URL starting with http:// or https://',
    })
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': `doc2api/${VERSION}`,
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      return fail('E5001', 'FETCH_FAILED', `HTTP ${response.status} for ${url}`, {
        context: { url, statusCode: response.status },
      })
    }

    const html = await response.text()

    return ok({
      html,
      url: response.url,
      statusCode: response.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('E5001', 'FETCH_FAILED', `Failed to fetch ${url}: ${message}`, {
      context: { url },
    })
  }
}
