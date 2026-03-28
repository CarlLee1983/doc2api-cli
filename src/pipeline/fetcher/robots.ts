import { VERSION } from '../../version'

export interface RobotsRules {
  readonly isAllowed: (path: string) => boolean
  readonly crawlDelay: number | null
}

export const PERMISSIVE_RULES: RobotsRules = {
  isAllowed: () => true,
  crawlDelay: null,
}

interface ParsedGroup {
  readonly agents: readonly string[]
  readonly allows: readonly string[]
  readonly disallows: readonly string[]
  readonly crawlDelay: number | null
}

function matchesAgent(pattern: string, userAgent: string): boolean {
  return userAgent.toLowerCase().startsWith(pattern.toLowerCase())
}

function buildRules(
  allows: readonly string[],
  disallows: readonly string[],
): RobotsRules['isAllowed'] {
  return (path: string): boolean => {
    // Empty disallow means allow all
    const effectiveDisallows = disallows.filter((d) => d.length > 0)

    let bestMatch: { length: number; allowed: boolean } = { length: -1, allowed: true }

    for (const disallow of effectiveDisallows) {
      if (path.startsWith(disallow) && disallow.length > bestMatch.length) {
        bestMatch = { length: disallow.length, allowed: false }
      }
    }

    for (const allow of allows) {
      if (allow.length > 0 && path.startsWith(allow) && allow.length > bestMatch.length) {
        bestMatch = { length: allow.length, allowed: true }
      }
    }

    return bestMatch.allowed
  }
}

export function parseRobotsTxt(content: string, userAgent: string): RobotsRules {
  const lines = content.split(/\r?\n/)
  const groups: ParsedGroup[] = []

  let currentAgents: string[] = []
  let currentAllows: string[] = []
  let currentDisallows: string[] = []
  let currentCrawlDelay: number | null = null
  let inGroup = false

  const flushGroup = (): void => {
    if (currentAgents.length > 0) {
      groups.push({
        agents: currentAgents,
        allows: currentAllows,
        disallows: currentDisallows,
        crawlDelay: currentCrawlDelay,
      })
    }
    currentAgents = []
    currentAllows = []
    currentDisallows = []
    currentCrawlDelay = null
    inGroup = false
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    // Skip comment-only lines (don't treat as group separator)
    if (trimmed.startsWith('#')) {
      continue
    }
    if (trimmed.length === 0) {
      if (inGroup) flushGroup()
      continue
    }
    const line = trimmed.split('#')[0].trim()
    if (line.length === 0) {
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const field = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line.slice(colonIdx + 1).trim()

    if (field === 'user-agent') {
      if (
        inGroup &&
        currentAllows.length === 0 &&
        currentDisallows.length === 0 &&
        currentCrawlDelay === null
      ) {
        // Still accumulating agents for this group
        currentAgents = [...currentAgents, value]
      } else {
        if (inGroup) flushGroup()
        currentAgents = [value]
        inGroup = true
      }
    } else if (field === 'allow') {
      currentAllows = [...currentAllows, value]
    } else if (field === 'disallow') {
      currentDisallows = [...currentDisallows, value]
    } else if (field === 'crawl-delay') {
      const delay = Number(value)
      if (!Number.isNaN(delay)) currentCrawlDelay = delay
    }
  }

  if (inGroup) flushGroup()

  if (groups.length === 0) return PERMISSIVE_RULES

  // Find specific agent match first
  const specificGroup = groups.find((g) =>
    g.agents.some((a) => a !== '*' && matchesAgent(a, userAgent)),
  )

  // Find wildcard group
  const wildcardGroup = groups.find((g) => g.agents.includes('*'))

  const activeGroup = specificGroup ?? wildcardGroup

  if (!activeGroup) return PERMISSIVE_RULES

  return {
    isAllowed: buildRules(activeGroup.allows, activeGroup.disallows),
    crawlDelay: activeGroup.crawlDelay,
  }
}

export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsRules> {
  let robotsUrl: string
  try {
    robotsUrl = new URL('/robots.txt', baseUrl).toString()
  } catch {
    return PERMISSIVE_RULES
  }

  try {
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': `doc2api/${VERSION}`,
      },
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) return PERMISSIVE_RULES

    const text = await response.text()
    return parseRobotsTxt(text, 'doc2api')
  } catch {
    return PERMISSIVE_RULES
  }
}
