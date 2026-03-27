import type { Chunk } from '../types/chunk'

export function detectLanguage(chunks: readonly Chunk[]): string {
  const allText = chunks.map((c) => c.raw_text).join('')
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]/g
  const cjkMatches = allText.match(cjkPattern)

  if (cjkMatches && cjkMatches.length > allText.length * 0.05) {
    return 'zh-TW'
  }

  return 'en'
}
