import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  FlowArrow,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppGraphDefinition, AppGraphRunStepStatus } from '../types'
import { AppGraphCanvas } from '../replay/components/AppGraphCanvas'
import type { LocalAppGraphLiveRun } from './types'

type AppGraphProgressPanelProps = {
  isRefreshing: boolean
  onClose: () => void
  onRecord?: () => void
  onRefresh: () => void
  runs: LocalAppGraphLiveRun[]
}

export function AppGraphProgressPanel({
  isRefreshing,
  onClose,
  onRecord,
  onRefresh,
  runs,
}: AppGraphProgressPanelProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const traceRef = useRef<HTMLOListElement>(null)

  const effectiveSelectedRunId = selectedRunId && runs.some((run) => run.runId === selectedRunId)
    ? selectedRunId
    : runs.find((run) => run.status === 'running' || run.status === 'starting')?.runId
      ?? runs[0]?.runId
      ?? null
  const selectedRun = runs.find((run) => run.runId === effectiveSelectedRunId) ?? null
  const definition = useMemo(
    () => selectedRun ? createLiveDefinition(selectedRun) : emptyDefinition,
    [selectedRun],
  )
  const edgeStatuses = useMemo(
    () => selectedRun ? createEdgeStatuses(selectedRun) : {},
    [selectedRun],
  )
  const effectiveSelectedNodeId = selectedNodeId
    && selectedRun?.nodes.some((node) => node.id === selectedNodeId)
    ? selectedNodeId
    : selectedRun?.currentDestinationId
  const selectedNode = selectedRun?.nodes.find((node) => node.id === effectiveSelectedNodeId)
    ?? null
  const trace = selectedRun?.trace ?? []
  const pendingActions = (selectedRun?.frontier ?? [])
    .filter((action) => action.status === 'queued' || action.status === 'attempted')
    .sort((left, right) => left.attemptCount - right.attemptCount
      || left.firstObservedUtc.localeCompare(right.firstObservedUtc))
  const latestTraceSequence = trace.at(-1)?.sequence ?? 0

  useEffect(() => {
    const element = traceRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [effectiveSelectedRunId, latestTraceSequence])

  return (
    <div className="local-app-graph-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <section aria-label="Live App Graph" className="local-app-graph-panel">
        <header>
          <div>
            <p className="eyebrow">App Graph build</p>
          </div>
          <div className="local-app-graph-header-actions">
            {onRecord ? (
              <button className="local-banner-button" onClick={onRecord} type="button">
                <FlowArrow aria-hidden="true" /> Record walkthrough
              </button>
            ) : null}
            <button aria-label="Refresh live App Graph" className="local-icon-button" disabled={isRefreshing} onClick={onRefresh} type="button">
              <ArrowClockwise className={isRefreshing ? 'spin' : undefined} aria-hidden="true" />
            </button>
            <button aria-label="Close live App Graph" className="local-icon-button" onClick={onClose} type="button">
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        {selectedRun ? (
          <>
            <div className="local-app-graph-toolbar">
              <label>
                <span>Exploration run</span>
                <select onChange={(event) => setSelectedRunId(event.target.value)} value={selectedRun.runId}>
                  {runs.map((run) => (
                    <option key={run.runId} value={run.runId}>
                      {run.graphName} · {formatStatus(run.status)} · {formatTime(run.startedUtc)}
                    </option>
                  ))}
                </select>
              </label>
              <span className={`local-app-graph-status local-app-graph-status--${selectedRun.status}`}>
                <RunStatusIcon status={selectedRun.status} />
                {formatStatus(selectedRun.status)}
              </span>
              <span>Turn {selectedRun.turn}</span>
              {selectedRun.activeToolName ? <code>{selectedRun.activeToolName}</code> : null}
            </div>

            <div className="local-app-graph-body">
              <aside className="local-app-graph-inspector">
                <div className="local-app-graph-counts">
                  <Metric label="Destinations" value={selectedRun.nodes.length} />
                  <Metric label="Transitions" value={selectedRun.edges.length} />
                  <Metric label="Navigation hosts" value={(selectedRun.navigationHosts ?? []).length} />
                  <Metric label="Internal tab groups" value={(selectedRun.tabGroups ?? []).length} />
                  <Metric label="Pending actions" value={pendingActions.length} />
                  <Metric
                    label="Actions explored"
                    value={`${selectedRun.coverage.actionsExplored}/${selectedRun.coverage.safeActionsObserved}`}
                  />
                  <Metric
                    label="Scroll coverage"
                    value={`${selectedRun.coverage.scrollContainersCompleted}/${selectedRun.coverage.scrollContainersObserved}`}
                  />
                </div>

                <div className="local-app-graph-activity">
                  <small>Latest activity</small>
                  <strong>{selectedRun.message}</strong>
                  <span>Updated {formatRelativeTime(selectedRun.updatedUtc)}</span>
                </div>

                {selectedNode ? (
                  <div className="local-app-graph-destination">
                    <small>{selectedNode.id === selectedRun.currentDestinationId ? 'Current destination' : 'Selected destination'}</small>
                    <strong>{selectedNode.name}</strong>
                    <span>{selectedNode.kind.replace('_', ' ')} · {formatScrollStatus(selectedNode.scrollStatus)}</span>
                    <p>{selectedNode.purpose}</p>
                    {selectedNode.description ? <p>{selectedNode.description}</p> : null}
                  </div>
                ) : null}

                {selectedRun.coverage.gaps.length > 0 ? (
                  <div className="local-app-graph-gaps">
                    <small>Coverage gaps</small>
                    {selectedRun.coverage.gaps.map((gap) => (
                      <span key={gap}><WarningCircle aria-hidden="true" />{gap}</span>
                    ))}
                  </div>
                ) : null}

                {pendingActions.length > 0 ? (
                  <div className="local-app-graph-gaps">
                    <small>Next action frontier</small>
                    {pendingActions.slice(0, 8).map((action) => (
                      <span key={action.id}>
                        <CircleNotch aria-hidden="true" />
                        {action.destinationId} · {action.automationId || action.semanticMeaning}
                        {action.attemptCount > 0 ? ` · ${action.attemptCount} attempt(s)` : ''}
                      </span>
                    ))}
                  </div>
                ) : null}
              </aside>

              <main className="local-app-graph-canvas">
                {definition.nodes.length > 0 ? (
                  <AppGraphCanvas
                    definition={definition}
                    edgeStatuses={edgeStatuses}
                    onChange={() => {}}
                    onSelectNode={setSelectedNodeId}
                    readOnly
                    selectedNodeId={selectedNode?.id ?? null}
                  />
                ) : (
                  <div className="local-app-graph-empty">
                    {selectedRun.status === 'running' || selectedRun.status === 'starting'
                      ? <CircleNotch className="spin" aria-hidden="true" />
                      : <FlowArrow aria-hidden="true" />}
                    <strong>Waiting for the first verified destination</strong>
                    <span>The graph appears as soon as the exploration agent reports semantic evidence.</span>
                  </div>
                )}
              </main>
            </div>

            <section aria-label="App Graph exploration trace" className="local-app-graph-trace">
              <header>
                <div>
                  <strong>Exploration trace</strong>
                  <span>The ordered instruction and accessibility-tool chain for this graph build.</span>
                </div>
                <span>{trace.length} {trace.length === 1 ? 'event' : 'events'}</span>
              </header>
              <ol ref={traceRef}>
                {trace.length > 0 ? trace.map((entry) => (
                  <li
                    className={`local-app-graph-trace-entry local-app-graph-trace-entry--${entry.stage.toLowerCase()}${isTraceError(entry.message) ? ' local-app-graph-trace-entry--error' : ''}`}
                    key={entry.sequence}
                  >
                    <time dateTime={entry.occurredUtc}>{formatTraceTime(entry.occurredUtc)}</time>
                    <i aria-hidden="true" />
                    <strong>{formatTraceStage(entry.stage)}</strong>
                    {entry.turn > 0 ? <span>Turn {entry.turn}</span> : null}
                    {entry.toolName ? <code>{entry.toolName}</code> : null}
                    <p>{entry.message}</p>
                  </li>
                )) : (
                  <li className="local-app-graph-trace-empty">Waiting for the first exploration instruction…</li>
                )}
              </ol>
            </section>
          </>
        ) : (
          <div className="local-app-graph-empty">
            <FlowArrow aria-hidden="true" />
            <strong>No App Graph exploration for this session</strong>
            <span>Start an `ansight app-graph explore` run and verified destinations will appear here live.</span>
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>
}

function RunStatusIcon({ status }: { status: LocalAppGraphLiveRun['status'] }) {
  if (status === 'running' || status === 'starting') return <CircleNotch className="spin" aria-hidden="true" />
  if (status === 'succeeded') return <CheckCircle aria-hidden="true" />
  if (status === 'cancelled') return <WarningCircle aria-hidden="true" />
  return <XCircle aria-hidden="true" />
}

function createLiveDefinition(run: LocalAppGraphLiveRun): AppGraphDefinition {
  const positions = createLiveGraphPositions(run)
  const destinationNameById = new Map(run.nodes.map((node) => [node.id, node.name]))
  return {
    schema: 'ansight.app-graph/v1',
    nodes: run.nodes.map((node, index) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      parentScreen: node.parentScreen
        ? destinationNameById.get(node.parentScreen) ?? node.parentScreen
        : undefined,
      synonyms: node.synonyms,
      purpose: node.purpose,
      isEntry: index === 0,
      x: positions.get(node.id)?.x ?? 120,
      y: positions.get(node.id)?.y ?? 120,
      confidence: node.confidence,
    })),
    edges: run.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      action: {
        automationId: edge.automationId,
        semanticMeaning: edge.semanticMeaning,
      },
      confidence: edge.confidence,
    })),
    navigationHosts: (run.navigationHosts ?? []).map((host) => ({
      id: host.id,
      kind: host.kind,
      name: host.name,
      destinationId: host.destinationId,
      activeChildDestinationId: host.activeChildDestinationId,
      childDestinationIds: [...host.childDestinationIds],
      framework: host.framework,
      technology: host.technology,
      confidence: host.confidence,
    })),
    tabGroups: (run.tabGroups ?? []).map((group) => ({
      id: group.id,
      parentDestinationId: group.parentDestinationId,
      selectedDestinationId: group.selectedDestinationId,
      tabDestinationIds: [...group.tabDestinationIds],
      technology: group.technology,
      confidence: group.confidence,
    })),
  }
}

