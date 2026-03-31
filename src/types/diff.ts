import type { ChunkType } from './chunk'

export interface RelatedChunk {
  readonly id: string
  readonly type: ChunkType
  readonly confidence: number
}

export interface DiffEndpoint {
  readonly method: string
  readonly path: string
  readonly chunkId: string
  readonly confidence: number
  readonly relatedChunks: readonly RelatedChunk[]
}

export interface DiffSummary {
  readonly totalDocEndpoints: number
  readonly totalSpecEndpoints: number
  readonly missingCount: number
}

export interface DiffData {
  readonly summary: DiffSummary
  readonly missing: readonly DiffEndpoint[]
}

export interface DiffFlags {
  readonly json: boolean
  readonly output?: string
  readonly confidence: number
}
