import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSessionTouchGestures, isPenTouch } from '../dist/library/replay/sessionTouchReplay.js'
import { visibleTouches } from '../dist/library/replay/touchReplay.js'

const start = Date.parse('2026-10-11T00:00:00Z')
const frame = { width: 1170, height: 2532 }
const sample = (id, offset, action, overrides = {}) => ({
  id, action, capturedAtUtc: new Date(start + offset).toISOString(),
  pointerId: 1, pointerIndex: 0, pointerCount: 1,
  x: 195, y: 422, surfaceWidth: 390, surfaceHeight: 844,
  coordinateUnit: 'points', ...overrides,
})

test('session playback retains a long hold and fades the contact after release', () => {
  const gestures = buildSessionTouchGestures([
    sample('down', 0, 'down'), sample('move', 3000, 'move', { x: 100 }),
    sample('up', 3500, 'up', { x: 80 }), sample('again', 3800, 'down', { x: 300 }),
  ])
  const held = visibleTouches(gestures, start + 2500, frame)
  assert.equal(held.length, 1)
  assert.deepEqual(held[0].point, { x: .5, y: .5 })
  assert.equal(held[0].opacity, 1)
  const released = visibleTouches(gestures, start + 4300, frame)
  assert.equal(released.length, 2)
  assert.equal(released[0].opacity, .5)
  assert.equal(released[0].radius, 62)
  assert.deepEqual(released[0].trail.map(point => point.x), [100 / 390, 80 / 390])
  assert.deepEqual(visibleTouches(gestures, start + 2500, frame), held)
})

test('session gestures omit pen markers, estimated corrections and invalid timestamps', () => {
  const records = [
    sample('finger', 0, 'down'),
    sample('pencil', 10, 'down', { details: { tool: 'stylus', force: .5 } }),
    sample('eraser', 20, 'move', { details: { tool: 'eraser', pressure: .8 } }),
    sample('hover', 30, 'hoverMove', { details: { tool: 'stylus' } }),
    sample('correction', 40, 'move', { details: { sampleKind: 'estimatedUpdate' } }),
    sample('invalid', 50, 'down', { capturedAtUtc: 'invalid' }),
    sample('missing', 60, 'down', { capturedAtUtc: undefined }),
    sample('release', 70, 'up'),
  ]
  const gestures = buildSessionTouchGestures(records)
  assert.equal(gestures.length, 1)
  assert.deepEqual(gestures[0].samples.map(touch => touch.id), ['finger', 'release'])
  assert.deepEqual(records.filter(isPenTouch).map(touch => touch.id), ['pencil', 'eraser', 'hover'])
})
