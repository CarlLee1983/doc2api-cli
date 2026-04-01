import type { Chunk } from './chunk'

export interface EndpointGroup {
  readonly groupId: string
  readonly anchor: Chunk
  readonly related: readonly Chunk[]
  readonly summary: string
}

export interface PreambleGroup {
  readonly groupId: '_preamble'
  readonly chunks: readonly Chunk[]
}

export interface GroupedResult {
  readonly preamble: PreambleGroup
  readonly groups: readonly EndpointGroup[]
}
