export interface InspectFlags {
  readonly json: boolean
  readonly pages?: string
  readonly outdir?: string
}

export interface AssembleFlags {
  readonly json: boolean
  readonly stdin: boolean
  readonly output?: string
  readonly format: 'yaml' | 'json'
}

export interface ValidateFlags {
  readonly json: boolean
}

export interface SessionFlags {
  readonly output?: string
  readonly format: 'yaml' | 'json'
  readonly pages?: string
  readonly crawl: boolean
  readonly maxDepth: number
  readonly maxPages: number
  readonly browser: boolean
  readonly requestDelay: number
  readonly noRobots: boolean
  readonly maxRetries: number
}
