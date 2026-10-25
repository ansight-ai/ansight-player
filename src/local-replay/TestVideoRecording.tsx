import type { LocalTestVideoResult } from './types'
import { sessionTimelineHref } from './sessionLinks'

export function TestVideoRecording({ video }: { video: LocalTestVideoResult }) {
  const playable = (video.status === 'completed' || video.status === 'partial') && video.recordingId
  if (!playable) return <p className="inline-message">Video: {video.message}</p>
  const url = sessionTimelineHref(window.location.href, { sessionId: video.sessionId })
  return <p className="inline-message">
    <a href={url}>Open recorded replay</a>
    {video.byteSize ? ` · ${(video.byteSize / 1_000_000).toFixed(1)} MB` : ''}
    {video.status === 'partial' ? ` · ${video.message}` : ''}
  </p>
}
