import { useEffect, useRef, useState } from 'react'
import { createSessionFileSignedUrl, type SessionVideoRecording, type SessionViewerPayload } from '../sessionViewerData'
import { recordingTimeSeconds } from '../sessionRecordings'

export function SessionRecordingSurface({ recording, payload, local, atMs, playing, frameId, onMedia, onError, onLoaded }: {
  recording: SessionVideoRecording
  payload: SessionViewerPayload
  local: boolean
  atMs: number
  playing: boolean
  frameId: string
  onMedia: (element: HTMLVideoElement | null) => void
  onError: () => void
  onLoaded: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const errorRef = useRef(onError)
  errorRef.current = onError
  const file = payload.manifest.files.find(item => item.entryPath === recording.entryPath)
  useEffect(() => {
    let cancelled = false
    setReady(false)
    const result = local
      ? Promise.resolve(`api/sessions/${encodeURIComponent(payload.capture.session?.sessionId ?? payload.session.session_id ?? payload.session.id)}/video/${encodeURIComponent(recording.recordingId)}`)
      : file ? createSessionFileSignedUrl(payload.session, file) : Promise.reject(new Error('Recording file is missing'))
    void result.then(value => { if (!cancelled) setUrl(value) }, () => { if (!cancelled) errorRef.current() })
    return () => { cancelled = true }
  }, [local, recording.recordingId, file?.storagePath, payload.session.id])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !ready) return
    const target = recordingTimeSeconds(recording, atMs)
    // Keep native playback smooth; correct drift and deliberate timeline seeks.
    if (Math.abs(video.currentTime - target) > (playing ? 0.25 : 0.002)) video.currentTime = target
    if (playing && video.paused) void video.play().catch(() => errorRef.current())
    else if (!playing && !video.paused) video.pause()
  }, [atMs, playing, ready, recording])

  return <video aria-label="Session video recording" className="session-frame-video session-frame-image-layer session-frame-image-layer--presented"
    data-frame-id={frameId} muted playsInline preload="metadata" src={url ?? undefined}
    ref={element => { videoRef.current = element; onMedia(element) }}
    onLoadedMetadata={() => setReady(true)} onLoadedData={onLoaded} onError={onError} />
}
