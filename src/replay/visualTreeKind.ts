import type { SessionVisualTreeSnapshot } from './sessionViewerData'

export function resolveVisualTreeKind(snapshot: SessionVisualTreeSnapshot): string | undefined {
  const payload = snapshot.payload && typeof snapshot.payload === 'object' && !Array.isArray(snapshot.payload)
    ? snapshot.payload as Record<string, unknown>
    : null
  const source = normalizedString(payload?.source)
  const format = normalizedString(payload?.format) ?? normalizedString(snapshot.visualTreeFormat)

  if (source === 'avalonia-accessibility' || format === 'ansight.avalonia.accessibility-tree.compact.v2') {
    return 'avalonia-accessibility'
  }

  if (/accessibility|core-simulator-ax-service/i.test(`${source ?? ''} ${format ?? ''}`)) {
    return 'accessibility'
  }

  // Older hosts retained the framework payload but classified its header as unknown.
  if (source === 'avalonia-logical' || source === 'avalonia-visual') {
    return source
  }

  if (format === 'ansight.avalonia.visual-tree.compact.v2') {
    const treeKind = normalizedString(payload?.treeKind)
    if (treeKind === 'logical' || treeKind === 'visual') {
      return `avalonia-${treeKind}`
    }
  }

  return snapshot.visualTreeKind
}

export function visualTreeKindLabel(snapshot: SessionVisualTreeSnapshot): string | undefined {
  const kind = resolveVisualTreeKind(snapshot)
  switch (kind) {
    case 'avalonia-accessibility':
      return 'Avalonia accessibility tree'
    case 'avalonia-logical':
      return 'Avalonia logical tree'
    case 'avalonia-visual':
      return 'Avalonia visual tree'
    default:
      return kind
  }
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim().toLowerCase() : undefined
}
