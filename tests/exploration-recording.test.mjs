import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { SpeechSegmenter, transcriptSegment } from '../dist/library/local-replay/explorationRecording.js'

test('silence is discarded; pauses split speech and preserve its sample clock', () => {
  const segments = []
  const segmenter = new SpeechSegmenter(1000, segment => segments.push(segment))
  for (let offset = 0; offset < 2000; offset += 100) segmenter.push(new Float32Array(100), offset)
  for (let offset = 2000; offset < 3000; offset += 100) segmenter.push(new Float32Array(100).fill(.1), offset)
  for (let offset = 3000; offset < 5000; offset += 100) segmenter.push(new Float32Array(100), offset)
  assert.equal(segments.length, 1)
  assert.equal(segments[0].startSample, 1700)
  assert.equal(segments[0].endSample, 3700)
  const startedAt = Date.parse('2026-11-21T00:00:00Z')
  const annotation = transcriptSegment(startedAt, 1000, segments[0], 'Move this button')
  assert.equal(annotation.startUtc, '2026-11-21T00:00:01.700Z')
  assert.equal(annotation.endUtc, '2026-11-21T00:00:03.700Z')
  assert.equal(annotation.segmentId, String(segments[0].startSample))
})

test('stop flushes the final spoken phrase exactly once', () => {
  const segments = []
  const segmenter = new SpeechSegmenter(16000, value => segments.push(value))
  segmenter.push(new Float32Array(2048).fill(.1), 0)
  segmenter.flush(); segmenter.flush()
  assert.equal(segments.length, 1)
  assert.equal(segments[0].samples.length, 2048)
})

test('continuous speech is bounded and adjacent chunks have no gaps or overlap', () => {
  const segments = []
  const segmenter = new SpeechSegmenter(1000, value => segments.push(value))
  for (let offset = 0; offset < 45000; offset += 100) segmenter.push(new Float32Array(100).fill(.1), offset)
  segmenter.flush()
  assert.deepEqual(segments.map(s => [s.startSample, s.endSample]), [[0,20000], [20000,40000], [40000,45000]])
})

test('audio worklet downmixes, transfers full blocks, and flushes the final partial block', () => {
  let Processor
  const messages = []
  vm.runInNewContext(readFileSync(new URL('../src/local-replay/explorationAudio.worklet.js', import.meta.url), 'utf8'), {
    Float32Array,
    AudioWorkletProcessor: class { port = { postMessage: data => messages.push(data) } },
    registerProcessor: (_name, ctor) => { Processor = ctor },
  })
  const processor = new Processor()
  for (let i = 0; i < 17; i++) processor.process([[new Float32Array(128).fill(.2), new Float32Array(128).fill(.4)]])
  processor.port.onmessage({ data: 'stop' })
  assert.equal(messages[0].samples.length, 2048)
  assert.equal(messages[1].samples.length, 128)
  assert.equal(messages[1].offset, 2048)
  assert.ok(Math.abs(messages[0].samples[0] - .3) < 1e-6)
  assert.equal(messages[2].stopped, true)
  assert.equal(processor.process([]), false)
})
