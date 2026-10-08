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
  period,
  selectedIds,
  taskExtractions,
}: {
  annotations: SessionAnnotation[]
  isLoading: boolean
  onAddAnnotation: () => void
  onEditAnnotation: (annotationId: string) => void
  onExtractTask: (section: { period: TimelinePeriod; name: string; description: string }) => void
  onJumpToTask: (annotationId: string) => void
  onSelectedIdsChange: (ids: string[]) => void
  period: TimelinePeriod
  selectedIds: string[]
  taskExtractions: Record<string, LocalTaskExtraction>
}) {
  const selectedOutsidePeriod = annotations.some((annotation) => selectedIds.includes(annotation.annotationId!)
    && (Date.parse(annotation.startUtc!) < period.startMs || Date.parse(annotation.endUtc!) > period.endMs))
  return <div className="local-test-intake">
    <div className="local-test-intake-heading">
      <span className="local-test-intake-step">Optional</span>
      <div>
        <h3>Mark reusable parts</h3>
        <p>Select session annotations to guide the test and generate reusable task drafts. Selecting a range outside the current replay expands the test period.</p>
      </div>
      <button className="button button--secondary" disabled={isLoading} onClick={onAddAnnotation} type="button"><NotePencil />Annotate on replay</button>
    </div>

    {isLoading ? <div className="local-test-intake-empty"><CircleNotch className="spin" />Loading range annotations…</div> : annotations.length ? <div className="local-test-intake-list">
      {annotations.map((annotation, index) => {
        const annotationId = annotation.annotationId!
        const startMs = Date.parse(annotation.startUtc!)
        const endMs = Date.parse(annotation.endUtc!)
        const outsidePeriod = startMs < period.startMs || endMs > period.endMs
        const label = annotation.label!.trim()
        const linkedTask = taskExtractions[annotationId]
        return <article className={`local-test-intake-card${selectedIds.includes(annotationId) ? ' is-selected' : ''}`} key={annotationId}>
          <label className="local-test-intake-card-main">
            <input aria-label={`Include ${label} in the test`} checked={selectedIds.includes(annotationId)} onChange={(event) => onSelectedIdsChange(event.target.checked ? [...selectedIds, annotationId] : selectedIds.filter((id) => id !== annotationId))} type="checkbox" />
            <span className="local-test-intake-card-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="local-test-intake-card-copy"><strong>{label}</strong><small>{annotation.notes || 'No description'}{outsidePeriod ? ' · Outside current replay' : ''}</small><time>{formatTime(startMs)} – {formatTime(endMs)}</time></span>
          </label>
          <div className="local-test-intake-card-actions">
            <button className="button button--secondary" onClick={() => onEditAnnotation(annotationId)} type="button"><NotePencil />Edit annotation</button>
            <button className="button button--secondary" onClick={() => linkedTask
              ? onJumpToTask(annotationId)
              : onExtractTask({ period: { startMs, endMs, focusMs: startMs }, name: label, description: annotation.notes?.trim() || label })} type="button"><Robot />{linkedTask?.draft ? 'Jump to task' : linkedTask ? 'View extraction' : 'Extract task'}</button>
          </div>
        </article>
      })}
    </div> : <div className="local-test-intake-empty"><NotePencil /><span><strong>No range annotations in this session</strong><small>You can generate a test directly from the replay. Add annotations when you want reusable task drafts too.</small></span></div>}

    <div className="local-test-intake-footer">
      <span>{selectedIds.length ? `${selectedIds.length} marked step${selectedIds.length === 1 ? '' : 's'} will guide the test and generate task drafts. The test includes the entire selected timeline range.${selectedOutsidePeriod ? ' The test period expands to include the selected ranges.' : ''}` : 'No marked steps selected. The test will use the entire selected timeline range.'}</span>
    </div>
  </div>
}

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
