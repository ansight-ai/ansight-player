export type TranscriptSegment = {
  segmentId: string
  startUtc: string
  endUtc: string
  text: string
}

export async function writeRecordingTranscript(
  sessionId: string,
  recordingId: string,
  segment?: TranscriptSegment,
) {
  const action = segment ? 'segment' : 'complete'
  const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/recording-transcripts/${encodeURIComponent(recordingId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(segment ?? {}),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.isSuccess) {
    throw new Error(result?.message || 'Unable to save the transcript. Check that the local host is up to date.')
  }
}
