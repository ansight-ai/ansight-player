import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadNetworkRequestFiles, summarizeNetworkPerformance, transferMbps } from '../dist/library/replay/networkPerformance.js'
import { NetworkPerformancePanel, NetworkPerformanceDetails } from '../dist/library/replay/NetworkPerformancePanel.js'

const origin = Date.parse('2026-10-11T00:00:00Z')
const request = (id, seconds = 1, performance = undefined, extra = {}) => ({
  schema: 'ansight.network-request.v1', id, source: 'apple.nsurlprotocol', method: 'GET', url: 'https://api.example.test/data',
  startedAtUtc: new Date(origin).toISOString(), completedAtUtc: new Date(origin + seconds * 1000).toISOString(),
  durationMilliseconds: seconds * 1000, statusCode: 200, performance, ...extra,
})

test('body rates use transferred bytes and transfer time, preserving absent or invalid measurements', () => {
  assert.equal(transferMbps(4_000_000, 2000), 16)
  for (const [bytes, duration] of [[null, 20], [100, null], [100, 0], [0, 100], [-1, 1], [10, -1], [Infinity, 100], [10, NaN]]) {
    assert.equal(transferMbps(bytes, duration), null)
  }
  const result = summarizeNetworkPerformance([
    request('measured', 1, { downloadedBytes: 4_000_000, downloadDurationMilliseconds: 2000 }, { responseBodySizeBytes: 80_000_000 }),
    request('legacy', 2, undefined, { responseBodySizeBytes: 80_000_000 }),
  ], origin, origin + 3000)
  assert.equal(result.samples[0].download, 16)
  assert.equal(result.samples[1].download, null)
  assert.equal(result.samples[1].latency, null)
  assert.equal(result.hosts[0].downloadCount, 1)
})

test('window summaries group servers and exclude requests after the playhead', () => {
  const requests = Array.from({ length: 20 }, (_, i) => request(String(i), i + 1, { timeToFirstByteMilliseconds: (i + 1) * 10 }))
  requests.push(request('other', 20, { timeToFirstByteMilliseconds: 0 }, { url: 'https://other.test/data', statusCode: 503 }))
  requests.push(request('future', 21, { timeToFirstByteMilliseconds: 9999 }))
  requests.push(request('invalid', 2, { timeToFirstByteMilliseconds: Infinity }, { completedAtUtc: 'invalid' }))
  const summary = summarizeNetworkPerformance(requests, origin + 1000, origin + 20000)
  assert.equal(summary.samples.length, 21)
  assert.equal(summary.hosts[0].medianLatency, 100)
  assert.equal(summary.hosts[0].p95Latency, 190)
  assert.equal(summary.hosts[0].latencyCount, 20)
  assert.equal(summary.hosts[1].medianLatency, 0)
  assert.equal(summary.hosts[1].failed, 1)
  assert.equal(summarizeNetworkPerformance(requests, origin + 22000, origin + 23000).hosts.length, 0)
})

test('overlapping transfers remain per-transfer averages instead of summing rates into fictitious capacity', () => {
  const summary = summarizeNetworkPerformance([
    request('a', 2, { downloadedBytes: 4_000_000, downloadDurationMilliseconds: 2000 }),
    request('b', 2, { downloadedBytes: 4_000_000, downloadDurationMilliseconds: 2000 }),
  ], origin, origin + 2000)
  assert.equal(summary.hosts[0].medianDownload, 16)
  assert.equal(summary.hosts[0].downloadCount, 2)
})

test('panel explains missing data and renders measured values with a seekable request time', () => {
  const props = { atMs: origin + 70000, startMs: origin, onSeek() {} }
  const html = renderToStaticMarkup(React.createElement(NetworkPerformancePanel, { ...props, requests: [request('a', 65, { timeToFirstByteMilliseconds: 120, downloadedBytes: 4_000_000, downloadDurationMilliseconds: 2000 })] }))
  assert.match(html, /0:10.0–1:10.0/)
  assert.match(html, /120 ms \/ 120 ms/)
  assert.match(html, /16 Mbps/)
  assert.match(html, /Seek to request GET api.example.test at 1:05.0/)
  assert.match(html, /final transaction/)
  assert.match(html, /1 latency measurements/)
  const legacy = renderToStaticMarkup(React.createElement(NetworkPerformancePanel, { ...props, requests: [request('a', 65)] }))
  assert.match(legacy, /contain no response latency measurements/)
  assert.doesNotMatch(legacy, /0 Mbps/)
  const empty = renderToStaticMarkup(React.createElement(NetworkPerformancePanel, { ...props, requests: [] }))
  assert.match(empty, /Network performance is unknown/)
  const loading = renderToStaticMarkup(React.createElement(NetworkPerformancePanel, { ...props, requests: [], loading: true }))
  assert.match(loading, /Loading recorded requests/)
  assert.doesNotMatch(loading, /No completed requests/)
  const failed = renderToStaticMarkup(React.createElement(NetworkPerformancePanel, { ...props, requests: [], error: 'Storage unavailable' }))
  assert.match(failed, /role="alert"/)
  assert.doesNotMatch(failed, /No completed requests/)
})

test('request timing details distinguish missing phases and zero-byte transfers', () => {
  const html = renderToStaticMarkup(React.createElement(NetworkPerformanceDetails, { performance: { timeToFirstByteMilliseconds: 0, reusedConnection: true, uploadedBytes: 0, uploadDurationMilliseconds: 100 } }))
  assert.match(html, /0 ms/)
  assert.match(html, /DNS lookup<\/dt><dd>Not measured/)
  assert.match(html, /Reused connection<\/dt><dd>Yes/)
  assert.doesNotMatch(html, /0 Mbps/)
})

test('cloud request loader reads all archived requests with bounded concurrency and merges embedded records', async () => {
  const files = Array.from({ length: 15 }, (_, i) => ({ entryPath: `network/requests/${i}.json`, index: i }))
  files.push({ entryPath: 'session.json' })
  const payload = { manifest: { files }, capture: { session: { networkRequests: [request('embedded'), request('0')] } } }
  let active = 0
  let peak = 0
  let readCount = 0
  const requests = await loadNetworkRequestFiles(payload, async file => {
    active++
    readCount++
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 1))
    active--
    return request(String(file.index), 1, { timeToFirstByteMilliseconds: 10 })
  })
  assert.equal(requests.length, 16)
  assert.equal(readCount, 15)
  assert.equal(peak, 6)
  assert.equal(requests.find(item => item.id === '0').performance.timeToFirstByteMilliseconds, 10)
  await assert.rejects(loadNetworkRequestFiles(payload, async () => { throw new Error('storage failed') }), /storage failed/)
  await assert.rejects(loadNetworkRequestFiles(payload, async () => ({})), /could not be read/)
})
