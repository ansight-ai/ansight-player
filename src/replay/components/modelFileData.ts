export interface ModelTransferProgress {
  loadedBytes: number
  totalBytes: number
}

export async function downloadModel(
  sourceUrl: string,
  signal: AbortSignal,
  onProgress: (progress: ModelTransferProgress) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(sourceUrl, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`The Ansight Host could not load the complete model (HTTP ${response.status}).`)
  }
  const totalBytes = Number(response.headers.get('content-length')) || 0
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onProgress({ loadedBytes: bytes.byteLength, totalBytes: totalBytes || bytes.byteLength })
    return bytes
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let loadedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    loadedBytes += value.byteLength
    onProgress({ loadedBytes, totalBytes })
  }
  const bytes = new Uint8Array(loadedBytes)
  let offset = 0
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  })
  return bytes
}

export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
