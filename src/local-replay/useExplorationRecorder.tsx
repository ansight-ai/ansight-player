import { setExplorationActivity } from './explorationActivity'
import { useEffect, useRef, useState } from 'react'
import { CircleNotch, Microphone, Stop } from '../icons'
import type { SessionAnnotation, SessionImageFrame } from '../replay/sessionViewerData'
import type { ScreenshotAnnotationGeometryDraft } from '../replay/pages/SessionViewerPage'
import type { ScreenshotAnnotationCapture } from '../replay/annotationCapture'
import { localAnnotationAgents } from './annotationAgentDelivery'
import { encodeVoiceWav } from './voiceAudio'
import { resampleSpeech, SpeechSegmenter, speechAnnotation, type SpeechSegment } from './explorationRecording'

type Pending = { annotation?: SessionAnnotation; segment?: SpeechSegment; capture?: ScreenshotAnnotationCapture }
type Run = {
  id: string; startedAt: number; rate: number; stopped: boolean; stopping: boolean; preparing: boolean
  abort: AbortController; queue: Pending[]; pumping: boolean; failed: boolean; saved: number
  stream?: MediaStream; context?: AudioContext; node?: AudioWorkletNode; input?: MediaStreamAudioSourceNode
  segmenter?: SpeechSegmenter; stopAcknowledged?: () => void; timer?: number
  save: (annotation: SessionAnnotation) => Promise<void>
}

type Options = {
  sessionId: string
  enabled: boolean
  onSave?: (annotation: SessionAnnotation) => Promise<void>
}

