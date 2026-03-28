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

describe('exit codes', () => {
  test('missing source argument exits 3', async () => {
    const { exitCode } = await runCli(['inspect'])
    expect(exitCode).toBe(3)
  })

  test('invalid file path exits 3', async () => {
    const { exitCode } = await runCli(['inspect', '../../../etc/passwd'])
    expect(exitCode).toBe(3)
  })

  test('non-existent PDF exits 1', async () => {
    const { exitCode } = await runCli(['inspect', 'nonexistent.pdf'])
    expect(exitCode).toBe(1)
  })

  test('assemble with missing arg exits 3', async () => {
    const { exitCode } = await runCli(['assemble'])
    expect(exitCode).toBe(3)
  })

  test('validate with missing arg exits 3', async () => {
    const { exitCode } = await runCli(['validate'])
    expect(exitCode).toBe(3)
  })

  test('unknown command exits 1', async () => {
    const { exitCode } = await runCli(['bogus'])
    expect(exitCode).toBe(1)
  })
})
