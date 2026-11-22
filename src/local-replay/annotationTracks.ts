import type { SessionAnnotation } from '../replay/sessionViewerData'
export type TrackClip = { annotation: SessionAnnotation; id: string; start: number; end: number; row: number; lane: 'markings' | 'speech' | 'inferred' }
export function annotationTrackLayout(annotations: SessionAnnotation[]) {
  const ends: Record<TrackClip["lane"], number[]> = { markings: [], speech: [], inferred: [] }
  const clips = annotations.map((annotation, index): TrackClip => {
    const start = Date.parse(annotation.startUtc ?? '')
    const finish = Date.parse(annotation.endUtc ?? '')
    const isLegacySpeech = isFeedbackSpeech(annotation)
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

export const feedbackContextMs = 3000
export const isFeedbackAnnotation = (annotation: SessionAnnotation) => ['localPortal.exploration', 'companion.exploration'].includes(annotation.source ?? '')
export const isFeedbackSpeech = (annotation: SessionAnnotation) => isFeedbackAnnotation(annotation)
  && (annotation.customData?.kind === 'speech' || (!annotation.customData?.kind && !annotation.geometry?.length))
export const feedbackText = (annotation: SessionAnnotation) => [annotation.label?.trim(), annotation.notes?.trim()].filter(Boolean).join('\n')
export function feedbackSessions(annotations: SessionAnnotation[]) {
  const clips = annotationTrackLayout(annotations).clips.filter(clip => isFeedbackAnnotation(clip.annotation))
  const groups = new Map<string, TrackClip[]>()
  for (const clip of clips) {
    const id = clip.annotation.captureGroupId || clip.id
    groups.set(id, [...(groups.get(id) ?? []), clip])
  }
  return [...groups].map(([id, items]) => {
    const speech = items.filter(clip => isFeedbackSpeech(clip.annotation))
    const markings = items.filter(clip => !isFeedbackSpeech(clip.annotation)).map(clip => ({ ...clip,
      speechIds: speech.filter(line => line.start <= clip.end + feedbackContextMs && line.end >= clip.start - feedbackContextMs).map(line => line.id) }))
    const paragraphs: { start: number; end: number; lines: TrackClip[] }[] = []
    for (const line of speech) {
      const previous = paragraphs.at(-1)
      if (previous && line.start - previous.end <= feedbackContextMs) {
        previous.lines.push(line); previous.end = Math.max(previous.end, line.end)
      } else paragraphs.push({ start: line.start, end: line.end, lines: [line] })
    }
    return { id, start: items[0].start, end: Math.max(...items.map(clip => clip.end)), speech, markings, paragraphs,
      transcript: speech.map(clip => feedbackText(clip.annotation)).join(' ').replace(/\s+([,.;:!?])/g, '$1') }
  })
}
