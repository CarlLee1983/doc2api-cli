import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type CrawlState,
  getCheckpointPath,
  loadCheckpoint,
  removeCheckpoint,
  saveCheckpoint,
} from '../../../src/pipeline/fetcher/checkpoint'

function makeState(url: string): CrawlState {
  return {
    version: 1,
    entryUrl: url,
    visited: ['https://example.com', 'https://example.com/page1'],
    queue: [{ url: 'https://example.com/page2', depth: 1 }],
    timestamp: new Date().toISOString(),
  }
}

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'checkpoint-test-'))
}

async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

describe('getCheckpointPath', () => {
  test('produces deterministic path from hostname', () => {
    const dir = '/some/dir'
    const url = 'https://docs.example.com/api'
    const path = getCheckpointPath(dir, url)
    expect(path).toBe('/some/dir/crawl-checkpoint-docs.example.com.json')
  })

  test('uses only hostname, ignoring path and query', () => {
    const dir = '/tmp/checkpoints'
    const a = getCheckpointPath(dir, 'https://api.foo.io/v1/docs?page=2')
    const b = getCheckpointPath(dir, 'https://api.foo.io/v2/other')
    expect(a).toBe(b)
    expect(a).toBe('/tmp/checkpoints/crawl-checkpoint-api.foo.io.json')
  })
})

describe('saveCheckpoint', () => {
  test('saves checkpoint and returns path', async () => {
    const dir = await makeTmpDir()
    try {
      const state = makeState('https://example.com')
      const result = await saveCheckpoint(state, dir)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toBe(getCheckpointPath(dir, 'https://example.com'))
        const exists = await Bun.file(result.data).exists()
        expect(exists).toBe(true)
      }
    } finally {
      await cleanupDir(dir)
    }
  })

  test('creates directory if it does not exist', async () => {
    const base = await makeTmpDir()
    const dir = join(base, 'nested', 'deep')
    try {
      const state = makeState('https://example.com')
      const result = await saveCheckpoint(state, dir)
      expect(result.ok).toBe(true)
      if (result.ok) {
        const exists = await Bun.file(result.data).exists()
        expect(exists).toBe(true)
      }
    } finally {
      await cleanupDir(base)
    }
  })
})

describe('loadCheckpoint', () => {
  test('save and load round-trip produces identical state', async () => {
    const dir = await makeTmpDir()
    try {
      const state = makeState('https://example.com')
      await saveCheckpoint(state, dir)
      const result = await loadCheckpoint(dir, 'https://example.com')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toEqual(state)
      }
    } finally {
      await cleanupDir(dir)
    }
  })

  test('returns ok(null) when entryUrl does not match checkpoint', async () => {
    const dir = await makeTmpDir()
    try {
      const state = makeState('https://example.com')
      await saveCheckpoint(state, dir)
      // Load with same hostname but different entryUrl value
      const result = await loadCheckpoint(dir, 'https://example.com/different')
      // Different hostname → different file, so file does not exist → ok(null)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toBeNull()
      }
    } finally {
      await cleanupDir(dir)
    }
  })

  test('returns ok(null) when checkpoint has wrong entryUrl inside file', async () => {
    const dir = await makeTmpDir()
    try {
      const state = makeState('https://example.com')
      await saveCheckpoint(state, dir)
      // Overwrite the file with a state that has a different entryUrl but same hostname
      const tampered: CrawlState = { ...state, entryUrl: 'https://example.com/something-else' }
      const path = getCheckpointPath(dir, 'https://example.com')
      await Bun.write(path, JSON.stringify(tampered, null, 2))

      const result = await loadCheckpoint(dir, 'https://example.com')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toBeNull()
      }
    } finally {
      await cleanupDir(dir)
    }
  })

  test('returns ok(null) when directory does not exist', async () => {
    const result = await loadCheckpoint('/nonexistent/path/xyz', 'https://example.com')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toBeNull()
    }
  })

  test('returns ok(null) when checkpoint file does not exist', async () => {
    const dir = await makeTmpDir()
    try {
      const result = await loadCheckpoint(dir, 'https://example.com')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toBeNull()
      }
    } finally {
      await cleanupDir(dir)
    }
  })

  test('returns fail on corrupted JSON', async () => {
    const dir = await makeTmpDir()
    try {
      const path = getCheckpointPath(dir, 'https://example.com')
      await Bun.write(path, '{ not valid json <<<')
      const result = await loadCheckpoint(dir, 'https://example.com')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('checkpoint_parse_error')
      }
    } finally {
      await cleanupDir(dir)
    }
  })

  test('returns fail on version mismatch', async () => {
    const dir = await makeTmpDir()
    try {
      const path = getCheckpointPath(dir, 'https://example.com')
      const badVersion = {
        version: 2,
        entryUrl: 'https://example.com',
        visited: [],
        queue: [],
        timestamp: new Date().toISOString(),
      }
      await Bun.write(path, JSON.stringify(badVersion, null, 2))
      const result = await loadCheckpoint(dir, 'https://example.com')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('checkpoint_version_mismatch')
      }
    } finally {
      await cleanupDir(dir)
    }
  })
})

describe('removeCheckpoint', () => {
  test('deletes existing checkpoint file', async () => {
    const dir = await makeTmpDir()
    try {
      const state = makeState('https://example.com')
      await saveCheckpoint(state, dir)
      const path = getCheckpointPath(dir, 'https://example.com')
      expect(await Bun.file(path).exists()).toBe(true)

      const result = await removeCheckpoint(dir, 'https://example.com')
      expect(result.ok).toBe(true)
      expect(await Bun.file(path).exists()).toBe(false)
    } finally {
      await cleanupDir(dir)
    }
  })

  test('succeeds when file does not exist', async () => {
    const dir = await makeTmpDir()
    try {
      const result = await removeCheckpoint(dir, 'https://example.com')
      expect(result.ok).toBe(true)
    } finally {
      await cleanupDir(dir)
    }
  })

  test('succeeds when directory does not exist', async () => {
    const result = await removeCheckpoint('/nonexistent/path/xyz', 'https://example.com')
    expect(result.ok).toBe(true)
  })
})
