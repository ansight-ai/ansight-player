import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveMediaFileFormat } from '../src/replay/components/mediaFileFormat.ts'

test('recognizes common recordings with missing or generic MIME metadata', () => {
  assert.deepEqual(resolveMediaFileFormat('session.MP4', 'application/octet-stream'), { kind: 'video', mimeType: 'video/mp4' })
  assert.deepEqual(resolveMediaFileFormat('voice.M4A'), { kind: 'audio', mimeType: 'audio/mp4' })
  assert.deepEqual(resolveMediaFileFormat('screen.mov', undefined, ''), { kind: 'video', mimeType: 'video/quicktime' })
  assert.deepEqual(resolveMediaFileFormat('clip.webm'), { kind: 'video', mimeType: 'video/webm' })
  assert.deepEqual(resolveMediaFileFormat('audio', undefined, ' WAV '), { kind: 'audio', mimeType: 'audio/wav' })
  assert.deepEqual(resolveMediaFileFormat('voice.opus'), { kind: 'audio', mimeType: 'audio/ogg' })
  assert.deepEqual(resolveMediaFileFormat('voice.mp3'), { kind: 'audio', mimeType: 'audio/mpeg' })
  assert.deepEqual(resolveMediaFileFormat('voice.flac'), { kind: 'audio', mimeType: 'audio/flac' })
})

test('prefers a media MIME type when a container may contain audio or video', () => {
  assert.deepEqual(resolveMediaFileFormat('clip.ogg', ' Video/Ogg '), { kind: 'video', mimeType: 'video/ogg' })
  assert.deepEqual(resolveMediaFileFormat('voice.webm', 'audio/webm; codecs=opus'), { kind: 'audio', mimeType: 'audio/webm; codecs=opus' })
  assert.deepEqual(resolveMediaFileFormat('recording', 'audio/aac'), { kind: 'audio', mimeType: 'audio/aac' })
})

test('does not classify non-media files or dotted directory names as media', () => {
  assert.equal(resolveMediaFileFormat('recording.json', 'application/json'), null)
  assert.equal(resolveMediaFileFormat('clip.mp4/metadata'), null)
  assert.equal(resolveMediaFileFormat('clip.mp4\\metadata'), null)
  assert.equal(resolveMediaFileFormat('unknown', 'application/octet-stream'), null)
})
