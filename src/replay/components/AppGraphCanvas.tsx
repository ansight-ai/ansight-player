import { CornersOut, Minus, Plus } from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import type { AppGraphDefinition, AppGraphEdge, AppGraphNode, AppGraphRunStepStatus } from '../../types'
import { appGraphNodeKindLabel, normalizeAppGraphDefinition } from '../appGraphModel'

const nodeWidth = 212
const nodeHeight = 96
const childNodeWidth = 150
const childNodeHeight = 68
const childColumnGap = 44
const childRowGap = 24
const parentStateGap = 56
const maximumChildRows = 4
const groupHeaderHeight = 62
const groupPadding = 20
const groupEdgeGutter = 38
const canvasMinimumWidth = 1_160
const canvasMinimumHeight = 650
const canvasRightPadding = 120
const canvasBottomPadding = 80

type DragState = {
  nodes: Array<{ id: string; x: number; y: number }>
  start: Point
}

type Point = { x: number; y: number }

type CanvasNode = {
  node: AppGraphNode
  x: number
  y: number
  width: number
  height: number
  groupKey?: string
}

type CanvasGroup = {
  key: string
  label: string
  x: number
  y: number
  width: number
  height: number
  nodeIds: string[]
  stateCount: number
}

type CanvasLayout = {
  definition: AppGraphDefinition
  groups: CanvasGroup[]
  nodes: CanvasNode[]
  nodeById: Map<string, CanvasNode>
}

type CanvasEdge = {
  edge: AppGraphEdge
  reverseEdge: AppGraphEdge | null
}

