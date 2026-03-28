import { type FSWatcher, watch } from 'node:fs'
import { basename, join } from 'node:path'

export interface WatcherEvent {
  readonly type: 'source_changed' | 'json_changed'
  readonly filePath: string
}

export interface WatcherOptions {
  readonly sourceFile: string
  readonly outputDir: string
  readonly debounceMs: number
  readonly onEvent: (event: WatcherEvent) => void
}

export interface Watcher {
  readonly close: () => void
  readonly markSelfWritten: (filePath: string) => void
}

const SELF_WRITE_WINDOW_MS = 500

export function createWatcher(options: WatcherOptions): Watcher {
  const { sourceFile, outputDir, debounceMs, onEvent } = options
  const selfWritten = new Map<string, number>()
  const watchers: FSWatcher[] = []
  let debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let closed = false
  // Ignore spurious initial events emitted by the OS on watcher startup
  const startupTime = Date.now()
  const STARTUP_GRACE_MS = debounceMs * 2

  function isSelfWritten(filePath: string): boolean {
    const timestamp = selfWritten.get(filePath)
    if (!timestamp) return false
    if (Date.now() - timestamp < SELF_WRITE_WINDOW_MS) return true
    selfWritten.delete(filePath)
    return false
  }

  function debouncedEmit(key: string, event: WatcherEvent): void {
    if (closed) return
    if (Date.now() - startupTime < STARTUP_GRACE_MS) return
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key)
        if (!closed) onEvent(event)
      }, debounceMs),
    )
  }

  // Watch source file (watch the directory containing it)
  const sourceDir = sourceFile.slice(0, sourceFile.lastIndexOf('/')) || '.'
  const sourceBasename = basename(sourceFile)

  // Determine if source dir and output dir are the same
  const sameDir = sourceDir === outputDir

  if (sameDir) {
    // Single watcher handles both source changes and JSON changes
    const combinedWatcher = watch(outputDir, (_eventType, filename) => {
      if (closed || !filename) return
      if (filename === sourceBasename) {
        if (!isSelfWritten(sourceFile)) {
          debouncedEmit('source', { type: 'source_changed', filePath: sourceFile })
        }
      } else if (filename.endsWith('.json')) {
        const fullPath = join(outputDir, filename)
        if (!isSelfWritten(fullPath)) {
          debouncedEmit(`json:${filename}`, { type: 'json_changed', filePath: fullPath })
        }
      }
    })
    watchers.push(combinedWatcher)
  } else {
    // Separate watchers for source dir and output dir
    const sourceWatcher = watch(sourceDir, (_eventType, filename) => {
      if (closed || filename !== sourceBasename) return
      if (isSelfWritten(sourceFile)) return
      debouncedEmit('source', { type: 'source_changed', filePath: sourceFile })
    })
    watchers.push(sourceWatcher)

    const outputWatcher = watch(outputDir, (_eventType, filename) => {
      if (closed || !filename || !filename.endsWith('.json')) return
      const fullPath = join(outputDir, filename)
      if (isSelfWritten(fullPath)) return
      debouncedEmit(`json:${filename}`, { type: 'json_changed', filePath: fullPath })
    })
    watchers.push(outputWatcher)
  }

  return {
    close() {
      closed = true
      for (const w of watchers) {
        w.close()
      }
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer)
      }
      debounceTimers = new Map()
    },
    markSelfWritten(filePath: string) {
      selfWritten.set(filePath, Date.now())
    },
  }
}
