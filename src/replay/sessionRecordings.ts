import type { SessionImageFrame, SessionSnapshot, SessionVideoRecording, SessionVisualTreeSnapshot, SharedSessionStreamFile } from './sessionViewerData'

// Completed test recordings own their playback boundary. Host processing can update
// lastUpdatedUtc (and append diagnostics) long after the app and recorder have stopped.
export function completedTestRecordingEndMs(session: SessionSnapshot | undefined): number | null {
  if (!session?.isHistorical) return null
  const run = session.customProperties?.['ui-test']
  if (!run || !['succeeded', 'failed', 'cancelled'].includes(String(run.status))) return null
  const videos = session.videoRecordings ?? []
  const recording = videos.find(video => video.runId === run.runId && video.status === 'completed')
  if (!recording || !Number.isFinite(recording.durationUs) || recording.durationUs <= 0) return null
  const end = Date.parse(recording.startedUtc) + recording.durationUs / 1000
  if (!Number.isFinite(end)) return null
  // A reused session may contain later recordings or manual interactions.
  if (videos.some(video => Date.parse(video.startedUtc) + video.durationUs / 1000 > end)
      || session.touches?.some(touch => touch.capturedAtUtc && Date.parse(touch.capturedAtUtc) > end)) return null
  return end
}

export function recordingFile(video: SessionVideoRecording): SharedSessionStreamFile {
  return { entryPath: video.entryPath, storagePath: video.entryPath, contentType: 'video/mp4', kind: 'session_recording', byteSize: video.byteSize }
}

export function selectRecording(recordings: SessionVideoRecording[], atMs: number): SessionVideoRecording | null {
  return recordings.filter(video => Number.isFinite(Date.parse(video.startedUtc)) && video.durationUs > 0
    && Date.parse(video.startedUtc) <= atMs && atMs < Date.parse(video.startedUtc) + video.durationUs / 1000)
    .sort((left, right) => Date.parse(right.startedUtc) - Date.parse(left.startedUtc))[0] ?? null
}

export function selectRecordingForVisualTree(recordings: SessionVideoRecording[], atMs: number,
  snapshot: SessionVisualTreeSnapshot | null, frames: SessionImageFrame[]): SessionVideoRecording | null {
  const linkedFrameId = snapshot?.screenshotFrameId?.trim()
  if (linkedFrameId && frames.some(frame => frame.frameId === linkedFrameId)) return null
  return selectRecording(recordings, atMs)
}

export function recordingTimeSeconds(video: SessionVideoRecording, atMs: number): number {
  return Math.max(0, Math.min((atMs - Date.parse(video.startedUtc)) / 1000, Math.max(0, video.durationUs / 1_000_000 - 0.001)))
}
