import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMetricGroups, metricLegendLabel } from '../src/replay/metricGroups.ts'

const channels = [
  { channelId: 0, name: 'Java heap', type: 'memory', unit: 'bytes' },
  { channelId: 1, name: 'Native heap', type: 'memory', unit: 'bytes' },
  { channelId: 2, name: 'RSS', type: 'memory', unit: 'bytes' },
  { channelId: 3, name: 'FPS', type: 'frames', unit: 'fps' },
  { channelId: 5, name: 'Battery Level', type: 'battery', unit: 'percent' },
  { channelId: 6, name: 'JNI reference count', unit: 'references' },
  { channelId: 7, name: 'Open File Handles', type: 'runtime', unit: 'handles' },
  ...['compositor render', 'compositor update', 'layout measure', 'layout arrange', 'render recording', 'input processing'].flatMap((name, index) =>
    ['mean', 'max', 'samples'].map((stat, offset) => ({ channelId: 40 + index * 3 + offset, name: `Avalonia ${name} ${stat}`,
      source: 'avalonia.diagnostics', group: 'Avalonia rendering', unit: offset === 2 ? 'count' : 'ms', kind: offset === 2 ? 'sample-count' : `duration-${stat}` }))),
  { channelId: 59, name: 'Avalonia rooted visuals', source: 'avalonia.diagnostics', group: 'Avalonia rendering', unit: 'count', kind: 'gauge' },
  { channelId: 61, name: 'Avalonia Render FPS (all targets)', source: 'avalonia.diagnostics', group: 'Avalonia rendering', unit: 'fps', kind: 'render-pass-rate' },
]

test('dense Avalonia capture opens with total memory and native FPS, retaining every diagnostic in the picker', () => {
  const groups = buildMetricGroups(channels)
  assert.deepEqual(groups[0].defaultChannelIds, [3, 2])
  assert.equal(groups[0].channelIds.length, channels.length)
  assert.deepEqual(groups.map(group => group.label), ['Overview', 'Memory', 'Rendering', 'Layout', 'Runtime', 'Device'])
  const rendering = groups.find(group => group.id === 'rendering')
  assert.deepEqual(rendering.defaultChannelIds, [3, 40, 43, 52, 61])
  assert.ok(rendering.channelIds.includes(41))
  assert.ok(rendering.channelIds.includes(42))
  assert.deepEqual(groups.find(group => group.id === 'layout').defaultChannelIds, [46, 49])
  assert.ok(groups.find(group => group.id === 'runtime').channelIds.includes(6))
})

test('published groups are honoured and arbitrary custom metrics remain discoverable', () => {
  const groups = buildMetricGroups([
    { channelId: 98, name: 'Process CPU', unit: 'millicores', type: 'cpu' },
    { channelId: 7, name: 'Duration', unit: 'ms', group: 'Checkout' },
    { channelId: 9, name: 'Layout max', unit: 'ms', group: 'Layout', kind: 'duration-max' },
  ])
  assert.deepEqual(groups[0].defaultChannelIds, [98])
  assert.deepEqual(groups.find(group => group.label === 'Checkout').channelIds, [7])
  assert.deepEqual(groups.find(group => group.id === 'layout').defaultChannelIds, [9])
})

test('custom-only sessions have a bounded useful overview; empty sessions remain valid', () => {
  const custom = Array.from({ length: 20 }, (_, i) => ({ channelId: 100 + i, name: `Custom ${i}`, unit: 'ms' }))
  const groups = buildMetricGroups(custom)
  assert.equal(groups[0].defaultChannelIds.length, 3)
  assert.equal(groups[1].defaultChannelIds.length, 6)
  assert.equal(groups[1].channelIds.length, 20)
  assert.deepEqual(buildMetricGroups([])[0].defaultChannelIds, [])
})

test('Flutter diagnostics use the shared rendering group without polluting overview', () => {
  const groups = buildMetricGroups([
    { channelId: 4, name: 'FPS', unit: 'fps', source: 'flutter' },
    { channelId: 100, name: 'Flutter frame build', unit: 'ms', source: 'flutter' },
  ])
  assert.deepEqual(groups[0].defaultChannelIds, [4])
  assert.deepEqual(groups.find(group => group.id === 'rendering').channelIds, [4, 100])
})

test('legend labels shorten only known framework descriptions', () => {
  assert.equal(metricLegendLabel(channels.find(channel => channel.channelId === 40), ''), 'Render mean')
  assert.equal(metricLegendLabel(channels.find(channel => channel.channelId === 61), ''), 'Avalonia render FPS')
  assert.equal(metricLegendLabel({ channelId: 9, name: 'Checkout latency' }, 'Checkout latency'), 'Checkout latency')
})


test('SDK identity overrides metric names, source and legacy labels', () => {
  const groups = buildMetricGroups([
    { channelId: 64, name: 'Avalonia layout measure', source: 'avalonia', group: 'Layout',
      metricGroup: { id: 'checkout', name: 'Purchase flow' } },
    { channelId: 65, name: 'Unrelated label', metricGroup: { id: 'checkout', name: 'Purchase flow' } },
    { channelId: 66, name: 'Another flow', metricGroup: { id: 'renewal', name: 'Purchase flow' } },
    { channelId: 67, name: 'Reserved view name', metricGroup: { id: 'overview', name: 'Custom overview' } },
  ])
  assert.deepEqual(groups.find(group => group.id === 'sdk:checkout').channelIds, [64, 65])
  assert.deepEqual(groups.find(group => group.id === 'sdk:renewal').channelIds, [66])
  assert.deepEqual(groups.find(group => group.id === 'sdk:overview').channelIds, [67])
  assert.equal(groups[0].id, 'overview')
  assert.ok(!groups.some(group => group.id === 'layout'))
})

test('standard SDK groups combine with legacy channels while labels can change without changing identity', () => {
  const input = [
    { channelId: 3, name: 'FPS', unit: 'fps' },
    { channelId: 64, name: 'Duration', metricGroup: { id: 'rendering', name: 'Drawing' } },
  ]
  assert.deepEqual(buildMetricGroups(input).find(group => group.id === 'rendering').channelIds, [3, 64])
  assert.equal(buildMetricGroups(input).find(group => group.id === 'rendering').label, 'Drawing')
  const original = buildMetricGroups([{ channelId: 64, name: 'Latency', metricGroup: { id: 'checkout', name: 'Checkout' } }])[1]
  const renamed = buildMetricGroups([{ channelId: 64, name: 'Latency', metricGroup: { id: 'checkout', name: 'Purchases' } }])[1]
  assert.equal(original.id, renamed.id)
  assert.equal(renamed.label, 'Purchases')
})
