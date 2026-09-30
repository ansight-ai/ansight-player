export interface GlbChunk {
  type: string
  byteOffset: number
  byteLength: number
}

export interface GlbFileContents {
  version: number
  byteLength: number
  chunks: GlbChunk[]
  jsonText: string
  formattedJson: string
}

// https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
export function parseGlbFileContents(bytes: Uint8Array): GlbFileContents {
  if (bytes.byteLength < 12) {
    throw new Error('The GLB header is incomplete.')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('This file does not contain a GLB header.')
  }
  const version = view.getUint32(4, true)
  if (version !== 2) {
    throw new Error(`GLB version ${version} is not supported. Expected version 2.`)
  }
  const byteLength = view.getUint32(8, true)
  if (byteLength !== bytes.byteLength) {
    throw new Error('The GLB file length does not match its header. The file may be incomplete.')
  }
  const chunks: GlbChunk[] = []
  let jsonText: string | null = null
  for (let offset = 12; offset < byteLength;) {
    if (offset + 8 > byteLength) {
      throw new Error('The GLB chunk header is incomplete.')
    }
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    const byteOffset = offset + 8
    if (chunkLength % 4 !== 0 || byteOffset + chunkLength > byteLength) {
      throw new Error('The GLB contains an invalid or incomplete chunk.')
    }
    if (chunks.length === 0 && chunkType !== 0x4e4f534a) {
      throw new Error('The first GLB chunk must contain JSON.')
    }
    if (chunkType === 0x4e4f534a) {
      if (jsonText !== null) {
        throw new Error('The GLB contains more than one JSON chunk.')
      }
      jsonText = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(byteOffset, byteOffset + chunkLength)).trimEnd()
    }
    chunks.push({
      type: chunkType === 0x4e4f534a ? 'JSON' : chunkType === 0x004e4942 ? 'BIN' : `0x${chunkType.toString(16).padStart(8, '0')}`,
      byteOffset,
      byteLength: chunkLength,
    })
    offset = byteOffset + chunkLength
  }
  if (jsonText === null) {
    throw new Error('The GLB does not contain a JSON chunk.')
  }
  return { version, byteLength, chunks, jsonText, formattedJson: JSON.stringify(JSON.parse(jsonText), null, 2) }
}
