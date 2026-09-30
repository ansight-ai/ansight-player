import {
  ArrowCounterClockwise,
  CircleNotch,
  DeviceMobile,
  House,
  Lock,
  MapPin,
  PencilSimpleLine,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ScreenshotAnnotationGeometryDraft } from '../replay/pages/SessionViewerPage'
import type { SessionAnnotation, SessionImageFrame } from '../replay/sessionViewerData'
import { createSimulatorCommandQueue } from './simulatorCommandQueue'
import { createSimulatorVideoProgressMonitor } from './simulatorVideoProgress'

type ControlPhase = 'negotiating' | 'connecting' | 'connected' | 'fallback' | 'failed'

type WebRtcAnswer = {
  sessionId: string
  type: RTCSdpType
  sdp: string
}

type NormalizedPoint = {
  x: number
  y: number
}

type MediaBounds = NormalizedPoint & {
  height: number
  width: number
}

type SimulatorViewportKind = 'phone' | 'tablet'

type AnnotationDrag = {
  pointerId: number
  startClientX: number
  startClientY: number
  start: NormalizedPoint
}

type MediaPointerEvent = ReactPointerEvent<HTMLVideoElement | HTMLImageElement>

export function SimulatorControlView({
  annotations,
  captureToolbar,
  deviceIdentifier,
  frame,
  isAnnotationEditorOpen,
  onCreateAnnotation,
  onOpenDeviceLocation,
  platform,
  selectedAnnotationId,
  sessionId,
}: {
  annotations: SessionAnnotation[]
  captureToolbar?: ReactNode
  deviceIdentifier: string
  frame: SessionImageFrame | null
  isAnnotationEditorOpen: boolean
  onCreateAnnotation?: (geometry: ScreenshotAnnotationGeometryDraft) => void
  onOpenDeviceLocation?: () => void
  platform?: string | null
  selectedAnnotationId: string | null
  sessionId: string
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fallbackImageRef = useRef<HTMLImageElement | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const commandQueueRef = useRef(createSimulatorCommandQueue())
  const remoteSessionIdRef = useRef<string | null>(null)
  const activePointersRef = useRef(new Map<number, NormalizedPoint>())
  const activePointerOrderRef = useRef<number[]>([])
  const virtualSecondaryActiveRef = useRef(false)
  const panOffsetRef = useRef<NormalizedPoint | null>(null)
  const pressedKeyUsagesRef = useRef(new Map<string, number>())
  const annotationDragRef = useRef<AnnotationDrag | null>(null)
  const lastPointerMoveAtRef = useRef(0)
  const [phase, setPhase] = useState<ControlPhase>('negotiating')
  const [error, setError] = useState<string | null>(null)
  const [fallbackFrameUrl, setFallbackFrameUrl] = useState<string | null>(null)
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [mediaBounds, setMediaBounds] = useState<MediaBounds | null>(null)
  const [mediaAspectRatio, setMediaAspectRatio] = useState(() => resolveMediaAspectRatio(frame?.width, frame?.height))
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotationDraft, setAnnotationDraft] = useState<ScreenshotAnnotationGeometryDraft | null>(null)
  const [multiTouchPreview, setMultiTouchPreview] = useState<{ primary: NormalizedPoint; secondary: NormalizedPoint } | null>(null)
  const apiRoot = `api/sessions/${encodeURIComponent(sessionId)}/simulator`
  const useHostControl = platform?.trim().toLowerCase() === 'android'

  const syncMediaBounds = useCallback(() => {
    const stage = stageRef.current
    const media = phase === 'fallback' ? fallbackImageRef.current : videoRef.current
    if (!stage || !media) {
      setMediaBounds(null)
      return
    }

    const stageBounds = stage.getBoundingClientRect()
    const contained = resolveContainedBounds(media)
    const nextAspectRatio = resolveMediaElementAspectRatio(media)
    if (nextAspectRatio !== null) {
      setMediaAspectRatio((current) => current === nextAspectRatio ? current : nextAspectRatio)
    }
    const nextBounds = contained
      ? {
          x: contained.left - stageBounds.left,
          y: contained.top - stageBounds.top,
          height: contained.height,
          width: contained.width,
        }
      : null
    setMediaBounds((current) => mediaBoundsEqual(current, nextBounds) ? current : nextBounds)
  }, [phase])

  useEffect(() => {
    let isDisposed = false
    const video = videoRef.current
    const peer = new RTCPeerConnection({
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    })
    peerRef.current = peer

    peer.addTransceiver('video', { direction: 'recvonly' })
    peer.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      if (video) {
        video.srcObject = stream
        void video.play().catch(() => undefined)
      }
    }
    peer.onconnectionstatechange = () => {
      if (isDisposed) {
        return
      }

      if (peer.connectionState === 'connected') {
        setPhase('connected')
        setError(null)
      } else if (peer.connectionState === 'connecting') {
        setPhase('connecting')
      } else if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        setPhase('fallback')
        setError('Live video disconnected. Using screenshot control mode.')
      }
    }

    // Android uses the host's ordered, acknowledged input route. Its scrcpy
    // video connection can remain healthy while the input data channel fails.
    if (!useHostControl) {
      const channel = peer.createDataChannel('input', { ordered: true })
      channelRef.current = channel
      channel.onerror = () => {
        if (channelRef.current === channel) {
          channelRef.current = null
        }
        channel.close()
        if (!isDisposed) {
          setError('The direct control channel failed; commands will use the local host.')
        }
      }
    }

    async function connect() {
      try {
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        await waitForIceGathering(peer)
        if (!peer.localDescription?.sdp) {
          throw new Error('The browser did not create a simulator video offer.')
        }

        const response = await fetch(`${apiRoot}/offer`, {
          body: JSON.stringify({
            framesPerSecond: 30,
            sdp: peer.localDescription.sdp,
            type: peer.localDescription.type,
          }),
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })
        if (!response.ok) {
          throw new Error(await resolveResponseError(response, 'Simulator video is unavailable.'))
        }

        const answer = await response.json() as WebRtcAnswer
        if (isDisposed) {
          await closeRemoteSession(apiRoot, answer.sessionId)
          return
        }

        remoteSessionIdRef.current = answer.sessionId
        setPhase('connecting')
        await peer.setRemoteDescription({ type: answer.type, sdp: answer.sdp })
      } catch (connectError) {
        if (!isDisposed) {
          setPhase('fallback')
          setError(connectError instanceof Error ? connectError.message : 'Simulator video is unavailable.')
        }
      }
    }

    void connect()
    return () => {
      isDisposed = true
      const remoteSessionId = remoteSessionIdRef.current
      remoteSessionIdRef.current = null
      channelRef.current?.close()
      channelRef.current = null
      peer.close()
      peerRef.current = null
      if (video) {
        video.srcObject = null
      }
      if (remoteSessionId) {
        void closeRemoteSession(apiRoot, remoteSessionId)
      }
    }
  }, [apiRoot, connectionAttempt, useHostControl])

  useEffect(() => {
    const video = videoRef.current
    if (!useHostControl || phase !== 'connected' || isAnnotationEditorOpen || !video) {
      return
    }

    // scrcpy repeats unchanged frames, so a stopped clock means the live
    // display is stale even when WebRTC still reports a healthy connection.
    const progress = createSimulatorVideoProgressMonitor(video.currentTime, performance.now())
    const interval = window.setInterval(() => {
      if (progress.hasStalled(video.currentTime, performance.now())) {
        setPhase('fallback')
        setError('Live video stopped updating. Using screenshot control mode.')
      }
    }, 1_000)
    return () => window.clearInterval(interval)
  }, [isAnnotationEditorOpen, phase, useHostControl])

  useEffect(() => {
    if (phase !== 'fallback' || isAnnotationEditorOpen) {
      return
    }

    let requestedAt = 0
    const updateFrame = () => {
      const now = Date.now()
      // Let a screenshot finish loading before replacing its URL. Otherwise
      // a slow capture is repeatedly cancelled by the polling interval.
      const image = fallbackImageRef.current
      if (image && !image.complete && now - requestedAt < 10_000) {
        return
      }
      requestedAt = now
      setFallbackFrameUrl(`${apiRoot}/frame?at=${now}`)
    }
    const initialUpdate = window.setTimeout(updateFrame, 0)
    const interval = window.setInterval(updateFrame, 650)
    return () => {
      window.clearTimeout(initialUpdate)
      window.clearInterval(interval)
    }
  }, [apiRoot, isAnnotationEditorOpen, phase])

  useEffect(() => {
    const stage = stageRef.current
    const media = phase === 'fallback' ? fallbackImageRef.current : videoRef.current
    if (!stage || !media) {
      return
    }

    syncMediaBounds()
    const observer = new ResizeObserver(syncMediaBounds)
    observer.observe(stage)
    observer.observe(media)
    return () => observer.disconnect()
  }, [fallbackFrameUrl, phase, syncMediaBounds])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    if (isAnnotationEditorOpen) {
      video.pause()
    } else if (phase === 'connected') {
      void video.play().catch(() => undefined)
    }
  }, [isAnnotationEditorOpen, phase])

  function sendCommand(operation: 'input' | 'button' | 'key' | 'text', payload: Record<string, unknown>) {
    return commandQueueRef.current.enqueue(async () => {
      const message = { ...payload, udid: deviceIdentifier }
      if (!useHostControl && channelRef.current?.readyState === 'open') {
        channelRef.current.send(JSON.stringify(message))
        return
      }

      const response = await fetch(`${apiRoot}/${operation}`, {
        body: JSON.stringify(payload),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(await resolveResponseError(response, 'The simulator command failed.'))
      }
    })
  }

  function sendPointer(event: MediaPointerEvent, pointerPhase: 'down' | 'move' | 'up' | 'cancel') {
    const point = resolveContainedPoint(event.currentTarget, event.clientX, event.clientY)
    stageRef.current?.focus({ preventScroll: true })

    const annotationDrag = annotationDragRef.current
    if (annotationDrag?.pointerId === event.pointerId) {
      handleAnnotationPointer(event, pointerPhase, point, annotationDrag)
      return
    }

    if (pointerPhase === 'down' && event.button === 0 && onCreateAnnotation && !event.altKey && (annotationMode || event.shiftKey)) {
      event.preventDefault()
      event.stopPropagation()
      annotationDragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        start: point,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      setAnnotationDraft({ kind: 0, x: point.x, y: point.y })
      videoRef.current?.pause()
      return
    }

    if (pointerPhase === 'move' && !activePointersRef.current.has(event.pointerId)) {
      setMultiTouchPreview(event.altKey
        ? { primary: point, secondary: mirrorAcrossCenter(point) }
        : null)
      return
    }

    if (pointerPhase === 'move') {
      const now = event.timeStamp
      if (now - lastPointerMoveAtRef.current < 30) {
        return
      }
      lastPointerMoveAtRef.current = now
    }

    if (pointerPhase === 'down') {
      if (event.button !== 0) {
        return
      }
      activePointersRef.current.set(event.pointerId, point)
      activePointerOrderRef.current = activePointerOrderRef.current
        .filter((pointerId) => pointerId !== event.pointerId)
        .concat(event.pointerId)
      virtualSecondaryActiveRef.current = event.altKey
      panOffsetRef.current = event.altKey && event.shiftKey
        ? { x: 1 - 2 * point.x, y: 1 - 2 * point.y }
        : null
      event.currentTarget.setPointerCapture(event.pointerId)
    } else if (!activePointersRef.current.has(event.pointerId)) {
      return
    } else {
      activePointersRef.current.set(event.pointerId, point)
    }

    const orderedContacts = activePointerOrderRef.current
      .map((pointerId) => ({ pointerId, point: activePointersRef.current.get(pointerId) }))
      .filter((contact): contact is { pointerId: number; point: NormalizedPoint } => contact.point !== undefined)
    const primary = orderedContacts[0] ?? { pointerId: event.pointerId, point }
    const physicalSecondary = orderedContacts[1]?.point
    const secondary = physicalSecondary
      ?? (virtualSecondaryActiveRef.current
        ? panOffsetRef.current
          ? {
              x: Math.max(0, Math.min(1, primary.point.x + panOffsetRef.current.x)),
              y: Math.max(0, Math.min(1, primary.point.y + panOffsetRef.current.y)),
            }
          : mirrorAcrossCenter(primary.point)
        : null)
    const commandPhase = pointerPhase === 'down' && orderedContacts.length > 1 ? 'move' : pointerPhase

    setMultiTouchPreview(secondary ? { primary: primary.point, secondary } : null)
    void sendCommand('input', {
      mouseButton: 'left',
      phase: commandPhase,
      pointerId: primary.pointerId,
      secondary,
      timestamp: Math.round(event.timeStamp),
      x: primary.point.x,
      y: primary.point.y,
    }).catch((commandError: unknown) => {
      setError(commandError instanceof Error ? commandError.message : 'The simulator pointer command failed.')
    })

    if (pointerPhase === 'up' || pointerPhase === 'cancel') {
      const endedMultiTouchGesture = orderedContacts.length > 1 || virtualSecondaryActiveRef.current
      if (endedMultiTouchGesture) {
        activePointersRef.current.clear()
        activePointerOrderRef.current = []
      } else {
        activePointersRef.current.delete(event.pointerId)
        activePointerOrderRef.current = activePointerOrderRef.current
          .filter((pointerId) => pointerId !== event.pointerId)
      }
      virtualSecondaryActiveRef.current = false
      panOffsetRef.current = null
      setMultiTouchPreview(null)
    }
  }

  function handleAnnotationPointer(
    event: MediaPointerEvent,
    pointerPhase: 'down' | 'move' | 'up' | 'cancel',
    point: NormalizedPoint,
    drag: AnnotationDrag,
  ) {
    event.preventDefault()
    event.stopPropagation()
    if (pointerPhase === 'cancel') {
      annotationDragRef.current = null
      setAnnotationDraft(null)
      setAnnotationMode(false)
      if (!isAnnotationEditorOpen && phase === 'connected') {
        void videoRef.current?.play().catch(() => undefined)
      }
      return
    }

    const nextDraft = createAnnotationGeometryDraft(drag, point, event.clientX, event.clientY)
    setAnnotationDraft(nextDraft)
    if (pointerPhase !== 'up') {
      return
    }

    annotationDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setAnnotationDraft(null)
    setAnnotationMode(false)
    onCreateAnnotation?.(nextDraft)
  }

  function handleKey(event: ReactKeyboardEvent<HTMLDivElement>, keyPhase: 'down' | 'up') {
    if (event.nativeEvent.isComposing) {
      return
    }

    const usageCode = keyboardCodeToHidUsage(event.code)
    if (usageCode === null) {
      if (keyPhase === 'down' && event.key.length === 1 && event.code === 'Unidentified') {
        event.preventDefault()
        void sendCommand('text', { text: event.key }).catch(showTextError)
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (keyPhase === 'down') {
      if (event.repeat || pressedKeyUsagesRef.current.has(event.code)) {
        return
      }
      pressedKeyUsagesRef.current.set(event.code, usageCode)
    } else {
      pressedKeyUsagesRef.current.delete(event.code)
    }

    void sendCommand('key', { phase: keyPhase, usageCode }).catch((commandError: unknown) => {
      setError(commandError instanceof Error ? commandError.message : 'Keyboard input failed.')
    })
  }

  function releasePressedKeys() {
    for (const usageCode of pressedKeyUsagesRef.current.values()) {
      void sendCommand('key', { phase: 'up', usageCode }).catch(() => undefined)
    }
    pressedKeyUsagesRef.current.clear()
  }

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData('text')
    if (!text) {
      return
    }

    event.preventDefault()
    void sendCommand('text', { text }).catch(showTextError)
  }

  const pointerHandlers = {
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onPointerCancel: (event: MediaPointerEvent) => sendPointer(event, 'cancel'),
    onPointerDown: (event: MediaPointerEvent) => sendPointer(event, 'down'),
    onPointerLeave: (event: MediaPointerEvent) => {
      if (!activePointersRef.current.has(event.pointerId)) {
        setMultiTouchPreview(null)
      }
    },
    onPointerMove: (event: MediaPointerEvent) => sendPointer(event, 'move'),
    onPointerUp: (event: MediaPointerEvent) => sendPointer(event, 'up'),
  }
  const overlayStyle = mediaBounds
    ? {
        height: mediaBounds.height,
        left: mediaBounds.x,
        top: mediaBounds.y,
        width: mediaBounds.width,
      } satisfies CSSProperties
    : undefined
  const canAnnotate = !!onCreateAnnotation && !!frame
  const isAnnotating = canAnnotate && annotationMode
  const controlCount = 3 + Number(!!onOpenDeviceLocation) + Number(canAnnotate)
  const controlsClassName = controlCount > 3
    ? `local-simulator-controls local-simulator-controls--${controlCount}`
    : 'local-simulator-controls'
  const resolvedMediaAspectRatio = mediaAspectRatio ?? resolveMediaAspectRatio(frame?.width, frame?.height) ?? (9 / 19.5)
  const viewportKind = resolveSimulatorViewportKind(resolvedMediaAspectRatio)
  const stageClassName = [
    'local-simulator-stage',
    `local-simulator-stage--${viewportKind}`,
    isAnnotating ? 'local-simulator-stage--annotating' : '',
  ].filter(Boolean).join(' ')
  const stageStyle = {
    aspectRatio: `${resolvedMediaAspectRatio}`,
    width: `min(100cqw, ${resolvedMediaAspectRatio * 100}cqh)`,
  } satisfies CSSProperties

  return (
    <div className="local-simulator-control">
      <div className="panel-heading local-simulator-heading">
        {captureToolbar}
        <span className={`local-simulator-status local-simulator-status--${phase}`}>
          {phase === 'negotiating' || phase === 'connecting' ? <CircleNotch className="spin" aria-hidden="true" /> : <DeviceMobile aria-hidden="true" />}
          {phase === 'connected' ? 'Live control' : phase === 'fallback' ? 'Screenshot control' : phase}
        </span>
      </div>

      <div className="local-simulator-stage-shell">
        <div
          aria-describedby="local-simulator-input-help"
          aria-label={`Live ${platform || 'mobile'} simulator control. Click to focus, then type into the app.`}
          className={stageClassName}
          onBlur={releasePressedKeys}
          onKeyDown={(event) => handleKey(event, 'down')}
          onKeyUp={(event) => handleKey(event, 'up')}
          onPaste={handlePaste}
          ref={stageRef}
          role="application"
          style={stageStyle}
          tabIndex={0}
        >
          <video
            {...pointerHandlers}
            aria-hidden="true"
            autoPlay
            muted
            onLoadedMetadata={syncMediaBounds}
            onResize={syncMediaBounds}
            playsInline
            ref={videoRef}
          />
          {phase === 'fallback' && fallbackFrameUrl ? (
            <img
              {...pointerHandlers}
              alt=""
              aria-hidden="true"
              draggable={false}
              onLoad={syncMediaBounds}
              ref={fallbackImageRef}
              src={fallbackFrameUrl}
            />
          ) : null}
          {overlayStyle ? (
            <div className="local-simulator-media-overlay" style={overlayStyle}>
              <LiveAnnotationOverlay
                annotations={annotations}
                draft={annotationDraft}
                frame={frame}
                selectedAnnotationId={selectedAnnotationId}
              />
              {multiTouchPreview ? <MultiTouchOverlay {...multiTouchPreview} /> : null}
            </div>
          ) : null}
          {phase === 'negotiating' || phase === 'connecting' ? (
            <div className="local-simulator-overlay">
              <CircleNotch className="spin" aria-hidden="true" />
              <strong>Connecting live control</strong>
            </div>
          ) : null}
        </div>
      </div>

      <div className={controlsClassName} aria-label="Simulator controls">
        <button onClick={() => void sendCommand('button', { button: 'home' }).catch(showCommandError)} title="Home" type="button">
          <House aria-hidden="true" /><span>Home</span>
        </button>
        <button onClick={() => void sendCommand('button', { button: 'back' }).catch(showCommandError)} title="Back" type="button">
          <ArrowCounterClockwise aria-hidden="true" /><span>Back</span>
        </button>
        <button onClick={() => void sendCommand('button', { button: 'lock' }).catch(showCommandError)} title="Lock" type="button">
          <Lock aria-hidden="true" /><span>Lock</span>
        </button>
        {onOpenDeviceLocation ? (
          <button onClick={onOpenDeviceLocation} title="Location" type="button">
            <MapPin aria-hidden="true" /><span>Location</span>
          </button>
        ) : null}
        {canAnnotate ? (
          <button
            aria-pressed={isAnnotating}
            className={isAnnotating ? 'local-simulator-annotate-button local-simulator-annotate-button--active' : 'local-simulator-annotate-button'}
            onClick={() => setAnnotationMode((current) => !current)}
            title="Draw an annotation on the live app"
            type="button"
          >
            <PencilSimpleLine aria-hidden="true" /><span>Annotate</span>
          </button>
        ) : null}
      </div>

      <p className="local-simulator-input-help" id="local-simulator-input-help">
        Click the simulator, then type
        <span aria-hidden="true">·</span>
        <kbd>⌥</kbd> drag to pinch
        <span aria-hidden="true">·</span>
        <kbd>⇧⌥</kbd> drag to pan
        {canAnnotate ? <><span aria-hidden="true">·</span><kbd>⇧</kbd> drag to annotate</> : null}
      </p>

      {error ? (
        <div className="local-simulator-error" role="status">
          <WarningCircle aria-hidden="true" />
          <span>{error}</span>
          {phase === 'fallback' ? (
            <button
              onClick={() => {
                setPhase('negotiating')
                setError(null)
                setConnectionAttempt((current) => current + 1)
              }}
              type="button"
            >
              Retry video
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  function showCommandError(commandError: unknown) {
    setError(commandError instanceof Error ? commandError.message : 'The simulator command failed.')
  }

  function showTextError(commandError: unknown) {
    setError(commandError instanceof Error ? commandError.message : 'Text input failed.')
  }
}

function LiveAnnotationOverlay({
  annotations,
  draft,
  frame,
  selectedAnnotationId,
}: {
  annotations: SessionAnnotation[]
  draft: ScreenshotAnnotationGeometryDraft | null
  frame: SessionImageFrame | null
  selectedAnnotationId: string | null
}) {
  const geometries = frame
    ? annotations.flatMap((annotation, annotationIndex) => {
        const annotationId = annotation.annotationId || `annotation-${annotationIndex}`
        return (annotation.geometry ?? [])
          .filter((geometry) => geometry.frameId === frame.frameId)
          .map((geometry, geometryIndex) => ({ annotationId, geometry, geometryIndex }))
      })
    : []

  if (geometries.length === 0 && !draft) {
    return null
  }

  return (
    <svg aria-hidden="true" className="local-simulator-annotation-overlay" focusable="false" preserveAspectRatio="none" viewBox="0 0 1 1">
      {geometries.map(({ annotationId, geometry, geometryIndex }) => {
        const className = annotationId === selectedAnnotationId
          ? 'local-simulator-annotation-shape local-simulator-annotation-shape--selected'
          : 'local-simulator-annotation-shape'
        if (Number(geometry.kind) === 0 || geometry.width == null || geometry.height == null) {
          return <circle className={className} cx={geometry.x ?? 0} cy={geometry.y ?? 0} key={`${annotationId}-${geometry.geometryId || geometryIndex}`} r={0.018} vectorEffect="non-scaling-stroke" />
        }
        return (
          <rect
            className={className}
            height={geometry.height}
            key={`${annotationId}-${geometry.geometryId || geometryIndex}`}
            rx={0.018}
            vectorEffect="non-scaling-stroke"
            width={geometry.width}
            x={geometry.x}
            y={geometry.y}
          />
        )
      })}
      {draft?.kind === 1 ? (
        <rect className="local-simulator-annotation-draft" height={draft.height} rx={0.018} vectorEffect="non-scaling-stroke" width={draft.width} x={draft.x} y={draft.y} />
      ) : draft ? (
        <circle className="local-simulator-annotation-draft" cx={draft.x} cy={draft.y} r={0.018} vectorEffect="non-scaling-stroke" />
      ) : null}
    </svg>
  )
}

function MultiTouchOverlay({ primary, secondary }: { primary: NormalizedPoint; secondary: NormalizedPoint }) {
  return (
    <svg aria-hidden="true" className="local-simulator-multitouch-overlay" focusable="false" preserveAspectRatio="none" viewBox="0 0 1 1">
      <line vectorEffect="non-scaling-stroke" x1={primary.x} x2={secondary.x} y1={primary.y} y2={secondary.y} />
      <circle cx={primary.x} cy={primary.y} r={0.022} vectorEffect="non-scaling-stroke" />
      <circle cx={secondary.x} cy={secondary.y} r={0.022} vectorEffect="non-scaling-stroke" />
      <circle className="local-simulator-multitouch-pivot" cx={(primary.x + secondary.x) / 2} cy={(primary.y + secondary.y) / 2} r={0.006} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function createAnnotationGeometryDraft(
  drag: AnnotationDrag,
  point: NormalizedPoint,
  clientX: number,
  clientY: number,
): ScreenshotAnnotationGeometryDraft {
  const isRectangle = Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) >= 6
  return isRectangle
    ? {
        kind: 1,
        x: Math.min(drag.start.x, point.x),
        y: Math.min(drag.start.y, point.y),
        width: Math.abs(point.x - drag.start.x),
        height: Math.abs(point.y - drag.start.y),
      }
    : { kind: 0, x: drag.start.x, y: drag.start.y }
}

function mirrorAcrossCenter(point: NormalizedPoint): NormalizedPoint {
  return {
    x: Math.max(0, Math.min(1, 1 - point.x)),
    y: Math.max(0, Math.min(1, 1 - point.y)),
  }
}

function keyboardCodeToHidUsage(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) {
    return 4 + code.charCodeAt(3) - 'A'.charCodeAt(0)
  }
  if (/^Digit[1-9]$/.test(code)) {
    return 30 + Number(code[5]) - 1
  }
  if (code === 'Digit0') {
    return 39
  }
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) {
    const functionNumber = Number(code.slice(1))
    return functionNumber <= 12 ? 57 + functionNumber : 91 + functionNumber
  }
  if (/^Numpad[1-9]$/.test(code)) {
    return 88 + Number(code[6])
  }

  return keyboardUsages[code] ?? null
}

const keyboardUsages: Record<string, number> = {
  AltLeft: 226,
  AltRight: 230,
  ArrowDown: 81,
  ArrowLeft: 80,
  ArrowRight: 79,
  ArrowUp: 82,
  Backquote: 53,
  Backslash: 49,
  Backspace: 42,
  BracketLeft: 47,
  BracketRight: 48,
  CapsLock: 57,
  Comma: 54,
  ContextMenu: 101,
  ControlLeft: 224,
  ControlRight: 228,
  Delete: 76,
  End: 77,
  Enter: 40,
  Equal: 46,
  Escape: 41,
  Home: 74,
  Insert: 73,
  IntlBackslash: 100,
  MetaLeft: 227,
  MetaRight: 231,
  Minus: 45,
  NumLock: 83,
  Numpad0: 98,
  NumpadAdd: 87,
  NumpadDecimal: 99,
  NumpadDivide: 84,
  NumpadEnter: 88,
  NumpadEqual: 103,
  NumpadMultiply: 85,
  NumpadSubtract: 86,
  PageDown: 78,
  PageUp: 75,
  Pause: 72,
  Period: 55,
  PrintScreen: 70,
  Quote: 52,
  ScrollLock: 71,
  Semicolon: 51,
  ShiftLeft: 225,
  ShiftRight: 229,
  Slash: 56,
  Space: 44,
  Tab: 43,
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer)
      peer.removeEventListener('icegatheringstatechange', listener)
      resolve()
    }
    const listener = () => {
      if (peer.iceGatheringState === 'complete') {
        finish()
      }
    }
    const timer = window.setTimeout(finish, 1800)
    peer.addEventListener('icegatheringstatechange', listener)
  })
}

async function closeRemoteSession(apiRoot: string, remoteSessionId: string): Promise<void> {
  await fetch(`${apiRoot}/close`, {
    body: JSON.stringify({ sessionId: remoteSessionId }),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined)
}

async function resolveResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { message?: string; error?: string }
    return body.message || body.error || fallback
  } catch {
    return fallback
  }
}

