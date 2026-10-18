import { CircleNotch, FlowArrow, X } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import { SessionActivityPanel } from '../replay/components/SessionActivityPanel'
import type { SessionActivitySource } from '../replay/sessionActivity'
import type { LocalTestHistory, LocalTestHistoryInspection, LocalTestRunSummary } from './types'

export type SessionTraceTarget = {
  sessionId: string
  title: string
  source: SessionActivitySource
  supportsTestHistory: boolean
}

type TraceRun = Pick<LocalTestRunSummary, 'runId' | 'appId' | 'displayName'>

export function SessionTracePanel({ session, initialRun, onClose, onOpenEvidence, renderInspection }: {
  session: SessionTraceTarget
  initialRun?: TraceRun | null
  onClose: () => void
  onOpenEvidence?: (ids: string[]) => boolean
  renderInspection: (inspection: LocalTestHistoryInspection) => ReactNode
}) {
  const [view, setView] = useState<'operations' | 'execution'>(initialRun ? 'execution' : 'operations')
  const [runs, setRuns] = useState<TraceRun[]>(initialRun ? [initialRun] : [])
  const [selectedRun, setSelectedRun] = useState<TraceRun | null>(initialRun ?? null)
  const [inspection, setInspection] = useState<LocalTestHistoryInspection | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [traceError, setTraceError] = useState<string | null>(null)

  useEffect(() => {
    if (!session.supportsTestHistory) return
    let cancelled = false
    const query = new URLSearchParams({ sessionId: session.sessionId, limit: '250' })
    void fetch(`api/test-history?${query}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`Unable to load linked traces (HTTP ${response.status}).`)
        const history = await response.json() as LocalTestHistory
        if (cancelled) return
        const matching = history.runs.filter(run => run.sessionId === session.sessionId)
        setRuns(initialRun && !matching.some(run => run.runId === initialRun.runId) ? [initialRun, ...matching] : matching)
        setSelectedRun(current => current ?? matching[0] ?? null)
      })
      .catch(error => { if (!cancelled) setHistoryError(error instanceof Error ? error.message : 'Unable to load linked traces.') })
    return () => { cancelled = true }
  }, [session.sessionId, session.supportsTestHistory, initialRun])

  useEffect(() => {
    if (view !== 'execution' || !selectedRun) return
    let cancelled = false
    const run = selectedRun
    const timer = window.setTimeout(() => {
      setIsLoading(true)
      setInspection(null)
      setTraceError(null)
      const query = run.appId ? `?${new URLSearchParams({ appId: run.appId })}` : ''
      void fetch(`api/test-history/${encodeURIComponent(run.runId)}${query}`, { cache: 'no-store' })
        .then(async response => {
          if (!response.ok) throw new Error(response.status === 404
            ? 'The linked execution trace is no longer retained. Its audit operations are still available.'
            : `Unable to load the execution trace (HTTP ${response.status}).`)
          const result = await response.json() as LocalTestHistoryInspection
          if (!cancelled) setInspection(result)
        })
        .catch(error => { if (!cancelled) setTraceError(error instanceof Error ? error.message : 'Unable to load the execution trace.') })
        .finally(() => { if (!cancelled) setIsLoading(false) })
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [view, selectedRun])

  function openRun(runId: string, appId?: string | null) {
    const run = runs.find(candidate => candidate.runId === runId) ?? { runId, appId, displayName: `Run ${runId}` }
    setRuns(current => current.some(candidate => candidate.runId === runId) ? current : [...current, run])
    setSelectedRun(run)
    setInspection(null)
    setTraceError(null)
    setView('execution')
    return Promise.resolve()
  }

  return <div className="local-test-history-backdrop" role="presentation" onMouseDown={event => {
    if (event.currentTarget === event.target) onClose()
  }}>
    <section aria-label="Session trace" className="local-test-history-panel local-session-trace-panel">
      <header>
        <div>
          <p className="eyebrow">Session trace</p>
          <h3>{session.title}</h3>
          <span className="local-test-history-muted">{session.sessionId}</span>
        </div>
        <button aria-label="Close session trace" className="local-icon-button" onClick={onClose} type="button"><X aria-hidden="true" /></button>
      </header>
      <div className="local-test-history-body">
        <div className="local-startup-view-switch local-session-trace-tabs" role="tablist" aria-label="Session trace sections">
          <button role="tab" aria-selected={view === 'operations'} aria-pressed={view === 'operations'} onClick={() => setView('operations')} type="button">Operations</button>
          {session.supportsTestHistory ? <button role="tab" aria-selected={view === 'execution'} aria-pressed={view === 'execution'} onClick={() => setView('execution')} type="button">Execution trace</button> : null}
        </div>
        <div hidden={view !== 'operations'}>
          <SessionActivityPanel sessionId={session.sessionId} source={session.source}
            onOpenRun={session.supportsTestHistory ? openRun : undefined} onOpenEvidence={onOpenEvidence} />
        </div>
        {view === 'execution' ? <>
          {historyError ? <p className="inline-message" role="alert">{historyError}</p> : null}
          {runs.length ? <label className="local-session-trace-run">
            Execution
            <select aria-label="Session execution" value={selectedRun?.runId ?? ''} onChange={event => {
              setSelectedRun(runs.find(run => run.runId === event.target.value) ?? null)
              setInspection(null)
              setTraceError(null)
            }}>{runs.map(run => <option key={run.runId} value={run.runId}>{run.displayName} · {run.runId}</option>)}</select>
          </label> : null}
          {traceError ? <p className="inline-message" role="alert">{traceError}</p> : null}
          {isLoading ? <div className="local-test-history-empty"><CircleNotch className="spin" aria-hidden="true" /><strong>Loading execution trace</strong></div>
            : inspection ? renderInspection(inspection)
              : !selectedRun ? <div className="local-test-history-empty"><FlowArrow aria-hidden="true" /><strong>No linked execution trace</strong><span>Standalone commands and interactions are listed under Operations.</span></div> : null}
        </> : null}
      </div>
    </section>
  </div>
}
