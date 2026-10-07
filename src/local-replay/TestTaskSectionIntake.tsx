import { CircleNotch, NotePencil, Robot } from '@phosphor-icons/react'
import type { SessionAnnotation } from '../replay/sessionViewerData'
import type { LocalTaskExtraction } from './types'

type TimelinePeriod = { startMs: number; endMs: number; focusMs: number }

export function TestTaskSectionIntake({
  annotations,
  isLoading,
  onAddAnnotation,
  onEditAnnotation,
  onExtractTask,
  onJumpToTask,
  onSelectedIdsChange,
  onSkipChange,
  selectedIds,
  skip,
  taskExtractions,
}: {
  annotations: SessionAnnotation[]
  isLoading: boolean
  onAddAnnotation: () => void
  onEditAnnotation: (annotationId: string) => void
  onExtractTask: (section: { period: TimelinePeriod; name: string; description: string }) => void
  onJumpToTask: (annotationId: string) => void
  onSelectedIdsChange: (ids: string[]) => void
  onSkipChange: (skip: boolean) => void
  selectedIds: string[]
  skip: boolean
  taskExtractions: Record<string, LocalTaskExtraction>
}) {
  return <div className="local-test-intake">
    <div className="local-test-intake-heading">
      <span className="local-test-intake-step">Step 1</span>
      <div>
        <h3>Mark reusable parts</h3>
        <p>Annotate the core steps of this session. Selected ranges guide the test and each generates a reusable task draft when you choose Generate with AI.</p>
      </div>
      <button className="button button--secondary" disabled={isLoading} onClick={onAddAnnotation} type="button"><NotePencil />Annotate on replay</button>
    </div>

    {isLoading ? <div className="local-test-intake-empty"><CircleNotch className="spin" />Loading range annotations…</div> : annotations.length ? <div className="local-test-intake-list">
      {annotations.map((annotation, index) => {
        const annotationId = annotation.annotationId!
        const startMs = Date.parse(annotation.startUtc!)
        const endMs = Date.parse(annotation.endUtc!)
        const label = annotation.label!.trim()
        const linkedTask = taskExtractions[annotationId]
        return <article className={`local-test-intake-card${selectedIds.includes(annotationId) && !skip ? ' is-selected' : ''}`} key={annotationId}>
          <label className="local-test-intake-card-main">
            <input aria-label={`Include ${label} in the test`} checked={selectedIds.includes(annotationId) && !skip} disabled={skip} onChange={(event) => onSelectedIdsChange(event.target.checked ? [...selectedIds, annotationId] : selectedIds.filter((id) => id !== annotationId))} type="checkbox" />
            <span className="local-test-intake-card-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="local-test-intake-card-copy"><strong>{label}</strong><small>{annotation.notes || 'No description'}</small><time>{formatTime(startMs)} – {formatTime(endMs)}</time></span>
          </label>
          <div className="local-test-intake-card-actions">
            <button className="button button--secondary" onClick={() => onEditAnnotation(annotationId)} type="button"><NotePencil />Edit annotation</button>
            <button className="button button--secondary" onClick={() => linkedTask
              ? onJumpToTask(annotationId)
              : onExtractTask({ period: { startMs, endMs, focusMs: startMs }, name: label, description: annotation.notes?.trim() || label })} type="button"><Robot />{linkedTask?.draft ? 'Jump to task' : linkedTask ? 'View extraction' : 'Extract task'}</button>
          </div>
        </article>
      })}
    </div> : <div className="local-test-intake-empty"><NotePencil /><span><strong>No range annotations in this period</strong><small>Annotate a core step on the replay timeline, then return here to include it in the test.</small></span></div>}

    <div className="local-test-intake-footer">
      <span>{skip ? 'The test will use the full replay without marked steps or task drafts.' : selectedIds.length ? `${selectedIds.length} annotation${selectedIds.length === 1 ? '' : 's'} will guide the test and generate task drafts.` : 'Select an annotation or choose to use the full replay.'}</span>
      <label><input checked={skip} onChange={(event) => onSkipChange(event.target.checked)} type="checkbox" />Use full replay without marked steps</label>
    </div>
  </div>
}

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
