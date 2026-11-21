import { useMemo, useState } from 'react'
import { Microphone, NotePencil, PaperPlaneTilt, X } from '../icons'
import type { SessionAnnotation } from '../replay/sessionViewerData'
import type { AnnotationAgentSource } from './annotationAgentDelivery'
import { AnnotationAgentDeliveryPanel } from './AnnotationAgentDeliveryPanel'
import { annotationTrackLayout, recordingDeliveryKey } from './annotationTracks'
import { useExplorationActivity } from './explorationActivity'

export function AnnotationRecordingTracks({ annotations, selectedId, sessionId, source, onSelect }: {
  annotations: SessionAnnotation[]; selectedId: string | null; sessionId: string; source?: AnnotationAgentSource
  onSelect: (id: string, timestamp: number | null) => void
}) {
  const activeRecording = useExplorationActivity(sessionId)
  const groups = useMemo(() => [...new Set(annotations.map(a => a.captureGroupId).filter((id): id is string => !!id && annotations.some(a => a.captureGroupId === id && ['localPortal.exploration', 'companion.exploration'].includes(a.source ?? ''))))], [annotations])
  const [group, setGroup] = useState('all')
  const [zoom, setZoom] = useState(1)
  const [delivery, setDelivery] = useState<SessionAnnotation[] | null>(null)
  const [sending, setSending] = useState(false)
  const filtered = group === 'all' || !groups.includes(group) ? annotations : annotations.filter(a => a.captureGroupId === group)
  const layout = annotationTrackLayout(filtered)
  const duration = layout.end - layout.start
  const selected = layout.clips.find(clip => clip.id === selectedId)
  const ids = filtered.flatMap(annotation => annotation.annotationId ? [annotation.annotationId] : [])
  const busy = !!activeRecording && (group === 'all' || group === activeRecording)
  const time = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const position = (timestamp: number) => `${(timestamp - layout.start) / duration * 100}%`
  return <section className="annotation-recording-tracks" aria-label="Comments timeline">
    <div className="annotation-tracks-toolbar">
      <label>Recording <select value={group} onChange={event => { setGroup(event.target.value); setZoom(1) }}>
        <option value="all">All comments</option>
        {groups.map((id, index) => { const first = annotations.find(a => a.captureGroupId === id); return <option key={id} value={id}>Recording {index + 1} · {first?.startUtc ? time(Date.parse(first.startUtc)) : ''}</option> })}
      </select></label>
      <div className="annotation-tracks-zoom"><button type="button" aria-label="Zoom comments out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value / 2))}>−</button><button type="button" aria-label="Zoom comments in" disabled={zoom >= 16} onClick={() => setZoom(value => Math.min(16, value * 2))}>+</button></div>
      {source ? <button type="button" className="annotation-tracks-send" disabled={busy || !ids.length} title={busy ? 'Stop recording and finish saving before sending' : `Send ${ids.length} comments and markings together`} onClick={() => setDelivery([...filtered])}><PaperPlaneTilt aria-hidden="true" />Send {group === 'all' ? 'all' : 'recording'} to chat</button> : null}
    </div>
    {busy ? <small role="status">Recording or saving comments… Stop recording to send this set.</small> : null}
    <div className="annotation-tracks-scroll">
      <div className="annotation-tracks-grid" style={{ width: `${zoom * 100}%`, minWidth: 600 }}>
        <div className="annotation-track-label annotation-track-ruler-label">Time</div>
        <div className="annotation-track-ruler">{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ left: `${i * 20}%` }}>{time(layout.start + duration * i / 5)}</span>)}</div>
        {(['markings', 'speech'] as const).map(lane => <div className="annotation-track-row" key={lane}>
          <div className="annotation-track-label">{lane === 'markings' ? <NotePencil aria-hidden="true" /> : <Microphone aria-hidden="true" />}{lane === 'markings' ? 'Markings' : 'Speech'}</div>
          <div className={`annotation-track-canvas annotation-track-canvas--${lane}`} role="listbox" aria-label={lane === 'markings' ? 'Screen markings' : 'Transcribed speech'} style={{ height: layout.rows[lane] * 38 + 10 }}>
            {Array.from({ length: 6 }, (_, i) => <i key={i} className="annotation-track-gridline" style={{ left: `${i * 20}%` }} />)}
            {selected ? <i className="annotation-track-playhead" style={{ left: position(selected.start) }} /> : null}
            {layout.clips.filter(clip => clip.lane === lane).map(clip => <button type="button" role="option" aria-selected={clip.id === selectedId} aria-label={`${clip.annotation.label || 'Marking'}, ${time(clip.start)} to ${time(clip.end)}`} title={`${clip.annotation.label || 'Marking'}
${time(clip.start)} – ${time(clip.end)}`} key={clip.id}
              className={`annotation-track-clip${clip.id === selectedId ? ' annotation-track-clip--selected' : ''}`}
              style={{ left: position(clip.start), width: `${(clip.end - clip.start) / duration * 100}%`, top: clip.row * 38 + 5 }}
              onClick={() => onSelect(clip.id, clip.start)}>{clip.annotation.label || 'Marking'}</button>)}
          </div>
        </div>)}
      </div>
    </div>
    {delivery && source ? <div className="annotation-recording-delivery">
      <div className="annotation-recording-delivery-heading"><strong>Send {delivery.length} comments and markings together</strong><button type="button" aria-label="Close recording delivery" disabled={sending} onClick={() => setDelivery(null)}><X aria-hidden="true" /></button></div>
      <AnnotationAgentDeliveryPanel showSave={false} sessionId={sessionId} annotationId={recordingDeliveryKey(delivery.map(a => a.annotationId!))} source={source} disabled={busy} onBusyChange={setSending}
        onSend={async request => {
          const catalog = await source.catalog(sessionId, request.provider, request.projectId)
          if (!catalog.canBatch) throw new Error('Restart Ansight with the updated local host to send all comments together. Nothing was sent.')
          return source.send(sessionId, { ...request, annotationId: delivery[0].annotationId!, annotationIds: delivery.map(a => a.annotationId!) })
        }} />
    </div> : null}
  </section>
}
