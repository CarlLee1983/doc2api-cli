import type { Chunk } from '../types/chunk'
import type { EndpointGroup, GroupedResult, PreambleGroup } from '../types/group'

function buildSummary(anchor: Chunk): string {
  if (anchor.content && anchor.content.kind === 'endpoint') {
    return `${anchor.content.method} ${anchor.content.path}`
  }
  return anchor.raw_text.slice(0, 80)
}

function formatGroupId(index: number): string {
  return `g-${String(index + 1).padStart(3, '0')}`
}

export function groupChunks(chunks: readonly Chunk[]): GroupedResult {
  const preambleChunks: Chunk[] = []
  const groups: EndpointGroup[] = []

  let currentAnchor: Chunk | null = null
  let currentRelated: Chunk[] = []

  for (const chunk of chunks) {
    if (chunk.type === 'endpoint_definition') {
      if (currentAnchor) {
        groups.push({
          groupId: formatGroupId(groups.length),
          anchor: currentAnchor,
          related: currentRelated,
          summary: buildSummary(currentAnchor),
        })
      }
      currentAnchor = chunk
      currentRelated = []
    } else if (currentAnchor) {
      currentRelated.push(chunk)
    } else {
      preambleChunks.push(chunk)
    }
  }

  if (currentAnchor) {
    groups.push({
      groupId: formatGroupId(groups.length),
      anchor: currentAnchor,
      related: currentRelated,
      summary: buildSummary(currentAnchor),
    })
  }

  const preamble: PreambleGroup = {
    groupId: '_preamble',
    chunks: preambleChunks,
  }

  return { preamble, groups }
}
