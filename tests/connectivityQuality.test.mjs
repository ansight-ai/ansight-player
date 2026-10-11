import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { connectivityQualitySeries } from '../dist/library/replay/connectivityQuality.js'
import { ConnectivityPanel } from '../dist/library/replay/ConnectivityPanel.js'
const origin = Date.parse('2026-10-11T00:00:00Z')
const sample = (id, seconds, quality = {}) => ({ schema: 'ansight.connectivity.v1', id, observationId: 'test', sequence: seconds, capturedAtUtc: new Date(origin + seconds * 1000).toISOString(), elapsedMilliseconds: seconds * 1000, kind: 'quality', source: 'test', snapshot: { availability: 'available', transports: ['wifi'] }, supportedMeasurements: [], quality: { measuredAtUtc: new Date(origin + seconds * 1000).toISOString(), source: 'os', ...quality } })

test('quality preserves zero values, groups units and sources, and does not manufacture unknown quality', () => {
  const records = [sample('unknown', 1, { linkQuality: 'unknown' }), sample('rssi', 2, { signalStrength: -70, signalStrengthUnit: 'dBm' }), sample('level', 3, { signalStrength: 0, signalStrengthUnit: 'level', estimatedDownstreamKbps: 0 }), sample('other', 4, { source: 'other', signalStrength: -70, signalStrengthUnit: 'dBm' })]
  const groups = connectivityQualitySeries(records, origin, origin + 5000)
  assert.equal(groups.length, 4)
  assert.equal(groups.some(group => group.metric === 'OS link quality'), false)
  assert.equal(groups.find(group => group.unit === 'level').points[0].value, 0)
  assert.equal(groups.find(group => group.metric === 'Downstream estimate').points[0].value, 0)
})

test('quality uses measurement time, clips zoom windows and deduplicates carried observations', () => {
  const first = sample('a', 1, { signalStrength: -60, signalStrengthUnit: 'dBm' })
  const carried = { ...first, id: 'b', capturedAtUtc: new Date(origin + 9000).toISOString() }
  assert.equal(connectivityQualitySeries([first, carried], origin, origin + 10000)[0].points.length, 1)
  assert.deepEqual(connectivityQualitySeries([carried], origin + 8000, origin + 10000), [])
})

test('tab quality preserves session times and gaps invalidate playhead measurements', () => {
  const records = [sample('a', 40, { signalStrength: -70, signalStrengthUnit: 'dBm', linkQuality: 'minimal' }), sample('b', 50, { signalStrength: -50, signalStrengthUnit: 'dBm', linkQuality: 'good' }), { ...sample('gap', 55), kind: 'gap', snapshot: { availability: 'unknown', transports: [] } }]
  const data = { records, overview: records, fromMs: origin + 40000, toMs: origin + 60000, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: [] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 57000, startMs: origin, endMs: origin + 60000, onSeek() {} }))
  assert.match(html, /cx="0"/)
  assert.match(html, /cx="500"/)
  assert.match(html, /0:40.0/)
  assert.match(html, /Unknown at playhead/)
  assert.doesNotMatch(html, /<path|<polyline/)
  assert.match(renderToStaticMarkup(React.createElement(ConnectivityPanel, { data: { ...data, records: [], overview: [] }, atMs: origin, startMs: origin, endMs: origin + 1, onSeek() {} })), /No connectivity observations were captured/)
})

test('compact tab hides missing metrics and collector events while retaining technical evidence', () => {
  const initial = { ...sample('initial', 0), kind: 'snapshot', snapshot: { availability: 'unknown', transports: [] }, reason: 'observation-started' }
  const connected = { ...sample('connected', 1, { linkQuality: 'unknown' }), kind: 'change', previousSnapshot: initial.snapshot, snapshot: { availability: 'available', transports: ['wifi'], expensive: false, lowDataMode: false } }
  const data = { records: [initial, connected], overview: [initial, connected], fromMs: origin, toMs: origin + 300000, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: ['availability', 'linkQuality'] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 239400, startMs: origin, endMs: origin + 300000, onSeek() {} }))
  const main = html.split('<details')[0]
  assert.match(main, /Wi-Fi · Available/)
  assert.match(main, /No quality measurements in this time window/)
  assert.match(main, /Wi-Fi became available/)
  assert.doesNotMatch(main, /Unknown|Signal strength|Estimated bandwidth|observation-started|snapshot|Expensive|Low Data Mode/)
  assert.match(html, /<summary>Technical details<\/summary>/)
  assert.match(html, /observation-started/)
  assert.match(html, /Observation at playhead/)
})

test('compact tab keeps zero measurements, active flags, transport switches, outages and gaps', () => {
  const wifi = sample('wifi', 1).snapshot
  const cellular = { ...wifi, transports: ['cellular'], vpn: true, lowDataMode: true }
  const switchRecord = { ...sample('switch', 2), kind: 'change', previousSnapshot: wifi, snapshot: cellular }
  const offline = { ...sample('offline', 3), kind: 'change', previousSnapshot: cellular, snapshot: { availability: 'unavailable', transports: [] } }
  const gap = { ...sample('gap', 4), kind: 'gap', snapshot: { availability: 'unknown', transports: [] } }
  const measured = { ...sample('measured', 5, { signalStrength: 0, signalStrengthUnit: 'level', estimatedDownstreamKbps: 0 }), snapshot: cellular }
  const records = [switchRecord, offline, gap, measured]
  const data = { records, overview: records, fromMs: origin, toMs: origin + 10000, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: [] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 9000, startMs: origin, endMs: origin + 10000, onSeek() {} })).split('<details')[0]
  assert.match(html, /Cellular · Available/)
  assert.match(html, /VPN active/)
  assert.match(html, /Low Data Mode/)
  assert.match(html, /<dd>0 level<\/dd>/)
  assert.match(html, /<dd>0 kbps<\/dd>/)
  assert.match(html, /Wi-Fi → Cellular/)
  assert.match(html, /Connection lost/)
  assert.match(html, /Observation interrupted/)
  assert.doesNotMatch(html, /Upload estimate/)
})
