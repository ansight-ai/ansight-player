import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDiscreteMetricChannel } from '../src/replay/metricPresentation.ts'
import { sampledMetricValue, timelineStepPaths } from '../src/replay/timelineCurve.ts'

test('JNI references, handles and sample counts are discrete, while averages and FPS remain continuous', () => {
  for (const unit of ['references', 'handles', 'count']) {
    assert.equal(isDiscreteMetricChannel({ channelId: 80, name: 'Quantity', unit }), true)
  }
  assert.equal(isDiscreteMetricChannel({ channelId: 80, name: 'JNI reference count' }), true)
  assert.equal(isDiscreteMetricChannel({ channelId: 80, name: 'Mean references', unit: 'references', kind: 'mean' }), false)
  assert.equal(isDiscreteMetricChannel({ channelId: 80, name: 'Render FPS', unit: 'fps' }), false)
  assert.equal(isDiscreteMetricChannel({ channelId: 80, name: 'Render time', unit: 'ms' }), false)
})

test('probe and clipped chart boundaries hold the last count until the next sample', () => {
  const start = { timestampMs: 0, value: 324 }
  const end = { timestampMs: 1000, value: 325 }
  assert.equal(sampledMetricValue(start, end, 507, true), 324)
  assert.equal(sampledMetricValue(start, end, 999, true), 324)
  assert.equal(sampledMetricValue(start, end, 1000, true), 325)
  assert.equal(sampledMetricValue(start, end, 507, false), 324.507)
  assert.deepEqual(timelineStepPaths([{ x: 0, y: 324 }, { x: 1000, y: 325 }]), ['M 0 324 H 1000 V 325'])
})
