import assert from 'node:assert/strict'
import { test } from 'node:test'
import { virtualLogWindow } from '../src/replay/components/virtualLogWindow.ts'

test('a 200,000-log session mounts a bounded window at the start, middle and end', () => {
  for (const offset of [0, 3000000, 7200000]) {
    const window = virtualLogWindow(200000, offset, 430, 36, 36)
    assert.ok(window.end - window.start <= 28)
    assert.ok(window.start >= 0 && window.end <= 200000)
    assert.equal(window.height, 7200000)
  }
  assert.equal(virtualLogWindow(200000, 7200000, 430, 36, 36).end, 200000)
})

test('shrinking a trimmed or filtered list keeps the remaining rows visible', () => {
  assert.deepEqual(virtualLogWindow(3, 3000000, 430, 36, 36), { start: 0, end: 3, height: 108 })
  assert.deepEqual(virtualLogWindow(0, 3000000, 430, 36, 36), { start: 0, end: 0, height: 0 })
})
