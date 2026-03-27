import { checkPdfplumber } from '../bridge/pdfplumber'
import { ok } from '../output/result'
import { checkPlaywright } from '../pipeline/fetcher/browser-fetcher'
import type { Result } from '../types/result'
import { VERSION } from '../version'

interface Check {
  readonly name: string
  readonly status: 'ok' | 'warn' | 'fail'
  readonly detail: string
}

interface DoctorData {
  readonly version: string
  readonly python: boolean
  readonly pdfplumber: boolean
  readonly playwright: boolean
  readonly checks: readonly Check[]
}

export async function runDoctor(): Promise<Result<DoctorData>> {
  const checks: Check[] = []

  checks.push({ name: 'doc2api', status: 'ok', detail: `v${VERSION}` })

  const pyStatus = await checkPdfplumber()

  checks.push({
    name: 'python3',
    status: pyStatus.python ? 'ok' : 'warn',
    detail: pyStatus.python ? `Python ${pyStatus.pythonVersion}` : 'not found',
  })

  checks.push({
    name: 'pdfplumber',
    status: pyStatus.pdfplumber ? 'ok' : 'warn',
    detail: pyStatus.pdfplumber ? 'available' : 'not installed (table extraction disabled)',
  })

  checks.push({ name: 'cheerio', status: 'ok', detail: 'available (bundled)' })

  const hasPlaywright = await checkPlaywright()
  checks.push({
    name: 'playwright',
    status: hasPlaywright ? 'ok' : 'warn',
    detail: hasPlaywright
      ? 'available'
      : 'not installed (SPA rendering disabled, run: bun add playwright && bunx playwright install chromium)',
  })

  return ok({
    version: VERSION,
    python: pyStatus.python,
    pdfplumber: pyStatus.pdfplumber,
    playwright: hasPlaywright,
    checks,
  })
}
