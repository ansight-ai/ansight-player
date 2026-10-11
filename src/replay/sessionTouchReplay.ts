import type { SessionTouchInputRecord } from './sessionViewerData'
import { buildGestures, type Touch } from './touchReplay'

export function isPenTouch(touch: SessionTouchInputRecord): boolean {
  return touch.details?.tool === 'stylus' || touch.details?.tool === 'eraser'
}

// Retain the full contact history so a long hold remains visible between samples.
// Pen samples keep their pressure, tilt, orientation and hover presentation.
export function buildSessionTouchGestures(touches: SessionTouchInputRecord[]) {
  const samples: Touch[] = touches.flatMap((touch) => {
    const timeMs = Date.parse(touch.capturedAtUtc ?? '')
    if (isPenTouch(touch) || !Number.isFinite(timeMs)) return []
    return [{ ...touch, timeMs, sampleKind: touch.details?.sampleKind ?? undefined }]
  })
  return buildGestures(samples)
}
