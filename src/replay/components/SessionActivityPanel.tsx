import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { activityOperations, activityOutcome, activityPageWarning, type SessionActivityRecord, type SessionActivitySource } from '../sessionActivity'
import './SessionActivityPanel.css'

export function SessionActivityPanel({ sessionId, source, onOpenRun, onOpenEvidence }: {
  sessionId: string
  source: SessionActivitySource
  onOpenRun?: (runId: string, appId?: string | null) => Promise<void>
  onOpenEvidence?: (ids: string[]) => boolean
}) {
  const [records, setRecords] = useState<SessionActivityRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState('all')
  const [outcome, setOutcome] = useState('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const generation = useRef(0)
  const busy = useRef(false)
  const load = useCallback(async (after: string | null) => {
    if (busy.current) return
    busy.current = true
    const current = generation.current
    setLoading(true)
    try {
      const page = await source.load(sessionId, after)
      if (generation.current !== current) return
      setRecords(previous => {
        const merged = new Map((after && !page.cursorExpired ? previous : []).map(record => [record.eventId, record]))
        for (const record of page.records) merged.set(record.eventId, record)
        return [...merged.values()]
      })
      setCursor(page.nextCursor)
      const nextWarning = activityPageWarning(page)
      setWarning(previous => nextWarning ?? (after ? previous : null))
      setError(null)
    } catch (caught) {
      if (generation.current === current) setError(caught instanceof Error ? caught.message : 'Unable to load session activity.')
    } finally {
      if (generation.current === current) { busy.current = false; setLoading(false) }
    }
  }, [sessionId, source])

  useEffect(() => {
    const current = ++generation.current
    busy.current = false
    const timer = window.setTimeout(() => { setRecords([]); setCursor(null); void load(null) }, 0)
    return () => { generation.current = current + 1; busy.current = false; window.clearTimeout(timer) }
  }, [load])

  const operations = useMemo(() => activityOperations(records), [records])
  const visible = operations.filter(record => (kind === 'all' || record.caller.kind === kind)
    && (outcome === 'all' || activityOutcome(record) === outcome)
    && (category === 'all' || record.category === category)
    && [record.operation, record.caller.name, record.caller.clientName, record.caller.workId, record.runId, record.traceId]
      .some(value => value?.toLowerCase().includes(query.toLowerCase())))
  const openRun = async (record: SessionActivityRecord) => {
    try { await onOpenRun?.(record.runId!, record.appId) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The linked trace is unavailable.') }
  }

  return <section className="session-activity" aria-label="Session activity">
    <div className="session-activity-toolbar">
      <input aria-label="Search activity" placeholder="Operation, caller, work or run ID" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="Caller kind" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="all">All callers</option>{['human', 'agent', 'automation', 'unknown'].map(value => <option key={value}>{value}</option>)}
      </select>
      <select aria-label="Activity outcome" value={outcome} onChange={event => setOutcome(event.target.value)}>
        <option value="all">All outcomes</option>{['succeeded', 'failed', 'rejected', 'cancelled', 'inconclusive', 'unknown', 'incomplete'].map(value => <option key={value}>{value}</option>)}
      </select>
      <select aria-label="Activity category" value={category} onChange={event => setCategory(event.target.value)}>
        <option value="all">All categories</option>{[...new Set(operations.map(record => record.category))].sort().map(value => <option key={value}>{value}</option>)}
      </select>
      <button type="button" disabled={loading} onClick={() => void load(cursor)}>{loading ? 'Loading…' : 'Load more / refresh'}</button>
      {source.jsonlUrl ? <a href={source.jsonlUrl(sessionId)} target="_blank" rel="noreferrer">JSONL page</a> : null}
    </div>
    <p className="session-activity-caption">{visible.length} of {operations.length} loaded operations · Actual operation time, including edits after recording. Caller declarations are labelled separately from verified identity.</p>
    {warning ? <p className="session-activity-warning" role="status">{warning}</p> : null}
    {error ? <p className="session-activity-warning" role="alert">{error}</p> : null}
    <div className="session-activity-list">
      {!visible.length && !loading ? <p className="session-activity-empty">{records.length ? 'No activity matches these filters.' : 'No retained activity. Older recordings may predate activity capture.'}</p> : null}
      {visible.map(record => <details key={`${record.provenance}:${record.operationId}`} className="session-activity-row">
        <summary>
          <time dateTime={record.startedAtUtc}>{new Date(record.startedAtUtc).toLocaleString()}</time>
          <strong>{record.operation}</strong>
          <span>{record.caller.name ?? record.caller.clientName ?? 'Unknown caller'} · {record.caller.kind}</span>
          <span className={`session-activity-outcome session-activity-outcome--${activityOutcome(record)}`}>{activityOutcome(record)}</span>
        </summary>
        <dl>
          <dt>Executor</dt><dd>{record.caller.kind} · {record.caller.executorAttribution}</dd>
          <dt>Principal</dt><dd>{record.caller.principalId ?? 'Unknown'} · {record.caller.principalAttribution}</dd>
          <dt>Client / ingress</dt><dd>{[record.caller.clientName, record.caller.clientVersion, record.caller.ingress].filter(Boolean).join(' · ')}</dd>
          {record.caller.initiatorKind ? <><dt>Initiated by</dt><dd>{record.caller.initiatorName ?? record.caller.initiatorKind} · {record.caller.initiatorAttribution}</dd></> : null}
          {record.caller.workId ? <><dt>External work</dt><dd>{record.caller.workId}</dd></> : null}
          <dt>Operation / parent</dt><dd>{record.operationId}{record.parentOperationId ? ` / ${record.parentOperationId}` : ''}</dd>
          <dt>Trace</dt><dd>{record.traceId}</dd>
          <dt>Runtime</dt><dd>{record.runtimeId}</dd>
          {record.requestId ? <><dt>Request</dt><dd>{record.requestId}</dd></> : null}
          <dt>Completion</dt><dd>{record.phase === 'completed' ? new Date(record.timestampUtc).toLocaleString() : 'No completion recorded. The operation may still be running or was interrupted.'}</dd>
          <dt>Provenance</dt><dd>{record.provenance}</dd>
          {record.deliveryOutcome ? <><dt>Input delivery</dt><dd>{record.deliveryOutcome}</dd></> : null}
          {record.evidenceStatus ? <><dt>Evidence</dt><dd>{record.evidenceStatus}</dd></> : null}
          {record.evidenceIds?.length ? <><dt>Evidence IDs</dt><dd>{record.evidenceIds.join(', ')}{onOpenEvidence ? <button type="button" onClick={() => { if (!onOpenEvidence(record.evidenceIds)) setError('The linked evidence is no longer retained in this recording.') }}>Show evidence</button> : null}</dd></> : null}
          {record.runId ? <><dt>Run</dt><dd>{record.runId}{record.provenance === 'local' && onOpenRun ? <button type="button" onClick={() => void openRun(record)}>Open trace</button>
            : record.provenance === 'local' && source.traceUrl ? <a href={source.traceUrl(record.runId, record.appId)} target="_blank" rel="noreferrer">Trace JSON</a> : null}</dd></> : null}
          {record.batchRunId ? <><dt>Batch</dt><dd>{record.batchRunId}</dd></> : null}
        </dl>
      </details>)}
    </div>
  </section>
}
