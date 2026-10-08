import { ChartBar, CircleNotch, Stop, X } from '@phosphor-icons/react'
import { useCallback, useLayoutEffect, useRef } from 'react'
import type { LocalTestExecution, LocalTestExecutionProgress } from './types'

export function DraftRunDetailsModal({ cancelError, isCancelling, onCancel, onClose, onViewTrace, run }: {
  cancelError: string | null
  isCancelling: boolean
  onCancel: (() => void) | null
  onClose: () => void
  onViewTrace: (() => void) | null
  run: LocalTestExecution
}) {
  const timelineRef = useRef<HTMLOListElement>(null)
  const followsLatestRef = useRef(true)
  const scrollToLatest = useCallback(() => {
    const timeline = timelineRef.current
    if (timeline && followsLatestRef.current) timeline.scrollTop = timeline.scrollHeight
  }, [])

  // Follow before paint so newly appended rows do not flash above the latest update.
  useLayoutEffect(scrollToLatest, [run.progress, scrollToLatest])

  useLayoutEffect(() => {
    const timeline = timelineRef.current
    if (!timeline) return
    // Keep the tail visible when wrapping or the modal header changes its height.
    const observer = new ResizeObserver(scrollToLatest)
    observer.observe(timeline)
    return () => observer.disconnect()
  }, [scrollToLatest])

  return <div className="modal-backdrop local-draft-run-details-backdrop" onMouseDown={onClose}>
    <section aria-label="Draft test run details" aria-modal="true" className="session-info-modal local-draft-run-details-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
      <header className="local-draft-run-details-header">
        <span><strong>{isCancelling ? 'Cancelling test…' : run.status === 'succeeded' ? 'Test passed' : run.status === 'failed' ? 'Test failed' : run.status === 'cancelled' ? 'Test cancelled' : 'Test running'}</strong><small>Started {new Date(run.createdAtUtc).toLocaleString()} · {run.progress.length} updates</small></span>
        <div>{onCancel ? <button className="button button--secondary" disabled={isCancelling} onClick={onCancel} type="button">{isCancelling ? <CircleNotch className="spin" /> : <Stop />}{isCancelling ? 'Cancelling…' : 'Cancel test'}</button> : null}{onViewTrace ? <button className="button button--secondary" onClick={onViewTrace} type="button"><ChartBar />View trace</button> : null}<button aria-label="Close run details" className="button button--secondary" onClick={onClose} type="button"><X /></button></div>
      </header>
      {cancelError ? <p className="local-draft-run-details-error" role="alert">{cancelError}</p> : null}
      <p className="local-draft-run-details-message">{latestProgressMessage(run.progress) || run.message}</p>
      {run.result?.traceError ? <p className="local-draft-run-details-error">{run.result.traceError}</p> : null}
      <ol aria-label="Test run updates" className="local-draft-run-details-timeline" onScroll={(event) => {
        const timeline = event.currentTarget
        followsLatestRef.current = timeline.scrollHeight - timeline.clientHeight - timeline.scrollTop <= 2
      }} ref={timelineRef} tabIndex={0}>{draftRunProgressRows(run.progress).map(({ step, index, discovery }) => {
        const kind = draftRunProgressKind(step)
        return <li className={`local-draft-run-step--${kind}`} key={`${index}:${step.occurredAtUtc}`}><time>{new Date(step.occurredAtUtc).toLocaleTimeString()}</time><small>{draftRunProgressKindLabel(kind)}</small><div className="local-draft-run-step-message">{discovery
          ? <details className="local-draft-run-discovery"><summary>{discoverySummary(discovery)}</summary><p>Checks for saved automation scripts the agent can use.</p>{discovery.map((check, checkIndex) => <p key={checkIndex}>{check.message}</p>)}</details>
          : step.message}</div></li>
      })}</ol>
    </section>
  </div>
}

type DraftRunProgressKind = 'context' | 'app-graph' | 'model' | 'decision' | 'discovery' | 'task' | 'batch' | 'ui' | 'tool' | 'result'

type DraftRunProgressRow = { step: LocalTestExecutionProgress, index: number, discovery?: LocalTestExecutionProgress[] }

function draftRunProgressRows(progress: LocalTestExecutionProgress[]): DraftRunProgressRow[] {
  const rows: DraftRunProgressRow[] = []
  progress.forEach((step, index) => {
    const previous = rows.at(-1)
    if (step.stage.toLowerCase() === 'taskdiscovery') {
      if (previous?.discovery && previous.step.testId === step.testId && previous.step.testIndex === step.testIndex) previous.discovery.push(step)
      else rows.push({ step, index, discovery: [step] })
    } else rows.push({ step, index })
  })
  return rows
}

function discoverySummary(checks: LocalTestExecutionProgress[]): string {
  const selected = checks.map((step) => /^Selected (\d+) repository task shortcut\(s\)\./.exec(step.message)?.[1]).findLast((count) => count !== undefined)
  if (selected === '0') return 'No saved automation scripts matched this instruction.'
  if (selected !== undefined) return `Found ${selected} saved automation script${selected === '1' ? '' : 's'} to consider.`
  return `Searching saved automation scripts · ${checks.length} check${checks.length === 1 ? '' : 's'}`
}

function latestProgressMessage(progress: LocalTestExecutionProgress[]): string | undefined {
  const latest = progress.at(-1)
  return latest?.stage.toLowerCase() === 'taskdiscovery' ? discoverySummary([latest]) : latest?.message
}

function draftRunProgressKind(step: LocalTestExecutionProgress): DraftRunProgressKind {
  const stage = step.stage.toLowerCase()
  if (stage === 'thinking' || stage === 'modelcompleted') return 'model'
  if (stage === 'callingtool' || stage === 'toolcompleted') {
    if (/^(Completed all \d+ batch steps|Batch stopped after)/.test(step.message)) return 'batch'
    if (/^(Choosing how to continue|Task choice|Decision):/.test(step.message)) return 'decision'
    const toolName = /^Calling ([\w]+) with\b/.exec(step.message)?.[1]
      ?? /^([\w]+) (?:completed in|failed after)\b/.exec(step.message)?.[1]
    if (toolName === 'ansight_declare_uncovered_step') return 'decision'
    if (toolName === 'ansight_list_tasks') return 'discovery'
    if (toolName === 'ansight_run_task') return 'task'
    if (toolName === 'ansight_run_ui_batch') return 'batch'
    if (toolName && /(_ui|screenshot|visual_tree|simulator|tap|swipe|type_text)/i.test(toolName)) return 'ui'
    return 'tool'
  }
  if (stage === 'taskdiscovery') return 'discovery'
  if (stage === 'appgraphupdated') return 'app-graph'
  if (stage === 'instructioncompleted' || stage === 'completed' || stage === 'test.complete') return 'result'
  return 'context'
}

function draftRunProgressKindLabel(kind: DraftRunProgressKind): string {
  switch (kind) {
    case 'app-graph': return 'App Graph'
    case 'model': return 'Model'
    case 'decision': return 'Decision'
    case 'discovery': return 'Discovery'
    case 'task': return 'Task'
    case 'batch': return 'Batch'
    case 'ui': return 'Live UI'
    case 'tool': return 'Tool'
    case 'result': return 'Result'
    default: return 'Context'
  }
}
