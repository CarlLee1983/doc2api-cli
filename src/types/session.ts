import type { EndpointDef } from './endpoint'
import type { EndpointGroup, PreambleGroup } from './group'

export interface SubmittedEndpoint {
  readonly groupId: string
  readonly endpoints: readonly EndpointDef[]
  readonly submittedAt: string
}

export interface Session {
  readonly id: string
  readonly source: string
  readonly createdAt: string
  readonly preamble: PreambleGroup
  readonly groups: readonly EndpointGroup[]
  readonly cursor: number
  readonly submitted: readonly SubmittedEndpoint[]
  readonly skipped: readonly string[]
  readonly status: 'active' | 'finished'
}
