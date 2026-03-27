export interface InferredSchema {
  readonly type: string
  readonly nullable?: boolean
  readonly items?: InferredSchema
  readonly properties?: Record<string, InferredSchema>
}

export function inferSchema(value: unknown): InferredSchema {
  if (value === null || value === undefined) return { type: 'string', nullable: true }
  if (typeof value === 'boolean') return { type: 'boolean' }
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' }
  if (typeof value === 'string') return { type: 'string' }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: { type: 'string' } }
    return { type: 'array', items: inferSchema(value[0]) }
  }
  if (typeof value === 'object') {
    const properties: Record<string, InferredSchema> = {}
    for (const [key, val] of Object.entries(value)) {
      properties[key] = inferSchema(val)
    }
    return { type: 'object', properties }
  }
  return { type: 'string' }
}
