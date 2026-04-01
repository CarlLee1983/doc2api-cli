import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { Session } from '../types/session'

const SESSIONS_DIR = '.doc2api/sessions'

function sessionsPath(baseDir: string): string {
  return join(baseDir, SESSIONS_DIR)
}

function sessionFilePath(baseDir: string, sessionId: string): string {
  return join(sessionsPath(baseDir), `${sessionId}.json`)
}

export async function writeSession(baseDir: string, session: Session): Promise<void> {
  const dir = sessionsPath(baseDir)
  await mkdir(dir, { recursive: true })
  const filePath = sessionFilePath(baseDir, session.id)
  const tmpPath = `${filePath}.tmp`
  await Bun.write(tmpPath, JSON.stringify(session, null, 2))
  const file = Bun.file(tmpPath)
  await Bun.write(filePath, file)
  await unlink(tmpPath)
}

export async function readSession(baseDir: string, sessionId: string): Promise<Session | null> {
  const filePath = sessionFilePath(baseDir, sessionId)
  const file = Bun.file(filePath)
  if (!(await file.exists())) return null
  const text = await file.text()
  return JSON.parse(text) as Session
}

export async function findActiveSession(baseDir: string): Promise<Session | null> {
  const dir = sessionsPath(baseDir)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return null
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const sessionId = entry.replace('.json', '')
    const session = await readSession(baseDir, sessionId)
    if (session && session.status === 'active') return session
  }

  return null
}

export async function removeSession(baseDir: string, sessionId: string): Promise<void> {
  const filePath = sessionFilePath(baseDir, sessionId)
  try {
    await unlink(filePath)
  } catch {
    // File already gone, no-op
  }
}
