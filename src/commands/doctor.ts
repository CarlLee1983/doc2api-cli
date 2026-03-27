import { ok } from '../output/result'
import { checkPdfplumber } from '../bridge/pdfplumber'
import type { Result } from '../types/result'

interface Check {
  readonly name: string
  readonly status: 'ok' | 'warn' | 'fail'
  readonly detail: string
}

interface DoctorData {
  readonly pdf2apiVersion: string
  readonly python: boolean
  readonly pdfplumber: boolean
  readonly checks: readonly Check[]
}

const VERSION = '0.1.0'

export async function runDoctor(): Promise<Result<DoctorData>> {
  const checks: Check[] = []

  checks.push({ name: 'pdf2api', status: 'ok', detail: `v${VERSION}` })

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

  return ok({
    pdf2apiVersion: VERSION,
    python: pyStatus.python,
    pdfplumber: pyStatus.pdfplumber,
    checks,
  })
}
