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
