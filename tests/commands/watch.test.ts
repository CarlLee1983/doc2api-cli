import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type WatchHandle, runWatch } from '../../src/commands/watch'

describe('runWatch()', () => {
  let tempDir: string
  let handle: WatchHandle | null = null

  afterEach(async () => {
    handle?.stop()
    handle = null
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test('runs initial pipeline and produces chunks.json', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watch-cmd-'))
    const pdfFixture = join(import.meta.dir, '../fixtures/simple-api.pdf')

    handle = await runWatch(pdfFixture, {
      output: tempDir,
      verbose: false,
      debounce: 100,
    })

    // Wait for initial run
    await new Promise((r) => setTimeout(r, 2000))

    const chunksFile = Bun.file(join(tempDir, 'chunks.json'))
    expect(await chunksFile.exists()).toBe(true)

    const content = await chunksFile.json()
    expect(content.chunks).toBeDefined()
    expect(content.chunks.length).toBeGreaterThan(0)
  })

  test('stop() cleanly shuts down', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watch-cmd-'))
    const pdfFixture = join(import.meta.dir, '../fixtures/simple-api.pdf')

    handle = await runWatch(pdfFixture, {
      output: tempDir,
      verbose: false,
      debounce: 100,
    })

    await new Promise((r) => setTimeout(r, 1000))
    handle.stop()

    // Should not throw
    expect(true).toBe(true)
  })
})
