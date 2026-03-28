import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

const CLI = resolve(import.meta.dir, '../../src/index.ts')

async function runCli(
  args: readonly string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', CLI, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

describe('CLI flags', () => {
  test('--version prints version and exits 0', async () => {
    const { stderr, exitCode } = await runCli(['--version'])
    expect(stderr).toMatch(/^doc2api v\d+\.\d+\.\d+\n$/)
    expect(exitCode).toBe(0)
  })

  test('--help prints usage and exits 0', async () => {
    const { stderr, exitCode } = await runCli(['--help'])
    expect(stderr).toContain('Usage:')
    expect(stderr).toContain('doc2api inspect')
    expect(exitCode).toBe(0)
  })

  test('help command prints usage and exits 0', async () => {
    const { stderr, exitCode } = await runCli(['help'])
    expect(stderr).toContain('Usage:')
    expect(exitCode).toBe(0)
  })

  test('no command prints usage and exits 1', async () => {
    const { stderr, exitCode } = await runCli([])
    expect(stderr).toContain('Usage:')
    expect(exitCode).toBe(1)
  })

  test('unknown command exits 1', async () => {
    const { stderr, exitCode } = await runCli(['nonexistent'])
    expect(stderr).toContain('Unknown command')
    expect(exitCode).toBe(1)
  })
})
