import type { RawPage } from '../extract'

export interface HtmlParser {
  readonly name: string
  detect(html: string): boolean
  parse(html: string, url: string): readonly RawPage[]
}
