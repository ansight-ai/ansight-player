import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSimulatorVideoProgressMonitor } from '../src/local-replay/simulatorVideoProgress.ts'

test('a connected video that stops advancing is detected after eight seconds', () => {
  const monitor = createSimulatorVideoProgressMonitor(5, 1_000)
  assert.equal(monitor.hasStalled(5, 8_999), false)
  assert.equal(monitor.hasStalled(5, 9_000), true)
})

test('new video frames reset the stall deadline', () => {
  const monitor = createSimulatorVideoProgressMonitor(5, 1_000)
  assert.equal(monitor.hasStalled(6, 8_000), false)
  assert.equal(monitor.hasStalled(6, 9_000), false)
  assert.equal(monitor.hasStalled(6, 16_000), true)
})

test('a reset video clock also counts as progress', () => {
  const monitor = createSimulatorVideoProgressMonitor(100, 1_000)
  assert.equal(monitor.hasStalled(0, 10_000), false)
  assert.equal(monitor.hasStalled(1, 17_000), false)
})
