import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectFrameForVisualTree } from '../src/replay/visualTreeFrame.ts'

const before = { frameId: 'collapsed', capturedAtUtc: '2026-09-13T23:35:44.064+00:00' }
const after = { frameId: 'expanded', capturedAtUtc: '2026-09-13T23:35:44.797+00:00' }
const snapshot = { capturedAtUtc: '2026-09-13T23:35:44.481+00:00' }

test('pairs the reported Redpoint snapshot with the closer expanded-sheet frame', () => {
  assert.equal(selectFrameForVisualTree([before, after], snapshot), after)
})

test('an explicit screenshot link takes priority over proximity', () => {
  assert.equal(selectFrameForVisualTree([before, after], { ...snapshot, screenshotFrameId: ' collapsed ' }), before)
})

test('missing links fall back to the closest retained frame', () => {
  assert.equal(selectFrameForVisualTree([before, after], { ...snapshot, screenshotFrameId: 'missing' }), after)
  assert.equal(selectFrameForVisualTree([before], snapshot), before)
})

test('ties prefer the earlier frame regardless of input order', () => {
  const midpoint = { capturedAtUtc: '2026-09-13T23:35:44.500Z' }
  const earlier = { ...before, capturedAtUtc: '2026-09-13T23:35:44.000Z' }
  const later = { ...after, capturedAtUtc: '2026-09-13T23:35:45.000Z' }
  assert.equal(selectFrameForVisualTree([later, earlier], midpoint), earlier)
})

test('unavailable or invalid timestamps preserve the normal replay fallback', () => {
  assert.equal(selectFrameForVisualTree([], snapshot), null)
  assert.equal(selectFrameForVisualTree([before, after], {}), null)
  assert.equal(selectFrameForVisualTree([{ ...before, capturedAtUtc: 'invalid' }, after], snapshot), after)
  assert.equal(selectFrameForVisualTree([before], { screenshotFrameId: before.frameId }), before)
})
