import type { AssembleInput, EndpointDef, RequestBody } from '../types/endpoint'

export interface OpenApiSpec {
  readonly openapi: string
  readonly info: { readonly title: string; readonly version: string; readonly description?: string }
  readonly servers: readonly { readonly url: string; readonly description?: string }[]
  // biome-ignore lint/suspicious/noExplicitAny: OpenAPI spec uses dynamic nested structures
  readonly paths: Record<string, Record<string, any>>
  readonly components?: { readonly securitySchemes?: Record<string, unknown> }
}

export function buildOpenApiSpec(input: AssembleInput): OpenApiSpec {
  const paths: Record<string, Record<string, unknown>> = {}

  for (const endpoint of input.endpoints) {
    const pathKey = endpoint.path
    if (!paths[pathKey]) {
      paths[pathKey] = {}
    }
    paths[pathKey][endpoint.method.toLowerCase()] = buildOperation(endpoint)
  }

  const spec: OpenApiSpec = {
    openapi: '3.0.3',
    info: {
      title: input.info.title,
      version: input.info.version,
      ...(input.info.description ? { description: input.info.description } : {}),
    },
    servers: input.servers ?? [],
    paths,
  }

  if (input.securitySchemes) {
    return { ...spec, components: { securitySchemes: input.securitySchemes } }
  }

  return spec
}

function buildOperation(endpoint: EndpointDef): Record<string, unknown> {
  const operation: Record<string, unknown> = {}
  if (endpoint.summary) operation.summary = endpoint.summary
  if (endpoint.description) operation.description = endpoint.description
  if (endpoint.tags && endpoint.tags.length > 0) operation.tags = endpoint.tags
  if (endpoint.parameters && endpoint.parameters.length > 0) {
    operation.parameters = endpoint.parameters.map((p) => ({
      name: p.name,
      in: p.in,
      required: p.required ?? false,
      ...(p.description ? { description: p.description } : {}),
      schema: p.schema,
    }))
  }
  if (endpoint.requestBody) operation.requestBody = buildRequestBody(endpoint.requestBody)
  operation.responses = buildResponses(endpoint.responses)
  if (endpoint.security) operation.security = endpoint.security
  return operation
}

function buildRequestBody(body: RequestBody): Record<string, unknown> {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: body.properties,
          ...(body.required ? { required: body.required } : {}),
        },
      },
    },
  }
}

function buildResponses(
  responses: Record<string, { description: string; example?: unknown; schema?: unknown }>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [code, def] of Object.entries(responses)) {
    const response: Record<string, unknown> = { description: def.description }
    if (def.example) {
      response.content = { 'application/json': { example: def.example } }
    }
    result[code] = response
  }
  return result
}
