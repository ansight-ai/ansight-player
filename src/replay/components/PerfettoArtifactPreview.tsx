import { useEffect, useRef, useState } from 'react'
import type { SessionLiveFileContent } from '../sessionViewerData'
import { readArtifactBytes } from './artifactBytes'

const perfettoOrigin = 'https://ui.perfetto.dev'

export function PerfettoArtifactPreview({ content, fileName }: { content: SessionLiveFileContent; fileName: string }) {
  const cleanupRef = useRef<(() => void) | undefined>(undefined)
  const [status, setStatus] = useState('')
  useEffect(() => () => cleanupRef.current?.(), [])
  function open() {
    cleanupRef.current?.()
    const handle = window.open(perfettoOrigin, '_blank')
    if (!handle) { setStatus('The browser blocked the new tab. Allow popups and try again.'); return }
    const controller = new AbortController()
    let ready = false, sent = false, bytes: Uint8Array<ArrayBuffer> | undefined
    const cleanup = () => { controller.abort(); window.clearInterval(interval); window.clearTimeout(timeout); window.removeEventListener('message', receive) }
    const send = () => {
      if (!ready || !bytes || sent) return
      sent = true
      handle.postMessage({ perfetto: { buffer: bytes.buffer, title: fileName, fileName } }, perfettoOrigin, [bytes.buffer])
      setStatus('Trace opened in Perfetto.'); cleanup()
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== perfettoOrigin || event.source !== handle || event.data !== 'PONG') return
      ready = true; send()
    }
    window.addEventListener('message', receive)
    const interval = window.setInterval(() => { if (handle.closed) { setStatus('Perfetto tab was closed.'); cleanup() } else handle.postMessage('PING', perfettoOrigin) }, 300)
    const timeout = window.setTimeout(() => { setStatus('Perfetto did not become ready within 30 seconds. Try again.'); cleanup() }, 30_000)
    cleanupRef.current = cleanup
    setStatus('Reading trace and opening Perfetto…')
    void readArtifactBytes(content, controller.signal).then(value => { bytes = value; send() }).catch(error => { if (!controller.signal.aborted) { setStatus(String(error)); cleanup() } })
  }
  return <div className="artifact-rich"><h4>Perfetto trace</h4><p>Open the full trace timeline in Perfetto. This sends the selected trace to the Perfetto web app in a new tab for processing in your browser.</p><button type="button" onClick={open}>Open trace in Perfetto</button><p role="status">{status}</p></div>
}
