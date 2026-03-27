import { fail } from '../../output/result'
import type { Result } from '../../types/result'

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '[::1]', '::1'])

const PRIVATE_IP_RANGES: readonly RegExp[] = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
]

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTNAMES.has(lower)) return true
  return PRIVATE_IP_RANGES.some((r) => r.test(lower))
}

export interface ValidateUrlOptions {
  readonly allowPrivate?: boolean
}

export function validateUrl(url: string, options?: ValidateUrlOptions): Result<URL> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return fail('E5001', 'FETCH_FAILED', `Invalid URL: ${url}`, {
      suggestion: 'Provide a valid URL starting with http:// or https://',
    })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail('E5001', 'FETCH_FAILED', `Unsupported protocol: ${parsed.protocol}`, {
      suggestion: 'Only http:// and https:// URLs are supported',
    })
  }

  if (!options?.allowPrivate && isPrivateHost(parsed.hostname)) {
    return fail(
      'E5003',
      'SSRF_BLOCKED',
      `Access to private/internal address is not allowed: ${parsed.hostname}`,
      {
        suggestion: 'Only public URLs are supported',
      },
    )
  }

  return { ok: true, data: parsed }
}
