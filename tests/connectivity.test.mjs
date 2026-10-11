import test from 'node:test'
import assert from 'node:assert/strict'
import { connectivityAt, connectivityFromEvents, connectivityIntervals, loadConnectivityWindow, parseConnectivityRecord } from '../src/replay/connectivity.ts'

const origin = Date.parse('2026-10-10T00:00:00Z')
function record(id, seconds, availability = 'available', kind = 'snapshot') {
  return { schema: 'ansight.connectivity.v1', id, observationId: 'test', sequence: seconds, elapsedMilliseconds: seconds * 1000,
    capturedAtUtc: new Date(origin + seconds * 1000).toISOString(), source: 'test', kind, snapshot: { availability, transports: availability === 'available' ? ['wifi'] : [] }, supportedMeasurements: ['availability'] }
}
test('unknown and gaps remain distinct from unavailable and outside coverage', () => {
  const records = [record('initial', 10), record('offline', 30, 'unavailable'), record('gap', 50, 'unknown', 'gap')]
  const intervals = connectivityIntervals(records, origin, origin + 100000)
  assert.deepEqual(intervals.map(item => item.record?.snapshot.availability ?? 'unknown'), ['unknown', 'available', 'unavailable', 'unknown'])
  assert.equal(connectivityAt(records, origin + 100001, origin, origin + 100000), null)
  assert.equal(connectivityAt(records, origin + 55000, origin, origin + 100000)?.kind, 'gap')
})
test('parsing retains zero measurements and rejects malformed records', () => {
  const value = { ...record('a', 0), quality: { source: 'test', measuredAtUtc: new Date(origin).toISOString(), signalStrength: 0, signalStrengthUnit: 'level', estimatedDownstreamKbps: 0 } }
  assert.equal(parseConnectivityRecord(JSON.stringify(value)).quality.signalStrength, 0)
  assert.equal(parseConnectivityRecord({ ...value, snapshot: { availability: 'available', transports: null } }), null)
  assert.equal(parseConnectivityRecord({ ...value, quality: { ...value.quality, signalStrengthUnit: 'percent' } }), null)
  assert.equal(parseConnectivityRecord({ ...value, kind: 'change' }), null)
  assert.equal(parseConnectivityRecord({ ...value, sequence: -1 }), null)
  assert.equal(parseConnectivityRecord('{broken'), null)
  const data = connectivityFromEvents([{ label: 'connectivity.snapshot', details: JSON.stringify(value) }, { label: 'connectivity.snapshot', details: JSON.stringify(value) }, { label: 'connectivity.change', details: 'bad' }], origin, origin + 1000)
  assert.equal(data.records.length, 1)
  assert.equal(data.malformedCount, 1)
})
test('window loading fetches relevant segments and preceding context, not the entire capture', async () => {
  const first = record('first', 0)
  const middle = record('middle', 60, 'unavailable')
  const last = record('last', 120)
  const records = [first, middle, last]
  const index = { schema: 'ansight.connectivity-index.v1', retainedRecordCount: 3, supportedMeasurements: ['availability'], stateChanges: records,
    segments: records.map((item, number) => ({ path: `segments/${number + 1}.jsonl`, fromUtc: item.capturedAtUtc, toUtc: item.capturedAtUtc, recordCount: 1 })) }
  const fetched = []
  const loaded = await loadConnectivityWindow(index, async path => { fetched.push(path); return JSON.stringify(records[Number(path.match(/\d+/)[0]) - 1]) + '\n' }, origin + 70000, origin + 90000)
  assert.deepEqual(fetched, ['segments/2.jsonl'])
  assert.equal(loaded.overview.length, 3)
  assert.equal(connectivityAt(loaded.records, origin + 80000, loaded.fromMs, loaded.toMs)?.snapshot.availability, 'unavailable')
  await assert.rejects(loadConnectivityWindow({ ...index, segments: [{ ...index.segments[0], path: '../session.json' }] }, async () => '', origin, origin + 1), /Invalid/)
  await assert.rejects(loadConnectivityWindow(index, async () => { throw Error('missing file') }, origin, origin + 1), /missing file/)
})

test('a full quality observation restores state after a lost observation gap', () => {
  const gap = record('gap', 10, 'unknown', 'gap')
  const resumed = { ...record('resumed', 20, 'available', 'quality'), quality: { source: 'test', measuredAtUtc: new Date(origin + 20000).toISOString(), linkQuality: 'good' } }
  const data = connectivityFromEvents([gap, resumed].map(item => ({ label: `connectivity.${item.kind}`, details: JSON.stringify(item) })), origin, origin + 30000)
  assert.deepEqual(connectivityIntervals(data.overview, origin, origin + 30000).map(item => item.record?.snapshot.availability ?? 'unknown'), ['unknown', 'unknown', 'available'])
})
