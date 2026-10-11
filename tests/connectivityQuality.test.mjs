import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { connectivityQualitySeries, summarizeQualitySeries } from '../dist/library/replay/connectivityQuality.js'
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

test('quality retains measurement time and carries the current value into zoom windows', () => {
  const first = sample('a', 1, { signalStrength: -60, signalStrengthUnit: 'dBm' })
  const carried = { ...first, id: 'b', capturedAtUtc: new Date(origin + 9000).toISOString() }
  assert.equal(connectivityQualitySeries([first, carried], origin, origin + 10000)[0].points.length, 1)
  const [group] = connectivityQualitySeries([first, carried], origin + 8000, origin + 10000)
  assert.equal(group.points.length, 1)
  assert.equal(group.points[0].time, origin + 1000)
  assert.deepEqual(group.intervals, [
    { fromMs: origin + 8000, toMs: origin + 9000, value: -60 },
    { fromMs: origin + 9000, toMs: origin + 10000, value: -60 },
  ])
  const data = { records: [first, carried], overview: [], fromMs: origin + 8000, toMs: origin + 10000, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: [] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 9500, startMs: origin, endMs: origin + 10000, onSeek() {} }))
  assert.match(html, /-60 dBm/)
  assert.match(html, /Last measured <strong>8.5 s<\/strong> before the playhead/)
  assert.match(html, /No new readings in this window. The last reported value is carried forward./)
  assert.match(html, /Go to reading · 0:01.0/)
  assert.doesNotMatch(html, /<svg/)
})

test('tab quality preserves session times and gaps invalidate playhead measurements', () => {
  const records = [sample('a', 40, { signalStrength: -70, signalStrengthUnit: 'dBm', linkQuality: 'minimal' }), sample('b', 50, { signalStrength: -50, signalStrengthUnit: 'dBm', linkQuality: 'good' }), { ...sample('gap', 55), kind: 'gap', snapshot: { availability: 'unknown', transports: [] } }]
  const data = { records, overview: records, fromMs: origin + 40000, toMs: origin + 60000, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: [] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 57000, startMs: origin, endMs: origin + 60000, onSeek() {} }))
  assert.match(html, /cx="0"/)
  assert.match(html, /cx="500"/)
  assert.match(html, /0:40.0/)
  assert.match(html, /Unknown at playhead/)
  assert.match(html, /<path d="M 0 60 H 500 V 12 H 750"/)
  assert.match(renderToStaticMarkup(React.createElement(ConnectivityPanel, { data: { ...data, records: [], overview: [] }, atMs: origin, startMs: origin, endMs: origin + 1, onSeek() {} })), /No connectivity observations were captured/)
})

test('a single quality reading explains its age and limitations without manufacturing a trend', () => {
  const records = [sample('good', 0, { linkQuality: 'good' })]
  const data = { records, overview: records, fromMs: origin, toMs: origin + 165500, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: [] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 88300, startMs: origin, endMs: data.toMs, onSeek() {} }))
  assert.match(html, /connectivity-quality-value--good">Good/)
  assert.match(html, /Last measured <strong>1 min 28 s<\/strong> before the playhead/)
  assert.match(html, /1 reading in this window. One reading cannot show a trend./)
  assert.match(html, /does not measure signal strength, request latency, or transfer speed/)
  assert.doesNotMatch(html, /<svg/)
})

test('quality lines break at unknown values, observation gaps, and changes of source or transport', () => {
  const records = [
    sample('good', 0, { linkQuality: 'good' }),
    sample('unknown', 10, { linkQuality: 'unknown' }),
    sample('moderate', 20, { linkQuality: 'moderate' }),
    { ...sample('gap', 30), kind: 'gap', snapshot: { availability: 'unknown', transports: [] } },
    sample('minimal', 40, { linkQuality: 'minimal' }),
    sample('other-source', 50, { source: 'other', linkQuality: 'good' }),
    { ...sample('cellular', 60, { linkQuality: 'good' }), snapshot: { availability: 'available', transports: ['cellular'] } },
    sample('wifi', 70, { linkQuality: 'good' }),
    sample('missing', 80),
  ]
  const data = { records, overview: records, fromMs: origin, toMs: origin + 100000, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: [] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 90000, startMs: origin, endMs: data.toMs, onSeek() {} }))
  assert.match(html, /<path d="M 0 12 H 100 M 200 36 H 300 M 400 60 H 500 M 700 12 H 800"/)
  assert.match(html, /No reading from this source:/)
  const mainGroup = connectivityQualitySeries(records, origin, origin + 100000).find(group => group.source === 'os' && group.transports[0] === 'wifi')
  assert.deepEqual(summarizeQualitySeries(mainGroup, origin, origin + 100000).gaps.map(gap => [(gap.fromMs - origin) / 1000, (gap.toMs - origin) / 1000]), [[10, 20], [30, 40], [50, 70], [80, 100]])
})

test('repeated equal readings collapse to a summary while gaps remain inspectable', () => {
  const records = [sample('a', 1, { linkQuality: 'good' }), sample('b', 2, { linkQuality: 'good' }),
    { ...sample('gap', 3), kind: 'gap', snapshot: { availability: 'unknown', transports: [] } }]
  const data = { records, overview: records, fromMs: origin, toMs: origin + 5000, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: [] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 4000, startMs: origin, endMs: data.toMs, onSeek() {} }))
  assert.match(html, /2 readings in this window. All reported the same value./)
  assert.match(html, /Unknown at playhead/)
  assert.match(html, /No reading from this source:/)
  assert.match(html, /0:03.0–0:05.0/)
  assert.doesNotMatch(html, /<svg|Last measured/)
})

test('a gap never presents an older carried reading as current', () => {
  const records = [sample('a', 0, { linkQuality: 'good' }),
    { ...sample('gap', 70), kind: 'gap', snapshot: { availability: 'unknown', transports: [] } }]
  const data = { records, overview: records, fromMs: origin + 60000, toMs: origin + 90000, malformedCount: 0, retentionTrimmed: false, supportedMeasurements: [] }
  const html = renderToStaticMarkup(React.createElement(ConnectivityPanel, { data, atMs: origin + 80000, startMs: origin, endMs: data.toMs, onSeek() {} }))
  assert.match(html, /No new readings in this window./)
  assert.match(html, /Unknown at playhead/)
  assert.doesNotMatch(html, /The last reported value is carried forward|Last measured/)
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
  assert.match(html, /connectivity-quality-value">0 level/)
  assert.match(html, /connectivity-quality-value">0 kbps/)
  assert.match(html, /Wi-Fi → Cellular/)
  assert.match(html, /Connection lost/)
  assert.match(html, /Observation interrupted/)
  assert.doesNotMatch(html, /Upload estimate/)
})
