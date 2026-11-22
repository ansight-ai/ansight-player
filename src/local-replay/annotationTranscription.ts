export type AnnotationTranscriptionSource = {
  transcriptionStatus: (sessionId: string, signal: AbortSignal) => Promise<{ isConfigured: boolean; isSupported?: boolean; supportsRecordingTranscript?: boolean }>
  prepareTranscription: (sessionId: string, signal: AbortSignal) => Promise<{ isConfigured: boolean }>
  transcribe: (sessionId: string, audio: Blob, signal: AbortSignal) => Promise<{ text: string }>
}

export const localAnnotationTranscription: AnnotationTranscriptionSource = {
  transcriptionStatus: async (sessionId, signal) => readTranscription(await fetch(`api/sessions/${encodeURIComponent(sessionId)}/annotation-transcription`, { signal })),
  prepareTranscription: async (sessionId, signal) => readTranscription(await fetch(`api/sessions/${encodeURIComponent(sessionId)}/annotation-transcription/prepare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal })),
  transcribe: async (sessionId, audio, signal) => readTranscription(await fetch(`api/sessions/${encodeURIComponent(sessionId)}/annotation-transcription`, {
    method: 'POST', headers: { 'Content-Type': audio.type }, body: audio, signal,
  })),
}

async function readTranscription<T>(response: Response): Promise<T> {
  if (response.status === 404) throw new Error('Restart Ansight with the updated local host to enable voice annotations.')
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.message || `Unable to transcribe audio (HTTP ${response.status}).`)
  return result as T
}
