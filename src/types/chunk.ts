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

export interface EndpointContent {
  readonly kind: 'endpoint'
  readonly method: string
  readonly path: string
  readonly summary: string | null
}

export interface ParameterContent {
  readonly kind: 'parameter'
  readonly parameters: readonly {
    readonly name: string
    readonly type: string | null
    readonly required: boolean | null
    readonly description: string | null
  }[]
}

export interface ResponseContent {
  readonly kind: 'response'
  readonly statusCode: number | null
  readonly body: string | null
}

export interface AuthContent {
  readonly kind: 'auth'
  readonly scheme: string | null
  readonly location: string | null
  readonly description: string
}

export interface ErrorCodesContent {
  readonly kind: 'error_codes'
  readonly codes: readonly {
    readonly status: number
    readonly message: string | null
  }[]
}

export type ChunkContent =
  | EndpointContent
  | ParameterContent
  | ResponseContent
  | AuthContent
  | ErrorCodesContent

export interface Chunk {
  readonly id: string
  readonly page: number
  readonly type: ChunkType
  readonly confidence: number
  readonly content: ChunkContent | null
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
