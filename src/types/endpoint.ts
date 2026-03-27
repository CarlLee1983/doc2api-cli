export interface SchemaProperty {
  readonly type: string
  readonly description?: string
  readonly format?: string
  readonly enum?: readonly string[]
  readonly items?: SchemaProperty
}

export interface RequestBody {
  readonly properties: Record<string, SchemaProperty>
  readonly required?: readonly string[]
}

export interface ResponseDef {
  readonly description: string
  readonly example?: unknown
  readonly schema?: Record<string, SchemaProperty>
}

export interface EndpointDef {
  readonly path: string
  readonly method: string
  readonly summary?: string
  readonly description?: string
  readonly parameters?: readonly ParameterDef[]
  readonly requestBody?: RequestBody
  readonly responses: Record<string, ResponseDef>
  readonly tags?: readonly string[]
  readonly security?: readonly Record<string, readonly string[]>[]
}

export interface ParameterDef {
  readonly name: string
  readonly in: 'query' | 'path' | 'header' | 'cookie'
  readonly required?: boolean
  readonly description?: string
  readonly schema: SchemaProperty
}

export interface AssembleInput {
  readonly info: {
    readonly title: string
    readonly version: string
    readonly description?: string
  }
  readonly servers?: readonly { readonly url: string; readonly description?: string }[]
  readonly endpoints: readonly EndpointDef[]
  readonly securitySchemes?: Record<string, unknown>
}
