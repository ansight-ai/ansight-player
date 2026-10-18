import type { SessionApplicationEvent } from './sessionViewerData'

export type TelemetrySpan = {
  id: string; parentSpanId?: string; name: string; channelId: number
  startMs: number; durationMs: number | null; status: 'ok' | 'error' | 'cancelled' | 'incomplete'
}

/** End records contain the start metadata so cropped and out-of-order streams still reconstruct. */
export function spansFromEvents(events: SessionApplicationEvent[]): TelemetrySpan[] {
  const spans = new Map<string, TelemetrySpan>()
  for (const event of events) {
    if (event.eventType.toLowerCase() !== 'span') continue
    try {
      const data: unknown = JSON.parse(event.details ?? '')
      if (!data || typeof data !== 'object') continue
      const value = data as Record<string, unknown>
      if (typeof value.spanId !== 'string' || !value.spanId.trim() || !['start', 'end'].includes(String(value.phase))) continue
      const startMs = typeof value.startedAtUtc === 'string' ? Date.parse(value.startedAtUtc) : NaN
      if (!Number.isFinite(startMs)) continue
      let durationMs: number | null = null
      let status: TelemetrySpan['status'] = 'incomplete'
      if (value.phase === 'end') {
        if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 0
          || !Number.isFinite(startMs + value.durationMs) || startMs + value.durationMs > 8.64e15) continue
        const outcome = value.status ?? 'ok'
        if (outcome !== 'ok' && outcome !== 'error' && outcome !== 'cancelled') continue
        durationMs = value.durationMs
        status = outcome
      }
      if (spans.get(value.spanId)?.durationMs != null) continue
      spans.set(value.spanId, { id: value.spanId, parentSpanId: typeof value.parentSpanId === 'string' ? value.parentSpanId : undefined,
        name: event.label, channelId: event.channelId ?? 255, startMs, durationMs, status })
    } catch { /* Malformed details remain available in the event lane. */ }
  }
  return [...spans.values()].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
}

/** Allocate simultaneous/nested operations separate rows; explicit parents remain visible in tooltips. */
export function layoutSpans(spans: TelemetrySpan[], startMs: number, endMs: number) {
  const rows: number[] = []
  return spans.filter(span => span.startMs <= endMs && span.startMs + (span.durationMs ?? Math.max(0, endMs - span.startMs)) >= startMs)
    .map(span => {
      const end = span.startMs + (span.durationMs ?? Math.max(0, endMs - span.startMs))
      let row = rows.findIndex(until => until <= span.startMs)
      if (row < 0) row = rows.length
      rows[row] = Math.max(end, span.startMs + 0.001)
      return { ...span, row, endMs: end }
    })
}
