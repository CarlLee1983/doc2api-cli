export const CHUNK_TYPES = [
  'endpoint_definition',
  'parameter_table',
  'response_example',
  'auth_description',
  'error_codes',
  'general_text',
] as const

export type ChunkType = (typeof CHUNK_TYPES)[number]

export interface Table {
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

export interface Chunk {
  readonly id: string
  readonly page: number
  readonly type: ChunkType
  readonly confidence: number
  readonly content: string | null
  readonly raw_text: string
  readonly table: Table | null
}

export interface InspectData {
  readonly source: string
  readonly pages: number
  readonly language: string
  readonly chunks: readonly Chunk[]
  readonly stats: {
    readonly total_chunks: number
    readonly by_type: Record<ChunkType, number>
  }
}
