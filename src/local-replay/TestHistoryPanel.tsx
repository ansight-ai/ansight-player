import {
  AppWindow,
  ArrowClockwise,
  ArrowSquareOut,
  CaretRight,
  CheckCircle,
  CircleNotch,
  Clock,
  MagnifyingGlass,
  MinusCircle,
  TestTube,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { readTaskCallTrace, taskCallPayloadPreview } from './taskCallTrace'
import type { TaskCallTrace } from './taskCallTrace'
import { readTaskSources, type TaskSourceEntry } from './taskSourceTrace'
import { TaskSourceViewer } from './TaskSourceViewer'
import type {
  LocalTestAppGraphPlan,
  LocalTestAccessibilityTraceEvidence,
  LocalTestAuditPayload,
  LocalTestBatchItemAudit,
  LocalTestHistory,
  LocalTestHistoryInspection,
  LocalTestModelPassAudit,
  LocalTestOcrTraceEvidence,
  LocalTestRunAudit,
  LocalTestStartupStep,
  LocalTestRunSummary,
  LocalTestToolCallAudit,
  LocalRegisteredApp,
} from './types'

type TestHistoryPanelProps = {
  appId?: string | null
  appName?: string | null
  initialRun?: LocalTestRunSummary | null
  onClose: () => void
}

type TestHistoryStatus = 'succeeded' | 'failed' | 'running' | 'pending' | 'cancelled' | 'skipped' | 'unknown'
type TestHistoryStatusFilter = 'all' | TestHistoryStatus

const testHistoryStatusOrder: TestHistoryStatus[] = [
  'succeeded',
  'failed',
  'running',
  'pending',
  'cancelled',
  'skipped',
  'unknown',
]

export function TestHistoryPanel({ appId, appName, initialRun, onClose }: TestHistoryPanelProps) {
  const [apps, setApps] = useState<LocalRegisteredApp[]>([])
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [history, setHistory] = useState<LocalTestHistory | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [inspection, setInspection] = useState<LocalTestHistoryInspection | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInspecting, setIsInspecting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TestHistoryStatusFilter>('all')

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      const [appsResponse, historyResponse] = await Promise.all([
        fetch('api/apps', { cache: 'no-store' }),
        fetch('api/test-history?limit=250', { cache: 'no-store' }),
      ])
      if (!appsResponse.ok || !historyResponse.ok) {
        throw new Error(`The local host returned HTTP ${!appsResponse.ok ? appsResponse.status : historyResponse.status}.`)
      }
      const nextApps = await appsResponse.json() as LocalRegisteredApp[]
      const next = await historyResponse.json() as LocalTestHistory
      const appIdsWithHistory = resolveTestHistoryAppIds(next)
      setApps(nextApps
        .filter((candidate) => appIdsWithHistory.has(candidate.appId.toLowerCase()))
        .sort((left, right) => Number(right.appId === appId) - Number(left.appId === appId)
          || left.name.localeCompare(right.name)))
      setHistory(next)
      const requestedRun = initialRun
        ? next.runs.find((run) => run.runId === initialRun.runId) ?? initialRun
        : null
      setSelectedAppId((current) => requestedRun ? requestedRun.appId ?? appId ?? null : current)
      setSelectedRunId((current) => {
        if (requestedRun) {
          return requestedRun.runId
        }
        if (!current) {
          return null
        }

        const runStillExists = next.runs.some((run) => run.runId === current)
          || next.batches.some((entry) => entry.audit.batchRunId === current)
        return runStillExists ? current : null
      })
      setMessage(null)
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to load test history.'))
    } finally {
      setIsLoading(false)
    }
  }, [appId, initialRun])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadHistory(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadHistory])

  useEffect(() => {
    if (!selectedRunId) {
      return
    }

    let isMounted = true
    async function inspectRun() {
      setIsInspecting(true)
      try {
        const query = new URLSearchParams()
        if (selectedAppId) {
          query.set('appId', selectedAppId)
        }
        const querySuffix = query.size > 0 ? `?${query}` : ''
        const response = await fetch(
          `api/test-history/${encodeURIComponent(selectedRunId!)}${querySuffix}`,
          { cache: 'no-store' },
        )
        if (!response.ok) {
          throw new Error(response.status === 404
            ? 'That test run is no longer present in local history.'
            : `The local host returned HTTP ${response.status}.`)
        }
        const next = await response.json() as LocalTestHistoryInspection
        if (isMounted) {
          setInspection(next)
          setMessage(null)
        }
      } catch (error) {
        if (isMounted) {
          setInspection(null)
          setMessage(resolveErrorMessage(error, 'Unable to inspect the selected test run.'))
        }
      } finally {
        if (isMounted) {
          setIsInspecting(false)
        }
      }
    }
    void inspectRun()
    return () => {
      isMounted = false
    }
  }, [selectedAppId, selectedRunId])

  const selectedApp = apps.find((candidate) => candidate.appId === selectedAppId)
  const selectedAppName = selectedApp?.name
    ?? (selectedAppId === appId ? appName ?? selectedAppId : null)
  const historyItems = useMemo(() => buildTestHistoryItems(history, selectedAppId), [history, selectedAppId])
  const statusCounts = useMemo(() => {
    const counts: Record<TestHistoryStatus, number> = {
      succeeded: 0,
      failed: 0,
      running: 0,
      pending: 0,
      cancelled: 0,
      skipped: 0,
      unknown: 0,
    }
    historyItems.forEach((item) => {
      counts[normalizeRunStatus(item.status)] += 1
    })
    return counts
  }, [historyItems])
  const filteredHistoryItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
    return historyItems.filter((item) => (
      (statusFilter === 'all' || normalizeRunStatus(item.status) === statusFilter)
      && (!normalizedQuery || item.searchText.toLocaleLowerCase().includes(normalizedQuery))
    ))
  }, [historyItems, searchQuery, statusFilter])
  const selectedRun = useMemo(
    () => history?.runs.find((run) => run.runId === selectedRunId)
      ?? (initialRun?.runId === selectedRunId ? initialRun : undefined),
    [history?.runs, initialRun, selectedRunId],
  )
  const selectedHistoryItem = historyItems.find((item) => item.id === selectedRunId)
    ?? (selectedRun ? createTestRunHistoryItem(selectedRun) : undefined)

  function showAppsRoot() {
    setSelectedAppId(null)
    setSelectedRunId(null)
    setInspection(null)
    setMessage(null)
    setSearchQuery('')
    setStatusFilter('all')
  }

  function openApp(nextAppId: string) {
    setSelectedAppId(nextAppId)
    setSelectedRunId(null)
    setInspection(null)
    setMessage(null)
    setSearchQuery('')
    setStatusFilter('all')
  }

  function openRun(runId: string) {
    setSelectedRunId(runId)
    setInspection(null)
  }

  return (
    <div className="local-test-history-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) {
        onClose()
      }
    }}>
      <section aria-label="Test history" className="local-test-history-panel">
        <header>
          <div>
            <p className="eyebrow">Test history</p>
          </div>
          <div className="local-test-history-header-actions">
            <a className="button button--secondary" href="https://www.ansight.ai/docs/workspace/tests" rel="noopener noreferrer" target="_blank">Tests help <ArrowSquareOut aria-hidden="true" /></a>
            <button aria-label="Refresh test history" className="local-icon-button" disabled={isLoading} onClick={() => void loadHistory()} type="button">
              <ArrowClockwise className={isLoading ? 'spin' : undefined} aria-hidden="true" />
            </button>
            <button aria-label="Close test history" className="local-icon-button" onClick={onClose} type="button">
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="local-test-history-body">
          <nav aria-label="Test history explorer breadcrumb" className="local-test-history-breadcrumb">
            {selectedAppName ? <button onClick={showAppsRoot} type="button">Home</button> : <strong>Home</strong>}
            {selectedAppName ? <><CaretRight aria-hidden="true" />{selectedHistoryItem ? (
              <button onClick={() => {
                setSelectedRunId(null)
                setInspection(null)
              }} type="button">{selectedAppName}</button>
            ) : <strong>{selectedAppName}</strong>}</> : null}
            {selectedHistoryItem ? <><CaretRight aria-hidden="true" /><strong>{selectedHistoryItem.title}</strong></> : null}
          </nav>

          {selectedAppName && !selectedHistoryItem && historyItems.length > 0 ? (
            <div className="local-test-history-toolbar">
              <label className="local-test-history-search">
                <MagnifyingGlass aria-hidden="true" />
                <input
                  aria-label="Search test runs"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search tests, run IDs, sessions…"
                  type="search"
                  value={searchQuery}
                />
              </label>
              <div aria-label="Filter test runs by outcome" className="local-test-history-filters" role="group">
                <button
                  aria-pressed={statusFilter === 'all'}
                  className={statusFilter === 'all' ? 'local-test-history-filter local-test-history-filter--active' : 'local-test-history-filter'}
                  onClick={() => setStatusFilter('all')}
                  type="button"
                >
                  All <span>{historyItems.length}</span>
                </button>
                {testHistoryStatusOrder.filter((status) => statusCounts[status] > 0).map((status) => (
                  <button
                    aria-pressed={statusFilter === status}
                    className={`local-test-history-filter local-test-history-filter--${status}${statusFilter === status ? ' local-test-history-filter--active' : ''}`}
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    type="button"
                  >
                    {formatStatusLabel(status)} <span>{statusCounts[status]}</span>
                  </button>
                ))}
              </div>
              <span aria-live="polite" className="local-test-history-result-count">
                {filteredHistoryItems.length} of {historyItems.length} shown
              </span>
            </div>
          ) : null}

          {message ? <p className="inline-message local-test-history-message">{message}</p> : null}
          {!selectedAppName ? isLoading && !history ? (
            <div className="local-test-history-empty">
              <CircleNotch className="spin" aria-hidden="true" />
              <strong>Loading test history</strong>
            </div>
          ) : apps.length > 0 ? (
            <div className="local-trends-app-grid" aria-label="Apps with test history">
              {apps.map((candidate) => {
                const runCount = buildTestHistoryItems(history, candidate.appId).length
                return (
                  <button className="local-trends-app" key={candidate.appId} onClick={() => openApp(candidate.appId)} type="button">
                    <span className="local-trends-app-icon" aria-hidden="true">
                      <AppWindow />
                      <img
                        alt=""
                        onError={(event) => { event.currentTarget.hidden = true }}
                        src={`api/apps/${encodeURIComponent(candidate.appId)}/icon`}
                      />
                    </span>
                    <span className="local-trends-app-copy">
                      <strong>{candidate.name}</strong>
                      <small>{candidate.appId}</small>
                      <span>{runCount} test run{runCount === 1 ? '' : 's'}</span>
                    </span>
                    <CaretRight aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="local-test-history-empty">
              <TestTube aria-hidden="true" />
              <strong>No apps with test history</strong>
              <span>An app appears here after its first workspace test or Run All batch.</span>
            </div>
          ) : selectedHistoryItem ? (
            <main className="local-test-history-detail local-test-history-detail--explorer">
              {isInspecting ? (
                <div className="local-test-history-empty">
                  <CircleNotch className="spin" aria-hidden="true" />
                  <strong>Loading execution audit</strong>
                </div>
              ) : inspection ? (
                <InspectionDetail
                  inspection={inspection}
                  standaloneRunName={selectedRun?.displayName}
                />
              ) : null}
            </main>
          ) : historyItems.length > 0 && filteredHistoryItems.length > 0 ? (
            <div className="local-test-history-run-grid" aria-label={`${selectedAppName} test runs`}>
              {filteredHistoryItems.map((item) => {
                const status = normalizeRunStatus(item.status)
                return (
                  <button
                    className={`local-test-history-run-card local-test-history-run-card--${status}`}
                    key={item.id}
                    onClick={() => openRun(item.id)}
                    type="button"
                  >
                    <span className="local-test-history-run-outcome">
                      <StatusIcon status={status} />
                      <strong>{formatStatusLabel(status)}</strong>
                    </span>
                    <span className="local-test-history-run-copy">
                      <small>{item.kind === 'batch' ? 'Run All batch' : 'Test execution'}</small>
                      <strong>{item.title}</strong>
                      <span>{formatDate(item.startedUtc)} · {item.detail}</span>
                    </span>
                    <CaretRight aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          ) : historyItems.length > 0 ? (
            <div className="local-test-history-empty local-test-history-empty--filtered">
              <MagnifyingGlass aria-hidden="true" />
              <strong>No matching test runs</strong>
              <span>Try another search or outcome filter.</span>
              <button onClick={() => {
                setSearchQuery('')
                setStatusFilter('all')
              }} type="button">Clear filters</button>
            </div>
          ) : (
            <div className="local-test-history-empty">
              <TestTube aria-hidden="true" />
              <strong>No test history yet</strong>
              <span>Run a workspace test or use <code>ansight test run-all</code>. Its audit will appear here.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

type TestHistoryItem = {
  id: string
  kind: 'batch' | 'run'
  title: string
  status: string
  startedUtc: string
  detail: string
  searchText: string
}

function resolveTestHistoryAppIds(history: LocalTestHistory) {
  return new Set([
    ...history.batches.flatMap((entry) => entry.audit.tests.map((test) => test.appId.toLowerCase())),
    ...history.runs.flatMap((run) => run.appId ? [run.appId.toLowerCase()] : []),
  ])
}

function buildTestHistoryItems(history: LocalTestHistory | null, appId?: string | null): TestHistoryItem[] {
  if (!history) {
    return []
  }
  const normalizedAppId = appId?.toLowerCase()
  const batches = history.batches.flatMap((entry): TestHistoryItem[] => {
    const matchingTests = normalizedAppId
      ? entry.audit.tests.filter((test) => test.appId.toLowerCase() === normalizedAppId)
      : entry.audit.tests
    if (matchingTests.length === 0) {
      return []
    }
    return [{
      id: entry.audit.batchRunId,
      kind: 'batch',
      title: workspaceName(entry.audit.workspacePath),
      status: entry.audit.status,
      startedUtc: entry.audit.startedUtc,
      detail: `${matchingTests.length} test${matchingTests.length === 1 ? '' : 's'} · ${matchingTests.reduce((total, test) => total + test.totalTokens, 0).toLocaleString()} tokens`,
      searchText: [
        entry.audit.batchRunId,
        entry.audit.workspacePath,
        entry.audit.status,
        entry.audit.message,
        ...matchingTests.flatMap((test) => [
          test.testId,
          test.testName,
          test.appId,
          test.status,
          test.message,
          test.agentRunId,
          test.sessionId,
        ]),
      ].filter(Boolean).join(' '),
    }]
  })
  const runs = history.runs.flatMap((run): TestHistoryItem[] => {
    if (run.batchRunId || (normalizedAppId && run.appId?.toLowerCase() !== normalizedAppId)) {
      return []
    }
    return [createTestRunHistoryItem(run)]
  })
  return [...batches, ...runs].sort((left, right) => Date.parse(right.startedUtc) - Date.parse(left.startedUtc))
}

function createTestRunHistoryItem(run: LocalTestRunSummary): TestHistoryItem {
  const cost = run.calculatedCost ? ` · ${formatCalculatedRunCost(run.calculatedCost)}` : ''
  return {
    id: run.runId,
    kind: 'run',
    title: run.displayName,
    status: run.status,
    startedUtc: run.startedUtc,
    detail: `${run.totalTokens.toLocaleString()} tokens · ${formatDuration(run.durationMilliseconds)}${cost}`,
    searchText: [
      run.runId,
      run.workspacePath,
      run.testId,
      run.testName,
      run.displayName,
      run.appId,
      run.sessionId,
      run.reasoning,
      run.status,
      run.message,
      run.filePath,
    ].filter(Boolean).join(' '),
  }
}

function InspectionDetail({
  inspection,
  standaloneRunName,
}: {
  inspection: LocalTestHistoryInspection
  standaloneRunName?: string
}) {
  const requestedRun = inspection.runs.find((entry) => entry.audit.runId === inspection.requestedRunId)?.audit
  if (requestedRun) {
    return <RunAuditDetail audit={requestedRun} displayName={standaloneRunName} />
  }

  const batch = inspection.batch?.audit
  if (batch) {
    const runsById = new Map(inspection.runs.map((entry) => [entry.audit.runId, entry.audit]))
    return (
      <>
        <div className="local-test-history-detail-heading">
          <div>
            <p className="eyebrow">Run All batch</p>
            <h3>{workspaceName(batch.workspacePath)}</h3>
            <span>{batch.batchRunId}</span>
          </div>
          <StatusBadge status={batch.status} />
        </div>
        <p className="local-test-history-summary">{batch.message}</p>
        <div className="local-test-history-metrics">
          <Metric label="Passed" value={batch.passedCount} />
          <Metric label="Failed" value={batch.failedCount} />
          <Metric label="Skipped" value={batch.skippedCount} />
          <Metric label="Tokens" value={batch.totalTokens.toLocaleString()} />
        </div>
        <dl className="local-test-history-metadata">
          <div><dt>Workspace</dt><dd>{batch.workspacePath}</dd></div>
          <div><dt>Window</dt><dd>{formatDate(batch.startedUtc)} → {batch.completedUtc ? formatDate(batch.completedUtc) : 'Running'}</dd></div>
          <div><dt>Runner</dt><dd>{batch.source} · {batch.reasoning ?? 'Unknown reasoning'} · {formatDuration(batch.durationMilliseconds)}</dd></div>
          <div><dt>Limits</dt><dd>{batch.maximumRoundTrips} round trips · {batch.maximumToolCalls} tool calls</dd></div>
        </dl>
        <div className="local-test-history-tests">
          {batch.tests.map((test) => (
            <TestAuditCard audit={test.agentRunId ? runsById.get(test.agentRunId) : undefined} key={`${test.index}:${test.testId}`} test={test} />
          ))}
        </div>
      </>
    )
  }

  const run = inspection.runs[0]?.audit
  return run ? <RunAuditDetail audit={run} displayName={standaloneRunName} /> : null
}

function TestAuditCard({ test, audit }: { test: LocalTestBatchItemAudit, audit?: LocalTestRunAudit }) {
  const cost = audit?.calculatedCost ? ` · ${formatCalculatedRunCost(audit.calculatedCost)}` : ''
  return (
    <details className="local-test-history-test-card" open={test.status === 'failed'}>
      <summary>
        <StatusIcon status={test.status} />
        <span>
          <strong>{test.index}. {test.testName}</strong>
          <small>{test.testId} · {test.appId}</small>
        </span>
        <span className="local-test-history-test-stats">{test.totalTokens.toLocaleString()} tokens · {formatDuration(test.durationMilliseconds)}{cost}</span>
      </summary>
      <div className="local-test-history-test-body">
        <p>{test.message}</p>
        {audit ? <RunAuditExecutions audit={audit} /> : <span className="local-test-history-muted">No model execution audit was created for this item.</span>}
      </div>
    </details>
  )
}

function RunAuditDetail({ audit, displayName }: { audit: LocalTestRunAudit, displayName?: string }) {
  return (
    <>
      <div className="local-test-history-detail-heading">
        <div>
          <h3>{displayName || audit.workspaceTestName || audit.workspaceTestId || instructionTitle(audit.instructions[0]?.instruction)}</h3>
        </div>
        <StatusBadge status={normalizeRunStatus(audit.status)} />
      </div>
      <div className="local-test-run-summary">
        <span>{formatDuration(audit.durationMilliseconds)}</span>
        <span>{audit.tokens.totalTokens.toLocaleString()} tokens</span>
        <span>{audit.modelPassCount} model passes</span>
        <span>{audit.ansightToolCallCount} tool calls</span>
        {audit.calculatedCost ? <span>{formatCalculatedRunCost(audit.calculatedCost)}</span> : null}
      </div>
      <RunAuditExecutions audit={audit} />
    </>
  )
}

function RunAuditExecutions({ audit }: { audit: LocalTestRunAudit }) {
  return (
    <div className="local-test-history-executions">
      <details className="local-test-run-details">
        <summary>Run details</summary>
      <dl className="local-test-history-metadata">
        <div><dt>App</dt><dd>{audit.appId || 'Unknown'}</dd></div>
        <div><dt>Session</dt><dd>{audit.sessionId}</dd></div>
        <div><dt>Reasoning</dt><dd>{audit.reasoning ?? 'Not recorded'}</dd></div>
        <div><dt>Window</dt><dd>{formatDate(audit.startedUtc)} → {formatDate(audit.completedUtc)}</dd></div>
        <div><dt>Run</dt><dd>{audit.runId}</dd></div>
        <div><dt>AI protocol</dt><dd>{connectionLabel(audit.openAiProtocol, {
          http: 'HTTP', websocket: 'WebSocket', 'http-fallback': 'HTTP (fell back from WebSocket)',
        })}</dd></div>
        <div><dt>AI connection</dt><dd>{connectionLabel(audit.openAiTransport, {
          direct: 'Direct API key', 'workload-identity': 'Workload identity', 'hosted-proxy': 'Hosted proxy',
        })}</dd></div>
      </dl>
      {audit.instructions.map((instruction) => (
        <article key={instruction.index}>
          <div>
            <StatusBadge status={normalizeRunStatus(instruction.status)} />
            <strong>Instruction {instruction.index}</strong>
            <span>{instruction.turns} turn(s) · {instruction.toolCalls} call(s)</span>
          </div>
          <p>{instruction.summary}</p>
        </article>
      ))}
      </details>
      <RunAuditGraph audit={audit} key={audit.runId} />
    </div>
  )
}

function connectionLabel(value: string | null | undefined, labels: Record<string, string>): string {
  return value ? labels[value] ?? value : 'Not recorded'
}

type AuditGraphNodeKind = 'context' | 'app-graph' | 'model' | 'task' | 'ui' | 'tool' | 'result'

type AuditGraphDetail = {
  label: string
  value: string
  code?: boolean
  truncated?: boolean
  sha256?: string
}

type AuditGraphNode = {
  id: string
  kind: AuditGraphNodeKind
  title: string
  subtitle: string
  durationMilliseconds: number
  elapsedMilliseconds: number
  tokenDelta: number
  cumulativeTokens: number
  isError: boolean
  details: AuditGraphDetail[]
  ocrEvidence?: LocalTestOcrTraceEvidence | null
  accessibilityEvidence?: LocalTestAccessibilityTraceEvidence | null
  taskCallTrace?: TaskCallTrace
  taskSources?: TaskSourceEntry[]
  startupAudit?: LocalTestRunAudit
  modelPass?: LocalTestModelPassAudit
  requestedTools?: LocalTestToolCallAudit[]
}

type TraceEvidenceSelection =
  | { kind: 'ocr', evidence: LocalTestOcrTraceEvidence }
  | { kind: 'accessibility', evidence: LocalTestAccessibilityTraceEvidence }

function RunAuditGraph({ audit }: { audit: LocalTestRunAudit }) {
  const nodes = useMemo(() => buildAuditGraphNodes(audit), [audit])
  const [traceView, setTraceView] = useState<'graph' | 'timeline' | 'table'>('graph')
  const [selectedNodeId, setSelectedNodeId] = useState('context')
  const [isRevealing, setIsRevealing] = useState(false)
  const [revealMessage, setRevealMessage] = useState<string | null>(null)
  const [evidenceSelection, setEvidenceSelection] = useState<TraceEvidenceSelection | null>(null)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const bundleUrl = `api/test-history/${encodeURIComponent(audit.runId)}/export${audit.appId ? `?appId=${encodeURIComponent(audit.appId)}` : ''}`

  async function revealTrace() {
    setIsRevealing(true)
    setRevealMessage(null)
    try {
      const response = await fetch(`api/test-history/${encodeURIComponent(audit.runId)}/reveal${audit.appId ? `?appId=${encodeURIComponent(audit.appId)}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) throw new Error(await response.text() || `Could not open the trace folder: the local host returned HTTP ${response.status}.`)
      setRevealMessage('Trace selected in its folder on the host computer.')
    } catch (error) {
      setRevealMessage(error instanceof Error ? error.message : 'Could not show the trace folder.')
    } finally {
      setIsRevealing(false)
    }
  }

  if (audit.traceEnabled === false) {
    return (
      <section className="local-test-trace local-test-trace--disabled">
        <header>
          <div>
            <p className="eyebrow">Evaluation trace</p>
            <h4>Trace not captured</h4>
            <span>{audit.tokens.totalTokens.toLocaleString()} tokens · {formatDuration(audit.durationMilliseconds)}</span>
          </div>
        </header>
        <p>Rerun with <code>--trace</code> to capture model context, tool payloads, App Graph details, and exportable trace data.</p>
      </section>
    )
  }

  return (
    <section className="local-test-trace">
      <header>
        <div>
          <h4>Execution trace <span className="local-test-trace-count">{nodes.length} nodes</span></h4>
        </div>
        <div className="local-test-trace-actions">
          <button disabled={isRevealing} onClick={() => void revealTrace()} type="button">{isRevealing ? 'Opening…' : 'Show trace in folder'}</button>
          <button onClick={() => downloadTraceJson(audit)} type="button">Export trace JSON</button>
          <a download href={bundleUrl}>Export session + trace</a>
        </div>
      </header>
      {revealMessage ? <p role="status">{revealMessage}</p> : null}
      <div className="local-startup-view-switch" role="group" aria-label="Trace view">
        <button type="button" aria-pressed={traceView === 'graph'} onClick={() => setTraceView('graph')}>Graph</button>
        <button type="button" aria-pressed={traceView === 'timeline'} onClick={() => setTraceView('timeline')}>Timeline</button>
        <button type="button" aria-pressed={traceView === 'table'} onClick={() => setTraceView('table')}>Table</button>
      </div>
      <div className="local-trace-workspace">
      <div className="local-trace-overview">
      {traceView === 'graph' ? <TraceNodeGraph nodes={nodes} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} /> :
      <FullTraceTimeline audit={audit} view={traceView} onSelectNode={(id) => {
        setSelectedNodeId(id)
        requestAnimationFrame(() => document.querySelector('.local-trace-detail-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
      }} />}
      </div>
      {selectedNode ? <section className="local-trace-detail-panel" aria-label="Selected step details">
      <button type="button" onClick={() => setSelectedNodeId('')}>Close details</button>
      <TraceNodeInspector node={selectedNode} onOpenEvidence={setEvidenceSelection} onSelectNode={(id) => {
        setSelectedNodeId(id)
        requestAnimationFrame(() => document.querySelector('.local-test-trace-inspector')?.scrollIntoView({ block: 'start' }))
      }} />
      </section> : null}
      </div>
      {evidenceSelection ? (
        <TraceEvidenceModal
          audit={audit}
          onClose={() => setEvidenceSelection(null)}
          selection={evidenceSelection}
        />
      ) : null}
    </section>
  )
}

function TraceNodeGraph({ nodes, selectedNodeId, onSelectNode }: {
  nodes: AuditGraphNode[]
  selectedNodeId: string
  onSelectNode: (id: string) => void
}) {
  return (
    <>
      <div className="local-test-trace-legend" aria-label="Trace node legend">
        {(['context', 'app-graph', 'model', 'task', 'ui', 'tool', 'result'] as AuditGraphNodeKind[]).map((kind) => (
          <span key={kind}><i className={`local-test-trace-dot local-test-trace-dot--${kind}`} />{graphKindLabel(kind)}</span>
        ))}
      </div>
      <div className="local-test-trace-scroll" role="region" tabIndex={0} aria-label="Chronological agent execution graph">
        <div className="local-test-trace-graph" role="list">
          {nodes.map((node, index) => (
            <div className="local-test-trace-step" key={node.id} role="listitem">
              {index > 0 ? <span className="local-test-trace-edge" aria-hidden="true"><i /></span> : null}
              <button
                aria-pressed={selectedNodeId === node.id}
                className={`local-test-trace-node local-test-trace-node--${node.kind}${node.isError ? ' local-test-trace-node--error' : ''}`}
                onClick={() => onSelectNode(node.id)}
                type="button"
              >
                <span className="local-test-trace-node-kind">{graphKindLabel(node.kind)}</span>
                <strong>{node.title}</strong>
                <small>{node.subtitle}</small>
                <span className="local-test-trace-node-stats">
                  <span>{node.tokenDelta > 0 ? `+${node.tokenDelta.toLocaleString()}` : '0'} tokens</span>
                  <span>{formatDuration(node.durationMilliseconds)}</span>
                </span>
                <span className="local-test-trace-node-cumulative">
                  Σ {node.cumulativeTokens.toLocaleString()} · T+{formatDuration(node.elapsedMilliseconds)}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function TraceNodeInspector({
  node,
  onOpenEvidence,
  onSelectNode,
}: {
  node: AuditGraphNode
  onOpenEvidence: (selection: TraceEvidenceSelection) => void
  onSelectNode: (id: string) => void
}) {
  return (
    <div className="local-test-trace-inspector">
      <header>
        <span className={`local-test-trace-node-kind local-test-trace-node-kind--${node.kind}`}>{graphKindLabel(node.kind)}</span>
        <div>
          <strong>{node.title}</strong>
          <span>{node.subtitle}</span>
        </div>
        <span>{node.tokenDelta.toLocaleString()} tokens · {formatDuration(node.durationMilliseconds)} · T+{formatDuration(node.elapsedMilliseconds)}</span>
      </header>
      {node.modelPass ? <AgentPassBreakdown key={`pass:${node.id}`} pass={node.modelPass} tools={node.requestedTools ?? []} onSelectNode={onSelectNode} /> : null}
      {node.startupAudit ? <StartupTiming audit={node.startupAudit} /> : null}
      {node.kind === 'task' && node.taskSources ? <TaskSourceViewer key={`source:${node.id}`} sources={node.taskSources} /> : null}
      {node.kind === 'task' && node.taskCallTrace ? <TaskCallResults key={`calls:${node.id}`} trace={node.taskCallTrace} /> : null}
      {node.ocrEvidence || node.accessibilityEvidence ? (
        <div className="local-test-trace-evidence-actions">
          {node.ocrEvidence ? (
            <button onClick={() => onOpenEvidence({ kind: 'ocr', evidence: node.ocrEvidence! })} type="button">
              View OCR screenshot + matches
            </button>
          ) : null}
          {node.accessibilityEvidence ? (
            <button onClick={() => onOpenEvidence({ kind: 'accessibility', evidence: node.accessibilityEvidence! })} type="button">
              View visual tree wireframe
            </button>
          ) : null}
        </div>
      ) : null}
      <div>
        {node.details.map((detail, index) => (
          <details key={`${detail.label}:${index}`} open={index === 0}>
            <summary>
              {detail.label}
              {detail.truncated ? <span>truncated · {detail.sha256}</span> : null}
            </summary>
            {detail.code ? <pre>{prettyAuditContent(detail.value)}</pre> : <p>{detail.value || 'No value recorded.'}</p>}
          </details>
        ))}
      </div>
    </div>
  )
}

function TaskCallResults({ trace }: { trace: TaskCallTrace }) {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(trace.rows[0]?.id ?? null)
  const failedCalls = trace.rows.filter((row) => row.call.isError).length
  return (
    <section aria-label="Task API call results" className="local-task-call-results">
      <header>
        <div><strong>API call results</strong><span>{trace.rows.length} call{trace.rows.length === 1 ? '' : 's'} · {failedCalls} failed</span></div>
        {trace.rows.length > 0 ? <p>Select a call to inspect its inputs and outputs.</p> : null}
      </header>
      {trace.message ? <p className="local-task-call-notice">{trace.message}</p> : null}
      {trace.rows.length > 0 ? (
        <div className="local-task-call-table-scroll">
          <table className="local-task-call-table">
            <thead><tr><th scope="col">#</th><th scope="col">API call</th><th scope="col">Status</th><th scope="col">Started (UTC)</th><th scope="col">Duration</th><th scope="col">Inputs</th><th scope="col">Outputs</th></tr></thead>
            <tbody>
              {trace.rows.map(({ id, sequenceLabel, depth, call }) => {
                const selected = selectedCallId === id
                const detailsId = `task-call-details-${id.replaceAll('/', '-')}`
                return (
                  <Fragment key={id}>
                    <tr className={`local-task-call-row${selected ? ' local-task-call-row--selected' : ''}`} onClick={() => setSelectedCallId(id)}>
                      <td>{sequenceLabel}</td>
                      <th scope="row" style={{ paddingLeft: `${10 + Math.min(depth, 8) * 12}px` }}>
                        <button aria-controls={selected ? detailsId : undefined} aria-expanded={selected} onClick={(event) => {
                          event.stopPropagation()
                          setSelectedCallId(selected ? null : id)
                        }} type="button"><CaretRight aria-hidden="true" /><span>{call.toolName}</span></button>
                      </th>
                      <td><span className={`local-task-call-status${call.isError ? ' local-task-call-status--failed' : ''}`}>{call.isError ? <XCircle aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}{call.isError ? 'Failed' : 'Succeeded'}</span></td>
                      <td><time dateTime={call.startedAtUtc ?? undefined}>{formatTaskCallTime(call.startedAtUtc)}</time></td>
                      <td className="local-task-call-duration">{call.durationMilliseconds.toLocaleString()} ms</td>
                      <td><span className="local-task-call-preview" title={taskCallPayloadPreview(call.arguments)}>{taskCallPayloadPreview(call.arguments)}</span></td>
                      <td><span className="local-task-call-preview" title={taskCallPayloadPreview(call.result)}>{taskCallPayloadPreview(call.result)}</span></td>
                    </tr>
                    {selected ? (
                      <tr className="local-task-call-detail-row"><td colSpan={7}>
                        <div className="local-task-call-detail" id={detailsId}>
                          <div className="local-task-call-metadata">
                            {call.message ? <p>{call.message}</p> : null}
                            <span>Started (UTC): {formatTaskCallTime(call.startedAtUtc)} · Completed (UTC): {formatTaskCallTime(call.completedAtUtc)} · {call.durationMilliseconds.toLocaleString()} ms</span>
                            {call.correlationId ? <span>Correlation ID: {call.correlationId}</span> : null}
                          </div>
                          <div className="local-task-call-payloads">
                            <TaskCallPayload label="Inputs" payload={call.arguments} />
                            <TaskCallPayload label="Outputs" payload={call.result} />
                          </div>
                        </div>
                      </td></tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

function TaskCallPayload({ label, payload }: { label: string, payload?: LocalTestAuditPayload | null }) {
  return (
    <section className="local-task-call-payload">
      <h5>{label}</h5>
      {payload ? <>
        {payload.wasTruncated ? <p className="local-task-call-truncated">Truncated · showing {payload.content.length.toLocaleString()} of {payload.originalCharacterCount.toLocaleString()} characters{payload.sha256 ? <span>SHA-256: {payload.sha256}</span> : null}</p> : null}
        <pre>{prettyAuditContent(payload.content) || '(empty payload)'}</pre>
      </> : <p className="local-task-call-notice">Not recorded in this trace. Rerun with --trace to capture call inputs and outputs.</p>}
    </section>
  )
}

function formatTaskCallTime(value?: string | null): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('T', ' ').replace('Z', '')
}

type TraceBounds = { x: number, y: number, width: number, height: number }

type OcrMatch = {
  text: string
  confidence: number
  bounds: TraceBounds
}

type AccessibilityTreeRow = {
  key: string
  depth: number
  type: string
  role: string
  text: string
  automationId: string
  actions: string[]
  bounds: TraceBounds | null
  raw: Record<string, unknown>
}

function TraceEvidenceModal({
  audit,
  selection,
  onClose,
}: {
  audit: LocalTestRunAudit
  selection: TraceEvidenceSelection
  onClose: () => void
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="local-trace-evidence-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }} role="presentation">
      <section aria-label={selection.kind === 'ocr' ? 'OCR trace evidence' : 'Visual tree trace evidence'} aria-modal="true" className="local-trace-evidence-modal" role="dialog">
        <header>
          <div>
            <p className="eyebrow">Captured trace evidence</p>
            <h3>{selection.kind === 'ocr' ? 'OCR screenshot + matches' : 'Visual tree snapshot'}</h3>
          </div>
          <button aria-label="Close trace evidence" className="local-icon-button" onClick={onClose} type="button"><X aria-hidden="true" /></button>
        </header>
        {selection.kind === 'ocr'
          ? <OcrEvidenceView audit={audit} evidence={selection.evidence} />
          : <AccessibilityEvidenceView evidence={selection.evidence} />}
      </section>
    </div>
  )
}

function OcrEvidenceView({ audit, evidence }: { audit: LocalTestRunAudit, evidence: LocalTestOcrTraceEvidence }) {
  const matches = useMemo(() => readOcrMatches(evidence), [evidence])
  const imageUrl = evidence.screenshotPath
    ? `api/test-history/${encodeURIComponent(audit.runId)}/evidence?path=${encodeURIComponent(evidence.screenshotPath)}${audit.appId ? `&appId=${encodeURIComponent(audit.appId)}` : ''}`
    : null
  return (
    <div className="local-trace-ocr-layout">
      <div className="local-trace-ocr-stage">
        {imageUrl ? (
          <div className="local-trace-ocr-image">
            <img alt="Screen captured for OCR" src={imageUrl} />
            <div aria-label={`${matches.length} OCR match overlays`} className="local-trace-ocr-overlays">
              {matches.map((match, index) => (
                <span
                  className="local-trace-ocr-match"
                  key={`${index}:${match.text}`}
                  style={boundsStyle(match.bounds)}
                  title={`${match.text} · ${Math.round(match.confidence * 100)}%`}
                ><i>{match.text}</i></span>
              ))}
            </div>
          </div>
        ) : <p className="local-trace-evidence-empty">The trace contains OCR results but no persisted screenshot.</p>}
      </div>
      <aside className="local-trace-evidence-list">
        <header><strong>{matches.length} detected region{matches.length === 1 ? '' : 's'}</strong><span>{evidence.provider || 'OCR'} · {evidence.screenWidth}×{evidence.screenHeight}</span></header>
        <ol>
          {matches.map((match, index) => (
            <li key={`${index}:${match.text}`}>
              <strong>{match.text || '(empty)'}</strong>
              <span>{Math.round(match.confidence * 100)}% · {formatBounds(match.bounds)}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}

function AccessibilityEvidenceView({ evidence }: { evidence: LocalTestAccessibilityTraceEvidence }) {
  const snapshot = useMemo(() => parseJsonRecord(evidence.snapshot.content), [evidence.snapshot.content])
  const rows = useMemo(() => readAccessibilityRows(snapshot), [snapshot])
  const framedRows = rows.filter((row) => row.bounds)
  const viewport = isJsonRecord(snapshot?.viewport) ? snapshot.viewport : null
  const viewportWidth = readFiniteNumber(viewport?.width)
  const viewportHeight = readFiniteNumber(viewport?.height)
  return (
    <div className="local-trace-accessibility-layout">
      <section className="local-trace-accessibility-wireframe">
        <header><strong>Viewport wireframe</strong><span>{evidence.source} · {framedRows.length} framed node{framedRows.length === 1 ? '' : 's'}</span></header>
        <div className="local-trace-accessibility-stage" style={viewportWidth && viewportHeight ? { aspectRatio: `${viewportWidth} / ${viewportHeight}` } : undefined}>
          {framedRows.map((row, index) => (
            <span
              className="local-trace-accessibility-box"
              data-depth={Math.min(row.depth, 5)}
              key={row.key}
              style={boundsStyle(row.bounds!)}
              title={accessibilityRowLabel(row)}
            ><i>{index + 1}</i></span>
          ))}
        </div>
      </section>
      <section className="local-trace-accessibility-tree">
        <header><strong>Semantic tree</strong><span>{rows.length} captured node{rows.length === 1 ? '' : 's'}{evidence.snapshot.wasTruncated ? ' · trace payload truncated' : ''}</span></header>
        <ol>
          {rows.map((row, index) => (
            <li key={row.key} style={{ paddingLeft: `${10 + Math.min(row.depth, 12) * 15}px` }}>
              <details>
                <summary>
                  <i>{index + 1}</i>
                  <span><strong>{row.text || row.automationId || row.type}</strong><small>{row.type}{row.role ? ` · ${row.role}` : ''}{row.automationId ? ` · #${row.automationId}` : ''}</small></span>
                  <em>{row.actions.join(', ') || 'observe'}</em>
                </summary>
                <pre>{JSON.stringify(row.raw, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function readOcrMatches(evidence: LocalTestOcrTraceEvidence): OcrMatch[] {
  const value = parseJsonRecord(evidence.results.content)
  return Array.isArray(value?.detections)
    ? value.detections.flatMap((candidate): OcrMatch[] => {
        if (!isJsonRecord(candidate)) return []
        const bounds = readBounds(candidate.normalizedBounds)
        if (!bounds) return []
        return [{
          text: typeof candidate.text === 'string' ? candidate.text : '',
          confidence: readFiniteNumber(candidate.confidence) ?? 0,
          bounds,
        }]
      })
    : []
}

function readLegacyAccessibilityEvidence(call: LocalTestToolCallAudit): LocalTestAccessibilityTraceEvidence | null {
  if (call.toolName !== 'ansight_get_live_visual_tree') return null
  const envelope = parseJsonRecord(call.result.content)
  const result = isJsonRecord(envelope?.result) ? envelope.result : null
  if (!result || (!isJsonRecord(result.root) && result.toolId !== 'device.accessibility')) return null
  const content = JSON.stringify(result)
  return {
    source: typeof result.toolId === 'string' ? result.toolId : 'Visual tree',
    capturedAtUtc: typeof result.capturedAtUtc === 'string' ? result.capturedAtUtc : call.startedUtc,
    nodeCount: readFiniteNumber(result.nodeCount) ?? 0,
    snapshotId: null,
    snapshot: {
      content,
      originalCharacterCount: content.length,
      wasTruncated: call.result.wasTruncated || result.truncated === true,
      sha256: call.result.sha256,
    },
  }
}

function readAccessibilityRows(snapshot: Record<string, unknown> | null): AccessibilityTreeRow[] {
  if (!snapshot) return []
  const types = Array.isArray(snapshot.types)
    ? snapshot.types.map((value) => typeof value === 'string' ? value : 'Element')
    : []
  const rows: AccessibilityTreeRow[] = []
  const root = isJsonRecord(snapshot.root) ? snapshot.root : null
  if (root) {
    appendAccessibilityNode(rows, root, 0, 'root', types)
  }
  if (Array.isArray(snapshot.nodes)) {
    snapshot.nodes.forEach((value, index) => {
      if (!isJsonRecord(value)) return
      const ancestorDepth = Array.isArray(value.ancestorPath) ? value.ancestorPath.length : 0
      appendAccessibilityNode(rows, value, Math.max(1, ancestorDepth), `node-${index}`, types, false)
    })
  }
  // Model-facing visual-tree observations use absolute viewport coordinates.
  // Accessibility evidence already carries normalized bounds.
  const viewport = isJsonRecord(snapshot.viewport) ? snapshot.viewport : null
  const width = readFiniteNumber(viewport?.width)
  const height = readFiniteNumber(viewport?.height)
  if (width && height && width > 0 && height > 0) {
    const x = readFiniteNumber(viewport?.x) ?? 0
    const y = readFiniteNumber(viewport?.y) ?? 0
    return rows.map((row) => ({ ...row, bounds: row.bounds ? {
      x: (row.bounds.x - x) / width,
      y: (row.bounds.y - y) / height,
      width: row.bounds.width / width,
      height: row.bounds.height / height,
    } : null }))
  }
  return rows
}

function appendAccessibilityNode(
  rows: AccessibilityTreeRow[],
  raw: Record<string, unknown>,
  depth: number,
  key: string,
  types: string[],
  recurse = true,
) {
  const typeId = readFiniteNumber(raw.typeId)
  const type = typeof raw.type === 'string'
    ? raw.type
    : typeId !== null && types[typeId]
      ? types[typeId]
      : 'Element'
  rows.push({
    key,
    depth,
    type,
    role: typeof raw.role === 'string' ? raw.role : '',
    text: firstString(raw.text, raw.label, raw.value),
    automationId: typeof raw.automationId === 'string' ? raw.automationId : '',
    actions: Array.isArray(raw.supportedActions)
      ? raw.supportedActions.filter((value): value is string => typeof value === 'string')
      : [],
    bounds: readTreeBounds(raw.bounds),
    raw,
  })
  if (!recurse || !Array.isArray(raw.children)) return
  raw.children.forEach((child, index) => {
    if (isJsonRecord(child)) appendAccessibilityNode(rows, child, depth + 1, `${key}-${index}`, types)
  })
}

function parseJsonRecord(content: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(content)
    return isJsonRecord(value) ? value : null
  } catch {
    return null
  }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTreeBounds(value: unknown): TraceBounds | null {
  const values = Array.isArray(value) ? value : isJsonRecord(value) ? [value.x, value.y, value.width, value.height] : []
  const [x, y, width, height] = values.map(readFiniteNumber)
  return x != null && y != null && width != null && height != null && width > 0 && height > 0
    ? { x, y, width, height }
    : null
}

function readBounds(value: unknown): TraceBounds | null {
  if (!isJsonRecord(value)) return null
  const x = readFiniteNumber(value.x)
  const y = readFiniteNumber(value.y)
  const width = readFiniteNumber(value.width)
  const height = readFiniteNumber(value.height)
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0, Math.min(1 - Math.max(0, x), width)),
    height: Math.max(0, Math.min(1 - Math.max(0, y), height)),
  }
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function boundsStyle(bounds: TraceBounds) {
  return {
    left: `${bounds.x * 100}%`,
    top: `${bounds.y * 100}%`,
    width: `${bounds.width * 100}%`,
    height: `${bounds.height * 100}%`,
  }
}

function formatBounds(bounds: TraceBounds): string {
  return `${Math.round(bounds.x * 100)}%, ${Math.round(bounds.y * 100)}% · ${Math.round(bounds.width * 100)}%×${Math.round(bounds.height * 100)}%`
}

function accessibilityRowLabel(row: AccessibilityTreeRow): string {
  const identity = row.text || row.automationId || row.type
  return `${identity} · ${row.role || row.type}${row.bounds ? ` · ${formatBounds(row.bounds)}` : ''}`
}

type TraceLane = 'setup' | 'agent' | 'tasks' | 'tools'
type InspectableTimingStep = LocalTestStartupStep & { nodeId?: string, lane?: TraceLane }

function startupTiming(audit: LocalTestRunAudit) {
  const firstPass = [...(audit.modelPasses ?? [])].sort((a, b) => Date.parse(a.startedUtc) - Date.parse(b.startedUtc))[0]
  const boundary = firstPass ? Date.parse(firstPass.startedUtc) : null
  const steps: LocalTestStartupStep[] = (audit.startupSteps ?? [])
    .filter((step) => boundary == null || Date.parse(step.startedUtc) <= boundary)
    .sort((a, b) => Date.parse(a.startedUtc) - Date.parse(b.startedUtc))
  const start = Math.min(Date.parse(audit.startedUtc), ...steps.map((step) => Date.parse(step.startedUtc)))
  const readyMilliseconds = boundary == null ? null : boundary - start
  if (firstPass && steps.length) steps.push({
    name: 'Setup complete — first agent request', startedUtc: firstPass.startedUtc,
    durationMilliseconds: 0, status: 'ready',
  })
  return { steps, start, readyMilliseconds }
}

function fullTraceTiming(audit: LocalTestRunAudit) {
  const steps: InspectableTimingStep[] = (audit.startupSteps ?? []).map((step) => ({ ...step, nodeId: 'context', lane: 'setup' }))
  const untimed: { name: string, nodeId: string }[] = []
  for (const pass of audit.modelPasses ?? []) {
    const nodeId = `model:${pass.sequence}`
    steps.push({ name: `Agent pass ${pass.sequence}`, startedUtc: pass.startedUtc,
      durationMilliseconds: pass.durationMilliseconds, status: pass.succeeded ? 'succeeded' : 'failed', nodeId, lane: 'agent' })
    for (const [index, attempt] of (pass.transport?.attempts ?? []).entries()) {
      const name = `Pass ${pass.sequence} · attempt ${index + 1} · ${attempt.mode}`
      if (!attempt.startedUtc) { untimed.push({ name, nodeId }); continue }
      steps.push({ name, startedUtc: attempt.startedUtc, durationMilliseconds: attempt.durationMilliseconds,
        status: attempt.error ? 'failed' : 'completed', nodeId, lane: 'agent' })
    }
  }
  for (const call of audit.toolCalls) {
    const nodeId = `tool:${call.sequence}`
    steps.push({ name: readableToolName(call.toolName), startedUtc: call.startedUtc,
      durationMilliseconds: call.durationMilliseconds, status: call.isError ? 'failed' : 'succeeded', nodeId, lane: call.toolName === 'ansight_run_task' ? 'tasks' : 'tools' })
    if (call.toolName !== 'ansight_run_task') continue
    for (const row of readTaskCallTrace(call).rows) {
      const name = `Task ${call.sequence} · ${row.sequenceLabel} · ${row.call.toolName}`
      if (!row.call.startedAtUtc) { untimed.push({ name, nodeId }); continue }
      steps.push({ name, startedUtc: row.call.startedAtUtc, durationMilliseconds: row.call.durationMilliseconds,
        status: row.call.isError ? 'failed' : 'succeeded', nodeId, lane: 'tasks' })
    }
  }
  steps.sort((a, b) => Date.parse(a.startedUtc) - Date.parse(b.startedUtc))
  return { steps, untimed, start: Math.min(Date.parse(audit.startedUtc), ...steps.map((step) => Date.parse(step.startedUtc))) }
}

function FullTraceTimeline({ audit, view, onSelectNode }: { audit: LocalTestRunAudit, view: 'timeline' | 'table', onSelectNode: (id: string) => void }) {
  const timing = useMemo(() => fullTraceTiming(audit), [audit])
  const nodes = useMemo(() => buildAuditGraphNodes(audit), [audit])
  return <section className="local-full-trace-timeline">
    {view === 'timeline' ? <TraceLanes nodes={nodes} steps={timing.steps} start={timing.start} onSelectNode={onSelectNode} /> :
      <table className="local-trace-step-table"><thead><tr><th>Node</th><th>Step</th><th>Start</th><th>Duration</th><th>Status</th></tr></thead>
        <tbody>{timing.steps.map((step, index) => <tr key={index}>
          <td><span className={`local-trace-lane-label trace-lane-${step.lane}`}>{nodes.find((node) => node.id === step.nodeId)?.title ?? step.lane}</span></td>
          <td><button type="button" onClick={() => step.nodeId && onSelectNode(step.nodeId)}>{startupStepLabel(step.name)}</button></td>
          <td>+{(Date.parse(step.startedUtc) - timing.start).toLocaleString()} ms</td>
          <td>{step.durationMilliseconds.toLocaleString()} ms</td><td>{step.status}</td>
        </tr>)}</tbody>
      </table>}
    {timing.untimed.length ? <details><summary>Steps without recorded timestamps ({timing.untimed.length})</summary>
      <ul>{timing.untimed.map((step, index) => <li key={index}><button type="button" onClick={() => onSelectNode(step.nodeId)}>{step.name} · Inspect</button></li>)}</ul>
    </details> : null}
  </section>
}

function TraceLanes({ nodes, steps, start, onSelectNode }: { nodes: AuditGraphNode[], steps: InspectableTimingStep[], start: number, onSelectNode: (id: string) => void }) {
  const [columnWidth, setColumnWidth] = useState(200)
  const [activeStep, setActiveStep] = useState<InspectableTimingStep | null>(null)
  const lanes = nodes.map((node) => ({
    id: node.id, title: node.title, kind: node.kind,
  }))
  const columnsStyle = { gridTemplateColumns: `65px repeat(${lanes.length}, ${columnWidth}px)`, width: 65 + lanes.length * columnWidth }
  const duration = Math.max(1, ...steps.map((step) => Date.parse(step.startedUtc) - start + step.durationMilliseconds))
  const height = Math.max(600, duration / 1000 * 50)
  const pixelsPerMs = height / duration
  return <>
    <p>Each column is one graph node, in execution order. Time runs downwards. Hover or focus a bar for its name and timing. Select it to open details below.</p>
    <label>Column zoom <input aria-label="Horizontal column zoom" type="range" min="120" max="480" step="20" value={columnWidth} onChange={(event) => setColumnWidth(Number(event.target.value))} /> <span>{columnWidth}px</span></label>
    <div className="local-trace-step-readout" aria-live="polite">
      <strong>{activeStep ? startupStepLabel(activeStep.name) : 'Explore a step'}</strong>
      <span>{activeStep ? `+${(Date.parse(activeStep.startedUtc) - start).toLocaleString()} ms · ${activeStep.durationMilliseconds.toLocaleString()} ms · ${activeStep.status}` : 'Point to a bar or use Tab to inspect its timing.'}</span>
    </div>
    <div className="local-trace-lanes" role="region" tabIndex={0} aria-label="Complete trace by graph node. Scroll horizontally for more nodes and vertically through time.">
      <div className="local-trace-lane-headings" style={columnsStyle}><span>Time</span>{lanes.map((lane, index) => <button type="button" className={`trace-node-${lane.kind}`} key={lane.id} onClick={() => onSelectNode(lane.id)}><small>{index + 1} · {graphKindLabel(lane.kind)}</small><strong>{lane.title}</strong></button>)}</div>
      <div className="local-trace-lane-columns" style={{ ...columnsStyle, height: height + 40 }}>
        <div className="local-trace-time-ruler">{Array.from({ length: 11 }, (_, index) => <span key={index} style={{ top: height * index / 10 }}>{(duration * index / 10000).toFixed(2)}s</span>)}</div>
        {lanes.map((lane) => {
          const ends: number[] = []
          const bars = steps.filter((step) => step.nodeId === lane.id).map((step) => {
            const top = (Date.parse(step.startedUtc) - start) * pixelsPerMs
            const barHeight = Math.max(8, step.durationMilliseconds * pixelsPerMs)
            let track = ends.findIndex((end) => end <= top)
            if (track < 0) track = ends.length
            ends[track] = top + barHeight + 2
            return { step, top, barHeight, track }
          })
          return <div className={`local-trace-lane trace-node-${lane.kind}`} key={lane.id}>
            {!bars.length ? <span className="local-trace-no-timing">No recorded timing</span> : null}
            {bars.map(({ step, top, barHeight, track }, index) => <button type="button" key={index}
              className={`local-trace-lane-bar${step.status === 'failed' ? ' local-trace-lane-bar--failed' : ''}`}
              style={{ top, height: barHeight, left: `${track / ends.length * 100}%`, width: `${100 / ends.length}%` }}
              onMouseEnter={() => setActiveStep(step)}
              onFocus={() => setActiveStep(step)}
              onClick={() => { setActiveStep(step); if (step.nodeId) onSelectNode(step.nodeId) }}
              aria-label={`${startupStepLabel(step.name)}: ${step.durationMilliseconds} ms, ${step.status}. Inspect`}
              title={`${startupStepLabel(step.name)} · +${Date.parse(step.startedUtc) - start} ms · ${step.durationMilliseconds} ms · ${step.status}`}>
            </button>)}
          </div>
        })}
      </div>
    </div>
  </>
}

type RequestAttempt = NonNullable<LocalTestModelPassAudit['transport']>['attempts'][number]

function requestAttemptSteps(attempt: RequestAttempt): LocalTestStartupStep[] {
  const steps: LocalTestStartupStep[] = []
  function phase(name: string, start: number | null | undefined, end: number | null | undefined) {
    if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return
    steps.push({ name, startedUtc: new Date(start).toISOString(), durationMilliseconds: end - start, status: 'recorded' })
  }
  phase('Whole attempt', 0, attempt.durationMilliseconds)
  if (steps[0]) steps[0].status = attempt.error ? 'failed' : 'completed'
  phase('Connection setup', 0, attempt.connectionDurationMilliseconds)
  phase('Prepare request', attempt.connectionDurationMilliseconds ?? 0, attempt.requestPreparedMilliseconds)
  phase('Send request', attempt.requestPreparedMilliseconds, attempt.requestSentMilliseconds)
  phase(attempt.mode === 'http' ? 'Send and wait for response headers' : 'Wait for first response event',
    attempt.requestSentMilliseconds ?? attempt.requestPreparedMilliseconds, attempt.firstResponseMilliseconds)
  phase('Receive remaining response', attempt.firstResponseMilliseconds, attempt.responseCompletedMilliseconds)
  if (attempt.responseCompletedMilliseconds != null && attempt.parsingDurationMilliseconds != null)
    phase('Parse final response', attempt.responseCompletedMilliseconds, attempt.responseCompletedMilliseconds + attempt.parsingDurationMilliseconds)
  return steps
}

function AgentPassBreakdown({ pass, tools, onSelectNode }: {
  pass: LocalTestModelPassAudit
  tools: LocalTestToolCallAudit[]
  onSelectNode: (id: string) => void
}) {
  const [view, setView] = useState<'timeline' | 'table'>('timeline')
  const offset = (value: number | null | undefined) => value == null ? 'Not recorded' : `+${value.toLocaleString()} ms`
  return <details className="local-test-startup-timing" open>
    <summary>Agent pass breakdown · {pass.durationMilliseconds.toLocaleString()} ms · {pass.functionCallCount} requested calls</summary>
    <p>Milestone offsets are measured from each request attempt. Final parsing is a duration. Tool execution occurs separately after the response.</p>
    <div className="local-startup-view-switch" role="group" aria-label="Agent pass timing view">
      <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Timeline</button>
      <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
    </div>
    {pass.transport?.attempts.length ? pass.transport.attempts.map((attempt, index) => <details key={index} open>
      <summary>Attempt {index + 1} · {attempt.mode} · {attempt.durationMilliseconds.toLocaleString()} ms{attempt.error ? ' · failed' : ''}</summary>
      {view === 'timeline' ? <StartupTimeline steps={requestAttemptSteps(attempt)} start={0}
        label="Request attempt timeline" axisLabel="Time from attempt start"
        description="The whole-attempt bar contains the phases below it. Waiting includes network and server work; HTTP sending and waiting are combined. Unrecorded phases are omitted. Dots mark very short phases." /> : <table><thead><tr><th>Milestone</th><th>Timing</th></tr></thead><tbody>
        <tr><td>Connection setup duration</td><td>{attempt.connectionDurationMilliseconds == null ? 'Not recorded separately' : `${attempt.connectionDurationMilliseconds.toLocaleString()} ms`}</td></tr>
        <tr><td>Request prepared / dispatch starts</td><td>{offset(attempt.requestPreparedMilliseconds)}</td></tr>
        <tr><td>Request sent</td><td>{offset(attempt.requestSentMilliseconds)}</td></tr>
        <tr><td>{attempt.mode === 'http' ? 'Response headers received' : 'First response event received'}</td><td>{offset(attempt.firstResponseMilliseconds)}</td></tr>
        <tr><td>Response fully received</td><td>{offset(attempt.responseCompletedMilliseconds)}</td></tr>
        <tr><td>Final response parsing</td><td>{attempt.parsingDurationMilliseconds == null ? 'Not recorded' : `${attempt.parsingDurationMilliseconds.toLocaleString()} ms`}</td></tr>
      </tbody></table>}
    </details>) : <p>Detailed request timings were not recorded for this pass.</p>}
    <details><summary>Recorded tool calls for this turn ({tools.length})</summary>
      {tools.length ? <ul>{tools.map((tool) => <li key={tool.sequence}><button type="button" onClick={() => onSelectNode(`tool:${tool.sequence}`)}>
        {readableToolName(tool.toolName)} · {tool.durationMilliseconds.toLocaleString()} ms{tool.isError ? ' · failed' : ''}
      </button></li>)}</ul> : <p>No tool execution was recorded for this turn.</p>}
    </details>
  </details>
}

function StartupTiming({ audit }: { audit: LocalTestRunAudit }) {
  const timing = startupTiming(audit)
  const [view, setView] = useState<'timeline' | 'table'>('timeline')
  return <section className="local-test-startup-timing">
    <h4>Test setup</h4>
    <p>{audit.openAiProtocol ?? 'Protocol not recorded'} · {audit.openAiTransport ?? 'Connection not recorded'}</p>
    <p>Setup to first agent request: {timing.readyMilliseconds == null ? 'Not recorded' : `${timing.readyMilliseconds.toLocaleString()} ms`}</p>
    {!audit.startupSteps?.length ? <p>Broker/setup timing was not recorded in this older trace. Totals start at the recorded run start.</p> : null}
    <p>Setup ends when the first agent request starts. Connection work performed inside a request is shown in that agent pass.</p>
    <div className="local-startup-view-switch" role="group" aria-label="Startup timing view">
      <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Timeline</button>
      <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
    </div>
    {view === 'timeline' ? <StartupTimeline steps={timing.steps} start={timing.start} description="Setup steps share one time scale. Aligned bars overlap; durations are not added together. Dots mark very short steps." /> : <table>
      <thead><tr><th>Step</th><th>Start offset</th><th>Duration</th><th>Status</th></tr></thead>
      <tbody>{timing.steps.map((step, index) => <tr key={index}>
        <td>{startupStepLabel(step.name)}</td><td>+{(Date.parse(step.startedUtc) - timing.start).toLocaleString()} ms</td>
        <td>{step.durationMilliseconds.toLocaleString()} ms</td><td>{step.status}</td>
      </tr>)}</tbody>
    </table>}
  </section>
}

function startupStepLabel(name: string): string {
  return name === 'Broker OpenAI credentials' ? 'Broker connection credentials' : name
}

function StartupTimeline({ steps, start, onSelectNode, label = 'Startup sequence timeline', axisLabel = 'Time from setup start',
  description = 'Bars share one time scale. Aligned bars overlap; connection setup is part of the agent request. Dots mark steps shorter than the visible scale.',
}: { steps: InspectableTimingStep[], start: number, onSelectNode?: (id: string) => void, label?: string, axisLabel?: string, description?: string }) {
  const span = Math.max(1, ...steps.map((step) => Date.parse(step.startedUtc) - start + step.durationMilliseconds))
  if (!steps.length) return <p>No startup timings were recorded.</p>
  return <div className="local-startup-timeline">
    <p>{description}</p>
    <div className="local-startup-timeline-axis" aria-hidden="true">
      <span>{axisLabel}</span>
      <div>{[0, 1, 2, 3, 4].map((tick) => <span key={tick}>{(span * tick / 4000).toFixed(2)}s</span>)}</div>
      <span>Duration / status</span>
    </div>
    <ol aria-label={label}>
      {steps.map((step, index) => {
        const offset = Date.parse(step.startedUtc) - start
        const label = startupStepLabel(step.name)
        const kind = step.status === 'skipped' ? 'skipped'
          : step.status === 'failed' || step.status === 'timed-out' || step.status === 'cancelled' ? 'failed'
          : (step.name.startsWith('Agent turn') || step.name === 'Whole attempt') ? 'agent'
          : step.name.startsWith('WebSocket connection') ? 'connection' : 'setup'
        return <li key={index}>
          <span className="local-startup-timeline-label">{step.nodeId && onSelectNode
            ? <button className="local-timing-inspect" type="button" onClick={() => onSelectNode(step.nodeId!)}>{label} · Inspect</button> : label}</span>
          <div className="local-startup-timeline-track" role="img"
            aria-label={`${label}: starts at ${offset} milliseconds, lasts ${step.durationMilliseconds} milliseconds, ${step.status}`}
            title={`Start +${offset.toLocaleString()} ms · End +${(offset + step.durationMilliseconds).toLocaleString()} ms`}>
            <span className={`local-startup-timeline-bar local-startup-timeline-bar--${kind}`}
              style={{ left: `${offset / span * 100}%`, width: `${step.durationMilliseconds / span * 100}%` }} />
          </div>
          <span className="local-startup-timeline-value">{step.durationMilliseconds.toLocaleString()} ms <small>{step.status}</small></span>
        </li>
      })}
    </ol>
  </div>
}

function buildAuditGraphNodes(audit: LocalTestRunAudit): AuditGraphNode[] {
  const startedMilliseconds = Date.parse(audit.startedUtc)
  const requestedInstructions = audit.requestedInstructions?.length
    ? audit.requestedInstructions
    : audit.instructions.map((instruction) => instruction.instruction)
  const nodes: AuditGraphNode[] = [{
    id: 'context',
    kind: 'context',
    title: 'Setup + run context',
    startupAudit: audit,
    subtitle: `${requestedInstructions.length} instruction(s) · ${audit.reasoning ?? 'Reasoning not recorded'}`,
    durationMilliseconds: startupTiming(audit).readyMilliseconds ?? 0,
    elapsedMilliseconds: 0,
    tokenDelta: 0,
    cumulativeTokens: 0,
    isError: false,
    details: [
      { label: 'Requested instructions', value: JSON.stringify(requestedInstructions, null, 2), code: true },
      { label: 'Session and environment', value: JSON.stringify({ sessionId: audit.sessionId, appId: audit.appId, environment: audit.environment }, null, 2), code: true },
      { label: 'Agent instructions', value: audit.agentPrompt ?? 'Agent instructions were not captured by this audit schema.', code: true },
    ],
  }]

  const appGraphPlans = audit.appGraphPlans ?? []
  const appGraphStatus = audit.appGraphEnabled === true
    ? 'enabled'
    : audit.appGraphEnabled === false
      ? 'disabled'
      : 'unknown'
  nodes.push({
    id: 'app-graph',
    kind: 'app-graph',
    title: appGraphPlans.length > 0
      ? `${appGraphPlans.length} App Graph candidate(s)`
      : appGraphStatus === 'enabled'
        ? 'No matching App Graph'
        : appGraphStatus === 'disabled'
          ? 'App Graph disabled'
          : 'App Graph provenance unavailable',
    subtitle: appGraphPlans.length > 0
      ? `${appGraphPlans.reduce((sum, plan) => sum + plan.transitions.length, 0)} transition(s) entered model context`
      : appGraphStatus === 'enabled'
        ? 'The run opted in, but no authorized published route matched'
        : appGraphStatus === 'disabled'
          ? 'The run did not opt in with --app-graph'
          : 'This older audit did not record whether --app-graph was enabled',
    durationMilliseconds: 0,
    elapsedMilliseconds: 0,
    tokenDelta: 0,
    cumulativeTokens: 0,
    isError: false,
    details: appGraphPlans.length > 0
      ? appGraphPlans.map(appGraphDetail)
      : [{
          label: 'Route context',
          value: appGraphStatus === 'enabled'
            ? 'App Graph guidance was explicitly enabled, but route discovery supplied no authorized published candidate for this app and instruction.'
            : appGraphStatus === 'disabled'
              ? 'App Graph guidance was not enabled. Use --app-graph on app execution to opt in.'
              : 'This audit predates explicit App Graph opt-in provenance. Its empty candidate list cannot distinguish disabled guidance from an enabled search with no match.',
        }],
  })

  const events = [
    ...(audit.modelPasses ?? []).map((pass) => ({ type: 'model' as const, startedUtc: pass.startedUtc, sequence: pass.sequence, pass })),
    ...audit.toolCalls.map((call) => ({ type: 'tool' as const, startedUtc: call.startedUtc, sequence: call.sequence, call })),
  ].sort((left, right) => Date.parse(left.startedUtc) - Date.parse(right.startedUtc)
    || (left.type === 'model' ? 0 : 1) - (right.type === 'model' ? 0 : 1)
    || left.sequence - right.sequence)

  let cumulativeTokens = 0
  for (const event of events) {
    if (event.type === 'model') {
      const pass = event.pass
      cumulativeTokens += pass.tokens.totalTokens
      nodes.push({ ...modelPassNode(pass, startedMilliseconds, cumulativeTokens), modelPass: pass,
        requestedTools: audit.toolCalls.filter((call) => call.instructionIndex === pass.instructionIndex && call.instructionTurn === pass.instructionTurn) })
      continue
    }

    nodes.push(toolCallNode(event.call, startedMilliseconds, cumulativeTokens))
  }

  nodes.push({
    id: 'result',
    kind: 'result',
    title: `Run ${normalizeRunStatus(audit.status)}`,
    subtitle: audit.message,
    durationMilliseconds: audit.durationMilliseconds,
    elapsedMilliseconds: audit.durationMilliseconds,
    tokenDelta: 0,
    cumulativeTokens: audit.tokens.totalTokens,
    isError: normalizeRunStatus(audit.status) !== 'succeeded',
    details: [
      { label: 'Instruction outcomes', value: JSON.stringify(audit.instructions, null, 2), code: true },
      { label: 'Run token usage', value: JSON.stringify(audit.tokens, null, 2), code: true },
      { label: 'Run message', value: audit.message },
    ],
  })
  return nodes
}

function modelPassNode(
  pass: LocalTestModelPassAudit,
  runStartedMilliseconds: number,
  cumulativeTokens: number,
): AuditGraphNode {
  const elapsedMilliseconds = elapsedAtEnd(runStartedMilliseconds, pass.startedUtc, pass.durationMilliseconds)
  const details: AuditGraphDetail[] = [
    { label: 'Assistant output', value: pass.assistantText ?? pass.errorMessage ?? 'No assistant text was emitted.', code: true },
    { label: 'Token usage', value: JSON.stringify(pass.tokens, null, 2), code: true },
  ]
  if (pass.context) {
    details.push(payloadDetail('Exact model context', pass.context))
  } else {
    details.push({
      label: 'Model context',
      value: 'This older audit predates exact per-pass context capture. Use the run context and preceding graph nodes to reconstruct it.',
    })
  }
  details.push({
    label: 'Response metadata',
    value: JSON.stringify({
      responseId: pass.responseId,
      functionCallCount: pass.functionCallCount,
      startedUtc: pass.startedUtc,
      durationMilliseconds: pass.durationMilliseconds,
      errorMessage: pass.errorMessage,
    }, null, 2),
    code: true,
  })
  return {
    id: `model:${pass.sequence}`,
    kind: 'model',
    title: `Model pass ${pass.sequence}`,
    subtitle: `Instruction ${pass.instructionIndex} · turn ${pass.instructionTurn} · ${pass.functionCallCount} call(s)`,
    durationMilliseconds: pass.durationMilliseconds,
    elapsedMilliseconds,
    tokenDelta: pass.tokens.totalTokens,
    cumulativeTokens,
    isError: !pass.succeeded,
    details,
  }
}

function toolCallNode(
  call: LocalTestToolCallAudit,
  runStartedMilliseconds: number,
  cumulativeTokens: number,
): AuditGraphNode {
  const kind = toolCallKind(call.toolName)
  const taskReference = kind === 'task' ? readToolArgumentLabel(call.arguments?.content) : null
  const details: AuditGraphDetail[] = [
    payloadDetail('Arguments', call.arguments),
    payloadDetail('Result', call.result),
  ]
  if (call.ocrEvidence) {
    details.push(
      payloadDetail('OCR detections', call.ocrEvidence.results),
      {
        label: 'OCR screenshot and result files',
        value: JSON.stringify({
          screenshotPath: call.ocrEvidence.screenshotPath,
          resultsPath: call.ocrEvidence.resultsPath,
          screenshotFrameId: call.ocrEvidence.screenshotFrameId,
          screenshotSha256: call.ocrEvidence.screenshotSha256,
          screenshotFormat: call.ocrEvidence.screenshotFormat,
          screenWidth: call.ocrEvidence.screenWidth,
          screenHeight: call.ocrEvidence.screenHeight,
          detectionCount: call.ocrEvidence.detectionCount,
          provider: call.ocrEvidence.provider,
          capturedAtUtc: call.ocrEvidence.capturedAtUtc,
        }, null, 2),
        code: true,
      },
    )
  }
  details.push({
    label: 'Call metadata',
    value: JSON.stringify({
      sequence: call.sequence,
      instructionIndex: call.instructionIndex,
      instructionTurn: call.instructionTurn,
      callId: call.callId,
      correlationId: call.correlationId,
      toolName: call.toolName,
      isAnsightTool: call.isAnsightTool,
      startedUtc: call.startedUtc,
      durationMilliseconds: call.durationMilliseconds,
      isError: call.isError,
    }, null, 2),
    code: true,
  })
  return {
    id: `tool:${call.sequence}`,
    kind,
    title: taskReference || readableToolName(call.toolName),
    subtitle: call.message,
    durationMilliseconds: call.durationMilliseconds,
    elapsedMilliseconds: elapsedAtEnd(runStartedMilliseconds, call.startedUtc, call.durationMilliseconds),
    tokenDelta: 0,
    cumulativeTokens,
    isError: call.isError,
    details,
    ocrEvidence: call.ocrEvidence,
    accessibilityEvidence: call.accessibilityEvidence ?? readLegacyAccessibilityEvidence(call),
    taskCallTrace: call.toolName === 'ansight_run_task' ? readTaskCallTrace(call) : undefined,
    taskSources: call.toolName === 'ansight_run_task' ? readTaskSources(call) : undefined,
  }
}

function appGraphDetail(plan: LocalTestAppGraphPlan): AuditGraphDetail {
  return {
    label: plan.name,
    value: JSON.stringify({
      graphId: plan.graphId,
      versionId: plan.versionId,
      intent: plan.intent,
      targetState: plan.targetState,
      transitions: plan.transitions,
    }, null, 2),
    code: true,
  }
}

function payloadDetail(label: string, payload?: LocalTestAuditPayload | null): AuditGraphDetail {
  if (!payload) {
    return { label, value: 'No payload was recorded.' }
  }
  return {
    label,
    value: payload.content,
    code: true,
    truncated: payload.wasTruncated,
    sha256: payload.sha256,
  }
}

function toolCallKind(toolName: string): AuditGraphNodeKind {
  if (toolName === 'ansight_list_tasks' || toolName === 'ansight_run_task') return 'task'
  if (/(_ui|screenshot|visual_tree|simulator|tap|swipe|type_text)/i.test(toolName)) return 'ui'
  return 'tool'
}

function graphKindLabel(kind: AuditGraphNodeKind): string {
  switch (kind) {
    case 'app-graph': return 'App Graph'
    case 'model': return 'Model'
    case 'task': return 'Task'
    case 'ui': return 'Live UI'
    case 'tool': return 'Tool'
    case 'result': return 'Result'
    default: return 'Context'
  }
}

function readableToolName(toolName: string): string {
  return toolName.replace(/^ansight_/, '').replaceAll('_', ' ')
}

function readToolArgumentLabel(content?: string): string | null {
  if (!content) return null
  try {
    const value = JSON.parse(content) as Record<string, unknown>
    const task = value.taskId ?? value.taskName ?? value.id ?? value.query
    return typeof task === 'string' && task.trim() ? task.trim() : null
  } catch {
    return null
  }
}

function elapsedAtEnd(runStartedMilliseconds: number, startedUtc: string, durationMilliseconds: number): number {
  const eventStartedMilliseconds = Date.parse(startedUtc)
  return Math.max(0, (Number.isFinite(eventStartedMilliseconds) ? eventStartedMilliseconds - runStartedMilliseconds : 0) + durationMilliseconds)
}

function prettyAuditContent(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

function downloadTraceJson(audit: LocalTestRunAudit) {
  const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${audit.runId}-trace.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function Metric({ label, value }: { label: string, value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = normalizeRunStatus(status)
  return <span className={`local-test-history-status local-test-history-status--${normalizedStatus}`}>{formatStatusLabel(normalizedStatus)}</span>
}

function StatusIcon({ status }: { status: string }) {
  switch (normalizeRunStatus(status)) {
    case 'succeeded': return <CheckCircle className="local-test-history-icon local-test-history-icon--succeeded" aria-hidden="true" />
    case 'failed': return <XCircle className="local-test-history-icon local-test-history-icon--failed" aria-hidden="true" />
    case 'running': return <CircleNotch className="local-test-history-icon local-test-history-icon--running spin" aria-hidden="true" />
    case 'pending': return <Clock className="local-test-history-icon local-test-history-icon--pending" aria-hidden="true" />
    case 'cancelled':
    case 'skipped': return <MinusCircle className="local-test-history-icon local-test-history-icon--skipped" aria-hidden="true" />
    default: return <WarningCircle className="local-test-history-icon local-test-history-icon--unknown" aria-hidden="true" />
  }
}

function normalizeRunStatus(status: string | number): TestHistoryStatus {
  if (typeof status === 'string') {
    switch (status.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '')) {
      case 'succeeded':
      case 'success':
      case 'passed':
      case 'complete':
      case 'completed':
        return 'succeeded'
      case 'failed':
      case 'failure':
      case 'error':
        return 'failed'
      case 'running':
      case 'inprogress':
      case 'starting':
        return 'running'
      case 'pending':
      case 'queued':
        return 'pending'
      case 'cancelled':
      case 'canceled':
        return 'cancelled'
      case 'skipped':
        return 'skipped'
      default:
        return 'unknown'
    }
  }
  switch (status) {
    case 0: return 'succeeded'
    case 1: return 'failed'
    case 2: return 'cancelled'
    default: return 'unknown'
  }
}

function formatStatusLabel(status: TestHistoryStatus): string {
  return status === 'unknown' ? 'Indeterminate' : `${status[0].toLocaleUpperCase()}${status.slice(1)}`
}

function workspaceName(path: string): string {
  const segments = path.replace(/[\\/]+$/, '').split(/[\\/]/)
  return segments.at(-1) || path
}

function instructionTitle(instruction?: string): string {
  const normalized = (instruction ?? '')
    .trim()
    .replace(/^Test scenario:\s*/i, '')
  const firstLine = normalized.split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (!firstLine) {
    return 'Untitled test'
  }
  if (firstLine.length <= 72) {
    return firstLine
  }
  const prefix = firstLine.slice(0, 72)
  const lastSpace = prefix.lastIndexOf(' ')
  return `${(lastSpace >= 40 ? prefix.slice(0, lastSpace) : prefix).replace(/[\s.,;:]+$/, '')}…`
}

function formatDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return '0s'
  }
  const seconds = Math.round(milliseconds / 1000)
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`
}

function formatCalculatedRunCost(cost: { costMicros?: number | null, customerCostMicros?: number | null, currency: string }): string {
  const micros = cost.costMicros ?? cost.customerCostMicros
  if (micros == null) return 'Unavailable'
  const amount = micros / 1_000_000
  const currency = cost.currency.toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: amount < 0.01 ? 6 : 2,
      maximumFractionDigits: 6,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(6)}`
  }
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
