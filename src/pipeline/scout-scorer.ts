export interface ScoutScore {
  readonly score: number
  readonly isApi: boolean
  readonly signals: readonly string[]
}

const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[a-zA-Z0-9_\-/{}.]+/i
const URL_API_PATTERN = /\/(api|reference|endpoint|method)(\/|$)/i
const PARAM_KEYWORDS = /\b(required|optional|parameter|request\s+body|response)\b/i
const EXCLUDE_URL_PATTERN =
  /\/(faq|changelog|blog|logo|contact|glossary|terms|privacy|release-note|change-?log)(\/|$)/i

export function scorePageForApi(url: string, text: string): ScoutScore {
  let score = 0
  const signals: string[] = []

  if (HTTP_METHOD_PATTERN.test(text)) {
    score += 0.4
    signals.push('http_method')
  }

  try {
    const path = new URL(url).pathname
    if (URL_API_PATTERN.test(path)) {
      score += 0.2
      signals.push('url_pattern')
    }
    if (EXCLUDE_URL_PATTERN.test(path)) {
      score -= 0.3
      signals.push('exclude_url')
    }
  } catch {
    // invalid URL, skip URL-based signals
  }

  if (PARAM_KEYWORDS.test(text)) {
    score += 0.2
    signals.push('param_keywords')
  }

  const clamped = Math.max(0, Math.min(1, score))

  return {
    score: Math.round(clamped * 100) / 100,
    isApi: clamped > 0.3,
    signals,
  }
}
