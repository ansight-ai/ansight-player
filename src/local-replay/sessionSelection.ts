export function addSessionRange(
  selectedIds: ReadonlySet<string>,
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
): Set<string> {
  const targetIndex = orderedIds.indexOf(targetId)
  if (targetIndex < 0) return new Set(selectedIds)
  const anchorIndex = anchorId === null ? -1 : orderedIds.indexOf(anchorId)
  const start = anchorIndex < 0 ? targetIndex : Math.min(anchorIndex, targetIndex)
  const end = anchorIndex < 0 ? targetIndex : Math.max(anchorIndex, targetIndex)
  return new Set([...selectedIds, ...orderedIds.slice(start, end + 1)])
}
