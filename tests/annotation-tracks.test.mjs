import test from 'node:test'
import assert from 'node:assert/strict'
import { annotationTrackLayout, recordingDeliveryKey } from '../dist/library/local-replay/annotationTracks.js'
const annotation = (id, start, end, speech = false) => ({ annotationId: id, startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString(), source: 'localPortal.exploration', customData: { kind: speech ? 'speech' : 'marking' } })
test('speech and markings retain their shared time positions on separate tracks', () => {
  const result = annotationTrackLayout([annotation('spoken', 2000, 6000, true), annotation('mark', 4000, 5000)])
  assert.equal(result.start, 2000)
  assert.equal(result.end, 6000)
  assert.equal(result.clips[0].lane, 'speech')
  assert.equal(result.clips[1].lane, 'markings')
  assert.equal((result.clips[1].start - result.start) / (result.end - result.start), .5)
  assert.equal(result.clips[0].row, result.clips[1].row)
})
test('inferred findings have their own track', () => {
  const finding = { ...annotation('finding', 2500, 3000), source: 'transcript.inferred' }
  const result = annotationTrackLayout([annotation('mark', 2000, 4000), finding])
  assert.deepEqual(result.clips.map(clip => clip.lane), ['markings', 'inferred'])
})
test('overlapping markings stack without moving their times', () => {
  const result = annotationTrackLayout([annotation('a', 0, 1000), annotation('b', 500, 1500), annotation('c', 1500, 2000)])
  assert.deepEqual(result.clips.map(clip => clip.row), [0, 1, 0])
  assert.equal(result.rows.markings, 2)
})
test('invalid timestamps are excluded and point comments have a visible duration', () => {
  const result = annotationTrackLayout([{ annotationId: 'bad', startUtc: 'bad' }, { annotationId: 'point', startUtc: new Date(0).toISOString() }])
  assert.equal(result.clips.length, 1)
  assert.equal(result.clips[0].end, 1000)
})
test('delivery identity is stable for the same set and changes for new comments', () => {
  assert.equal(recordingDeliveryKey(['b','a','a']), recordingDeliveryKey(['a','b']))
  assert.notEqual(recordingDeliveryKey(['a']), recordingDeliveryKey(['a','b']))
})
