import * as cheerio from 'cheerio'
import type { HtmlParser } from './types'

export type FrameworkId = 'readme' | 'docusaurus' | 'gitbook' | 'redoc' | 'slate' | 'generic'

interface FrameworkRule {
  readonly id: FrameworkId
  readonly detect: (html: string, $: cheerio.CheerioAPI) => boolean
}

const FRAMEWORK_RULES: readonly FrameworkRule[] = [
  {
    id: 'readme',
    detect: (_html, $) => {
      const generator = $('meta[name="generator"]').attr('content') ?? ''
      return generator.toLowerCase().includes('readme') || $('.rm-Article').length > 0
    },
  },
  {
    id: 'docusaurus',
    detect: (_html, $) => {
      const generator = $('meta[name="generator"]').attr('content') ?? ''
      return generator.toLowerCase().includes('docusaurus')
    },
  },
  {
    id: 'gitbook',
    detect: (_html, $) => {
      const generator = $('meta[name="generator"]').attr('content') ?? ''
      return generator.toLowerCase().includes('gitbook')
    },
  },
  {
    id: 'redoc',
    detect: (_html, $) => $('.redoc-wrap').length > 0 || $('redoc').length > 0,
  },
  {
    id: 'slate',
    detect: (_html, $) => $('.tocify-wrapper').length > 0,
  },
]

export function detectFramework(html: string): FrameworkId {
  const $ = cheerio.load(html)

  for (const rule of FRAMEWORK_RULES) {
    if (rule.detect(html, $)) {
      return rule.id
    }
  }

  return 'generic'
}

export function selectParser(
  frameworkId: FrameworkId,
  parsers: readonly HtmlParser[],
  fallback: HtmlParser,
): HtmlParser {
  return parsers.find((p) => p.name === frameworkId) ?? fallback
}
