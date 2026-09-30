import assert from 'node:assert/strict'
import { test } from 'node:test'
import { metricPresentation, formatMetricValue, isFlutterDiagnosticChannel, isFpsChannel, metricAxisMaximum } from '../src/replay/metricPresentation.ts'

const cpu = { channelId: 3, name: 'Process CPU', type: 'cpu', unit: 'millicores' }
const fps = { channelId: 4, name: 'Rendered frames per second', type: 'fps', unit: 'fps' }

test('Flutter diagnostics are identified by metadata or legacy names, independently of channel IDs', () => {
  const names = ['build', 'raster', 'total', 'count']
  names.forEach((name, index) => {
    const channel = { channelId: 40 + index, name: `Flutter frame ${name}`, unit: name === 'count' ? 'count' : 'ms', source: 'flutter' }
    assert.equal(isFlutterDiagnosticChannel(channel), true)
    assert.equal(isFlutterDiagnosticChannel({ ...channel, source: undefined }), true)
  })
  assert.equal(isFlutterDiagnosticChannel({ channelId: 80, name: 'Build duration', unit: 'ms', source: ' Flutter ' }), true)
  assert.equal(isFlutterDiagnosticChannel({ channelId: 40, name: 'Request duration', unit: 'ms' }), false)
  assert.equal(isFlutterDiagnosticChannel(undefined), false)
})

test('overview metrics remain visible even when collected by Flutter', () => {
  for (const channel of [fps, cpu, { channelId: 2, name: 'Flutter heap', type: 'memory', unit: 'bytes' }]) {
    assert.equal(isFlutterDiagnosticChannel({ ...channel, source: 'flutter' }), false)
  }
})
test('external CPU and FPS metadata override legacy channel numbers', () => {
  const channels = new Map([[3, cpu], [4, fps]])
  assert.equal(isFpsChannel(channels, 3), false)
  assert.equal(isFpsChannel(channels, 4), true)
  assert.equal(formatMetricValue(442, metricPresentation(cpu, 3)), '44.2%')
  assert.equal(formatMetricValue(62, metricPresentation(fps, 4)), '62 FPS')
})
test('CPU has a percentage scale and supports more than one fully used core', () => {
  const presentation = metricPresentation(cpu, 3)
  assert.equal(presentation.axisKey, 'cpu')
  assert.equal(metricAxisMaximum(presentation, 442), 100)
  assert.equal(formatMetricValue(2450, presentation), '245%')
  assert.ok(metricAxisMaximum(presentation, 2450) >= 245)
})
test('axis tops are round in the units they are shown in, quarters included', () => {
  const memory = metricPresentation({ channelId: 2, name: 'Physical Footprint', type: 'memory', unit: 'bytes' }, 2)
  // 1.6 GiB of data tops out at 2 GiB, so the quarter ticks read 512 MB, 1 GB, 1.5 GB, 2 GB.
  assert.equal(metricAxisMaximum(memory, 1.6 * 1024 ** 3), 2 * 1024 ** 3)
  assert.equal(formatMetricValue(metricAxisMaximum(memory, 1.6 * 1024 ** 3) * 0.25, memory), '512 MB')
  assert.equal(formatMetricValue(metricAxisMaximum(memory, 1.6 * 1024 ** 3) * 0.75, memory), '1.5 GB')
  assert.equal(metricAxisMaximum(memory, 300 * 1024 ** 2), 512 * 1024 ** 2)

  const duration = metricPresentation({ channelId: 7, name: 'App Launch Duration', type: 'custom', unit: 'ms' }, 7)
  assert.equal(metricAxisMaximum(duration, 3_500), 4_000)
  assert.equal(metricAxisMaximum(duration, 6_000), 8_000)
  assert.equal(metricAxisMaximum(duration, 9_500), 20_000)

  assert.equal(metricAxisMaximum(metricPresentation(fps, 4), 60), 100)
  assert.equal(metricAxisMaximum(metricPresentation(fps, 4), 120), 200)
})
test('incomplete channel metadata never turns a named CPU channel into FPS', () => {
  const incompleteCpu = { channelId: 3, name: 'Process CPU', type: 'custom' }
  assert.equal(isFpsChannel(new Map([[3, incompleteCpu]]), 3), false)
  assert.equal(formatMetricValue(442, metricPresentation(incompleteCpu, 3)), '442')
  assert.equal(formatMetricValue(442, metricPresentation({ ...incompleteCpu, kind: 'cpu-millicores' }, 3)), '44.2%')
  assert.equal(formatMetricValue(62, metricPresentation({ channelId: 4, name: 'Rendered frames per second' }, 4)), '62 FPS')
})
test('memory, generic units and legacy SDK channels retain their own units', () => {
  assert.equal(formatMetricValue(1048576, metricPresentation({ channelId: 1, name: 'RSS', type: 'memory', unit: 'bytes' }, 1)), '1 MB')
  assert.equal(formatMetricValue(62, metricPresentation({ channelId: 5, name: 'Duration', unit: 'ms', type: 'duration' }, 5)), '62 ms')
  assert.equal(metricPresentation({ channelId: 3, name: 'FPS' }, 3).kind, 'fps')
  assert.equal(metricPresentation(undefined, 3).kind, 'fps')
  assert.equal(metricPresentation({ channelId: 3, name: 'Battery', type: 'battery', unit: 'percent' }, 3).kind, 'other')
})
