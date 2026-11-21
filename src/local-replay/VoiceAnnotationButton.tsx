import { prepareVoiceAudio } from './voiceAudio'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { CircleNotch, Microphone, Stop, X } from '../icons'
import type { AnnotationAgentSource } from './annotationAgentDelivery'

type Recording = { abort: AbortController; recorder?: MediaRecorder; stream?: MediaStream; timer?: number; chunks: Blob[]; bytes: number }

type Props = {
  source: AnnotationAgentSource
  sessionId: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onTranscript: (text: string, start: number, end: number) => void
}

export function VoiceAnnotationButton({ source, sessionId, textareaRef, disabled, onBusyChange, onTranscript }: Props) {
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'starting' | 'recording' | 'transcribing'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const active = useRef<Recording | null>(null)

  function cancel() {
    const run = active.current
    active.current = null
    run?.abort.abort()
    if (run?.timer) window.clearInterval(run.timer)
    if (run?.recorder?.state === 'recording') run.recorder.stop()
    run?.stream?.getTracks().forEach(track => track.stop())
    setPhase('idle')
    onBusyChange(false)
  }

  useEffect(() => () => {
    const run = active.current
    active.current = null
    run?.abort.abort()
    if (run?.timer) window.clearInterval(run.timer)
    if (run?.recorder?.state === 'recording') run.recorder.stop()
    run?.stream?.getTracks().forEach(track => track.stop())
  }, [])

  async function start() {
    if (disabled || active.current || !source.transcribe) return
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is unavailable in this browser. Open Ansight in a browser with microphone support.')
      return
    }
    const selection = textareaRef.current
    const start = selection?.selectionStart ?? selection?.value.length ?? 0
    const end = selection?.selectionEnd ?? start
    const run: Recording = { abort: new AbortController(), chunks: [], bytes: 0 }
    active.current = run
    setPhase('starting')
    onBusyChange(true)
    try {
      if (source.transcriptionStatus) {
        const status = await source.transcriptionStatus(sessionId, run.abort.signal)
        if (status.isSupported === false) throw new Error('Local dictation on Mac requires Apple Silicon and macOS 15 or newer.')
        if (status.isSupported === undefined) throw new Error('Restart Ansight with the updated local host to enable offline dictation.')
        if (!status.isConfigured) {
          if (!source.prepareTranscription) throw new Error('Local speech model setup is unavailable.')
          setPhase('preparing')
          await source.prepareTranscription(sessionId, run.abort.signal)
        }
      }
      if (active.current !== run) return
      setPhase('starting')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (active.current !== run) { stream.getTracks().forEach(track => track.stop()); return }
      run.stream = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('This browser does not support a compatible audio recording format.')
      const recorder = new MediaRecorder(stream, { mimeType })
      run.recorder = recorder
      recorder.ondataavailable = event => {
        if (active.current !== run || !event.data.size) return
        run.bytes += event.data.size
        if (run.bytes > 10 * 1024 * 1024) {
          cancel()
          setError('Recording exceeded 10 MB. Please record a shorter comment.')
          return
        }
        run.chunks.push(event.data)
      }
      recorder.onerror = () => {
        if (active.current !== run) return
        cancel()
        setError('Microphone recording failed. Please try again.')
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        if (run.timer) window.clearInterval(run.timer)
        if (active.current !== run) return
        setPhase('transcribing')
        try {
          const audio = new Blob(run.chunks, { type: recorder.mimeType })
          if (!audio.size) throw new Error('No audio was recorded. Please try again.')
          const wav = await prepareVoiceAudio(audio)
          if (active.current !== run) return
          const result = await source.transcribe!(sessionId, wav, run.abort.signal)
          if (active.current !== run) return
          if (!result.text?.trim()) throw new Error('No speech was detected. Please try again.')
          onTranscript(result.text.trim(), start, end)
        } catch (error) {
          if (active.current === run) setError(error instanceof Error ? error.message : 'Unable to transcribe this recording.')
        } finally {
          if (active.current === run) cancel()
        }
      }
      recorder.start(1000)
      setSeconds(0)
      setPhase('recording')
      const began = Date.now()
      run.timer = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000)
        setSeconds(elapsed)
        if (elapsed >= 120 && recorder.state === 'recording') recorder.stop()
      }, 250)
    } catch (error) {
      if (active.current !== run) return
      cancel()
      setError(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow microphone access in your browser and try again.'
        : error instanceof Error ? error.message : 'Unable to start recording.')
    }
  }

  return <div className="annotation-voice">
    <div className="annotation-voice-controls">
      {phase === 'idle' ? <button type="button" disabled={disabled} onClick={() => void start()} aria-label="Dictate comment" title="Dictate comment · Transcribed locally on your computer">
        <Microphone aria-hidden="true" />
      </button> : <>
        <span role="status">{phase === 'recording' ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : phase === 'preparing' ? 'Downloading local speech model…' : phase === 'starting' ? 'Opening microphone…' : 'Transcribing…'}</span>
        {phase === 'recording' ? <button type="button" onClick={() => active.current?.recorder?.stop()} aria-label="Stop recording and transcribe" title="Stop and transcribe"><Stop aria-hidden="true" /></button> : <CircleNotch className="spin" aria-hidden="true" />}
        <button type="button" onClick={cancel} aria-label="Cancel dictation" title="Cancel dictation"><X aria-hidden="true" /></button>
      </>}
    </div>
    {error ? <p role="alert">{error}</p> : null}
  </div>
}
