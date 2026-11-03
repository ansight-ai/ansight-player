import assert from 'node:assert/strict'
import { test } from 'node:test'
import { completedTestRecordingEndMs, selectRecording, selectRecordingForVisualTree, recordingTimeSeconds, recordingFile } from '../src/replay/sessionRecordings.ts'

const first = { recordingId: 'one', startedUtc: '2026-10-25T00:00:10Z', durationUs: 20_000_000, entryPath: 'session-video/one.mp4', byteSize: 123 }
const second = { ...first, recordingId: 'two', startedUtc: '2026-10-25T00:00:40Z' }
const at = seconds => Date.parse('2026-10-25T00:00:00Z') + seconds * 1000

test('tree inspection uses video unless an explicitly linked screenshot is retained', () => {
  const frames = [{ frameId: 'old', capturedAtUtc: new Date(at(9)).toISOString() }]
  const tree = { capturedAtUtc: new Date(at(15)).toISOString() }
  assert.equal(selectRecordingForVisualTree([first], at(15), tree, frames), first)
  assert.equal(selectRecordingForVisualTree([first], at(15), tree, []), first)
  assert.equal(selectRecordingForVisualTree([first], at(15), { ...tree, screenshotFrameId: 'missing' }, frames), first)
  assert.equal(selectRecordingForVisualTree([first], at(15), { ...tree, screenshotFrameId: ' old ' }, frames), null)
  assert.equal(selectRecordingForVisualTree([first], at(35), tree, frames), null)
})

test('completed test playback excludes compression, metering and profiler shutdown time', () => {
  const session = { isHistorical: true, lastUpdatedUtc: new Date(at(46)).toISOString(),
    customProperties: { 'ui-test': { runId: 'run', status: 'succeeded' } },
    videoRecordings: [{ ...first, runId: 'run', status: 'completed' }], touches: [] }
  assert.equal(completedTestRecordingEndMs(session), at(30))
  assert.equal(completedTestRecordingEndMs({ ...session, isHistorical: false }), null)
  assert.equal(completedTestRecordingEndMs({ ...session, customProperties: { 'ui-test': { runId: 'run', status: 'running' } } }), null)
  assert.equal(completedTestRecordingEndMs({ ...session, touches: [{ capturedAtUtc: new Date(at(31)).toISOString() }] }), null)
  assert.equal(completedTestRecordingEndMs({ ...session, videoRecordings: [...session.videoRecordings, second] }), null)
  assert.equal(completedTestRecordingEndMs({ ...session, videoRecordings: [{ ...first, runId: 'run', status: 'partial' }] }), null)
})

test('continuous recordings are selected by UTC coverage, including reused sessions and gaps', () => {
  assert.equal(selectRecording([second, first], at(9)), null)
  assert.equal(selectRecording([second, first], at(10)), first)
  assert.equal(selectRecording([second, first], at(29.9)), first)
  assert.equal(selectRecording([second, first], at(30)), null)
  assert.equal(selectRecording([second, first], at(40)), second)
  assert.equal(selectRecording([second, first], at(60)), null)
})

test('scrubbing advances within a recording independently of screenshot times', () => {
  assert.equal(recordingTimeSeconds(first, at(12.125)), 2.125)
  assert.equal(recordingTimeSeconds(first, at(9)), 0)
  assert.equal(recordingTimeSeconds(first, at(100)), 19.999)
  assert.equal(recordingFile(first).kind, 'session_recording')
})
