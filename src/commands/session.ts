import { resolve } from 'node:path'
import { basename } from 'node:path'
import { fail, ok } from '../output/result'
import { chunkPages } from '../pipeline/chunk'
import { classifyChunks } from '../pipeline/classify'
import { contextRefine } from '../pipeline/context-refine'
import { extractText } from '../pipeline/extract'
import { groupChunks } from '../pipeline/group'
import {
  createSession,
  currentGroup,
  discardSession,
  finishSession,
  getPreamble,
  nextGroup,
  sessionStatus,
  skipGroup,
  submitEndpoints,
} from '../session/session-manager'
import type { EndpointDef } from '../types/endpoint'
import type { Result } from '../types/result'

const BASE_DIR = process.cwd()

export async function runSession(
  subcommand: string | undefined,
  args: readonly string[],
  values: Record<string, string | boolean | undefined>,
): Promise<Result<unknown>> {
  if (!subcommand) {
    return fail('E2001', 'INVALID_INPUT', 'Missing session subcommand', {
      suggestion: 'Available: start, preamble, next, submit, skip, current, status, finish, discard',
    })
  }

  switch (subcommand) {
    case 'start':
      return handleStart(args, values)
    case 'preamble':
      return getPreamble(BASE_DIR)
    case 'next':
      return nextGroup(BASE_DIR)
    case 'submit':
      return handleSubmit(args, values)
    case 'skip':
      return skipGroup(BASE_DIR)
    case 'current':
      return currentGroup(BASE_DIR)
    case 'status':
      return sessionStatus(BASE_DIR)
    case 'finish':
      return handleFinish(values)
    case 'discard':
      return discardSession(BASE_DIR)
    default:
      return fail('E2001', 'INVALID_INPUT', `Unknown session subcommand: ${subcommand}`, {
        suggestion: 'Available: start, preamble, next, submit, skip, current, status, finish, discard',
      })
  }
}

async function handleStart(
  args: readonly string[],
  values: Record<string, string | boolean | undefined>,
): Promise<Result<unknown>> {
  const source = args[0]
  if (!source) {
    return fail('E2001', 'INVALID_INPUT', 'session start requires a source file', {
      suggestion: 'Usage: doc2api session start <source.pdf>',
    })
  }

  const pagesValue = values.pages as string | undefined

  const extractResult = await extractText(resolve(source), { pages: pagesValue })
  if (!extractResult.ok) return extractResult

  const { rawPages } = extractResult.data
  const rawChunks = chunkPages(rawPages)
  const classified = classifyChunks(rawChunks)
  const refined = contextRefine(classified)
  const grouped = groupChunks(refined)

  const result = await createSession(BASE_DIR, basename(source), grouped.preamble, grouped.groups)
  if (!result.ok) return result

  return ok({
    sessionId: result.data.id,
    source: result.data.source,
    totalGroups: result.data.groups.length,
    preambleChunks: result.data.preamble.chunks.length,
  })
}

async function handleSubmit(
  args: readonly string[],
  values: Record<string, string | boolean | undefined>,
): Promise<Result<unknown>> {
  const useStdin = (values.stdin as boolean) ?? false
  const filePath = args[0]

  if (!filePath && !useStdin) {
    return fail('E2001', 'INVALID_INPUT', 'session submit requires a file path or --stdin', {
      suggestion: 'Usage: doc2api session submit <endpoints.json>',
    })
  }

  let rawJson: string
  if (useStdin) {
    const chunks: string[] = []
    const reader = Bun.stdin.stream().getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(new TextDecoder().decode(value))
      }
    } finally {
      reader.cancel()
    }
    rawJson = chunks.join('')
  } else {
    const file = Bun.file(resolve(filePath))
    if (!(await file.exists())) {
      return fail('E3001', 'FILE_NOT_FOUND', `File not found: ${filePath}`)
    }
    rawJson = await file.text()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return fail('E2001', 'INVALID_INPUT', 'Submit file is not valid JSON')
  }

  let groupId: string
  let endpoints: readonly EndpointDef[]

  if (isRecord(parsed) && typeof parsed.groupId === 'string' && Array.isArray(parsed.endpoints)) {
    groupId = parsed.groupId
    endpoints = parsed.endpoints as EndpointDef[]
  } else if (Array.isArray(parsed)) {
    const currentResult = await currentGroup(BASE_DIR)
    if (!currentResult.ok) return currentResult
    groupId = currentResult.data.group.groupId
    endpoints = parsed as EndpointDef[]
  } else if (isRecord(parsed) && typeof parsed.method === 'string') {
    const currentResult = await currentGroup(BASE_DIR)
    if (!currentResult.ok) return currentResult
    groupId = currentResult.data.group.groupId
    endpoints = [parsed as unknown as EndpointDef]
  } else {
    return fail('E2001', 'INVALID_INPUT', 'Submit JSON must be an EndpointDef, EndpointDef[], or { groupId, endpoints }')
  }

  return submitEndpoints(BASE_DIR, groupId, endpoints)
}

async function handleFinish(
  values: Record<string, string | boolean | undefined>,
): Promise<Result<unknown>> {
  const result = await finishSession(BASE_DIR)
  if (!result.ok) return result

  const outputPath = values.output as string | undefined
  if (outputPath) {
    const format = (values.format as string) ?? 'yaml'
    let content: string
    if (format === 'json') {
      content = JSON.stringify(result.data.spec, null, 2)
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic require for optional transitive dep
      const yaml = require('js-yaml') as { dump: (data: any, opts?: any) => string }
      content = yaml.dump(result.data.spec, { lineWidth: 100, noRefs: true })
    }
    await Bun.write(resolve(outputPath), content)
    console.error(`Wrote OpenAPI spec to ${outputPath}`)
  }

  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
