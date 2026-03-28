import { mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fail, ok } from '../../output/result'
import type { Result } from '../../types/result'

export interface CrawlState {
  readonly version: 1
  readonly entryUrl: string
  readonly visited: readonly string[]
  readonly queue: readonly QueueItem[]
  readonly timestamp: string
}

export interface QueueItem {
  readonly url: string
  readonly depth: number
}

export function getCheckpointPath(dir: string, entryUrl: string): string {
  const hostname = new URL(entryUrl).hostname
  return join(dir, `crawl-checkpoint-${hostname}.json`)
}

export async function saveCheckpoint(state: CrawlState, dir: string): Promise<Result<string>> {
  try {
    await mkdir(dir, { recursive: true })
  } catch (err) {
    return fail('E3001', 'checkpoint_dir_error', `Failed to create checkpoint directory: ${dir}`, {
      context: { dir, error: String(err) },
    })
  }

  const path = getCheckpointPath(dir, state.entryUrl)
  const tmpPath = `${path}.tmp`

  try {
    await Bun.write(tmpPath, JSON.stringify(state, null, 2))
    await rename(tmpPath, path)
    return ok(path)
  } catch (err) {
    try {
      await unlink(tmpPath)
    } catch {
      // ignore cleanup errors
    }
    return fail('E3002', 'checkpoint_write_error', `Failed to write checkpoint to ${path}`, {
      context: { path, error: String(err) },
    })
  }
}

export async function loadCheckpoint(
  dir: string,
  entryUrl: string,
): Promise<Result<CrawlState | null>> {
  const path = getCheckpointPath(dir, entryUrl)

  let exists: boolean
  try {
    exists = await Bun.file(path).exists()
  } catch {
    exists = false
  }

  if (!exists) {
    return ok(null)
  }

  let raw: string
  try {
    raw = await Bun.file(path).text()
  } catch (err) {
    return fail('E3003', 'checkpoint_read_error', `Failed to read checkpoint file: ${path}`, {
      context: { path, error: String(err) },
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return fail('E3004', 'checkpoint_parse_error', `Failed to parse checkpoint JSON at: ${path}`, {
      context: { path, error: String(err) },
    })
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return fail('E3005', 'checkpoint_invalid', `Checkpoint file is not a valid object: ${path}`, {
      context: { path },
    })
  }

  const record = parsed as Record<string, unknown>

  if (record.version !== 1) {
    return fail('E3006', 'checkpoint_version_mismatch', `Checkpoint version mismatch at: ${path}`, {
      context: { path, version: record.version },
    })
  }

  if (record.entryUrl !== entryUrl) {
    return ok(null)
  }

  return ok(parsed as CrawlState)
}

export async function removeCheckpoint(dir: string, entryUrl: string): Promise<Result<void>> {
  const path = getCheckpointPath(dir, entryUrl)
  try {
    await unlink(path)
  } catch {
    // file not found or already deleted — treat as success
  }
  return ok(undefined)
}
