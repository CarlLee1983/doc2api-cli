import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findActiveSession,
  readSession,
  removeSession,
  writeSession,
} from '../../src/session/session-store'
import type { Session } from '../../src/types/session'

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 'test-id',
    source: 'test.pdf',
    createdAt: '2026-04-01T00:00:00.000Z',
    preamble: { groupId: '_preamble', chunks: [] },
    groups: [],
    cursor: 0,
    submitted: [],
    skipped: [],
    status: 'active',
    ...overrides,
  }
}

describe('session-store', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  })

  test('writeSession + readSession roundtrip', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    const session = makeSession()
    await writeSession(tempDir, session)
    const loaded = await readSession(tempDir, 'test-id')
    expect(loaded).toEqual(session)
  })

  test('readSession returns null for missing session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    const loaded = await readSession(tempDir, 'nonexistent')
    expect(loaded).toBeNull()
  })

  test('findActiveSession returns active session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    const session = makeSession()
    await writeSession(tempDir, session)
    const found = await findActiveSession(tempDir)
    expect(found).toEqual(session)
  })

  test('findActiveSession ignores finished sessions', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await writeSession(tempDir, makeSession({ status: 'finished' }))
    const found = await findActiveSession(tempDir)
    expect(found).toBeNull()
  })

  test('removeSession deletes the file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await writeSession(tempDir, makeSession())
    await removeSession(tempDir, 'test-id')
    const loaded = await readSession(tempDir, 'test-id')
    expect(loaded).toBeNull()
  })
})
