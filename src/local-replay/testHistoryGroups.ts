import type { LocalTestBatchAudit, LocalTestHistory, LocalTestRunCost, LocalTestRunSummary } from './types'

export type TestHistoryStatus = 'succeeded' | 'failed' | 'running' | 'pending' | 'cancelled' | 'skipped' | 'unknown'
export type TestHistoryGrouping = 'batch' | 'test' | 'date' | 'outcome' | 'none'

export const testHistoryGroupings: { value: TestHistoryGrouping, label: string }[] = [
  { value: 'batch', label: 'Test batch' },
  { value: 'test', label: 'Test' },
  { value: 'date', label: 'Date' },
  { value: 'outcome', label: 'Outcome' },
  { value: 'none', label: 'No grouping' },
]

export const testHistoryStatusOrder: TestHistoryStatus[] = [
  'succeeded', 'failed', 'running', 'pending', 'cancelled', 'skipped', 'unknown',
]

export type TestHistoryExecution = {
  id: string
  inspectionRunId: string
  run: LocalTestRunSummary
  batch?: LocalTestBatchAudit
  batchIndex?: number
  searchText: string
}

export type TestHistoryGroup = {
  id: string
  title: string
  subtitle?: string
  batch?: LocalTestBatchAudit
  items: TestHistoryExecution[]
}

export type TestHistoryCostedTrace = {
  runId: string
  calculatedCost?: LocalTestRunCost | null
}

export function summarizeTestHistoryCosts(traces: TestHistoryCostedTrace[]) {
  const uniqueTraces = new Map(traces.map((trace) => [trace.runId, trace]))
  const totalsByCurrency = new Map<string, number>()
  let pricedCount = 0
  for (const { calculatedCost } of uniqueTraces.values()) {
    const costMicros = calculatedCost?.costMicros ?? calculatedCost?.customerCostMicros
    const currency = calculatedCost?.currency.trim().toUpperCase()
    if (costMicros == null || !Number.isFinite(costMicros) || costMicros < 0 || !currency) continue
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + costMicros)
    pricedCount += 1
  }
  return {
    totalCount: uniqueTraces.size,
    pricedCount,
    totals: [...totalsByCurrency].sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, costMicros]) => ({ currency, costMicros })),
  }
}

// Batch summaries can outlive (or exceed the history limit for) their child audits.
// Include every batch item, and only add run summaries that are not already represented.
export function buildTestHistoryExecutions(history: LocalTestHistory | null, appId?: string | null): TestHistoryExecution[] {
  if (!history) return []
  const normalizedAppId = appId?.toLowerCase()
  const matchesApp = (candidate?: string | null) => !normalizedAppId || candidate?.toLowerCase() === normalizedAppId
  const runsById = new Map(history.runs.map((run) => [run.runId, run]))
  const batchesById = new Map(history.batches.map(({ audit }) => [audit.batchRunId, audit]))
  const representedRunIds = new Set<string>()
  const items: TestHistoryExecution[] = []

  for (const { audit: batch } of history.batches) {
    for (const test of batch.tests) {
      if (!matchesApp(test.appId)) continue
      const childRunId = test.taskRunId || test.agentRunId
      const recordedRun = childRunId ? runsById.get(childRunId) : undefined
      if (test.taskRunId) representedRunIds.add(test.taskRunId)
      if (test.agentRunId) representedRunIds.add(test.agentRunId)
      const id = `${batch.batchRunId}:${test.index}:${test.testId}`
      const run: LocalTestRunSummary = {
        runId: childRunId || id,
        executionKind: test.taskRunId ? 'task' : undefined,
        sessionId: test.sessionId ?? '',
        startedUtc: batch.startedUtc,
        completedUtc: batch.completedUtc ?? '',
        durationMilliseconds: test.durationMilliseconds,
        totalTokens: test.totalTokens,
        modelPassCount: test.modelPassCount,
        ansightToolCallCount: test.ansightToolCallCount,
        filePath: test.agentAuditFilePath ?? '',
        ...recordedRun,
        batchRunId: batch.batchRunId,
        workspacePath: batch.workspacePath,
        testId: test.testId,
        testName: test.testName,
        displayName: test.testName,
        appId: test.appId,
        status: test.status,
        message: test.message,
      }
      items.push({
        id,
        // The batch detail remains usable even when no child audit is available.
        inspectionRunId: recordedRun ? recordedRun.runId : batch.batchRunId,
        run,
        batch,
        batchIndex: test.index,
        searchText: executionSearchText(run),
      })
    }
  }

  for (const run of history.runs) {
    if (!matchesApp(run.appId) || representedRunIds.has(run.runId)) continue
    items.push({
      id: run.runId,
      inspectionRunId: run.runId,
      run,
      batch: run.batchRunId ? batchesById.get(run.batchRunId) : undefined,
      searchText: executionSearchText(run),
    })
  }
  return items.sort((left, right) => timestamp(right.run.startedUtc) - timestamp(left.run.startedUtc))
}