export function AppGraphCanvas({
  definition,
  edgeStatuses = {},
  onChange,
  onConnect,
  onSelectEdge,
  onSelectNode,
  readOnly = false,
  selectedEdgeId,
  selectedNodeId,
}: {
  definition: AppGraphDefinition
  edgeStatuses?: Record<string, AppGraphRunStepStatus>
  onChange: (definition: AppGraphDefinition) => void
  onConnect?: (fromNodeId: string, toNodeId: string) => void
  onSelectEdge?: (edgeId: string) => void
  onSelectNode: (nodeId: string) => void
  readOnly?: boolean
  selectedEdgeId?: string | null
  selectedNodeId: string | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const panStateRef = useRef<{ start: Point; origin: Point } | null>(null)
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null)
  const [connectionPoint, setConnectionPoint] = useState<Point | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const layout = useMemo(() => createCompoundCanvasLayout(definition), [definition])
  const width = Math.max(
    canvasMinimumWidth,
    ...layout.nodes.map((placement) => placement.x + placement.width + canvasRightPadding),
    ...layout.groups.map((group) => group.x + group.width + canvasRightPadding),
  )
  const height = Math.max(
    canvasMinimumHeight,
    ...layout.nodes.map((placement) => placement.y + placement.height + canvasBottomPadding),
    ...layout.groups.map((group) => group.y + group.height + canvasBottomPadding),
  )
  const nodeById = layout.nodeById
  const canvasEdges = useMemo(() => createCanvasEdges(layout.definition.edges), [layout.definition.edges])
  const viewWidth = width / zoom
  const viewHeight = height / zoom

  function startDragging(event: ReactPointerEvent<SVGElement>, node: AppGraphNode) {
    if (readOnly || connectionSourceId) return
    event.preventDefault()
    event.stopPropagation()
    const point = clientPointToCanvas(event.clientX, event.clientY)
    const groupKey = layout.nodeById.get(node.id)?.groupKey
    const movedNodes = groupKey
      ? definition.nodes.filter((candidate) => layout.nodeById.get(candidate.id)?.groupKey === groupKey)
      : [node]
    dragStateRef.current = {
      nodes: movedNodes.map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y })),
      start: point,
    }
    svgRef.current?.setPointerCapture(event.pointerId)
    onSelectEdge?.('')
    onSelectNode(node.id)
  }

  function startPanning(event: ReactPointerEvent<SVGSVGElement>) {
    const target = event.target as SVGElement
    if ((target !== svgRef.current && !target.classList.contains('app-graph-grid')) || event.button !== 0) return
    panStateRef.current = {
      start: { x: event.clientX, y: event.clientY },
      origin: pan,
    }
    svgRef.current?.setPointerCapture(event.pointerId)
    onSelectNode('')
    onSelectEdge?.('')
  }

  function continuePointer(event: ReactPointerEvent<SVGSVGElement>) {
    const point = clientPointToCanvas(event.clientX, event.clientY)
    if (connectionSourceId) setConnectionPoint(point)

    const dragState = dragStateRef.current
    if (dragState) {
      const deltaX = Math.round(point.x - dragState.start.x)
      const deltaY = Math.round(point.y - dragState.start.y)
      const positionByNodeId = new Map(dragState.nodes.map((node) => [node.id, node]))
      onChange({
        ...definition,
        nodes: definition.nodes.map((node) => {
          const origin = positionByNodeId.get(node.id)
          return origin
            ? { ...node, x: Math.max(24, origin.x + deltaX), y: Math.max(24, origin.y + deltaY) }
            : node
        }),
      })
      return
    }

    const panState = panStateRef.current
    if (panState) {
      const bounds = svgRef.current?.getBoundingClientRect()
      if (!bounds) return
      setPan({
        x: Math.max(0, panState.origin.x - (event.clientX - panState.start.x) * (viewWidth / bounds.width)),
        y: Math.max(0, panState.origin.y - (event.clientY - panState.start.y) * (viewHeight / bounds.height)),
      })
    }
  }

  function stopPointer(event: ReactPointerEvent<SVGSVGElement>) {
    dragStateRef.current = null
    panStateRef.current = null
    setConnectionSourceId(null)
    setConnectionPoint(null)
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId)
    }
  }

  function startConnection(event: ReactPointerEvent<SVGCircleElement>, nodeId: string) {
    if (readOnly || !onConnect) return
    event.preventDefault()
    event.stopPropagation()
    const point = clientPointToCanvas(event.clientX, event.clientY)
    setConnectionSourceId(nodeId)
    setConnectionPoint(point)
  }

  function finishConnection(event: ReactPointerEvent<SVGCircleElement>, targetNodeId: string) {
    event.preventDefault()
    event.stopPropagation()
    if (connectionSourceId && connectionSourceId !== targetNodeId) onConnect?.(connectionSourceId, targetNodeId)
    setConnectionSourceId(null)
    setConnectionPoint(null)
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault()
    setZoom((current) => clampZoom(current * (event.deltaY > 0 ? 0.9 : 1.1)))
  }

  function clientPointToCanvas(clientX: number, clientY: number): Point {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) return { x: clientX, y: clientY }
    return {
      x: pan.x + (clientX - bounds.left) * (viewWidth / bounds.width),
      y: pan.y + (clientY - bounds.top) * (viewHeight / bounds.height),
    }
  }

  function fitGraph() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const connectionSource = connectionSourceId ? nodeById.get(connectionSourceId) : null

  return (
    <div className="app-graph-canvas-shell">
      <div className="app-graph-canvas-controls" aria-label="Canvas zoom controls">
        <button aria-label="Zoom out" onClick={() => setZoom((current) => clampZoom(current - 0.15))} type="button"><Minus /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => setZoom((current) => clampZoom(current + 0.15))} type="button"><Plus /></button>
        <button aria-label="Fit graph" onClick={fitGraph} type="button"><CornersOut /></button>
      </div>
      <div className="app-graph-canvas-legend">
        <span><i className="app-graph-legend-dot app-graph-legend-dot--strong" />Repeated evidence</span>
        <span><i className="app-graph-legend-dot app-graph-legend-dot--weak" />Single observation</span>
      </div>
      <svg
        aria-label="Editable App Graph"
        className={`app-graph-canvas${readOnly ? ' app-graph-canvas--readonly' : ''}`}
        onPointerCancel={stopPointer}
        onPointerDown={startPanning}
        onPointerMove={continuePointer}
        onPointerUp={stopPointer}
        onWheel={handleWheel}
        ref={svgRef}
        role="application"
        viewBox={`${pan.x} ${pan.y} ${viewWidth} ${viewHeight}`}
      >
        <defs>
          <pattern height="24" id="app-graph-grid-small" patternUnits="userSpaceOnUse" width="24">
            <circle className="app-graph-grid-dot" cx="1" cy="1" r="1" />
          </pattern>
          <pattern height="120" id="app-graph-grid-large" patternUnits="userSpaceOnUse" width="120">
            <rect fill="url(#app-graph-grid-small)" height="120" width="120" />
            <path className="app-graph-grid-line" d="M 120 0 L 0 0 0 120" fill="none" />
          </pattern>
          <filter height="180%" id="app-graph-node-shadow" width="180%" x="-40%" y="-40%">
            <feDropShadow dx="0" dy="8" floodColor="#020812" floodOpacity=".55" stdDeviation="8" />
          </filter>
          <marker id="app-graph-arrow" markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4">
            <path className="app-graph-arrow-head" d="M 0 0 L 8 4 L 0 8 z" />
          </marker>
        </defs>
        <rect className="app-graph-grid" height={height} width={width} x="0" y="0" />

        <g className="app-graph-state-groups">
          {layout.groups.map((group) => {
            const firstNode = layout.nodeById.get(group.nodeIds[0])?.node
            return (
              <g className="app-graph-state-group" key={group.key}>
                <rect className="app-graph-state-group-surface" height={group.height} rx="15" width={group.width} x={group.x} y={group.y} />
                <path
                  className="app-graph-state-group-header"
                  d={`M ${group.x + 15} ${group.y} H ${group.x + group.width - 15} Q ${group.x + group.width} ${group.y} ${group.x + group.width} ${group.y + 15} V ${group.y + groupHeaderHeight} H ${group.x} V ${group.y + 15} Q ${group.x} ${group.y} ${group.x + 15} ${group.y} Z`}
                />
                <text className="app-graph-state-group-kind" x={group.x + 20} y={group.y + 22}>Screen</text>
                <text className="app-graph-state-group-label" x={group.x + 20} y={group.y + 45}>{truncateNodeLabel(group.label, 48)}</text>
                <text className="app-graph-state-group-count" textAnchor="end" x={group.x + group.width - 20} y={group.y + 37}>
                  {group.stateCount} internal state{group.stateCount === 1 ? '' : 's'}
                </text>
                {firstNode && !readOnly ? (
                  <rect
                    className="app-graph-state-group-drag-handle"
                    height={groupHeaderHeight}
                    onPointerDown={(event) => startDragging(event, firstNode)}
                    rx="15"
                    width={group.width}
                    x={group.x}
                    y={group.y}
                  />
                ) : null}
              </g>
            )
          })}
        </g>

        <g className="app-graph-edges">
          {canvasEdges.map(({ edge, reverseEdge }) => {
            const from = nodeById.get(edge.from)
            const to = nodeById.get(edge.to)
            if (!from || !to) return null
            const geometry = createEdgeGeometry(edge, from, to, layout.groups)
            const status = resolveCanvasEdgeStatus(edge, reverseEdge, edgeStatuses)
            const selected = edge.id === selectedEdgeId || reverseEdge?.id === selectedEdgeId
            const isInternal = !!from.groupKey && from.groupKey === to.groupKey
            const label = canvasEdgeLabel(edge, reverseEdge)
            const classes = [
              'app-graph-edge',
              isInternal ? 'app-graph-edge--internal' : '',
              reverseEdge ? 'app-graph-edge--bidirectional' : '',
              selected ? 'app-graph-edge--selected' : '',
              status ? `app-graph-edge--${status}` : '',
              [edge, reverseEdge].filter((candidate): candidate is AppGraphEdge => !!candidate).some((candidate) => (candidate.confidence ?? 1) < 0.75) ? 'app-graph-edge--weak' : '',
            ].filter(Boolean).join(' ')
            return (
              <g className="app-graph-edge-group" key={reverseEdge ? `${edge.id}:${reverseEdge.id}` : edge.id}>
                {reverseEdge ? <title>{`${edgeSemanticMeaning(edge)}: ${edge.from} to ${edge.to}. ${edgeSemanticMeaning(reverseEdge)}: ${reverseEdge.from} to ${reverseEdge.to}. Click again to inspect the other direction.`}</title> : null}
                <path
                  className="app-graph-edge-hit"
                  d={geometry.path}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectNode('')
                    onSelectEdge?.(reverseEdge && selectedEdgeId === edge.id ? reverseEdge.id : edge.id)
                  }}
                />
                <path className={classes} d={geometry.path} markerEnd="url(#app-graph-arrow)" markerStart={reverseEdge ? 'url(#app-graph-arrow)' : undefined} />
                {label && !isInternal ? (
                  <g className={`app-graph-edge-label${isInternal ? ' app-graph-edge-label--internal' : ''}`} transform={`translate(${geometry.labelX} ${geometry.labelY})`}>
                    <rect height="24" rx="12" width={Math.min(230, Math.max(52, label.length * 6.8 + 24))} x={-Math.min(230, Math.max(52, label.length * 6.8 + 24)) / 2} y="-15" />
                    <text textAnchor="middle">{label.length > 32 ? `${label.slice(0, 31)}…` : label}</text>
                  </g>
                ) : null}
              </g>
            )
          })}
          {connectionSource && connectionPoint ? (
            <path
              className="app-graph-edge app-graph-edge--preview"
              d={`M ${connectionSource.x + connectionSource.width} ${connectionSource.y + connectionSource.height / 2} C ${connectionSource.x + connectionSource.width + 80} ${connectionSource.y + connectionSource.height / 2}, ${connectionPoint.x - 80} ${connectionPoint.y}, ${connectionPoint.x} ${connectionPoint.y}`}
            />
          ) : null}
        </g>

        <g className="app-graph-nodes">
          {layout.nodes.map((placement) => {
            const { node } = placement
            const lines = wrapNodeLabel(node.name)
            const isSubState = !!node.parentScreen?.trim()
            const groupedLabel = node.kind === 'state'
              ? `Internal state of ${node.parentScreen}: ${node.name}`
              : `Destination in ${node.parentScreen}: ${node.name}`
            const selected = node.id === selectedNodeId
            const weakEvidence = (node.confidence ?? 1) < 0.75
            return (
              <g
                aria-label={isSubState ? groupedLabel : `${appGraphNodeKindLabel(node.kind)}: ${node.name}`}
                className={`app-graph-node app-graph-node--${node.kind}${isSubState ? ' app-graph-node--internal' : ''}${selected ? ' app-graph-node--selected' : ''}${weakEvidence ? ' app-graph-node--weak' : ''}`}
                key={node.id}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectEdge?.('')
                  onSelectNode(node.id)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onSelectNode(node.id)
                }}
                onPointerDown={(event) => startDragging(event, node)}
                role="button"
                tabIndex={0}
                transform={`translate(${placement.x} ${placement.y})`}
              >
                <rect className="app-graph-node-surface" filter="url(#app-graph-node-shadow)" height={placement.height} rx="10" width={placement.width} />
                {isSubState ? <>
                  <text className="app-graph-node-kind" x="14" y="19">Internal state</text>
                  <text className="app-graph-node-label" x="14" y="42">{truncateNodeLabel(node.name, 22)}</text>
                </> : <>
                  <path className="app-graph-node-header" d={`M 10 0 H ${placement.width - 10} Q ${placement.width} 0 ${placement.width} 10 V 31 H 0 V 10 Q 0 0 10 0 Z`} />
                  <text className="app-graph-node-glyph" x="13" y="21">{nodeKindGlyph(node.kind)}</text>
                  <text className="app-graph-node-kind" x="34" y="21">{appGraphNodeKindLabel(node.kind)}</text>
                  <text className="app-graph-node-label" x="16" y="53">
                    {lines.map((line, index) => <tspan dy={index === 0 ? 0 : 18} key={`${node.id}-${index}`} x="16">{line}</tspan>)}
                  </text>
                </>}
                <text className="app-graph-node-confidence" textAnchor="end" x={placement.width - 13} y={placement.height - 10}>
                  {Math.round((node.confidence ?? 1) * 100)}% · {(node.provenanceObservationIds?.length ?? 1)}×
                </text>
                <circle
                  className="app-graph-node-port app-graph-node-port--input"
                  cx="0"
                  cy={placement.height / 2}
                  onPointerUp={(event) => finishConnection(event, node.id)}
                  r="7"
                />
                <circle
                  className="app-graph-node-port app-graph-node-port--output"
                  cx={placement.width}
                  cy={placement.height / 2}
                  onPointerDown={(event) => startConnection(event, node.id)}
                  r="7"
                />
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

function createCanvasEdges(edges: AppGraphEdge[]): CanvasEdge[] {
  const consumedEdgeIds = new Set<string>()
  const canvasEdges: CanvasEdge[] = []

  for (const edge of edges) {
    if (consumedEdgeIds.has(edge.id)) continue
    consumedEdgeIds.add(edge.id)
    const reverseEdge = edge.from === edge.to
      ? null
      : edges.find((candidate) => (
          !consumedEdgeIds.has(candidate.id)
          && candidate.from === edge.to
          && candidate.to === edge.from
        )) ?? null
    if (reverseEdge) consumedEdgeIds.add(reverseEdge.id)
    canvasEdges.push({ edge, reverseEdge })
  }

  return canvasEdges
}

function canvasEdgeLabel(edge: AppGraphEdge, reverseEdge: AppGraphEdge | null): string {
  const label = edgeSemanticMeaning(edge)
  const reverseLabel = reverseEdge ? edgeSemanticMeaning(reverseEdge) : ''
  if (!reverseEdge || label.toLocaleLowerCase() === reverseLabel.toLocaleLowerCase()) return label
  return `${label} ↔ ${reverseLabel}`
}

function edgeSemanticMeaning(edge: AppGraphEdge): string {
  return edge.action.semanticMeaning.trim()
}

function resolveCanvasEdgeStatus(
  edge: AppGraphEdge,
  reverseEdge: AppGraphEdge | null,
  edgeStatuses: Record<string, AppGraphRunStepStatus>,
): AppGraphRunStepStatus | undefined {
  const statuses = [edgeStatuses[edge.id], reverseEdge ? edgeStatuses[reverseEdge.id] : undefined]
  const priority: AppGraphRunStepStatus[] = ['failed', 'running', 'succeeded', 'skipped', 'pending']
  return priority.find((status) => statuses.includes(status))
}

function createCompoundCanvasLayout(sourceDefinition: AppGraphDefinition): CanvasLayout {
  const definition = normalizeAppGraphDefinition(sourceDefinition)
  const groupedNodes = new Map<string, { label: string; nodes: AppGraphNode[] }>()
  const nodes: CanvasNode[] = []

  for (const node of definition.nodes) {
    const parentScreen = node.parentScreen?.trim()
    if (!parentScreen) continue
    const key = normalizeGroupKey(parentScreen)
    const group = groupedNodes.get(key) ?? { label: parentScreen, nodes: [] }
    group.nodes.push(node)
    groupedNodes.set(key, group)
  }

  const parentNodeByGroupKey = new Map<string, AppGraphNode>()
  for (const node of definition.nodes) {
    if (node.parentScreen?.trim()) continue
    const key = normalizeGroupKey(node.name)
    if (groupedNodes.has(key)) parentNodeByGroupKey.set(key, node)
  }

  const groups: CanvasGroup[] = []
  for (const [key, grouped] of groupedNodes) {
    const members = [...grouped.nodes].sort((left, right) => left.x - right.x || left.y - right.y || left.name.localeCompare(right.name))
    const parentNode = parentNodeByGroupKey.get(key)
    const rows = Math.min(maximumChildRows, Math.max(1, members.length))
    const columns = Math.ceil(members.length / rows)
    const childGridWidth = columns * childNodeWidth + Math.max(0, columns - 1) * childColumnGap
    const childGridHeight = rows * childNodeHeight + Math.max(0, rows - 1) * childRowGap
    const contentWidth = parentNode
      ? nodeWidth + parentStateGap + childGridWidth
      : childGridWidth
    const contentHeight = Math.max(parentNode ? nodeHeight : 0, childGridHeight)
    const x = Math.max(24, parentNode?.x ?? Math.min(...members.map((node) => node.x)))
    const y = Math.max(24, parentNode?.y ?? Math.min(...members.map((node) => node.y)))
    const width = groupPadding * 2 + contentWidth
    const height = groupHeaderHeight + groupPadding * 2 + contentHeight + groupEdgeGutter
    const groupNodeIds = parentNode
      ? [parentNode.id, ...members.map((node) => node.id)]
      : members.map((node) => node.id)
    const group: CanvasGroup = {
      key,
      label: grouped.label,
      x,
      y,
      width,
      height,
      nodeIds: groupNodeIds,
      stateCount: members.length,
    }
    groups.push(group)

    if (parentNode) {
      nodes.push({
        node: parentNode,
        x: x + groupPadding,
        y: y + groupHeaderHeight + groupPadding + (contentHeight - nodeHeight) / 2,
        width: nodeWidth,
        height: nodeHeight,
        groupKey: key,
      })
    }

    members.forEach((node, index) => {
      const column = Math.floor(index / rows)
      const row = index % rows
      nodes.push({
        node,
        x: x + groupPadding + (parentNode ? nodeWidth + parentStateGap : 0) + column * (childNodeWidth + childColumnGap),
        y: y + groupHeaderHeight + groupPadding + row * (childNodeHeight + childRowGap),
        width: childNodeWidth,
        height: childNodeHeight,
        groupKey: key,
      })
    })
  }

  for (const node of definition.nodes) {
    if (node.parentScreen?.trim() || parentNodeByGroupKey.has(normalizeGroupKey(node.name))) continue
    nodes.push({ node, x: node.x, y: node.y, width: nodeWidth, height: nodeHeight })
  }

  return {
    definition,
    groups,
    nodes,
    nodeById: new Map(nodes.map((placement) => [placement.node.id, placement])),
  }
}

function normalizeGroupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function createEdgeGeometry(
  _edge: AppGraphEdge,
  from: CanvasNode,
  to: CanvasNode,
  groups: CanvasGroup[],
): { path: string; labelX: number; labelY: number } {
  const startX = from.x + from.width
  const startY = from.y + from.height / 2
  const endX = to.x
  const endY = to.y + to.height / 2
  const isInternal = !!from.groupKey && from.groupKey === to.groupKey

  if (isInternal && endX <= startX) {
    const group = groups.find((candidate) => candidate.key === from.groupKey)
    const routeY = group ? group.y + group.height - 18 : Math.max(startY, endY) + 54
    const outward = 34
    return {
      path: `M ${startX} ${startY} C ${startX + outward} ${startY}, ${startX + outward} ${routeY}, ${(startX + endX) / 2} ${routeY} C ${endX - outward} ${routeY}, ${endX - outward} ${endY}, ${endX} ${endY}`,
      labelX: (startX + endX) / 2,
      labelY: routeY - 5,
    }
  }

  const overlapsHorizontally = from.x < to.x + to.width && to.x < from.x + from.width
  const separatedVertically = to.y >= from.y + from.height || from.y >= to.y + to.height
  if (!isInternal && overlapsHorizontally && separatedVertically) {
    const travelsDown = to.y >= from.y + from.height
    const verticalStartX = from.x + from.width / 2
    const verticalStartY = travelsDown ? from.y + from.height : from.y
    const verticalEndX = to.x + to.width / 2
    const verticalEndY = travelsDown ? to.y : to.y + to.height
    const controlOffset = Math.max(44, Math.abs(verticalEndY - verticalStartY) * 0.46)
    return {
      path: travelsDown
        ? `M ${verticalStartX} ${verticalStartY} C ${verticalStartX} ${verticalStartY + controlOffset}, ${verticalEndX} ${verticalEndY - controlOffset}, ${verticalEndX} ${verticalEndY}`
        : `M ${verticalStartX} ${verticalStartY} C ${verticalStartX} ${verticalStartY - controlOffset}, ${verticalEndX} ${verticalEndY + controlOffset}, ${verticalEndX} ${verticalEndY}`,
      labelX: (verticalStartX + verticalEndX) / 2,
      labelY: (verticalStartY + verticalEndY) / 2 - 8,
    }
  }

  const sourceGroup = from.groupKey && !from.node.parentScreen?.trim()
    ? groups.find((candidate) => candidate.key === from.groupKey)
    : undefined
  if (sourceGroup && to.groupKey !== from.groupKey && endX > startX) {
    const routeY = sourceGroup.y + sourceGroup.height - 18
    const routeStartX = Math.min(sourceGroup.x + sourceGroup.width - 48, startX + 36)
    const groupExitX = sourceGroup.x + sourceGroup.width
    const corridorX = groupExitX + Math.min(76, Math.max(48, (endX - groupExitX) * 0.36))
    const targetOffset = Math.max(40, (endX - corridorX) * 0.44)
    return {
      path: `M ${startX} ${startY} C ${routeStartX} ${startY}, ${routeStartX} ${routeY}, ${routeStartX + 30} ${routeY} L ${groupExitX} ${routeY} C ${corridorX} ${routeY}, ${corridorX} ${routeY}, ${corridorX} ${routeY - 36} L ${corridorX} ${endY} C ${corridorX + targetOffset} ${endY}, ${endX - targetOffset} ${endY}, ${endX} ${endY}`,
      labelX: (corridorX + endX) / 2,
      labelY: endY - 10,
    }
  }

  const controlOffset = Math.max(isInternal ? 30 : 72, Math.abs(endX - startX) * 0.48)
  return {
    path: `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`,
    labelX: (startX + endX) / 2,
    labelY: (startY + endY) / 2 - 10,
  }
}

function wrapNodeLabel(label: string): string[] {
  const words = label.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > 27 && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
    if (lines.length === 1) break
  }
  if (current && lines.length < 2) lines.push(current)
  if (words.join(' ').length > lines.join(' ').length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, 24)}…`
  }
  return lines.slice(0, 2)
}

function truncateNodeLabel(label: string, maximumLength: number): string {
  const value = label.trim()
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value
}

function nodeKindGlyph(kind: AppGraphNode['kind']): string {
  const glyphs: Record<AppGraphNode['kind'], string> = {
    screen: '▣',
    dialog: '▤',
    state: '◈',
  }
  return glyphs[kind]
}

function clampZoom(value: number): number {
  return Math.max(0.55, Math.min(1.8, Math.round(value * 100) / 100))
}
