import { ok } from '../../output/result'
import type { Result } from '../../types/result'
import { checkPlaywright, fetchWithBrowser } from './browser-fetcher'
import type { FetchOptions } from './http-fetcher'
import { fetchHtml } from './http-fetcher'
import { detectSpa } from './spa-detector'

export interface FetchPageOptions extends FetchOptions {
  readonly forceBrowser?: boolean
}

export async function fetchPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<Result<{ html: string; url: string }>> {
  const fetchOpts: FetchOptions | undefined = options.allowPrivate
    ? { allowPrivate: options.allowPrivate }
    : undefined

  if (options.forceBrowser) {
    return fetchWithBrowser(url, fetchOpts)
  }

  const result = await fetchHtml(url, fetchOpts)
  if (!result.ok) return result

  if (detectSpa(result.data.html)) {
    const hasPw = await checkPlaywright()
    if (!hasPw) {
      console.error(
        `[doc2api] Warning: SPA detected but Playwright not installed, using static HTML for ${url}`,
      )
      return ok({ html: result.data.html, url: result.data.url })
    }
    return fetchWithBrowser(url, fetchOpts)
  }

  return ok({ html: result.data.html, url: result.data.url })
}
