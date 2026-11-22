import type { SessionAnnotation } from '../replay/sessionViewerData'
export type TrackClip = { annotation: SessionAnnotation; id: string; start: number; end: number; row: number; lane: 'markings' | 'speech' | 'inferred' }
export function annotationTrackLayout(annotations: SessionAnnotation[]) {
  const ends: Record<TrackClip["lane"], number[]> = { markings: [], speech: [], inferred: [] }
  const clips = annotations.map((annotation, index): TrackClip => {
    const start = Date.parse(annotation.startUtc ?? '')
    const finish = Date.parse(annotation.endUtc ?? '')
    const isLegacySpeech = ['localPortal.exploration', 'companion.exploration'].includes(annotation.source ?? '')
      && annotation.customData?.kind === 'speech'
    const lane = annotation.source === 'transcript.inferred' ? 'inferred' : isLegacySpeech ? 'speech' : 'markings'
    return { annotation, id: annotation.annotationId || `annotation-${index}`, start,
      end: Math.max(start + 100, Number.isFinite(finish) ? finish : start + 1000), row: 0, lane }
  }).filter(clip => Number.isFinite(clip.start)).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  for (const clip of clips) {
    const rows = ends[clip.lane]
    const free = rows.findIndex(end => end <= clip.start)
    clip.row = free < 0 ? rows.length : free
    rows[clip.row] = clip.end
  }
  const start = clips.length ? Math.min(...clips.map(clip => clip.start)) : 0
  const end = clips.length ? Math.max(start + 1000, ...clips.map(clip => clip.end)) : 1000
  return { clips, start, end, rows: { markings: Math.max(1, ends.markings.length), speech: Math.max(1, ends.speech.length), inferred: Math.max(1, ends.inferred.length) } }
}
export function recordingDeliveryKey(ids: string[]) {
  // Storage identity follows the exact set, so adding another comment creates a new delivery.
  return `recording:${[...new Set(ids)].sort().join(',')}`
}
