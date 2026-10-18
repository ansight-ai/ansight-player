import { maximumArtifactBytes } from './artifactArchives'

export async function readArtifactBytes(content: { base64?: string; contentUrl?: string }, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (content.base64) {
    if (content.base64.length > Math.ceil(maximumArtifactBytes / 3) * 4) throw new Error('Preview exceeds 64 MiB. Download this file to inspect it locally.')
    const binary = atob(content.base64)
    return Uint8Array.from(binary, value => value.charCodeAt(0))
  }
  if (!content.contentUrl) throw new Error('No artifact content was returned.')
  const response = await fetch(content.contentUrl, { signal })
  if (!response.ok) throw new Error(`Unable to read artifact (HTTP ${response.status}).`)
  if (Number(response.headers.get('content-length')) > maximumArtifactBytes) { await response.body?.cancel(); throw new Error('Preview exceeds 64 MiB.') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('This browser does not support streaming artifact reads.')
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumArtifactBytes) { await reader.cancel(); throw new Error('Preview exceeds 64 MiB.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}
