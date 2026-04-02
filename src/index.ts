#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { route } from './cli/router'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    output: { type: 'string', short: 'o' },
    pages: { type: 'string' },
    stdin: { type: 'boolean', default: false },
    format: { type: 'string', default: 'yaml' },
    outdir: { type: 'string' },
    crawl: { type: 'boolean', default: false },
    'max-depth': { type: 'string' },
    'max-pages': { type: 'string' },
    browser: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
    debounce: { type: 'string' },
    'request-delay': { type: 'string' },
    'no-robots': { type: 'boolean', default: false },
    'checkpoint-dir': { type: 'string' },
    resume: { type: 'boolean', default: false },
    'max-retries': { type: 'string' },
    confidence: { type: 'string' },
    save: { type: 'string' },
    all: { type: 'boolean', default: false },
    'allow-private': { type: 'boolean', default: false },
    version: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

route({
  command: positionals[0],
  positionals,
  values: values as Record<string, string | boolean | undefined>,
})
