export type ArtifactReference = { sessionId: string; artifactId: string }
export type ArtifactListItem = ArtifactReference & {
  reference: string; sessionName: string; name: string; provider: string; logicalId: string
  capturedAtUtc: string; fileCount: number; sizeBytes: number; truncated: boolean; formats: string[]; paths: string[]
}
export type ArtifactListRequest = {
  sessionId: string; search?: string; provider?: string; format?: string; from?: string; to?: string
  minBytes?: number; maxBytes?: number; offset?: number; limit?: number; sort?: string
}
export type ArtifactListResult = { items: ArtifactListItem[]; total: number; nextOffset: number | null }
export type DatabaseCell = { type: string; value?: string; length?: number; sha256?: string }
export type DatabaseRowChange = { table: string; key: string; changedColumns: string[]; beforeRow?: Record<string, DatabaseCell | null>; afterRow?: Record<string, DatabaseCell | null>; beforeCount: number; afterCount: number }
export type ArtifactChange = { path: string; kind: string; before?: string | null; after?: string | null; database?: DatabaseRowChange }
export type ArtifactFileDiff = {
  path: string; format: string; status: string; byteIdentical: boolean; isComplete: boolean
  message: string | null; totalChanges: number; changes: ArtifactChange[]; nextOffset: number | null
}
export type ArtifactDiffHop = {
  index: number; before: ArtifactListItem; after: ArtifactListItem; status: string; isComplete: boolean; files: ArtifactFileDiff[]
}
export type ArtifactDiffResult = { summary: string; schema: string; artifacts: ArtifactListItem[]; hops: ArtifactDiffHop[]; isComplete: boolean }
export type ArtifactDiffRequest = {
  artifacts: ArtifactReference[]; path?: string; mode?: string; arrayKey?: string; ignoreWhitespace?: boolean; offset?: number; limit?: number
}
export type ArtifactSessionOption = { sessionId: string; appId?: string; name?: string; clientName?: string }
export type ArtifactComparisonSource = {
  list: (request: ArtifactListRequest) => Promise<ArtifactListResult>
  compare: (request: ArtifactDiffRequest) => Promise<ArtifactDiffResult>
  timelineHref?: (reference: ArtifactReference) => string
  sessions: () => Promise<ArtifactSessionOption[]>
}

export function artifactCommand(artifacts: ArtifactReference[], options: Omit<ArtifactDiffRequest, 'artifacts'> = {}): string {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
  const args = ['ansight artifact diff', ...artifacts.map(item => `--artifact ${quote(`${item.sessionId}/${item.artifactId}`)}`)]
  if (options.path) args.push(`--path ${quote(options.path)}`)
  if (options.mode && options.mode !== 'auto') args.push(`--mode ${quote(options.mode)}`)
  if (options.arrayKey) args.push(`--array-key ${quote(options.arrayKey)}`)
  if (options.ignoreWhitespace) args.push('--ignore-whitespace')
  return args.join(' \\\n  ')
}

export function reorderArtifacts(items: ArtifactListItem[], index: number, direction: -1 | 1): ArtifactListItem[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = items.slice()
  const moved = next[index]
  next[index] = next[target]
  next[target] = moved
  return next
}

// Highlight the changed word span without interpreting captured content as markup.
export function changedWordSpan(value: string, other: string): { prefix: string; changed: string; suffix: string } {
  const words = value.split(/([^\p{L}\p{N}_]+)/u)
  const previous = other.split(/([^\p{L}\p{N}_]+)/u)
  let start = 0
  while (start < words.length && start < previous.length && words[start] === previous[start]) start++
  let end = words.length
  let previousEnd = previous.length
  while (end > start && previousEnd > start && words[end - 1] === previous[previousEnd - 1]) { end--; previousEnd-- }
  return { prefix: words.slice(0, start).join(''), changed: words.slice(start, end).join(''), suffix: words.slice(end).join('') }
}

export function groupArtifacts(items: ArtifactListItem[]): Array<{ key: string; name: string; items: ArtifactListItem[] }> {
  const groups = new Map<string, { key: string; name: string; items: ArtifactListItem[] }>()
  for (const item of items) {
    const key = JSON.stringify([item.provider, item.logicalId])
    const existing = groups.get(key)
    if (existing) existing.items.push(item)
    else groups.set(key, { key, name: item.name === 'data' && item.paths.length === 1 ? item.paths[0].split('/').at(-1) || item.name : item.name, items: [item] })
  }
  return [...groups.values()]
}

export function latestArtifactPair(items: ArtifactListItem[]): ArtifactListItem[] {
  return [...items].sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc) || a.reference.localeCompare(b.reference)).slice(-2)
}

export function artifactSessionOptions(sessions: ArtifactSessionOption[], sessionId: string, showAllApps: boolean): ArtifactSessionOption[] {
  if (showAllApps) return sessions
  const appId = sessions.find(session => session.sessionId === sessionId)?.appId
  return sessions.filter(session => session.sessionId === sessionId || (Boolean(appId) && session.appId === appId))
}

export function removeArtifactSession(sessionIds: string[], browseSession: string, selected: ArtifactListItem[], removed: string) {
  const remaining = sessionIds.filter(id => id !== removed)
  return { sessionIds: remaining, browseSession: browseSession === removed ? remaining[0] ?? '' : browseSession, selected: selected.filter(item => item.sessionId !== removed) }
}

export async function listComparisonSessions(source: Pick<ArtifactComparisonSource, 'list'>, sessionIds: string[], request: Omit<ArtifactListRequest, 'sessionId'>) {
  const results = await Promise.allSettled(sessionIds.map(sessionId => source.list({ ...request, sessionId })))
  const items: ArtifactListItem[] = []
  const errors: string[] = []
  const counts: Record<string, number> = {}
  let total = 0
  let nextOffset: number | null = null
  results.forEach((result, index) => {
    if (result.status === 'rejected') { errors.push(`${sessionIds[index]}: ${String(result.reason)}`); return }
    counts[sessionIds[index]] = result.value.total
    items.push(...result.value.items); total += result.value.total
    if (result.value.nextOffset != null) nextOffset = (request.offset ?? 0) + (request.limit ?? 100)
  })
  return { items, total, nextOffset, errors, counts }
}
