import { fail, ok } from '../../output/result'
import type { Result } from '../../types/result'
import { VERSION } from '../../version'
import type { ValidateUrlOptions } from './url-guard'
import { validateUrl } from './url-guard'

export interface FetchResult {
  readonly html: string
  readonly url: string
  readonly statusCode: number
}

export interface FetchOptions extends ValidateUrlOptions {}

export async function fetchHtml(url: string, options?: FetchOptions): Promise<Result<FetchResult>> {
  const urlCheck = validateUrl(url, options)
  if (!urlCheck.ok) return urlCheck

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

    const MAX_RESPONSE_SIZE = 10 * 1024 * 1024
    const contentLength = response.headers.get('content-length')
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      return fail(
        'E5001',
        'FETCH_FAILED',
        `Response too large: ${contentLength} bytes (max 10MB)`,
        {
          context: { url },
        },
      )
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
