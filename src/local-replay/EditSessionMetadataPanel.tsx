import { CircleNotch, FloppyDisk, X } from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import type { LocalOperationResult } from './types'

type SessionMetadata = {
  sessionId: string
  name?: string | null
  isPinned: boolean
  tags: string[]
  notes?: string | null
}

export function EditSessionMetadataPanel({
  onClose,
  onSaved,
  sessionId,
  sessionTitle,
}: {
  onClose: () => void
  onSaved: (name: string | null) => void
  sessionId: string
  sessionTitle: string
}) {
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    async function loadMetadata() {
      try {
        const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(await readError(response))
        const next = await response.json() as SessionMetadata
        setMetadata(next)
        setName(next.name ?? '')
        setNotes(next.notes ?? '')
      } catch (error) {
        if (!controller.signal.aborted) setMessage(resolveError(error, 'Unable to load session details.'))
      }
    }

    void loadMetadata()
    return () => controller.abort()
  }, [sessionId])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSaving, onClose])

  async function saveMetadata(event: FormEvent) {
    event.preventDefault()
    if (!metadata || isSaving) return

    const normalizedName = name.trim() || null
    setIsSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/metadata`, {
        body: JSON.stringify({
          isPinned: metadata.isPinned,
          tags: metadata.tags,
          notes: notes.trim() || null,
          name: normalizedName,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalOperationResult
      if (!response.ok || !result.isSuccess) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      onSaved(normalizedName)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to save session details.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="local-admin-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !isSaving) onClose()
    }}>
      <section aria-label="Edit session details" aria-modal="true" className="local-admin-panel local-session-metadata-panel" role="dialog">
        <header className="local-admin-header">
          <div><p className="eyebrow">Session details</p><span>{sessionTitle}</span></div>
          <button aria-label="Close session details" className="local-icon-button" disabled={isSaving} onClick={onClose} type="button"><X /></button>
        </header>
        {message ? <p className="inline-message local-admin-message" role="alert">{message}</p> : null}
        <div className="local-admin-content">
          {metadata ? (
            <form className="local-admin-form local-session-metadata-form" onSubmit={saveMetadata}>
              <label className="local-admin-form--wide">Name<input autoFocus onChange={(event) => setName(event.target.value)} placeholder="Session name" value={name} /></label>
              <label className="local-admin-form--wide">Notes<textarea onChange={(event) => setNotes(event.target.value)} placeholder="Add context, findings, or follow-up notes" rows={8} value={notes} /></label>
              <div className="local-admin-actions local-admin-form--wide">
                <button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? <CircleNotch className="spin" /> : <FloppyDisk />}Save</button>
                <button className="button button--secondary" disabled={isSaving} onClick={onClose} type="button">Cancel</button>
              </div>
            </form>
          ) : !message ? (
            <div className="local-admin-empty"><CircleNotch className="spin" /><span>Loading session details</span></div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

async function readError(response: Response): Promise<string> {
  try {
    return ((await response.json()) as { message?: string }).message || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function resolveError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
