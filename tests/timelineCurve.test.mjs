import assert from 'node:assert/strict'
import { test } from 'node:test'
import { timelineCornerPaths } from '../src/replay/timelineCurve.ts'

test('rounding stays local to corners and leaves connecting segments straight', () => {
  const paths = timelineCornerPaths([{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 40, y: 0 }])
  const numbers = paths.map(path => path.match(/-?\d+(?:\.\d+)?/g).map(Number))
  assert.deepEqual(numbers[0].slice(0, 2), [0, 0])
  assert.deepEqual(numbers[1].slice(-2), [40, 0])
  const entry = numbers[0].slice(6, 8)
  const exit = numbers[1].slice(4, 6)
  assert.ok(Math.hypot(entry[0] - 20, entry[1] - 20) <= 4.000001)
  assert.ok(Math.hypot(exit[0] - 20, exit[1] - 20) <= 4.000001)
  assert.equal(entry[0], entry[1]) // On the original incoming straight line.
  assert.ok(Math.abs(exit[0] + exit[1] - 40) < 1e-9)
  assert.deepEqual(numbers[0].slice(-2), numbers[1].slice(0, 2)) // No gaps at color changes.
  assert.ok(paths.every(path => path.includes(' L ') && !path.includes(' C ')))
})

test('short segments, empty data and duplicate timestamps stay finite', () => {
  assert.deepEqual(timelineCornerPaths([]), [])
  assert.deepEqual(timelineCornerPaths([{ x: 1, y: 2 }]), [])
  const paths = timelineCornerPaths([{ x: 1, y: 2 }, { x: 1, y: 9 }, { x: 1.001, y: 4 }, { x: 2, y: 6 }])
  assert.ok(paths.every(path => !/NaN|Infinity/.test(path)))
})