function resolveContainedPoint(
  element: HTMLVideoElement | HTMLImageElement,
  clientX: number,
  clientY: number,
): NormalizedPoint {
  const rendered = resolveContainedBounds(element)
  if (!rendered) {
    return { x: 0.5, y: 0.5 }
  }

  return {
    x: Math.max(0, Math.min(1, (clientX - rendered.left) / rendered.width)),
    y: Math.max(0, Math.min(1, (clientY - rendered.top) / rendered.height)),
  }
}

function resolveMediaElementAspectRatio(element: HTMLVideoElement | HTMLImageElement): number | null {
  return element instanceof HTMLVideoElement
    ? resolveMediaAspectRatio(element.videoWidth, element.videoHeight)
    : resolveMediaAspectRatio(element.naturalWidth, element.naturalHeight)
}

function resolveMediaAspectRatio(width: number | null | undefined, height: number | null | undefined): number | null {
  return typeof width === 'number'
    && Number.isFinite(width)
    && width > 0
    && typeof height === 'number'
    && Number.isFinite(height)
    && height > 0
    ? width / height
    : null
}

function resolveSimulatorViewportKind(aspectRatio: number): SimulatorViewportKind {
  const shortToLongRatio = Math.min(aspectRatio, 1 / aspectRatio)
  return shortToLongRatio <= 0.6 ? 'phone' : 'tablet'
}

function resolveContainedBounds(
  element: HTMLVideoElement | HTMLImageElement,
): { height: number; left: number; top: number; width: number } | null {
  const bounds = element.getBoundingClientRect()
  const sourceWidth = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth
  const sourceHeight = element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight
  if (sourceWidth <= 0 || sourceHeight <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return {
    height,
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
  }
}

function mediaBoundsEqual(left: MediaBounds | null, right: MediaBounds | null): boolean {
  if (!left || !right) {
    return left === right
  }

  return Math.abs(left.x - right.x) < 0.5
    && Math.abs(left.y - right.y) < 0.5
    && Math.abs(left.width - right.width) < 0.5
    && Math.abs(left.height - right.height) < 0.5
}
