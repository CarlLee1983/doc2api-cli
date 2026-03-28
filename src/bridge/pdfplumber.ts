import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface PdfplumberStatus {
  readonly python: boolean
  readonly pdfplumber: boolean
  readonly pythonVersion?: string
}

export interface ExtractedTable {
  readonly page: number
  readonly table_index: number
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

export interface BridgeResult {
  readonly ok: boolean
  readonly tables?: readonly ExtractedTable[]
  readonly error?: string
}

export function getBridgePath(): string {
  return resolve(__dirname, '../../bridge/extract_tables.py')
}

export async function checkPdfplumber(): Promise<PdfplumberStatus> {
  const pythonCheck = await runCommand('python3', ['--version'])
  if (!pythonCheck.success) {
    return { python: false, pdfplumber: false }
  }

  const pythonVersion = pythonCheck.stdout.trim().replace('Python ', '')

  const plumberCheck = await runCommand('python3', ['-c', 'import pdfplumber; print("ok")'])

  return {
    python: true,
    pdfplumber: plumberCheck.success,
    pythonVersion,
  }
}

const PAGES_PATTERN = /^\d+(-\d+)?$/

export function validatePages(pages: string): string | null {
  if (!PAGES_PATTERN.test(pages)) {
    return `Invalid pages format: "${pages}". Expected "N" or "N-M" (e.g., 1-10)`
  }
  return null
}

export function validateFilePath(filePath: string): string | null {
  if (filePath.includes('\0')) {
    return 'Invalid file path: contains null bytes'
  }
  const normalized = resolve(filePath)
  if (normalized !== filePath && filePath.split(/[/\\]/).some((segment) => segment === '..')) {
    return 'Invalid file path: path traversal not allowed'
  }
  if (basename(filePath).startsWith('-')) {
    return 'Invalid file path: filename cannot start with a hyphen'
  }
  return null
}

export async function extractTables(pdfPath: string, pages?: string): Promise<BridgeResult> {
  const pathError = validateFilePath(pdfPath)
  if (pathError) {
    return { ok: false, error: pathError }
  }

  const bridgePath = getBridgePath()
  const args = [bridgePath, pdfPath]

  if (pages) {
    const pagesError = validatePages(pages)
    if (pagesError) {
      return { ok: false, error: pagesError }
    }
    args.push('--pages', pages)
  }

  const result = await runCommand('python3', args)

  if (!result.success) {
    return { ok: false, error: result.stderr || 'Python bridge failed' }
  }

  try {
    return JSON.parse(result.stdout) as BridgeResult
  } catch {
    return { ok: false, error: 'Python bridge returned invalid JSON output' }
  }
}

async function runCommand(
  cmd: string,
  args: string[],
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    return { success: exitCode === 0, stdout, stderr }
  } catch {
    return { success: false, stdout: '', stderr: `Command not found: ${cmd}` }
  }
}
