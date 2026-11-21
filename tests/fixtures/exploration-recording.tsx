// Manual browser integration fixture: synthetic microphone, real local transcription,
// and in-memory annotation saves. Never records the user's microphone or writes a session.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useExplorationRecorder } from '../../src/local-replay/useExplorationRecorder'
import type { SessionAnnotation } from '../../src/replay/sessionViewerData'

let clip: ArrayBuffer | undefined
let failNext = false
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
  if (!clip) throw new Error('Choose a WAV test clip first.')
  const context = new AudioContext({ sampleRate: 48000 })
  const audio = await context.decodeAudioData(clip.slice(0))
  const source = context.createBufferSource()
  source.buffer = audio
  const destination = context.createMediaStreamDestination()
  source.connect(destination)
  await context.resume()
  source.start(context.currentTime + 1)
  const track = destination.stream.getAudioTracks()[0]
  const stop = track.stop.bind(track)
  track.stop = () => { stop(); void context.close() }
  return destination.stream
} })

export function ExplorationRecordingFixture() {
  const [annotations, setAnnotations] = useState<SessionAnnotation[]>([])
  const [ready, setReady] = useState(false)
  const recorder = useExplorationRecorder({ sessionId: 'exploration-test', enabled: ready, onSave: async annotation => {
    if (failNext) { failNext = false; throw new Error('Simulated save failure') }
    setAnnotations(current => [...current.filter(item => item.annotationId !== annotation.annotationId), annotation])
  } })
  return <main>
    <h1>Exploration recording test</h1>
    <p>Synthetic microphone. Real local transcription. No session changes.</p>
    <label>Test speech clip <input type="file" accept="audio/wav" onChange={async event => {
      clip = await event.target.files?.[0]?.arrayBuffer(); setReady(!!clip)
    }} /></label>
    {recorder.controls}
    <button disabled={!recorder.recording} onClick={() => recorder.mark({ kind: 1, x: .2, y: .3, width: .4, height: .2 }, null)}>Test marking</button>
    <button onClick={() => { failNext = true }}>Fail next save</button>
    <pre aria-label="Saved annotations">{JSON.stringify(annotations, null, 2)}</pre>
  </main>
}
createRoot(document.getElementById('root')!).render(<ExplorationRecordingFixture />)
