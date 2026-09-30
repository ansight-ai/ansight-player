import { BoundingBox, CaretDown, CaretRight, Funnel, Info, MagnifyingGlass, TreeStructure } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode, useId, useMemo, useState } from 'react'
import type { SessionVisualTreeSnapshot } from '../sessionViewerData'

export type VisualTreeOverlaySelection = {
  snapshotId: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

type VisualTreeNodeRecord = {
  key: string
  parentKey: string | null
  ancestorKeys: string[]
  depth: number
  paintOrder: number
  typeName: string
  label: string
  automationId: string
  role: string
  supportedActions: string[]
  nodeId: string
  childCount: number
  bounds: VisualTreeBounds | null
  backgroundColor: string
  foregroundColor: string
  opacity: number
  isHidden: boolean
  isOccluded: boolean
  wireframeText: string
}

type VisualTreeVisibility = {
  hidden: boolean
  occluded: boolean
  transparent: boolean
}

type VisualTreeBounds = {
  x: number
  y: number
  width: number
  height: number
  isAbsolute: boolean
}

type CompactVisualTreePayload = {
  root: Record<string, unknown>
  types: string[]
  source: string
  coordinateSpace: VisualTreeBounds | null
  treatBoundsAsAbsolute: boolean
  visibleFlag: number
}

const androidUiEvidenceOverlayType = 'ai.ansight.runtime.AndroidUiEvidence$OverlaySurface'
const sdkOverlayAutomationId = 'ansight.overlay.surface'

export function VisualTreeInspector({
  onSelectOverlay,
  snapshot,
  snapshotDetails,
  viewportHeight,
  viewportWidth,
}: {
  onSelectOverlay?: (selection: VisualTreeOverlaySelection | null) => void
  snapshot: SessionVisualTreeSnapshot
  snapshotDetails?: ReactNode
  viewportHeight?: number | null
  viewportWidth?: number | null
}) {
  const snapshotKey = snapshot.snapshotId || snapshot.capturedAtUtc || 'visual-tree'
  const parsed = useMemo(() => parseVisualTree(snapshot), [snapshot])
  const [query, setQuery] = useState('')
  const [visibility, setVisibility] = useState<VisualTreeVisibility>({ hidden: false, occluded: false, transparent: false })
  const detailsGroup = useId()
  const [selectionState, setSelectionState] = useState({ snapshotKey, nodeKey: '' })
  const [expansionState, setExpansionState] = useState<{ snapshotKey: string, keys: Set<string> }>(() => ({
    snapshotKey,
    keys: new Set(parsed.nodes.filter((node) => node.depth < 2).map((node) => node.key)),
  }))

  if (!parsed.payload || parsed.nodes.length === 0) {
    return (
      <div className="visual-tree-unsupported">
        <TreeStructure aria-hidden="true" />
        <strong>Hierarchy unavailable</strong>
        <span>This snapshot is not an Ansight compact visual-tree payload.</span>
        <pre className="json-block">{JSON.stringify(snapshot.payload ?? snapshot, null, 2)}</pre>
      </div>
    )
  }

  const selectedKey = selectionState.snapshotKey === snapshotKey ? selectionState.nodeKey : ''
  const filteredNodes = filterVisualTreeNodes(parsed.nodes, visibility)
  const selectedNode = filteredNodes.find((node) => node.key === selectedKey) ?? filteredNodes[0] ?? null
  const visibilityOptions: { key: keyof VisualTreeVisibility; label: string; description: string; count: number }[] = [
    { key: 'hidden', label: 'Hidden', description: 'Include nodes with visible = false, including inherited visibility.', count: parsed.nodes.filter((node) => node.isHidden).length },
    { key: 'occluded', label: 'Occluded', description: 'Include nodes fully covered by another element.', count: parsed.nodes.filter((node) => node.isOccluded).length },
    { key: 'transparent', label: 'Fully transparent', description: 'Include nodes with effective opacity = 0.', count: parsed.nodes.filter((node) => node.opacity <= 0).length },
  ]
  const expandedKeys = expansionState.snapshotKey === snapshotKey
    ? expansionState.keys
    : new Set(parsed.nodes.filter((node) => node.depth < 2).map((node) => node.key))
  const normalizedQuery = query.trim().toLowerCase()
  const matchingKeys = normalizedQuery
    ? createMatchingKeys(filteredNodes, normalizedQuery)
    : null
  const visibleNodes = filteredNodes.filter((node) => {
    if (matchingKeys) {
      return matchingKeys.has(node.key)
    }
    return node.ancestorKeys.every((ancestorKey) => expandedKeys.has(ancestorKey))
  })

  function changeVisibility(key: keyof VisualTreeVisibility, include: boolean) {
    const next = { ...visibility, [key]: include }
    setVisibility(next)
    if (selectedNode && !includesVisualTreeNode(selectedNode, next)) {
      setSelectionState({ snapshotKey, nodeKey: '' })
      onSelectOverlay?.(null)
    }
  }

  function toggleNode(node: VisualTreeNodeRecord) {
    setExpansionState((current) => {
      const next = current.snapshotKey === snapshotKey ? new Set(current.keys) : new Set<string>()
      if (next.has(node.key)) {
        next.delete(node.key)
      } else {
        next.add(node.key)
      }
      return { snapshotKey, keys: next }
    })
  }

  function selectNode(node: VisualTreeNodeRecord) {
    setExpansionState((current) => {
      const next = current.snapshotKey === snapshotKey ? new Set(current.keys) : new Set<string>()
      node.ancestorKeys.forEach((key) => next.add(key))
      if (node.childCount > 0) {
        next.add(node.key)
      }
      return { snapshotKey, keys: next }
    })
    setSelectionState({ snapshotKey, nodeKey: node.key })
    onSelectOverlay?.(createOverlaySelection(snapshotKey, node, parsed.payload?.coordinateSpace ?? null))
  }

  return (
    <div className="visual-tree-inspector">
      <div className="visual-tree-main">
        <div className="visual-tree-browser">
          <div className="visual-tree-search-toolbar">
            <label className="visual-tree-search">
              <MagnifyingGlass aria-hidden="true" />
              <input
                aria-label="Search visual tree"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type, label, automation id…"
                type="search"
                value={query}
              />
              <span>{normalizedQuery ? `${visibleNodes.length} matches` : `${filteredNodes.length} / ${parsed.nodes.length} nodes`}</span>
            </label>
            <div className="visual-tree-pane-tools">
              <details className="visual-tree-visibility-filters" name={detailsGroup}>
                <summary aria-label="Node visibility filters" title="Node visibility filters">
                  <Funnel aria-hidden="true" />
                </summary>
                <div className="visual-tree-visibility-popover" role="group" aria-label="Include nodes">
                  {visibilityOptions.map((option) => (
                    <label key={option.key} title={option.description}>
                      <input
                        aria-label={`Include ${option.label.toLowerCase()} nodes`}
                        checked={visibility[option.key]}
                        onChange={(event) => changeVisibility(option.key, event.target.checked)}
                        type="checkbox"
                      />
                      <span>Include {option.label.toLowerCase()}</span>
                      <small>{option.count}</small>
                    </label>
                  ))}
                </div>
              </details>
              {snapshotDetails ? (
                <details className="visual-tree-snapshot-details" key={snapshotKey} name={detailsGroup}>
                  <summary aria-label="Snapshot details" title="Snapshot details">
                    <Info aria-hidden="true" />
                  </summary>
                  <div className="visual-tree-snapshot-details-popover">
                    <div className="detail-list">{snapshotDetails}</div>
                  </div>
                </details>
              ) : null}
            </div>
          </div>
          {selectedNode ? <div aria-label="Selected visual tree node" className="visual-tree-selection-summary">
            <BoundingBox aria-hidden="true" />
            <div>
              <strong>{selectedNode.typeName}</strong>
              <span>{formatNodeSummary(selectedNode)}</span>
              {selectedNode.bounds ? <code>{formatBounds(selectedNode.bounds)}</code> : null}
            </div>
          </div> : <p className="visual-tree-filter-empty" role="status">No nodes match these filters.</p>}
          <div aria-label="Visual tree hierarchy" className="visual-tree-node-list" role="tree">
            {visibleNodes.map((node) => {
              const isExpanded = normalizedQuery ? true : expandedKeys.has(node.key)
              const isSelected = node.key === selectedNode?.key
              return (
                <div
                  aria-level={node.depth + 1}
                  aria-selected={isSelected}
                  className={[
                    'visual-tree-node',
                    isSelected ? 'visual-tree-node--selected' : '',
                    node.isHidden ? 'visual-tree-node--hidden' : '',
                    node.isOccluded ? 'visual-tree-node--occluded' : '',
                    node.opacity <= 0 ? 'visual-tree-node--transparent' : '',
                  ].filter(Boolean).join(' ')}
                  key={node.key}
                  role="treeitem"
                  style={{ '--visual-tree-depth': node.depth } as CSSProperties}
                >
                  {node.childCount > 0 ? (
                    <button
                      aria-label={isExpanded ? `Collapse ${node.typeName}` : `Expand ${node.typeName}`}
                      className="visual-tree-disclosure"
                      onClick={() => toggleNode(node)}
                      type="button"
                    >
                      {isExpanded ? <CaretDown aria-hidden="true" /> : <CaretRight aria-hidden="true" />}
                    </button>
                  ) : <span className="visual-tree-disclosure-placeholder" />}
                  <button className="visual-tree-node-content" onClick={() => selectNode(node)} type="button">
                    <span>
                      <strong>{node.typeName}</strong>
                      {node.label ? <small>{node.label}</small> : null}
                    </span>
                    <span className="visual-tree-node-badges">
                      {node.isHidden ? <em>Hidden</em> : null}
                      {node.isOccluded ? <em>Occluded</em> : null}
                      {node.opacity <= 0 ? <em>Transparent</em> : null}
                      {node.automationId ? <code>#{node.automationId}</code> : null}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <aside className="visual-tree-layout-preview">
        <VisualTreeWireframe
          coordinateSpace={parsed.payload.coordinateSpace}
          nodes={filteredNodes}
          selectedNode={selectedNode}
          onSelect={selectNode}
          viewportHeight={viewportHeight}
          viewportWidth={viewportWidth}
        />
      </aside>
    </div>
  )
}

function VisualTreeWireframe({
  coordinateSpace,
  nodes,
  onSelect,
  selectedNode,
  viewportHeight,
  viewportWidth,
}: {
  coordinateSpace: VisualTreeBounds | null
  nodes: VisualTreeNodeRecord[]
  onSelect: (node: VisualTreeNodeRecord) => void
  selectedNode: VisualTreeNodeRecord | null
  viewportHeight?: number | null
  viewportWidth?: number | null
}) {
  if (!coordinateSpace || coordinateSpace.width <= 0 || coordinateSpace.height <= 0) {
    return (
      <div className="visual-tree-wireframe-empty">
        <BoundingBox aria-hidden="true" />
        <strong>Wireframe unavailable</strong>
        <span>This snapshot does not contain a valid coordinate space.</span>
      </div>
    )
  }

  const boundedNodes = nodes.filter((node) => isRenderableWireframeNode(node, coordinateSpace))
  const inspectionLayerOffset = nodes.reduce((maximum, node) => Math.max(maximum, node.paintOrder), 0) + 1
  const aspectRatio = resolveWireframeAspectRatio(coordinateSpace, viewportWidth, viewportHeight)
  const maximumWidth = Math.min(520, 650 * aspectRatio)
  return (
    <div className="visual-tree-wireframe-scroll">
      <div
        aria-label="Visual tree wireframe"
        className="visual-tree-wireframe"
        style={{
          aspectRatio,
          width: `min(100%, ${maximumWidth}px)`,
        }}
      >
        {boundedNodes.map((node) => {
          const bounds = node.bounds!
          const style = {
            '--visual-tree-node-fill': node.backgroundColor || 'transparent',
            '--visual-tree-node-text': node.foregroundColor || 'currentColor',
            height: `${(bounds.height / coordinateSpace.height) * 100}%`,
            left: `${((bounds.x - coordinateSpace.x) / coordinateSpace.width) * 100}%`,
            opacity: (node.isHidden || node.isOccluded || node.opacity <= 0)
              ? Math.max(0.35, clamp(node.opacity))
              : clamp(node.opacity),
            top: `${((bounds.y - coordinateSpace.y) / coordinateSpace.height) * 100}%`,
            width: `${(bounds.width / coordinateSpace.width) * 100}%`,
            zIndex: (node.isHidden || node.isOccluded || node.opacity <= 0)
              ? inspectionLayerOffset + node.paintOrder + 1
              : node.paintOrder + 1,
          } as CSSProperties
          return (
            <button
              aria-label={`Select ${node.label || node.typeName}`}
              className={[
                'visual-tree-wireframe-node',
                node.role === 'button' || node.supportedActions.includes('tap') ? 'visual-tree-wireframe-node--interactive' : '',
                node.key === selectedNode?.key ? 'visual-tree-wireframe-node--selected' : '',
                node.isHidden ? 'visual-tree-wireframe-node--hidden' : '',
                node.isOccluded ? 'visual-tree-wireframe-node--occluded' : '',
                node.opacity <= 0 ? 'visual-tree-wireframe-node--transparent' : '',
              ].filter(Boolean).join(' ')}
              key={node.key}
              onClick={() => onSelect(node)}
              style={style}
              title={`${node.typeName}${node.label ? ` · ${node.label}` : ''}`}
              type="button"
            >
              {node.wireframeText ? <span>{node.wireframeText}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function resolveWireframeAspectRatio(
  coordinateSpace: VisualTreeBounds,
  viewportWidth?: number | null,
  viewportHeight?: number | null,
): number {
  const hasViewport = typeof viewportWidth === 'number'
    && Number.isFinite(viewportWidth)
    && viewportWidth > 0
    && typeof viewportHeight === 'number'
    && Number.isFinite(viewportHeight)
    && viewportHeight > 0
  const usesNormalizedUnitSpace = approximatelyEqual(coordinateSpace.width, 1)
    && approximatelyEqual(coordinateSpace.height, 1)

  return usesNormalizedUnitSpace && hasViewport
    ? viewportWidth / viewportHeight
    : coordinateSpace.width / coordinateSpace.height
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 8
}

function parseVisualTree(snapshot: SessionVisualTreeSnapshot): {
  payload: CompactVisualTreePayload | null
  nodes: VisualTreeNodeRecord[]
} {
  const raw = asRecord(snapshot.payload)
  const root = asRecord(raw?.root)
  const types = Array.isArray(raw?.types) ? raw.types.filter((type): type is string => typeof type === 'string') : []
  if (!raw || !root || types.length === 0) {
    return { payload: null, nodes: [] }
  }

  const source = readString(raw.source) || readString(raw.adapter) || snapshot.source || ''
  const format = readString(raw.format) || snapshot.visualTreeFormat || ''
  const isAccessibilityTree = /accessibility|core-simulator-ax-service/i.test(`${source} ${format}`)
  const treatBoundsAsAbsolute = isAccessibilityTree || /react|flutter|capacitor|native/i.test(source)
    || readString(raw.treeKind).toLowerCase() === 'shadow'
  const rootBounds = readBounds(root.bounds)
  const coordinateSpace = readBounds(raw.coordinateSpace, true) ?? rootBounds
  const visibleFlag = readNumber(asRecord(raw.flagBits)?.visible) ?? 1
  const payload: CompactVisualTreePayload = { root, types, source, coordinateSpace, treatBoundsAsAbsolute, visibleFlag }
  const nodes: VisualTreeNodeRecord[] = []
  appendNode(nodes, payload, root, null, [], 0, 0, 0, true, 1, '0')
  markOccludedNodes(nodes)
  return { payload, nodes }
}

function appendNode(
  nodes: VisualTreeNodeRecord[],
  payload: CompactVisualTreePayload,
  source: Record<string, unknown>,
  parentKey: string | null,
  ancestorKeys: string[],
  depth: number,
  parentX: number,
  parentY: number,
  parentIsVisible: boolean,
  parentOpacity: number,
  path: string,
) {
  const typeId = readNumber(source.typeId)
  const typeName = typeId !== null ? payload.types[typeId] : undefined
  if (isSdkInjectedOverlayNode(source, typeName)) {
    return
  }

  const rawChildren = Array.isArray(source.children)
    ? source.children
      .map(asRecord)
      .filter((child): child is Record<string, unknown> => child !== null)
    : []
  const children = rawChildren.filter((child) => {
    const childTypeId = readNumber(child.typeId)
    const childTypeName = childTypeId !== null ? payload.types[childTypeId] : undefined
    return !isSdkInjectedOverlayNode(child, childTypeName)
  })
  const excludedChildCount = rawChildren.length - children.length
  const localBounds = readBounds(source.bounds)
  const bounds = localBounds
    ? {
        ...localBounds,
        x: localBounds.isAbsolute || payload.treatBoundsAsAbsolute || depth === 0 ? localBounds.x : parentX + localBounds.x,
        y: localBounds.isAbsolute || payload.treatBoundsAsAbsolute || depth === 0 ? localBounds.y : parentY + localBounds.y,
      }
    : null
  const nodeId = readString(source.id)
  const key = `${path}:${nodeId || typeName || 'node'}`
  const visual = asRecord(source.visual)
  const localOpacity = readNumber(visual?.opacity) ?? readNumber(source.opacity) ?? 1
  const effectiveOpacity = clamp(parentOpacity * localOpacity)
  const flags = readNumber(source.flags)
  const explicitVisibility = readOptionalBoolean(source.visible)
  const isExplicitlyHidden = readBoolean(source.hidden) || readBoolean(visual?.hidden)
  const isLocallyVisible = isExplicitlyHidden
    ? false
    : explicitVisibility !== null
      ? explicitVisibility
    : flags !== null
      ? (flags & payload.visibleFlag) === payload.visibleFlag
      : true
  const isVisible = parentIsVisible && isLocallyVisible
  const label = readString(source.label)
    || readString(visual?.text)
    || readString(visual?.value)
  const wireframeText = readString(visual?.value)
    || readString(visual?.text)
    || (children.length === 0 ? label : '')
  nodes.push({
    key,
    parentKey,
    ancestorKeys,
    depth,
    paintOrder: nodes.length,
    typeName: typeName || readString(source.type) || '(unknown type)',
    label,
    automationId: readString(source.automationId),
    role: readString(source.role),
    supportedActions: readStringArray(source.supportedActions),
    nodeId,
    childCount: Math.max((readNumber(source.childCount) ?? 0) - excludedChildCount, children.length),
    bounds,
    backgroundColor: normalizeVisualColor(readString(visual?.background) || readString(visual?.backgroundColor)),
    foregroundColor: normalizeVisualColor(readString(visual?.foreground) || readString(visual?.foregroundColor)),
    opacity: effectiveOpacity,
    isHidden: !isVisible,
    isOccluded: readBoolean(source.occluded) || readBoolean(visual?.occluded),
    wireframeText,
  })

  orderChildrenForPainting(children).forEach(({ child, sourceIndex }) => appendNode(
    nodes,
    payload,
    child,
    key,
    [...ancestorKeys, key],
    depth + 1,
    bounds?.x ?? parentX,
    bounds?.y ?? parentY,
    isVisible,
    effectiveOpacity,
    `${path}.${sourceIndex}`,
  ))
}

function isSdkInjectedOverlayNode(source: Record<string, unknown>, typeName?: string): boolean {
  return typeName === androidUiEvidenceOverlayType
    || readString(source.type) === androidUiEvidenceOverlayType
    || readString(source.automationId) === sdkOverlayAutomationId
    || readString(source.id) === sdkOverlayAutomationId
}

function orderChildrenForPainting(children: Record<string, unknown>[]): Array<{
  child: Record<string, unknown>
  sourceIndex: number
}> {
  const ordered = children.map((child, sourceIndex) => ({
    child,
    sourceIndex,
    z: readNumber(child.z),
  }))
  if (!ordered.some(({ z }) => z !== null)) {
    return ordered
  }
  return ordered.sort((left, right) => (left.z ?? 0) - (right.z ?? 0) || left.sourceIndex - right.sourceIndex)
}

function includesVisualTreeNode(node: VisualTreeNodeRecord, visibility: VisualTreeVisibility): boolean {
  return (visibility.hidden || !node.isHidden)
    && (visibility.occluded || !node.isOccluded)
    && (visibility.transparent || node.opacity > 0)
}

function filterVisualTreeNodes(nodes: VisualTreeNodeRecord[], visibility: VisualTreeVisibility): VisualTreeNodeRecord[] {
  const included = nodes.filter((node) => includesVisualTreeNode(node, visibility))
  const includedKeys = new Set(included.map((node) => node.key))
  const filtered = included.map((node) => {
    // Keep eligible descendants reachable when an excluded ancestor is occluded.
    const ancestorKeys = node.ancestorKeys.filter((key) => includedKeys.has(key))
    return { ...node, ancestorKeys, parentKey: ancestorKeys.at(-1) ?? null, depth: ancestorKeys.length, childCount: 0 }
  })
  const byKey = new Map(filtered.map((node) => [node.key, node]))
  for (const node of filtered) {
    const parent = node.parentKey ? byKey.get(node.parentKey) : null
    if (parent) parent.childCount += 1
  }
  return filtered
}

function isRenderableWireframeNode(
  node: VisualTreeNodeRecord,
  coordinateSpace: VisualTreeBounds,
): boolean {
  const bounds = node.bounds
  if (!bounds
    || bounds.width <= 0
    || bounds.height <= 0) {
    return false
  }

  return bounds.x < coordinateSpace.x + coordinateSpace.width
    && bounds.x + bounds.width > coordinateSpace.x
    && bounds.y < coordinateSpace.y + coordinateSpace.height
    && bounds.y + bounds.height > coordinateSpace.y
}

function markOccludedNodes(nodes: VisualTreeNodeRecord[]) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (!node.bounds || node.isHidden || node.opacity <= 0) {
      continue
    }

    const nodeBounds = node.bounds
    node.isOccluded ||= nodes.slice(index + 1).some((candidate) => {
      const candidateBounds = candidate.bounds
      return candidateBounds !== null
        && !candidate.ancestorKeys.includes(node.key)
        && !candidate.isHidden
        && candidate.opacity >= 0.98
        && isOpaqueVisualColor(candidate.backgroundColor)
        && boundsContain(candidateBounds, nodeBounds)
    })
  }
}

function boundsContain(container: VisualTreeBounds, target: VisualTreeBounds): boolean {
  const tolerance = 0.5
  return container.x <= target.x + tolerance
    && container.y <= target.y + tolerance
    && container.x + container.width >= target.x + target.width - tolerance
    && container.y + container.height >= target.y + target.height - tolerance
}

function isOpaqueVisualColor(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === 'transparent' || normalized === 'clear') {
    return false
  }

  const hexWithAlpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/.exec(normalized)
  if (hexWithAlpha) {
    return Number.parseInt(hexWithAlpha[1], 16) >= 250
  }

  const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/.exec(normalized)
  return !rgba || Number(rgba[1]) >= 0.98
}

function normalizeVisualColor(value: string): string {
  const argbMatch = /^#([0-9a-f]{8})$/i.exec(value)
  if (!argbMatch) {
    return value
  }

  const argb = argbMatch[1]
  return `#${argb.slice(2)}${argb.slice(0, 2)}`
}

function createMatchingKeys(nodes: VisualTreeNodeRecord[], query: string): Set<string> {
  const keys = new Set<string>()
  for (const node of nodes) {
    const searchable = `${node.typeName} ${node.label} ${node.automationId} ${node.nodeId}`.toLowerCase()
    if (!searchable.includes(query)) {
      continue
    }
    keys.add(node.key)
    node.ancestorKeys.forEach((key) => keys.add(key))
  }
  return keys
}

function createOverlaySelection(
  snapshotId: string,
  node: VisualTreeNodeRecord,
  coordinateSpace: VisualTreeBounds | null,
): VisualTreeOverlaySelection | null {
  if (!node.bounds || !coordinateSpace || coordinateSpace.width <= 0 || coordinateSpace.height <= 0) {
    return null
  }

  return {
    snapshotId,
    label: node.label || node.typeName,
    x: clamp((node.bounds.x - coordinateSpace.x) / coordinateSpace.width),
    y: clamp((node.bounds.y - coordinateSpace.y) / coordinateSpace.height),
    width: clamp(node.bounds.width / coordinateSpace.width),
    height: clamp(node.bounds.height / coordinateSpace.height),
  }
}

function readBounds(value: unknown, treatObjectBoundsAsAbsolute = false): VisualTreeBounds | null {
  if (Array.isArray(value) && value.length >= 4) {
    const isAbsolute = value.length >= 8
    const values = value.slice(isAbsolute ? 4 : 0, isAbsolute ? 8 : 4).map(readNumber)
    return values.every((candidate) => candidate !== null)
      ? { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]!, isAbsolute }
      : null
  }

  const record = asRecord(value)
  if (!record) {
    return null
  }
  const hasAbsoluteBounds = record.absoluteX !== undefined
    && record.absoluteY !== undefined
    && record.absoluteWidth !== undefined
    && record.absoluteHeight !== undefined
  const x = readNumber(hasAbsoluteBounds ? record.absoluteX : record.x)
  const y = readNumber(hasAbsoluteBounds ? record.absoluteY : record.y)
  const width = readNumber(hasAbsoluteBounds ? record.absoluteWidth : record.width)
  const height = readNumber(hasAbsoluteBounds ? record.absoluteHeight : record.height)
  return x === null || y === null || width === null || height === null
    ? null
    : { x, y, width, height, isAbsolute: hasAbsoluteBounds || treatObjectBoundsAsAbsolute }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter(Boolean)
    : []
}

function readNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function readBoolean(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.toLowerCase() === 'true')
}

function readOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 0 || value === 1) {
    return value === 1
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') {
      return true
    }
    if (normalized === 'false' || normalized === '0') {
      return false
    }
  }
  return null
}

function formatBounds(bounds: VisualTreeBounds): string {
  return `${formatNumber(bounds.x)}, ${formatNumber(bounds.y)} · ${formatNumber(bounds.width)} × ${formatNumber(bounds.height)}`
}

function formatNodeSummary(node: VisualTreeNodeRecord): string {
  return [
    node.label,
    node.automationId ? `#${node.automationId}` : '',
    node.nodeId ? `id: ${node.nodeId}` : '',
    `${node.childCount} ${node.childCount === 1 ? 'child' : 'children'}`,
  ].filter(Boolean).join(' · ')
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