type LiveGraphLayoutUnit = {
  id: string
  primaryNodeId: string | null
  nodeIds: string[]
  originalIndex: number
  width: number
  height: number
  outgoing: Set<string>
  incoming: Set<string>
}

const liveNodeWidth = 212
const liveNodeHeight = 96
const liveChildNodeWidth = 150
const liveChildNodeHeight = 68
const liveChildColumnGap = 44
const liveChildRowGap = 24
const liveParentStateGap = 56
const liveMaximumChildRows = 4
const liveGroupHeaderHeight = 62
const liveGroupPadding = 20
const liveGroupEdgeGutter = 38
const liveLayoutLeft = 64
const liveLayoutTop = 54
const liveLayoutColumnGap = 116
const liveLayoutLayerGap = 52
const liveLayoutRowGap = 80
const liveLayoutTargetColumnHeight = 548

function createLiveGraphPositions(run: LocalAppGraphLiveRun): Map<string, { x: number; y: number }> {
  const unitById = new Map<string, LiveGraphLayoutUnit>()
  const unitIdByNodeId = new Map<string, string>()
  const parentNodeByReference = new Map<string, LocalAppGraphLiveRun['nodes'][number]>()
  const nodeIndexById = new Map(run.nodes.map((node, index) => [node.id, index]))

  for (const node of run.nodes) {
    if (node.parentScreen?.trim()) continue
    parentNodeByReference.set(normalizeLiveGraphReference(node.id), node)
    parentNodeByReference.set(normalizeLiveGraphReference(node.name), node)
    const unit: LiveGraphLayoutUnit = {
      id: node.id,
      primaryNodeId: node.id,
      nodeIds: [node.id],
      originalIndex: nodeIndexById.get(node.id) ?? 0,
      width: liveNodeWidth,
      height: liveNodeHeight,
      outgoing: new Set(),
      incoming: new Set(),
    }
    unitById.set(unit.id, unit)
    unitIdByNodeId.set(node.id, unit.id)
  }

  for (const node of run.nodes) {
    const parentScreen = node.parentScreen?.trim()
    if (!parentScreen) continue
    const parentNode = parentNodeByReference.get(normalizeLiveGraphReference(parentScreen))
    const unitId = parentNode?.id ?? `state-group:${normalizeLiveGraphReference(parentScreen)}`
    const unit = unitById.get(unitId) ?? {
      id: unitId,
      primaryNodeId: null,
      nodeIds: [],
      originalIndex: nodeIndexById.get(node.id) ?? 0,
      width: liveNodeWidth,
      height: liveNodeHeight,
      outgoing: new Set<string>(),
      incoming: new Set<string>(),
    }
    unit.nodeIds.push(node.id)
    unit.originalIndex = Math.min(unit.originalIndex, nodeIndexById.get(node.id) ?? unit.originalIndex)
    unitById.set(unitId, unit)
    unitIdByNodeId.set(node.id, unitId)
  }

  for (const unit of unitById.values()) {
    const stateCount = unit.nodeIds.length - (unit.primaryNodeId ? 1 : 0)
    if (stateCount > 0) {
      const dimensions = estimateLiveCompoundDimensions(stateCount, !!unit.primaryNodeId)
      unit.width = dimensions.width
      unit.height = dimensions.height
    }
  }

  const directionalPairs = new Set<string>()
  for (const edge of run.edges) {
    const fromUnitId = unitIdByNodeId.get(edge.from)
    const toUnitId = unitIdByNodeId.get(edge.to)
    if (!fromUnitId || !toUnitId || fromUnitId === toUnitId) continue
    const pairKey = [fromUnitId, toUnitId].sort().join('\u0000')
    if (directionalPairs.has(pairKey)) continue
    directionalPairs.add(pairKey)
    unitById.get(fromUnitId)?.outgoing.add(toUnitId)
    unitById.get(toUnitId)?.incoming.add(fromUnitId)
  }

  const orderedUnits = [...unitById.values()].sort((left, right) => left.originalIndex - right.originalIndex)
  const roots = orderedUnits.filter((unit) => unit.incoming.size === 0)
  const traversalRoots = roots.length > 0 ? roots : orderedUnits.slice(0, 1)
  const rankByUnitId = new Map<string, number>()
  const queue = traversalRoots.map((unit) => unit.id)
  traversalRoots.forEach((unit) => rankByUnitId.set(unit.id, 0))
  for (let index = 0; index < queue.length; index++) {
    const unitId = queue[index]
    const rank = rankByUnitId.get(unitId) ?? 0
    for (const nextUnitId of unitById.get(unitId)?.outgoing ?? []) {
      if (rankByUnitId.has(nextUnitId)) continue
      rankByUnitId.set(nextUnitId, rank + 1)
      queue.push(nextUnitId)
    }
  }

  let fallbackRank = Math.max(0, ...rankByUnitId.values())
  for (const unit of orderedUnits) {
    if (rankByUnitId.has(unit.id)) continue
    fallbackRank += 1
    rankByUnitId.set(unit.id, fallbackRank)
  }

  const unitsByRank = new Map<number, LiveGraphLayoutUnit[]>()
  for (const unit of orderedUnits) {
    const rank = rankByUnitId.get(unit.id) ?? 0
    const layer = unitsByRank.get(rank) ?? []
    layer.push(unit)
    unitsByRank.set(rank, layer)
  }

  const layers = [...unitsByRank.keys()]
    .sort((left, right) => left - right)
    .map((rank) => {
      const units = unitsByRank.get(rank) ?? []
      return {
        units,
        width: Math.max(liveNodeWidth, ...units.map((unit) => unit.width)),
        height: measureLiveLayerHeight(units),
      }
    })
  const columns: Array<typeof layers> = []
  for (const layer of layers) {
    const column = columns.at(-1)
    const occupiedHeight = column
      ? column.reduce((height, candidate, index) => (
          height + candidate.height + (index === 0 ? 0 : liveLayoutLayerGap)
        ), 0)
      : 0
    if (!column || (occupiedHeight > 0 && occupiedHeight + liveLayoutLayerGap + layer.height > liveLayoutTargetColumnHeight)) {
      columns.push([layer])
    } else {
      column.push(layer)
    }
  }

  const columnHeights = columns.map((column) => column.reduce((height, layer, index) => (
    height + layer.height + (index === 0 ? 0 : liveLayoutLayerGap)
  ), 0))
  const maximumColumnHeight = Math.max(liveNodeHeight, ...columnHeights)
  const positionByUnitId = new Map<string, { x: number; y: number }>()
  let columnX = liveLayoutLeft
  columns.forEach((column, columnIndex) => {
    const columnWidth = Math.max(liveNodeWidth, ...column.map((layer) => layer.width))
    let layerY = liveLayoutTop + (maximumColumnHeight - columnHeights[columnIndex]) / 2
    for (const layer of column) {
      let unitY = layerY
      for (const unit of layer.units) {
        positionByUnitId.set(unit.id, {
          x: columnX + (columnWidth - unit.width) / 2,
          y: unitY,
        })
        unitY += unit.height + liveLayoutRowGap
      }
      layerY += layer.height + liveLayoutLayerGap
    }
    columnX += columnWidth + liveLayoutColumnGap
  })

  const positions = new Map<string, { x: number; y: number }>()
  for (const unit of orderedUnits) {
    const anchor = positionByUnitId.get(unit.id) ?? { x: liveLayoutLeft, y: liveLayoutTop }
    if (unit.primaryNodeId) positions.set(unit.primaryNodeId, anchor)
    const stateNodeIds = unit.nodeIds.filter((nodeId) => nodeId !== unit.primaryNodeId)
    const rows = Math.min(liveMaximumChildRows, Math.max(1, stateNodeIds.length))
    stateNodeIds.forEach((nodeId, index) => {
      const column = Math.floor(index / rows)
      const row = index % rows
      positions.set(nodeId, {
        x: anchor.x + (unit.primaryNodeId ? liveGroupPadding + liveNodeWidth + liveParentStateGap : 0)
          + column * (liveChildNodeWidth + liveChildColumnGap),
        y: anchor.y + row * (liveChildNodeHeight + liveChildRowGap),
      })
    })
  }
  return positions
}

