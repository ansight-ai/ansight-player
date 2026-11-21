import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeVoiceWav } from '../dist/library/local-replay/voiceAudio.js'
test('dictation encodes canonical PCM16 WAV, clips and handles invalid samples', async () => {
  const blob = encodeVoiceWav(new Float32Array([-2, 0, 2, NaN]))
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  assert.equal(blob.type, 'audio/wav')
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF')
  assert.equal(view.getUint32(24, true), 16000)
  assert.equal(view.getUint32(40, true), 8)
  assert.deepEqual([44,46,48,50].map(i => view.getInt16(i, true)), [-32768,0,32767,0])
})
test('dictation rejects empty and overlong recordings', () => {
  assert.throws(() => encodeVoiceWav(new Float32Array()))
  assert.throws(() => encodeVoiceWav(new Float32Array(16000 * 120 + 1)))
})