export function useExplorationRecorder({ sessionId, enabled, onSave }: Options) {
  const runRef = useRef<Run | null>(null)
  const mounted = useRef(false)
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'recording' | 'saving' | 'error'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [saved, setSaved] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const updatePhase = (value: typeof phase) => { if (mounted.current) setPhase(value) }

  function finishIfReady(run: Run) {
    if (run.stopped && !run.pumping && !run.queue.length && !run.failed) {
      if (runRef.current === run) { runRef.current = null; setExplorationActivity(sessionId, null); updatePhase('idle') }
    }
  }

  async function pump(run: Run) {
    if (run.pumping || run.failed) return
    run.pumping = true
    try {
      while (run.queue.length) {
        const pending = run.queue[0]
        if (!pending.annotation && pending.segment) {
          const samples = await resampleSpeech(pending.segment.samples, run.rate)
          let text: string
          try {
            text = (await localAnnotationAgents.transcribe!(sessionId, encodeVoiceWav(samples), new AbortController().signal)).text
          } catch (failure) {
            // A loud non-speech sound can trip the silence detector; no comment is needed.
            if (failure instanceof Error && failure.message.startsWith('No speech was detected')) { run.queue.shift(); continue }
            throw failure
          }
          pending.annotation = speechAnnotation(run.id, run.startedAt, run.rate, pending.segment, text)
          pending.segment = undefined // Release audio as soon as text exists, even if saving needs a retry.
        }
        if (pending.annotation && pending.capture) {
          const result = await pending.capture.visualTree.catch(() => null)
          if (result?.snapshotId) pending.annotation.target = { ...pending.annotation.target, visualTreeSnapshotId: result.snapshotId }
          pending.capture = undefined
        }
        if (pending.annotation) await run.save(pending.annotation)
        run.queue.shift()
        run.saved++
        if (mounted.current) setSaved(run.saved)
      }
    } catch (failure) {
      run.failed = true
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Unable to save the recording comments.')
      await stop(run)
      updatePhase('error')
    } finally {
      run.pumping = false
      finishIfReady(run)
    }
  }

  function enqueue(run: Run, item: Pending) {
    run.queue.push(item)
    void pump(run)
    if (run.queue.filter(item => item.segment).length >= 6 && !run.stopping && !run.stopped) {
      if (mounted.current) setError('Transcription is falling behind. Recording stopped so the remaining comments can finish.')
      void stop(run)
    }
  }

  async function stop(run = runRef.current) {
    if (!run || run.stopping || run.stopped) return
    run.stopping = true
    if (run.timer) window.clearInterval(run.timer)
    if (run.preparing) run.abort.abort()
    updatePhase('saving')
    if (run.node) {
      await new Promise<void>(resolve => {
        const timer = window.setTimeout(resolve, 1000)
        run.stopAcknowledged = () => { window.clearTimeout(timer); resolve() }
        run.node!.port.postMessage('stop')
      })
    }
    run.stream?.getTracks().forEach(track => track.stop())
    run.node?.disconnect(); run.input?.disconnect()
    await run.context?.close().catch(() => undefined)
    run.segmenter?.flush()
    run.stopped = true
    run.stopping = false
    finishIfReady(run)
  }

  async function start() {
    if (!enabled || !onSave || runRef.current) return
    setError(null); setSaved(0); setSeconds(0)
    const run: Run = { id: crypto.randomUUID(), startedAt: 0, rate: 16000, stopped: false, stopping: false, preparing: true,
      abort: new AbortController(), queue: [], pumping: false, failed: false, saved: 0, save: onSave }
    runRef.current = run
    setExplorationActivity(sessionId, run.id)
    updatePhase('preparing')
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error('This browser does not support live microphone recording.')
      const status = await localAnnotationAgents.transcriptionStatus!(sessionId, run.abort.signal)
      if (!status.isSupported) throw new Error('Local speech recording requires the updated host and a supported computer.')
      if (!status.isConfigured) await localAnnotationAgents.prepareTranscription!(sessionId, run.abort.signal)
      if (run.stopped || run.stopping) return
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      if (run.stopped || run.stopping) { stream.getTracks().forEach(track => track.stop()); return }
      run.stream = stream
      const context = new AudioContext({ sampleRate: 16000 })
      run.context = context
      await context.audioWorklet.addModule(new URL('./explorationAudio.worklet.js?no-inline', import.meta.url))
      if (run.stopped || run.stopping) return
      await context.resume()
      run.rate = context.sampleRate
      // Anchor the audio sample clock once; network/transcription delay cannot shift comments.
      run.startedAt = Date.now()
      run.segmenter = new SpeechSegmenter(run.rate, segment => enqueue(run, { segment }))
      const node = new AudioWorkletNode(context, 'ansight-exploration-audio')
      run.node = node
      node.port.onmessage = ({ data }: MessageEvent<{ samples?: Float32Array; offset?: number; stopped?: boolean }>) => {
        if (data.stopped) { run.stopAcknowledged?.(); return }
        if (data.samples && data.offset !== undefined && !run.stopped) run.segmenter!.push(data.samples, data.offset)
      }
      node.onprocessorerror = () => {
        if (mounted.current) setError('Audio capture stopped unexpectedly. Captured comments are being saved.')
        void stop(run)
      }
      run.input = context.createMediaStreamSource(stream)
      run.input.connect(node)
      node.connect(context.destination) // Processor outputs silence; microphone audio is never played back.
      for (const track of stream.getTracks()) track.onended = () => { void stop(run) }
      context.onstatechange = () => {
        if (context.state === 'suspended' && !run.stopping && !run.stopped) {
          if (mounted.current) setError('Microphone recording was interrupted. Captured comments are being saved.')
          void stop(run)
        }
      }
      run.preparing = false
      const started = performance.now()
      run.timer = window.setInterval(() => {
        if (mounted.current) setSeconds(Math.floor((performance.now() - started) / 1000))
      }, 500)
      updatePhase('recording')
    } catch (failure) {
      if (!run.abort.signal.aborted && mounted.current) setError(failure instanceof Error ? failure.message : 'Unable to start recording.')
      await stop(run)
    }
  }

  function mark(geometry: ScreenshotAnnotationGeometryDraft, frame: SessionImageFrame | null, capture?: ScreenshotAnnotationCapture) {
    const run = runRef.current
    if (!run || run.preparing || run.stopping || run.stopped) return false
    const now = Date.now()
    const annotation: SessionAnnotation = {
      annotationId: crypto.randomUUID(), startUtc: new Date(now).toISOString(), endUtc: new Date(now + 1000).toISOString(),
      label: 'Screen marking', source: 'localPortal.exploration', captureGroupId: run.id,
      customData: { recordingId: run.id, kind: 'marking', displayDurationMs: 1000 },
      geometry: [{ ...geometry, geometryId: crypto.randomUUID(), frameId: frame?.frameId, capturedAtUtc: new Date(now).toISOString(), strokeColor: '#FFFF3B30', strokeWidth: 3 }],
    }
    annotation.target = { kind: 'visualTreeRegion', source: 'localPortal.exploration',
      normalizedBounds: { x: geometry.x, y: geometry.y, width: geometry.width ?? 0.018, height: geometry.height ?? 0.018 } }
    enqueue(run, { annotation, capture })
    return true
  }

  useEffect(() => {
    mounted.current = true
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (runRef.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      mounted.current = false
      window.removeEventListener('beforeunload', beforeUnload)
      // Switching sessions stops the mic and drains work against the original session ID.
      void stop(runRef.current)
    }
    // The simulator mounts once per session; the cleanup retains that session's save callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!enabled) void stop(runRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const recording = phase === 'recording'
  const busy = phase !== 'idle'
  return {
    recording,
    mark,
    controls: <div className="exploration-recording-controls">
      {!busy ? <button type="button" className="button button--primary button--compact exploration-comments-button" disabled={!enabled} onClick={() => void start()} title="Record spoken comments while exploring the app"><Microphone aria-hidden="true" /> Comments</button>
        : phase === 'error' ? <><button type="button" className="button button--secondary button--compact" onClick={() => {
          const run = runRef.current
          if (run) { run.failed = false; setError(null); updatePhase('saving'); void pump(run) }
        }}>Retry saving</button><button type="button" onClick={() => {
          const run = runRef.current
          if (run) { run.queue = []; run.failed = false; setError(null); finishIfReady(run) }
        }}>Discard unsaved</button></>
        : <>
          <span role="status">{recording ? <><span className="exploration-recording-dot" />{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</> : <><CircleNotch className="spin" />{phase === 'preparing' ? 'Preparing microphone…' : 'Saving comments…'}</>}</span>
          {phase !== 'saving' ? <button type="button" aria-label={recording ? 'Stop recording comments' : 'Cancel recording setup'} onClick={() => void stop()}><Stop aria-hidden="true" /></button> : null}
        </>}
      {saved > 0 ? <small>{saved} saved</small> : null}
      {recording ? <small>Speak · ⇧ drag to mark</small> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>,
  }
}
