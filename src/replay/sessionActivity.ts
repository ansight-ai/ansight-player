export type ActivityCaller = {
  principalId?: string | null
  principalAttribution: string
  kind: string
  name?: string | null
  executorAttribution: string
  ingress: string
  clientName?: string | null
  clientVersion?: string | null
  workId?: string | null
  initiatorKind?: string | null
  initiatorName?: string | null
  initiatorAttribution?: string | null
}

export type SessionActivityRecord = {
  schema: string
  eventId: string
  operationId: string
  traceId: string
  parentOperationId?: string | null
  runtimeId: string
  phase: 'started' | 'target' | 'completed'
  timestampUtc: string
  startedAtUtc: string
  operation: string
  category: string
  sessionId?: string | null
  appId?: string | null
  caller: ActivityCaller
  requestId?: string | null
  runId?: string | null
  batchRunId?: string | null
  outcome?: string | null
  errorType?: string | null
  deliveryOutcome?: string | null
  evidenceStatus?: string | null
  evidenceIds: string[]
  provenance: string
}

export type SessionActivityPage = {
  records: SessionActivityRecord[]
  nextCursor: string | null
  retentionLimited: boolean
  cursorExpired: boolean
  skippedRecords: number
  incompleteTail: boolean
  persistenceError?: string | null
  importedHistoryIncomplete?: boolean
}

export type SessionActivitySource = {
  load: (sessionId: string, cursor?: string | null) => Promise<SessionActivityPage>
  jsonlUrl?: (sessionId: string, cursor?: string | null) => string
  traceUrl?: (runId: string, appId?: string | null) => string
}

/** Completion events are self-contained, so retention, paging and a torn start cannot invent success. */
export function activityOperations(records: readonly SessionActivityRecord[]): SessionActivityRecord[] {
  const operations = new Map<string, SessionActivityRecord>()
  for (const record of records) {
    if (record.schema !== 'ansight.session-activity/v1' || !record.operationId || !record.caller
      || !Number.isFinite(Date.parse(record.startedAtUtc))) continue
    const key = `${record.provenance}:${record.operationId}`
    const previous = operations.get(key)
    if (!previous || record.phase === 'completed' || previous.phase !== 'completed') operations.set(key, record)
  }
  return [...operations.values()].sort((a, b) => Date.parse(b.startedAtUtc) - Date.parse(a.startedAtUtc))
}

export function activityOutcome(record: SessionActivityRecord): string {
  return record.phase === 'completed' ? record.outcome ?? 'unknown' : 'incomplete'
}

export function activityPageWarning(page: SessionActivityPage): string | null {
  const warnings = [
    page.persistenceError,
    page.importedHistoryIncomplete ? 'Imported history contains a recording or retention gap.' : null,
    page.retentionLimited ? 'Older activity has expired from retention.' : null,
    page.cursorExpired ? 'The previous page expired; showing retained activity.' : null,
    page.skippedRecords ? `${page.skippedRecords} unreadable record(s) were skipped.` : null,
    page.incompleteTail ? 'An incomplete record was found at the end of the journal.' : null,
  ].filter(Boolean)
  return warnings.length ? warnings.join(' ') : null
}
