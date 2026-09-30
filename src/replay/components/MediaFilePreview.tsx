import { MusicNotes, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import './MediaFilePreview.css'

export function MediaFilePreview({
  fileName,
  kind,
  sourceUrl,
}: {
  fileName: string
  kind: 'audio' | 'video'
  sourceUrl: string
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const media = mediaRef.current
    if (media && media.getAttribute('src') !== sourceUrl) {
      media.setAttribute('src', sourceUrl)
    }
    return () => {
      // Release the stream and stop playback when the artifact viewer closes.
      media?.pause()
      media?.removeAttribute('src')
      media?.load()
    }
  }, [sourceUrl])

  function handleError() {
    const code = mediaRef.current?.error?.code
    setError(code === 2
      ? 'The media could not be loaded. Check your connection and reopen the file to try again.'
      : 'This browser could not play the file. Its format or codec may be unsupported, or the file may be damaged.')
  }

  return (
    <div className={`file-media-player file-media-player--${kind}`}>
      {kind === 'audio' ? <div className="file-media-audio-heading">
        <MusicNotes aria-hidden="true" />
        <strong>{fileName}</strong>
      </div> : null}
      {kind === 'audio' ? (
        <audio aria-label={`Play ${fileName}`} className="file-media-preview" controls onError={handleError} preload="metadata" ref={(node) => { mediaRef.current = node }} src={sourceUrl} />
      ) : (
        <video aria-label={`Play ${fileName}`} className="file-media-preview" controls onError={handleError} playsInline preload="metadata" ref={(node) => { mediaRef.current = node }} src={sourceUrl} />
      )}
      {error ? <div className="file-media-error" role="alert">
        <WarningCircle aria-hidden="true" />
        <p>{error} Download it to open it in another player.</p>
      </div> : null}
      <a className="file-media-download" download={fileName} href={sourceUrl}>Download {kind}</a>
    </div>
  )
}
