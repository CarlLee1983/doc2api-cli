// Core pipeline
export { extractText } from './pipeline/extract'
export type { ExtractOptions, ExtractResult, RawPage } from './pipeline/extract'
export { chunkPages } from './pipeline/chunk'
export { classifyChunks } from './pipeline/classify'
export { contextRefine } from './pipeline/context-refine'
export { detectLanguage } from './pipeline/detect-language'

// Streaming pipeline
export { streamPipeline, collectStream } from './pipeline/stream'

// HTML pipeline
export { extractHtml } from './pipeline/extract-html'
export type { HtmlExtractOptions } from './pipeline/extract-html'

// Grouping pipeline
export { groupChunks } from './pipeline/group'
export type { EndpointGroup, PreambleGroup, GroupedResult } from './types/group'

// Assembly
export { buildOpenApiSpec } from './assembler/openapi-builder'
export type { OpenApiSpec } from './assembler/openapi-builder'
export { inferSchema } from './assembler/schema-inferrer'
export type { InferredSchema } from './assembler/schema-inferrer'

// Types
export type { Chunk, ChunkType, ChunkContent, InspectData, Table } from './types/chunk'
export type {
  AssembleInput,
  EndpointDef,
  ParameterDef,
  RequestBody,
  ResponseDef,
  SchemaProperty,
} from './types/endpoint'
export type { Result, SuccessResult, FailResult, AppError } from './types/result'

// Helpers
export { ok, fail } from './output/result'

// Version
export { VERSION } from './version'