function estimateLiveCompoundDimensions(stateCount: number, hasParent: boolean): { width: number; height: number } {
  const rows = Math.min(liveMaximumChildRows, Math.max(1, stateCount))
  const columns = Math.ceil(stateCount / rows)
  const childGridWidth = columns * liveChildNodeWidth + Math.max(0, columns - 1) * liveChildColumnGap
  const childGridHeight = rows * liveChildNodeHeight + Math.max(0, rows - 1) * liveChildRowGap
  return {
    width: liveGroupPadding * 2 + (hasParent ? liveNodeWidth + liveParentStateGap : 0) + childGridWidth,
    height: liveGroupHeaderHeight + liveGroupPadding * 2
      + Math.max(hasParent ? liveNodeHeight : 0, childGridHeight)
      + liveGroupEdgeGutter,
  }
}

function measureLiveLayerHeight(units: LiveGraphLayoutUnit[]): number {
  return units.reduce((height, unit, index) => (
    height + unit.height + (index === 0 ? 0 : liveLayoutRowGap)
  ), 0)
}

function normalizeLiveGraphReference(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function createEdgeStatuses(run: LocalAppGraphLiveRun): Record<string, AppGraphRunStepStatus> {
  const statuses: Record<string, AppGraphRunStepStatus> = Object.fromEntries(
    run.edges.map((edge) => [edge.id, 'succeeded']),
  )
  const latestEdge = [...run.edges].sort((left, right) => right.updatedUtc.localeCompare(left.updatedUtc))[0]
  if (latestEdge && (run.status === 'running' || run.status === 'starting')) statuses[latestEdge.id] = 'running'
  if (latestEdge && run.status === 'failed') statuses[latestEdge.id] = 'failed'
  return statuses
}

function formatStatus(status: LocalAppGraphLiveRun['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatScrollStatus(status: LocalAppGraphLiveRun['nodes'][number]['scrollStatus']): string {
  if (status === 'not_scrollable') return 'not scrollable'
  if (status === 'in_progress') return 'scrolling in progress'
  if (status === 'complete') return 'scroll coverage complete'
  if (status === 'blocked') return 'scroll coverage blocked'
  return 'scroll coverage unknown'
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatRelativeTime(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

function formatTraceStage(stage: LocalAppGraphLiveRun['trace'][number]['stage']): string {
  return stage.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function formatTraceTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function isTraceError(message: string): boolean {
  return /\b(error|exhausted|failed|rejected|stopped|threw)\b/i.test(message)
}

const emptyDefinition: AppGraphDefinition = {
  schema: 'ansight.app-graph/v1',
  nodes: [],
  edges: [],
}
