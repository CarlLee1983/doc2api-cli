import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type WatcherEvent, createWatcher } from '../src/watcher'

describe('createWatcher()', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test('detects source file changes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'))
    const sourceFile = join(tempDir, 'test.pdf')
    await writeFile(sourceFile, 'initial content')

    const events: WatcherEvent[] = []
    const watcher = createWatcher({
      sourceFile,
      outputDir: tempDir,
      debounceMs: 50,
      onEvent: (event) => {
        events.push(event)
      },
    })

    // Wait for watcher to initialize
    await new Promise((r) => setTimeout(r, 100))

    // Trigger a change
    await writeFile(sourceFile, 'updated content')
    await new Promise((r) => setTimeout(r, 200))

    watcher.close()

    const sourceEvents = events.filter((e) => e.type === 'source_changed')
    expect(sourceEvents.length).toBeGreaterThanOrEqual(1)
  })

  test('detects output JSON changes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'))
    const sourceFile = join(tempDir, 'test.pdf')
    await writeFile(sourceFile, 'content')

    const events: WatcherEvent[] = []
    const watcher = createWatcher({
      sourceFile,
      outputDir: tempDir,
      debounceMs: 50,
      onEvent: (event) => {
        events.push(event)
      },
    })

    await new Promise((r) => setTimeout(r, 100))

    // Write a JSON file to output dir
    const jsonFile = join(tempDir, 'endpoints.json')
    await writeFile(jsonFile, '{"endpoints": []}')
    await new Promise((r) => setTimeout(r, 200))

    watcher.close()

    const jsonEvents = events.filter((e) => e.type === 'json_changed')
    expect(jsonEvents.length).toBeGreaterThanOrEqual(1)
  })

  test('ignores self-written files', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'))
    const sourceFile = join(tempDir, 'test.pdf')
    await writeFile(sourceFile, 'content')

    const events: WatcherEvent[] = []
    const watcher = createWatcher({
      sourceFile,
      outputDir: tempDir,
      debounceMs: 50,
      onEvent: (event) => {
        events.push(event)
      },
    })

    await new Promise((r) => setTimeout(r, 100))

    // Mark file as self-written, then write it
    const outFile = join(tempDir, 'chunks.json')
    watcher.markSelfWritten(outFile)
    await writeFile(outFile, '{}')
    await new Promise((r) => setTimeout(r, 200))

    watcher.close()

    const jsonEvents = events.filter((e) => e.type === 'json_changed')
    expect(jsonEvents.length).toBe(0)
  })

  test('close stops watching', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'))
    const sourceFile = join(tempDir, 'test.pdf')
    await writeFile(sourceFile, 'content')

    const events: WatcherEvent[] = []
    const watcher = createWatcher({
      sourceFile,
      outputDir: tempDir,
      debounceMs: 50,
      onEvent: (event) => {
        events.push(event)
      },
    })

    await new Promise((r) => setTimeout(r, 100))
    watcher.close()

    await writeFile(sourceFile, 'post-close change')
    await new Promise((r) => setTimeout(r, 200))

    expect(events.length).toBe(0)
  })
})
