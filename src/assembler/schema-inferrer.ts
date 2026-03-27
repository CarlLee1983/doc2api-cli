export interface InferredSchema {
  readonly type: string
  readonly nullable?: boolean
  readonly items?: InferredSchema
  readonly properties?: Record<string, InferredSchema>
}

const MAX_DEPTH = 10

export function inferSchema(value: unknown, depth = 0): InferredSchema {
  if (value === null || value === undefined) return { type: 'string', nullable: true }
  if (depth >= MAX_DEPTH) return { type: 'object' }
  if (typeof value === 'boolean') return { type: 'boolean' }
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' }
  if (typeof value === 'string') return { type: 'string' }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: { type: 'string' } }
    return { type: 'array', items: inferSchema(value[0], depth + 1) }
  }
  if (typeof value === 'object') {
    const properties: Record<string, InferredSchema> = {}
    for (const [key, val] of Object.entries(value)) {
      properties[key] = inferSchema(val, depth + 1)
    }
    return { type: 'object', properties }
  }
  return { type: 'string' }
}
