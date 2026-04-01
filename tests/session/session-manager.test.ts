import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createSession,
  currentGroup,
  discardSession,
  finishSession,
  nextGroup,
  sessionStatus,
  skipGroup,
  submitEndpoints,
} from '../../src/session/session-manager'
import type { EndpointDef } from '../../src/types/endpoint'
import type { EndpointGroup, PreambleGroup } from '../../src/types/group'
import type { Chunk } from '../../src/types/chunk'

function makeChunk(id: string, type: Chunk['type']): Chunk {
  return {
    id,
    page: 1,
    type,
    confidence: 0.8,
    content: type === 'endpoint_definition'
      ? { kind: 'endpoint', method: 'GET', path: '/test', summary: null }
      : null,
    raw_text: 'text',
    table: null,
  }
}

const testPreamble: PreambleGroup = {
  groupId: '_preamble',
  chunks: [makeChunk('auth1', 'auth_description')],
}

const testGroups: readonly EndpointGroup[] = [
  {
    groupId: 'g-001',
    anchor: makeChunk('e1', 'endpoint_definition'),
    related: [makeChunk('p1', 'parameter_table')],
    summary: 'GET /users',
  },
  {
    groupId: 'g-002',
    anchor: makeChunk('e2', 'endpoint_definition'),
    related: [makeChunk('r2', 'response_example')],
    summary: 'POST /users',
  },
]

describe('session-manager', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  })

  test('createSession creates an active session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    const result = await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.status).toBe('active')
      expect(result.data.groups).toHaveLength(2)
      expect(result.data.cursor).toBe(0)
    }
  })

  test('createSession fails if active session exists', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    const result = await createSession(tempDir, 'other.pdf', testPreamble, testGroups)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E7002')
    }
  })

  test('nextGroup returns groups in order', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    const r1 = await nextGroup(tempDir)
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      expect(r1.data.group.groupId).toBe('g-001')
      expect(r1.data.progress).toBe('1/2')
    }
  })

  test('nextGroup advances cursor', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    const r2 = await nextGroup(tempDir)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.data.group.groupId).toBe('g-002')
      expect(r2.data.progress).toBe('2/2')
    }
  })

  test('nextGroup returns E7003 when exhausted', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    await nextGroup(tempDir)
    const r3 = await nextGroup(tempDir)
    expect(r3.ok).toBe(false)
    if (!r3.ok) expect(r3.error.code).toBe('E7003')
  })

  test('currentGroup returns current without advancing', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    const c1 = await currentGroup(tempDir)
    const c2 = await currentGroup(tempDir)
    expect(c1.ok).toBe(true)
    expect(c2.ok).toBe(true)
    if (c1.ok && c2.ok) {
      expect(c1.data.group.groupId).toBe(c2.data.group.groupId)
    }
  })

  test('skipGroup advances cursor without submission', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    await skipGroup(tempDir)
    const status = await sessionStatus(tempDir)
    expect(status.ok).toBe(true)
    if (status.ok) {
      expect(status.data.skipped).toBe(1)
    }
  })

  test('submitEndpoints stores endpoints for current group', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    const result = await submitEndpoints(tempDir, 'g-001', [{
      method: 'GET',
      path: '/users',
      responses: { '200': { description: 'OK' } },
    }])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.accepted).toBe(true)
      expect(result.data.remaining).toBe(1)
    }
  })

  test('submitEndpoints rejects endpoints missing method', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    const result = await submitEndpoints(tempDir, 'g-001', [{
      path: '/users',
      responses: { '200': { description: 'OK' } },
    } as unknown as EndpointDef])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E7004')
    }
  })

  test('submitEndpoints rejects endpoints missing path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    const result = await submitEndpoints(tempDir, 'g-001', [{
      method: 'GET',
      responses: { '200': { description: 'OK' } },
    } as unknown as EndpointDef])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('E7004')
    }
  })

  test('sessionStatus returns correct counts', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    const status = await sessionStatus(tempDir)
    expect(status.ok).toBe(true)
    if (status.ok) {
      expect(status.data.total).toBe(2)
      expect(status.data.processed).toBe(0)
      expect(status.data.remaining).toBe(2)
      expect(status.data.status).toBe('active')
    }
  })

  test('finishSession assembles spec from submitted endpoints', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    await nextGroup(tempDir)
    await submitEndpoints(tempDir, 'g-001', [{
      method: 'GET',
      path: '/users',
      responses: { '200': { description: 'OK' } },
    }])
    await nextGroup(tempDir)
    await submitEndpoints(tempDir, 'g-002', [{
      method: 'POST',
      path: '/users',
      responses: { '201': { description: 'Created' } },
    }])
    const result = await finishSession(tempDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.spec.paths).toBeDefined()
      expect(result.data.endpointCount).toBe(2)
    }
  })

  test('discardSession removes the session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc2api-test-'))
    await createSession(tempDir, 'test.pdf', testPreamble, testGroups)
    const result = await discardSession(tempDir)
    expect(result.ok).toBe(true)
    const status = await sessionStatus(tempDir)
    expect(status.ok).toBe(false)
    if (!status.ok) expect(status.error.code).toBe('E7001')
  })
})
