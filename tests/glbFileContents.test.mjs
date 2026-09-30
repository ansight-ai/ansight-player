import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseGlbFileContents } from '../src/replay/components/glbFileContents.ts'

function createGlb(json, extraChunks = []) {
  const source = new TextEncoder().encode(json)
  const paddedJson = new Uint8Array(Math.ceil(source.length / 4) * 4).fill(0x20)
  paddedJson.set(source)
  const chunks = [{ type: 0x4e4f534a, bytes: paddedJson }, ...extraChunks]
  const bytes = new Uint8Array(12 + chunks.reduce((size, chunk) => size + 8 + chunk.bytes.length, 0))
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.length, true)
  let offset = 12
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.bytes.length, true)
    view.setUint32(offset + 4, chunk.type, true)
    bytes.set(chunk.bytes, offset + 8)
    offset += 8 + chunk.bytes.length
  }
  return bytes
}

test('extracts embedded UTF-8 JSON and reports binary chunk offsets without decoding binary as text', () => {
  const json = '{"asset":{"version":"2.0"},"nodes":[{"name":"三角形"}]}'
  const bytes = createGlb(json, [{ type: 0x004e4942, bytes: Uint8Array.of(0, 255, 128, 12) }])
  const result = parseGlbFileContents(bytes)
  assert.equal(result.jsonText, json)
  assert.deepEqual(JSON.parse(result.formattedJson), JSON.parse(json))
  assert.equal(result.chunks[0].type, 'JSON')
  assert.equal(result.chunks[0].byteOffset, 20)
  assert.deepEqual(result.chunks[1], { type: 'BIN', byteOffset: bytes.length - 4, byteLength: 4 })
})

test('accepts JSON-only files, buffer subarrays and unknown extension chunks', () => {
  const bytes = createGlb('{"asset":{"version":"2.0"}}', [{ type: 0x12345678, bytes: new Uint8Array(4) }])
  const padded = new Uint8Array(bytes.length + 16)
  padded.set(bytes, 8)
  assert.equal(parseGlbFileContents(padded.subarray(8, 8 + bytes.length)).chunks[1].type, '0x12345678')
  assert.equal(parseGlbFileContents(createGlb('{}')).chunks.length, 1)
})

test('rejects incomplete files and invalid headers', () => {
  assert.throws(() => parseGlbFileContents(new Uint8Array(8)), /header is incomplete/)
  const bytes = createGlb('{}')
  assert.throws(() => parseGlbFileContents(bytes.subarray(0, bytes.length - 1)), /file length/)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0, true)
  assert.throws(() => parseGlbFileContents(bytes), /GLB header/)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 1, true)
  assert.throws(() => parseGlbFileContents(bytes), /version 1/)
})

test('rejects missing JSON, malformed JSON and chunks that overrun the file', () => {
  const bytes = createGlb('{}')
  const view = new DataView(bytes.buffer)
  view.setUint32(16, 0x004e4942, true)
  assert.throws(() => parseGlbFileContents(bytes), /first GLB chunk/)
  view.setUint32(16, 0x4e4f534a, true)
  view.setUint32(12, 1024, true)
  assert.throws(() => parseGlbFileContents(bytes), /incomplete chunk/)
  assert.throws(() => parseGlbFileContents(createGlb('not json')), SyntaxError)
  assert.throws(() => parseGlbFileContents(createGlb('{}', [{ type: 0x4e4f534a, bytes: new Uint8Array(4) }])), /more than one JSON/)
})