export function groupTestHistoryExecutions(items: TestHistoryExecution[], grouping: TestHistoryGrouping): TestHistoryGroup[] {
  const groups = new Map<string, TestHistoryGroup>()
  for (const item of items) {
    const identity = groupIdentity(item, grouping)
    let group = groups.get(identity.id)
    if (!group) {
      group = { ...identity, items: [] }
      groups.set(group.id, group)
    }
    group.items.push(item)
  }
  const result = [...groups.values()]
  for (const group of result) {
    group.items.sort((left, right) => grouping === 'batch' && group.id !== 'standalone'
      ? (left.batchIndex ?? Infinity) - (right.batchIndex ?? Infinity)
        || timestamp(left.run.startedUtc) - timestamp(right.run.startedUtc)
      : timestamp(right.run.startedUtc) - timestamp(left.run.startedUtc))
  }
  return result.sort((left, right) => {
    if (grouping === 'test') return left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
    if (grouping === 'outcome') return testHistoryStatusOrder.indexOf(left.id as TestHistoryStatus) - testHistoryStatusOrder.indexOf(right.id as TestHistoryStatus)
    if (grouping === 'batch') {
      if (left.id === 'standalone') return 1
      if (right.id === 'standalone') return -1
    }
    return latestTimestamp(right) - latestTimestamp(left)
  })
}

function groupIdentity(item: TestHistoryExecution, grouping: TestHistoryGrouping): Omit<TestHistoryGroup, 'items'> {
  const { run, batch } = item
  switch (grouping) {
    case 'batch':
      return run.batchRunId
        ? { id: `batch:${run.batchRunId}`, title: workspaceName(batch?.workspacePath ?? run.workspacePath ?? '') || 'Test batch', subtitle: run.batchRunId, batch }
        : { id: 'standalone', title: 'Standalone runs', subtitle: 'Executions outside a test batch' }
    case 'test':
      return {
        id: JSON.stringify([run.appId?.toLowerCase(), run.workspacePath, run.testId || run.testName || run.displayName]),
        title: run.testName || run.displayName,
        subtitle: [run.testId, run.workspacePath].filter(Boolean).join(' · ') || undefined,
      }
    case 'date': {
      const date = new Date(run.startedUtc)
      return Number.isNaN(date.getTime())
        ? { id: 'unknown-date', title: 'Unknown date' }
        : { id: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`, title: date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
    }
    case 'outcome': {
      const status = normalizeRunStatus(run.status)
      return { id: status, title: formatStatusLabel(status) }
    }
    case 'none':
      return { id: 'all', title: 'All test runs' }
  }
}

function executionSearchText(run: LocalTestRunSummary): string {
  return [run.runId, run.batchRunId, run.workspacePath, run.testId, run.testName, run.displayName,
    run.appId, run.sessionId, run.reasoning, run.status, run.message, run.filePath].filter(Boolean).join(' ')
}

function timestamp(value: string): number {
  return Date.parse(value) || 0
}

function latestTimestamp(group: TestHistoryGroup): number {
  return group.batch ? timestamp(group.batch.startedUtc) : Math.max(...group.items.map((item) => timestamp(item.run.startedUtc)))
}

export function workspaceName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || path
}

export function normalizeRunStatus(status: string | number): TestHistoryStatus {
  if (typeof status === 'string') {
    switch (status.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '')) {
      case 'succeeded': case 'success': case 'passed': case 'complete': case 'completed': return 'succeeded'
      case 'failed': case 'failure': case 'error': return 'failed'
      case 'running': case 'inprogress': case 'starting': return 'running'
      case 'pending': case 'queued': return 'pending'
      case 'cancelled': case 'canceled': return 'cancelled'
      case 'skipped': return 'skipped'
      default: return 'unknown'
    }
  }
  switch (status) {
    case 0: return 'succeeded'
    case 1: return 'failed'
    case 2: return 'cancelled'
    default: return 'unknown'
  }
}

export function formatStatusLabel(status: TestHistoryStatus): string {
  return status === 'unknown' ? 'Indeterminate' : `${status[0].toLocaleUpperCase()}${status.slice(1)}`
}
