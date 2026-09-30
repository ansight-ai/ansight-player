import { ArrowClockwise, CircleNotch, TreeStructure, WarningCircle } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'

export type LiveVisualTreeSource = { toolId: string; label: string }

export function LiveVisualTreeCaptureToolbar({ sessionId, loadSources, capture }: {
  sessionId: string
  loadSources: (sessionId: string) => Promise<LiveVisualTreeSource[]>
  capture: (sessionId: string, toolId: string) => Promise<string>
}) {
  const [sources, setSources] = useState<LiveVisualTreeSource[]>([])
  const [selectedToolId, setSelectedToolId] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const mounted = useRef(false)
  const refreshing = useRef(false)
  const capturing = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshing.current || capturing.current) return
    refreshing.current = true
    try {
      const next = await loadSources(sessionId)
      if (!mounted.current) return
      setSources(next)
      setSelectedToolId((current) => next.some((source) => source.toolId === current) ? current : next[0]?.toolId ?? '')
      setMessage(null)
    } catch (error) {
      if (mounted.current) {
        setSources([])
        setSelectedToolId('')
        setMessage({ error: true, text: error instanceof Error ? error.message : 'Unable to load visual trees.' })
      }
    } finally {
      refreshing.current = false
      if (mounted.current) setLoading(false)
    }
  }, [loadSources, sessionId])

  useEffect(() => {
    mounted.current = true
    const initialLoad = window.setTimeout(() => void refresh(), 0)
    return () => {
      mounted.current = false
      window.clearTimeout(initialLoad)
    }
  }, [refresh])

  async function handleCapture() {
    if (!selectedToolId || capturing.current) return
    capturing.current = true
    setPending(true)
    setMessage(null)
    try {
      const text = await capture(sessionId, selectedToolId)
      if (mounted.current) setMessage({ error: false, text })
    } catch (error) {
      if (mounted.current) setMessage({ error: true, text: error instanceof Error ? error.message : 'Unable to capture the visual tree.' })
    } finally {
      capturing.current = false
      if (mounted.current) setPending(false)
    }
  }

  const label = sources.find((source) => source.toolId === selectedToolId)?.label ?? 'visual tree'
  const captureLabel = pending ? `Capturing ${label}` : `Capture ${label}`
  return (
    <div className="session-replay-capture-toolbar">
      <select
        aria-label="Visual tree to capture"
        disabled={pending}
        onChange={(event) => setSelectedToolId(event.target.value)}
        onFocus={() => { setLoading(true); void refresh() }}
        value={selectedToolId}
      >
        {sources.length === 0 ? <option value="">{loading ? 'Loading trees…' : 'No trees available'}</option> : null}
        {sources.map((source) => <option key={source.toolId} value={source.toolId}>{source.label}</option>)}
      </select>
      <button
        aria-label={captureLabel}
        className="session-replay-capture-button"
        disabled={pending || loading || !selectedToolId}
        onClick={() => void handleCapture()}
        title={captureLabel}
        type="button"
      >
        {pending ? <CircleNotch className="spin" aria-hidden="true" /> : <TreeStructure aria-hidden="true" />}
      </button>
      {!loading && sources.length === 0 ? (
        <button aria-label="Reload available visual trees" className="session-replay-capture-button" onClick={() => { setLoading(true); void refresh() }} title="Reload available visual trees" type="button">
          <ArrowClockwise aria-hidden="true" />
        </button>
      ) : null}
      {message ? (
        <span className={message.error ? 'session-replay-capture-message session-replay-capture-message--error' : 'session-replay-capture-message session-replay-capture-message--success'} role={message.error ? 'alert' : 'status'} title={message.text}>
          {message.error ? <WarningCircle aria-hidden="true" /> : null}
          {message.text}
        </span>
      ) : null}
    </div>
  )
}
