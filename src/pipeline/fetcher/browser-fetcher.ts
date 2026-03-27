import { ok, fail } from '../../output/result'
import type { Result } from '../../types/result'
import type { FetchResult } from './http-fetcher'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Playwright = any

export async function checkPlaywright(): Promise<boolean> {
  try {
    const moduleSpec = 'playwright'
    // Using eval to avoid static import checks since playwright is optional
    // eslint-disable-next-line no-eval
    await import(moduleSpec)
    return true
  } catch {
    return false
  }
}

export async function fetchWithBrowser(url: string): Promise<Result<FetchResult>> {
  let playwright: Playwright

  try {
    const moduleSpec = 'playwright'
    // Using dynamic require-style import to avoid static type resolution
    // eslint-disable-next-line no-eval
    playwright = await import(moduleSpec)
  } catch {
    return fail('E5002', 'BROWSER_REQUIRED', 'Playwright is required for SPA rendering but not installed', {
      suggestion: 'Install Playwright: bun add playwright && bunx playwright install chromium',
      context: { url },
    })
  }

  let browser: Playwright = null

  try {
    browser = await playwright.chromium.launch({ headless: true })
    const page = await browser.newPage()

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    const html = await page.content()

    return ok({
      html,
      url: page.url(),
      statusCode: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('E5001', 'FETCH_FAILED', `Browser fetch failed for ${url}: ${message}`, {
      context: { url },
    })
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
