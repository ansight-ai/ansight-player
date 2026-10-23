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

test('session gestures retain pen and hover while omitting estimated corrections and invalid timestamps', () => {
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
  assert.equal(gestures.length, 3)
  assert.deepEqual(gestures[0].samples.map(touch => touch.id), ['finger', 'release'])
  assert.deepEqual(gestures[1].samples.map(touch => touch.id), ['pencil', 'hover'])
  assert.deepEqual(gestures[2].samples.map(touch => touch.id), ['eraser'])
  assert.deepEqual(records.filter(isPenTouch).map(touch => touch.id), ['pencil', 'eraser', 'hover'])
})

test('pencil tip follows captured tilt, azimuth, roll and pressure; hover fades and lifts', () => {
  const details = { tool: 'stylus', force: 2, maximumPossibleForce: 4, altitudeRadians: 0, azimuthRadians: Math.PI / 2, rollRadians: Math.PI }
  const gestures = buildSessionTouchGestures([
    sample('hover-start', 0, 'hoverEnter', { details: { ...details, distance: 1 } }),
    sample('hover-near', 100, 'hoverMove', { details: { ...details, distance: 0 } }),
    sample('down', 200, 'down', { x: 0, y: 0, details }),
    sample('move', 400, 'move', { x: 390, details: { ...details, altitudeRadians: Math.PI / 2 } }),
    sample('up', 500, 'up', { x: 390, details }),
  ])
  const hover = visibleTouches(gestures, start + 50, frame)[0]
  assert.equal(hover.pen.hover, true)
  assert.equal(hover.pen.pressure, 0)
  assert.equal(hover.pen.distance, .5)
  assert.equal(hover.pen.lift, 18)
  assert.ok(Math.abs(hover.pen.opacity - .55) < 1e-8)
  assert.deepEqual(hover.trail, [])
  const contact = visibleTouches(gestures, start + 300, frame).find(value => value.showTip)
  assert.equal(contact.pen.hover, false)
  assert.equal(contact.pen.pressure, .5)
  assert.equal(contact.pen.length, 56)
  assert.equal(contact.pen.rotation, 90)
  assert.equal(contact.pen.roll, Math.PI)
  assert.deepEqual(contact.tapPoint, { x: 0, y: 0 })
  assert.equal(contact.point.x, .5)
  assert.equal(visibleTouches(gestures, start + 300, frame).filter(value => value.showTip).length, 1)
  assert.deepEqual(visibleTouches(gestures, start + 50, frame)[0], hover, 'seeking backwards is deterministic')
})

test('pen interpolation takes the short rotation path and clamps malformed numeric metadata', () => {
  const gestures = buildSessionTouchGestures([
    sample('one', 0, 'down', { details: { tool: 'stylus', azimuthRadians: 350 * Math.PI / 180, rollRadians: 350 * Math.PI / 180, pressure: 8, altitudeRadians: NaN } }),
    sample('two', 100, 'move', { details: { tool: 'stylus', azimuthRadians: 10 * Math.PI / 180, rollRadians: 10 * Math.PI / 180, pressure: 8, altitudeRadians: NaN } }),
    sample('up', 200, 'up', { details: { tool: 'stylus' } }),
  ])
  const tip = visibleTouches(gestures, start + 50, frame)[0].pen
  assert.ok(Math.abs(tip.rotation - 360) < 1e-8)
  assert.ok(Math.abs(tip.roll - 2 * Math.PI) < 1e-8)
  assert.equal(tip.pressure, 1)
  assert.equal(tip.length, 32)
})
