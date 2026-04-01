import { randomUUID } from 'node:crypto'
import { buildOpenApiSpec } from '../assembler/openapi-builder'
import type { OpenApiSpec } from '../assembler/openapi-builder'
import { fail, ok } from '../output/result'
import type { EndpointDef } from '../types/endpoint'
import type { EndpointGroup, PreambleGroup } from '../types/group'
import type { Result } from '../types/result'
import type { Session, SubmittedEndpoint } from '../types/session'
import { findActiveSession, removeSession, writeSession } from './session-store'
import { validateSubmission } from './submit-validator'

interface NextGroupData {
  readonly group: EndpointGroup
  readonly progress: string
}

interface SubmitData {
  readonly groupId: string
  readonly accepted: boolean
  readonly warnings: readonly string[]
  readonly remaining: number
}

interface StatusData {
  readonly sessionId: string
  readonly source: string
  readonly total: number
  readonly processed: number
  readonly skipped: number
  readonly remaining: number
  readonly status: 'active' | 'finished'
}

interface FinishData {
  readonly spec: OpenApiSpec
  readonly endpointCount: number
  readonly pathCount: number
}

function noActiveSession(): Result<never> {
  return fail('E7001', 'NO_ACTIVE_SESSION', 'No active session found', {
    suggestion: 'Run "doc2api session start <source>" to create a session',
  })
}

async function getActive(baseDir: string): Promise<Result<Session>> {
  const session = await findActiveSession(baseDir)
  if (!session) return noActiveSession()
  return ok(session)
}

export async function createSession(
  baseDir: string,
  source: string,
  preamble: PreambleGroup,
  groups: readonly EndpointGroup[],
): Promise<Result<Session>> {
  const existing = await findActiveSession(baseDir)
  if (existing) {
    return fail('E7002', 'SESSION_ALREADY_ACTIVE', `An active session already exists for "${existing.source}"`, {
      suggestion: 'Run "doc2api session discard" to remove it, or "doc2api session finish" to complete it',
    })
  }

  const session: Session = {
    id: randomUUID(),
    source,
    createdAt: new Date().toISOString(),
    preamble,
    groups,
    cursor: 0,
    submitted: [],
    skipped: [],
    status: 'active',
  }

  await writeSession(baseDir, session)
  return ok(session)
}

export async function nextGroup(baseDir: string): Promise<Result<NextGroupData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data
  if (session.cursor >= session.groups.length) {
    return fail('E7003', 'SESSION_EXHAUSTED', 'All groups have been processed', {
      suggestion: 'Run "doc2api session finish" to assemble the final spec',
    })
  }

  const group = session.groups[session.cursor]
  const updated: Session = {
    ...session,
    cursor: session.cursor + 1,
  }
  await writeSession(baseDir, updated)

  return ok({
    group,
    progress: `${session.cursor + 1}/${session.groups.length}`,
  })
}

export async function currentGroup(baseDir: string): Promise<Result<NextGroupData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data
  if (session.groups.length === 0) {
    return fail('E7003', 'SESSION_EXHAUSTED', 'No groups in this session', {
      suggestion: 'Run "doc2api session finish" to assemble the final spec',
    })
  }

  const index = session.cursor > 0 ? session.cursor - 1 : 0
  const group = session.groups[index]
  return ok({
    group,
    progress: `${index + 1}/${session.groups.length}`,
  })
}

export async function skipGroup(baseDir: string): Promise<Result<{ readonly remaining: number }>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data
  const index = session.cursor > 0 ? session.cursor - 1 : 0
  const groupId = session.groups[index]?.groupId

  const updated: Session = {
    ...session,
    skipped: groupId ? [...session.skipped, groupId] : session.skipped,
  }
  await writeSession(baseDir, updated)

  const remaining = session.groups.length - session.cursor
  return ok({ remaining })
}

export async function submitEndpoints(
  baseDir: string,
  groupId: string,
  endpoints: readonly EndpointDef[],
): Promise<Result<SubmitData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data

  const allWarnings: string[] = []
  for (const ep of endpoints) {
    const validation = validateSubmission(ep as unknown as Record<string, unknown>)
    allWarnings.push(...validation.warnings)
  }

  const submission: SubmittedEndpoint = {
    groupId,
    endpoints,
    submittedAt: new Date().toISOString(),
  }

  const existingIndex = session.submitted.findIndex((s) => s.groupId === groupId)
  const newSubmitted = existingIndex >= 0
    ? session.submitted.map((s, i) => (i === existingIndex ? submission : s))
    : [...session.submitted, submission]

  const updated: Session = {
    ...session,
    submitted: newSubmitted,
  }
  await writeSession(baseDir, updated)

  const remaining = session.groups.length - session.cursor
  return ok({
    groupId,
    accepted: true,
    warnings: allWarnings,
    remaining,
  })
}

export async function sessionStatus(baseDir: string): Promise<Result<StatusData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data
  return ok({
    sessionId: session.id,
    source: session.source,
    total: session.groups.length,
    processed: session.submitted.length,
    skipped: session.skipped.length,
    remaining: session.groups.length - session.cursor,
    status: session.status,
  })
}

export async function finishSession(baseDir: string): Promise<Result<FinishData>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  const session = result.data

  const allEndpoints: EndpointDef[] = []
  for (const sub of session.submitted) {
    allEndpoints.push(...sub.endpoints)
  }

  const spec = buildOpenApiSpec({
    info: { title: session.source, version: '1.0.0' },
    endpoints: allEndpoints,
  })

  const updated: Session = {
    ...session,
    status: 'finished',
  }
  await writeSession(baseDir, updated)

  return ok({
    spec,
    endpointCount: allEndpoints.length,
    pathCount: Object.keys(spec.paths).length,
  })
}

export async function discardSession(baseDir: string): Promise<Result<{ readonly discarded: boolean }>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result

  await removeSession(baseDir, result.data.id)
  return ok({ discarded: true })
}

export async function getPreamble(baseDir: string): Promise<Result<PreambleGroup>> {
  const result = await getActive(baseDir)
  if (!result.ok) return result
  return ok(result.data.preamble)
}
