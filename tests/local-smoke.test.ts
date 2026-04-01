import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync, mkdirSync, existsSync } from 'node:fs'
import { runSession } from '../src/commands/session'

const TEST_TMP_DIR = join(tmpdir(), `doc2api-smoke-${Date.now()}`)
const FIXTURES_DIR = resolve(import.meta.dir, 'fixtures')
const SAMPLE_PDF = join(FIXTURES_DIR, 'simple-api.pdf')

describe('Local Smoke Test: Session Workflow', () => {
  beforeAll(() => {
    if (existsSync(TEST_TMP_DIR)) rmSync(TEST_TMP_DIR, { recursive: true })
    mkdirSync(TEST_TMP_DIR, { recursive: true })
    process.chdir(TEST_TMP_DIR)
  })

  afterAll(() => {
    process.chdir(resolve(import.meta.dir, '..'))
    rmSync(TEST_TMP_DIR, { recursive: true })
  })

  test('full session lifecycle', async () => {
    // 0. Ensure clean state
    await runSession('discard', [], {})

    // 1. Start Session
    const startResult = await runSession('start', [SAMPLE_PDF], {})
    if (!startResult.ok) console.error('Session start failed:', JSON.stringify(startResult.error, null, 2))
    expect(startResult.ok).toBe(true)
    if (!startResult.ok) return
    expect(startResult.data.totalGroups).toBeGreaterThan(0)

    // 2. Get Preamble
    const preambleResult = await runSession('preamble', [], {})
    expect(preambleResult.ok).toBe(true)

    // 3. Get Next Group
    const nextResult = await runSession('next', [], {})
    expect(nextResult.ok).toBe(true)
    if (!nextResult.ok) return
    const groupId = nextResult.data.group.groupId
    console.log('Current groupId:', groupId)

    // 4. Submit Analysis (Mock)
    const mockEndpoint = {
      method: 'GET',
      path: '/test',
      summary: 'Mock endpoint',
      responses: { '200': { description: 'OK' } }
    }
    const mockFile = join(TEST_TMP_DIR, 'endpoints.json')
    const submitPayload = { groupId, endpoints: [mockEndpoint] }
    console.log('Submit payload:', JSON.stringify(submitPayload, null, 2))
    await Bun.write(mockFile, JSON.stringify(submitPayload))
    
    const submitFileResult = await runSession('submit', [mockFile], {})
    if (!submitFileResult.ok) console.error('Session submit failed:', JSON.stringify(submitFileResult.error, null, 2))
    expect(submitFileResult.ok).toBe(true)

    // 5. Check Status
    const statusResult = await runSession('status', [], {})
    expect(statusResult.ok).toBe(true)
    if (statusResult.ok) {
      expect(statusResult.data.processed).toBe(1)
    }

    // 6. Finish Session
    const outputSpec = join(TEST_TMP_DIR, 'spec.yaml')
    const finishResult = await runSession('finish', [], { output: outputSpec, format: 'yaml' })
    expect(finishResult.ok).toBe(true)
    expect(existsSync(outputSpec)).toBe(true)
  })
})
