import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGestures, touchPoint, visibleTouches, touchFadeMs } from '../src/chat-replay/touches.ts';
const touch = (id, timeMs, action, overrides = {}) => ({ id, timeMs, action, pointerId: 1, pointerIndex: 0, x: 195, y: 422, surfaceWidth: 390, surfaceHeight: 844, coordinateUnit: 'points', ...overrides });
test('touch coordinates use normalized values, surface points, and pixel fallback without density errors', () => {
  const frame = { width: 1170, height: 2532 };
  assert.deepEqual(touchPoint(touch('tap', 0, 'down'), frame), { x: .5, y: .5 });
  assert.deepEqual(touchPoint(touch('tap', 0, 'down', { normalizedX: .2, normalizedY: .7 }), frame), { x: .2, y: .7 });
  assert.deepEqual(touchPoint(touch('tap', 0, 'down', { x: .3, y: .8, coordinateUnit: 'normalized' }), frame), { x: .3, y: .8 });
  assert.deepEqual(touchPoint(touch('tap', 0, 'down', { x: 585, y: 1266, surfaceWidth: null, surfaceHeight: null, coordinateUnit: 'pixels' }), frame), { x: .5, y: .5 });
  assert.equal(touchPoint(touch('tap', 0, 'down', { x: NaN }), frame), null);
});

test('touches follow the scrubber: no future touches, long holds remain visible, release fades by capture time', () => {
  const gestures = buildGestures([touch('down', 100, 'down'), touch('move', 2000, 'move', { x: 100 }), touch('up', 3100, 'up', { x: 100 })]);
  const frame = { width: 1170, height: 2532 };
  assert.equal(visibleTouches(gestures, 99, frame).length, 0);
  const held = visibleTouches(gestures, 1900, frame)[0];
  assert.equal(held.opacity, 1);
  assert.equal(held.point.x, .5); // No future move leaked into the position.
  assert.equal(visibleTouches(gestures, 2000, frame)[0].point.x, 100 / 390);
  assert.equal(visibleTouches(gestures, 3900, frame)[0].opacity, .5);
  assert.equal(visibleTouches(gestures, 3100 + touchFadeMs, frame).length, 0);
  assert.equal(visibleTouches(gestures, 100, frame)[0].point.x, .5); // Scrubbing backwards is deterministic.
});

test('swipe trails stop at the playhead and multi-touch/reused pointer IDs stay separate', () => {
  const gestures = buildGestures([
    touch('a-down', 0, 'began'), touch('b-down', 1, 'down', { pointerId: 2, x: 300 }),
    touch('a-move', 100, 'moved', { x: 100 }), touch('a-up', 200, 'ended', { x: 80 }),
    touch('a-again', 300, 'down', { x: 20 }),
    touch('estimate', 301, 'move', { sampleKind: 'estimatedUpdate' }),
  ]);
  assert.equal(gestures.length, 3);
  const visible = visibleTouches(gestures, 150, { width: 1170, height: 2532 });
  assert.equal(visible.length, 2);
  assert.deepEqual(visible[0].trail.map(point => point.x), [.5, 100 / 390]);
  assert.equal(gestures[2].samples.length, 1);
});

