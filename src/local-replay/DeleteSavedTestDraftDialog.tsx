import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

export function DeleteSavedTestDraftDialog({ title, updatedAtUtc, isDeleting, error, onCancel, onConfirm }: {
  title: string
  updatedAtUtc: string
  isDeleting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return createPortal(<dialog
    aria-describedby={descriptionId}
    aria-labelledby={titleId}
    className="local-session-delete-modal local-saved-draft-delete-dialog"
    onCancel={(event) => { event.preventDefault(); if (!isDeleting) onCancel() }}
    onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
    ref={dialogRef}
  >
    <h2 id={titleId}>Delete saved YAML draft?</h2>
    <p><strong>{title}</strong><br />{new Date(updatedAtUtc).toLocaleString()}</p>
    <p id={descriptionId}>This permanently deletes the saved draft and cannot be undone.</p>
    {error ? <p className="inline-message" role="alert">{error}</p> : null}
    <footer>
      <button autoFocus disabled={isDeleting} onClick={onCancel} type="button">Cancel</button>
      <button className="local-session-delete-confirm" disabled={isDeleting} onClick={onConfirm} type="button">{isDeleting ? 'Deleting…' : 'Delete draft'}</button>
    </footer>
  </dialog>, document.body)
}
