import type { SessionAnnotation } from '../replay/sessionViewerData'
export type TrackClip = { annotation: SessionAnnotation; id: string; start: number; end: number; row: number; lane: 'markings' | 'speech' }
export function annotationTrackLayout(annotations: SessionAnnotation[]) {
  const ends = { markings: [] as number[], speech: [] as number[] }
  const clips: TrackClip[] = annotations.map((annotation, index) => {
    const start = Date.parse(annotation.startUtc ?? '')
    const finish = Date.parse(annotation.endUtc ?? '')
    return { annotation, id: annotation.annotationId || `annotation-${index}`, start, end: Math.max(start + 100, Number.isFinite(finish) ? finish : start + 1000), row: 0,
      lane: ['localPortal.exploration', 'companion.exploration'].includes(annotation.source ?? '') && annotation.customData?.kind === 'speech' ? 'speech' as const : 'markings' as const }
  }).filter(clip => Number.isFinite(clip.start)).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  for (const clip of clips) {
    const rows = ends[clip.lane]
    const free = rows.findIndex(end => end <= clip.start)
    clip.row = free < 0 ? rows.length : free
    rows[clip.row] = clip.end
  }
  const start = clips.length ? Math.min(...clips.map(clip => clip.start)) : 0
  const end = clips.length ? Math.max(start + 1000, ...clips.map(clip => clip.end)) : 1000
  return { clips, start, end, rows: { markings: Math.max(1, ends.markings.length), speech: Math.max(1, ends.speech.length) } }
}
export function recordingDeliveryKey(ids: string[]) {
  // Storage identity follows the exact set, so adding another comment creates a new delivery.
  return `recording:${[...new Set(ids)].sort().join(',')}`
}
