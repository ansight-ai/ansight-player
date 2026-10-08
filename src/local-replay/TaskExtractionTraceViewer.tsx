import { ChartBar, Coins, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LocalTaskExtractionModelPassTrace, LocalTaskExtractionToolCallTrace, LocalTaskExtractionTrace, LocalTaskExtractionTracePayload } from './types'

type TraceNode = {
  id: string
  kind: 'context' | 'model' | 'tool' | 'result'
  title: string
  subtitle: string
  startedAtUtc: string
  durationMilliseconds: number
  tokens: number
  failed: boolean
  pass?: LocalTaskExtractionModelPassTrace
  tool?: LocalTaskExtractionToolCallTrace
}

export function TaskExtractionTraceViewer({ onClose, trace }: { onClose: () => void; trace: LocalTaskExtractionTrace }) {
  const [view, setView] = useState<'graph' | 'timeline' | 'table'>('graph')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const nodes = useMemo(() => buildTraceNodes(trace), [trace])
  const selected = nodes.find((node) => node.id === selectedId)
  const start = Math.min(...nodes.map((node) => Date.parse(node.startedAtUtc)).filter(Number.isFinite))
  const end = Math.max(start + 1, ...nodes.map((node) => Date.parse(node.startedAtUtc) + node.durationMilliseconds).filter(Number.isFinite))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function exportJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `task-extraction-trace-${trace.runId ?? 'local'}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="modal-backdrop local-task-extraction-trace-backdrop" onMouseDown={onClose}>
    <section aria-label="Task extraction trace" aria-modal="true" className="session-info-modal local-task-extraction-trace-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
      <div className="modal-heading">
        <div><p className="eyebrow">Task extraction</p><h2>Usage trace</h2>
          <p className="muted">{trace.status === 'collecting' ? 'Usage is still being finalized.' : `${trace.modelPasses.length.toLocaleString()} model passes · ${(trace.toolCalls ?? []).length.toLocaleString()} tool calls recorded.`}</p></div>
        <button aria-label="Close extraction trace" className="button button--secondary button--icon" onClick={onClose} type="button"><X /></button>
      </div>
      <div className="local-task-extraction-trace-summary">
        <TraceMetric icon={<Coins />} label="Estimated cost" value={formatCost(trace)} />
        <TraceMetric icon={<ChartBar />} label="Total tokens" value={trace.tokens.totalTokens.toLocaleString()} />
        <TraceMetric label="Input / output" value={`${trace.tokens.inputTokens.toLocaleString()} / ${trace.tokens.outputTokens.toLocaleString()}`} />
        <TraceMetric label="Cached / reasoning" value={`${trace.tokens.cachedInputTokens.toLocaleString()} / ${trace.tokens.reasoningOutputTokens.toLocaleString()}`} />
      </div>
      <p className="muted local-task-extraction-trace-message">
        <strong>One-off optimisation.</strong> Extraction turns the recorded workflow into a reusable task. Once saved, the task can run repeatedly without repeating this extraction cost or asking AI to work out the same steps again.
      </p>
      {trace.message ? <p className="inline-message local-task-extraction-trace-message">{trace.message}</p> : null}
      <section className="local-task-extraction-trace-passes">
        <div className="local-task-extraction-trace-section-heading"><div><p className="eyebrow">Trace</p><h3>Execution trace <span className="local-test-trace-count">{nodes.length} nodes</span></h3></div>
          <div className="local-task-extraction-trace-actions">{trace.runId ? <code title={trace.runId}>Run {shortId(trace.runId)}</code> : null}<button onClick={exportJson} type="button">Export trace JSON</button></div></div>
        <div className="local-startup-view-switch" role="group" aria-label="Trace view">
          {(['graph', 'timeline', 'table'] as const).map((choice) => <button aria-pressed={view === choice} key={choice} onClick={() => setView(choice)} type="button">{choice[0].toUpperCase() + choice.slice(1)}</button>)}
        </div>
        {nodes.length === 0 ? <p className="local-task-extraction-hint">Waiting for the first model pass.</p> : null}
        {view === 'graph' ? <div className="local-test-trace-scroll" role="region" tabIndex={0} aria-label="Chronological task extraction graph"><div className="local-test-trace-graph" role="list">
          {nodes.map((node, index) => <div className="local-test-trace-step" key={node.id} role="listitem">
            {index > 0 ? <span className="local-test-trace-edge" aria-hidden="true"><i /></span> : null}
            <button aria-pressed={selectedId === node.id} className={`local-test-trace-node local-test-trace-node--${node.kind}${node.failed ? ' local-test-trace-node--error' : ''}`} onClick={() => setSelectedId(node.id)} type="button">
              <span className="local-test-trace-node-kind">{kindLabel(node.kind)}</span><span className="local-test-trace-title"><strong>{node.title}</strong></span><small>{node.subtitle}</small>
              <span className="local-test-trace-node-stats"><span>{node.tokens.toLocaleString()} tokens</span><span>{formatDuration(node.durationMilliseconds)}</span></span>
              <span className="local-test-trace-node-cumulative">{new Date(node.startedAtUtc).toLocaleTimeString()}</span>
            </button></div>)}
        </div></div> : null}
        {view === 'timeline' ? <div className="local-extraction-timeline" role="region" tabIndex={0} aria-label="Task extraction timeline">
          <p>Time runs left to right from the first model pass. Select a step to inspect its recorded inputs and results.</p>
          {nodes.map((node) => <button aria-pressed={selectedId === node.id} className={`local-extraction-timeline-row local-test-trace-node--${node.kind}`} key={node.id} onClick={() => setSelectedId(node.id)} type="button">
            <span>{node.title}</span><span className="local-extraction-timeline-track"><i style={{ left: `${((Date.parse(node.startedAtUtc) - start) / (end - start)) * 100}%`, width: `${Math.max(0.5, node.durationMilliseconds / (end - start) * 100)}%` }} /></span><span>{formatDuration(node.durationMilliseconds)}</span>
          </button>)}
        </div> : null}
        {view === 'table' ? <div className="local-extraction-table-scroll"><table className="local-trace-step-table"><thead><tr><th>Step</th><th>Type</th><th>Started</th><th>Duration</th><th>Tokens</th><th>Status</th></tr></thead><tbody>
          {nodes.map((node) => <tr key={node.id}><td><button onClick={() => setSelectedId(node.id)} type="button">{node.title}</button></td><td>{kindLabel(node.kind)}</td><td>{new Date(node.startedAtUtc).toLocaleTimeString()}</td><td>{formatDuration(node.durationMilliseconds)}</td><td>{node.tokens.toLocaleString()}</td><td>{node.failed ? 'Failed' : 'Completed'}</td></tr>)}
        </tbody></table></div> : null}
        {selected ? <section aria-label="Selected step details" className="local-trace-detail-panel"><button onClick={() => setSelectedId(null)} type="button">Close details</button>
          <div className="local-test-trace-inspector"><header><span className={`local-test-trace-node-kind local-test-trace-node-kind--${selected.kind}`}>{kindLabel(selected.kind)}</span><div><strong>{selected.title}</strong><span>{selected.subtitle}</span></div><span>{formatDuration(selected.durationMilliseconds)} · {new Date(selected.startedAtUtc).toLocaleTimeString()}</span></header>
            {selected.pass ? <><div className="local-task-extraction-trace-token-grid">
              {Object.entries({ Total: selected.pass.tokens.totalTokens, Input: selected.pass.tokens.inputTokens, Output: selected.pass.tokens.outputTokens, Cached: selected.pass.tokens.cachedInputTokens, 'Cache write': selected.pass.tokens.cacheWriteInputTokens, Reasoning: selected.pass.tokens.reasoningOutputTokens }).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}
            </div><div className="local-extraction-inspector-meta">Model: {selected.pass.model ?? 'Unknown'} · Reasoning: {selected.pass.reasoning ?? 'Unknown'} · Service tier: {selected.pass.serviceTier ?? 'Unknown'} · Response: {selected.pass.responseId ?? 'None'}</div>
              <div><TracePayload label="Exact model context" payload={selected.pass.context} /><TracePayload label="Assistant output" payload={selected.pass.assistantOutput} />
                <details><summary>Requested tools ({selected.pass.functionCalls.length})</summary><pre>{selected.pass.functionCalls.join('\n') || 'No tool calls requested.'}</pre></details>
                {selected.pass.errorMessage ? <details open><summary>Error</summary><pre>{selected.pass.errorMessage}</pre></details> : null}</div></> : null}
            {selected.tool ? <><div className="local-extraction-inspector-meta">Pass {selected.tool.passSequence} · Call ID: {selected.tool.callId} · {selected.tool.isError ? 'Failed' : 'Completed'}</div><div><TracePayload label="Arguments" payload={selected.tool.arguments} /><TracePayload label="Result" payload={selected.tool.result} /></div></> : null}
            {selected.kind === 'context' ? <div><TracePayload label="Initial model context" payload={trace.modelPasses[0]?.context} /></div> : null}
            {selected.kind === 'result' ? <div><details open><summary>Run token usage and status</summary><pre>{JSON.stringify({ status: trace.status, message: trace.message, tokens: trace.tokens, calculatedCost: trace.calculatedCost }, null, 2)}</pre></details></div> : null}
          </div></section> : null}
      </section>
    </section>
  </div>
}

function buildTraceNodes(trace: LocalTaskExtractionTrace): TraceNode[] {
  const passes: TraceNode[] = trace.modelPasses.map((pass) => ({ id: `model:${pass.sequence}`, kind: 'model', title: `Model pass ${pass.sequence}`, subtitle: `${pass.functionCalls.length} tool call(s) requested`, startedAtUtc: pass.startedAtUtc, durationMilliseconds: pass.durationMilliseconds, tokens: pass.tokens.totalTokens, failed: pass.succeeded === false, pass }))
  const tools: TraceNode[] = (trace.toolCalls ?? []).map((tool) => ({ id: `tool:${tool.sequence}`, kind: 'tool', title: tool.toolName, subtitle: `Pass ${tool.passSequence} · ${tool.isError ? 'failed' : 'completed'}`, startedAtUtc: tool.startedAtUtc, durationMilliseconds: tool.durationMilliseconds, tokens: 0, failed: tool.isError, tool }))
  const events = [...passes, ...tools].sort((a, b) => Date.parse(a.startedAtUtc) - Date.parse(b.startedAtUtc) || (a.kind === 'model' ? -1 : 1))
  if (!events.length) return []
  const first = events[0]
  return [{ id: 'context', kind: 'context', title: 'Extraction context', subtitle: 'Instructions, selected evidence, and available tools', startedAtUtc: first.startedAtUtc, durationMilliseconds: 0, tokens: 0, failed: false }, ...events,
    { id: 'result', kind: 'result', title: `Extraction ${trace.status}`, subtitle: `${trace.tokens.totalTokens.toLocaleString()} total tokens`, startedAtUtc: new Date(Math.max(...events.map((event) => Date.parse(event.startedAtUtc) + event.durationMilliseconds))).toISOString(), durationMilliseconds: 0, tokens: trace.tokens.totalTokens, failed: trace.status === 'failed' }]
}

function TracePayload({ label, payload }: { label: string; payload?: LocalTaskExtractionTracePayload | null }) {
  return <details><summary>{label}{payload?.wasTruncated ? <span>truncated · SHA-256 {payload.sha256}</span> : null}</summary><pre>{payload?.content || 'Not recorded for this run.'}</pre></details>
}

function TraceMetric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) { return <div>{icon}<span>{label}</span><strong>{value}</strong></div> }
function kindLabel(kind: TraceNode['kind']) { return kind === 'context' ? 'Context' : kind === 'model' ? 'Model' : kind === 'tool' ? 'Tool' : 'Result' }
function formatDuration(ms: number) { return ms < 1000 ? `${ms.toLocaleString()} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s` }
function shortId(value: string) { return value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-6)}` }
function formatCost(trace: LocalTaskExtractionTrace) {
  const cost = trace.calculatedCost
  if (!cost) return trace.status === 'collecting' ? 'Calculating…' : 'Unavailable'
  const micros = cost.costMicros ?? cost.customerCostMicros
  if (micros == null) return 'Unavailable'
  const currency = cost.currency || 'USD'
  const value = micros / 1_000_000
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2, maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2 }).format(value) }
  catch { return `${currency} ${value.toFixed(4)}` }
}
