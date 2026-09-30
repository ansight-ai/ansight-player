import { Check, CircleNotch, X } from '@phosphor-icons/react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import type { TeamSession } from '../types'
import { sessionAccessStatusOptions, type SessionDetailsUpdate } from './teamData'

export function SessionEditModal({
  error,
  isSubmitting,
  onClose,
  onSubmit,
  session,
}: {
  error: string | null
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (details: SessionDetailsUpdate) => Promise<void>
  session: TeamSession
}) {
  const [title, setTitle] = useState(session.title)
  const [description, setDescription] = useState(session.description)
  const [appName, setAppName] = useState(session.app_name ?? '')
  const [appId, setAppId] = useState(session.app_id ?? '')
  const [sourceSessionId, setSourceSessionId] = useState(session.session_id ?? '')
  const [authorName, setAuthorName] = useState(session.author_name ?? '')
  const [authorEmail, setAuthorEmail] = useState(session.author_email ?? '')
  const [authorCompany, setAuthorCompany] = useState(session.author_company ?? '')
  const [tagsText, setTagsText] = useState((session.tags ?? []).join(', '))
  const [accessStatus, setAccessStatus] = useState(session.access_status)
  const [metadataText, setMetadataText] = useState(() => formatMetadataDraft(session.metadata))
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    let metadata: unknown
    try {
      metadata = metadataText.trim() ? JSON.parse(metadataText) : {}
    } catch {
      setLocalError('Metadata JSON is invalid.')
      return
    }

    await onSubmit({
      title,
      description,
      appName,
      appId,
      sourceSessionId,
      authorName,
      authorEmail,
      authorCompany,
      tags: parseTags(tagsText),
      metadata,
      accessStatus,
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="session-edit-title"
        aria-modal="true"
        className="session-info-modal session-edit-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Session</p>
            <h2 id="session-edit-title">Edit session</h2>
          </div>
          <button className="button button--secondary button--icon" onClick={onClose} type="button" aria-label="Close session editor">
            <X aria-hidden="true" />
          </button>
        </div>

        <form className="session-edit-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="session-edit-grid">
            <SessionEditField label="Name" onChange={setTitle} required value={title} />
            <SessionEditField label="Access" onChange={setAccessStatus} options={sessionAccessStatusOptions} value={accessStatus} />
            <SessionEditField label="App name" onChange={setAppName} value={appName} />
            <SessionEditField label="App ID" onChange={setAppId} value={appId} />
            <SessionEditField label="Session ID" onChange={setSourceSessionId} value={sourceSessionId} />
            <SessionEditField label="Tags" onChange={setTagsText} value={tagsText} />
            <SessionEditField label="Author name" onChange={setAuthorName} value={authorName} />
            <SessionEditField label="Author email" onChange={setAuthorEmail} type="email" value={authorEmail} />
            <SessionEditField label="Author company" onChange={setAuthorCompany} value={authorCompany} />
          </div>

          <label className="session-edit-field">
            <span className="field-label">Description</span>
            <textarea className="session-edit-control textarea-control" onChange={(event) => setDescription(event.target.value)} value={description} />
          </label>

          <label className="session-edit-field">
            <span className="field-label">Metadata JSON</span>
            <textarea className="session-edit-control textarea-control session-edit-metadata" onChange={(event) => setMetadataText(event.target.value)} value={metadataText} />
          </label>

          {localError || error ? <p className="inline-message inline-message--warning">{localError ?? error}</p> : null}

          <div className="session-edit-actions">
            <button className="button button--secondary" onClick={onClose} type="button">
              <X aria-hidden="true" />
              Cancel
            </button>
            <button className="button button--primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? <CircleNotch className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              Save
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function SessionEditField<TValue extends string>({
  label,
  onChange,
  options,
  required,
  type = 'text',
  value,
}: {
  label: string
  onChange: (value: TValue) => void
  options?: Array<{ value: TValue; label: string }>
  required?: boolean
  type?: string
  value: TValue
}) {
  return (
    <label className="session-edit-field">
      <span className="field-label">{label}</span>
      {options ? (
        <select className="session-edit-control" onChange={(event) => onChange(event.target.value as TValue)} value={value}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input className="session-edit-control" onChange={(event) => onChange(event.target.value as TValue)} required={required} type={type} value={value} />
      )}
    </label>
  )
}

function parseTags(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatMetadataDraft(metadata: unknown): string {
  try {
    return JSON.stringify(metadata ?? {}, null, 2)
  } catch {
    return '{}'
  }
}
