import assert from 'node:assert/strict'
import test from 'node:test'
import { spansFromEvents, layoutSpans } from '../dist/library/replay/telemetrySpans.js'
import { formatMetricValue, metricPresentation } from '../dist/library/replay/metricPresentation.js'
const start = Date.parse('2026-10-18T00:00:00Z')
const event = (id, phase, durationMs, parentSpanId, startMs = start) => ({
  eventId: `${id}-${phase}`, eventType: 'Span', label: id, channelId: 64, capturedAtUtc: new Date(startMs).toISOString(),
  details: JSON.stringify({ spanId: id, parentSpanId, phase, durationMs, startedAtUtc: new Date(startMs).toISOString(), status: phase === 'end' ? 'ok' : undefined }),
})
test('end records survive truncation, reordering, and duplicates; unfinished spans remain incomplete', () => {
  const spans = spansFromEvents([event('outer', 'end', 16.67), event('outer', 'start'), event('child', 'end', .125, 'outer'), event('open', 'start'), event('outer', 'end', 99), event('bad', 'end', -1)])
  assert.equal(spans.length, 3)
  assert.equal(spans.find(span => span.id === 'outer').durationMs, 16.67)
  assert.equal(spans.find(span => span.id === 'child').parentSpanId, 'outer')
  assert.equal(spans.find(span => span.id === 'open').status, 'incomplete')
  const rows = layoutSpans(spans, start, start + 30)
  assert.equal(new Set(rows.map(span => span.row)).size, 3)
})
test('malformed span details and non-finite durations do not break replay', () => {
  assert.deepEqual(spansFromEvents([{ ...event('x', 'start'), details: '{' }, event('x', 'end', Infinity)]), [])
})
test('metric formatting retains fractional units and compatible axes', () => {
  const channel = { channelId: 64, name: 'Frame', unit: 'ms' }
  assert.equal(formatMetricValue(16.67, metricPresentation(channel, 64)), '16.67 ms')
  assert.equal(formatMetricValue(.125, metricPresentation(channel, 64)), '0.125 ms')
  assert.equal(metricPresentation(channel, 64).axisKey, metricPresentation({ ...channel, channelId: 65 }, 65).axisKey)
  assert.notEqual(metricPresentation(channel, 64).axisKey, metricPresentation({ ...channel, unit: 'bytes' }, 64).axisKey)
})
