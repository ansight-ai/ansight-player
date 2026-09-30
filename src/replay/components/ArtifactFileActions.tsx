import { createPortal } from 'react-dom'
import { ArrowSquareOut, CircleNotch, Desktop, FolderOpen, DotsThree, X } from '@phosphor-icons/react'
import { useId, useRef, useState } from 'react'
import './ArtifactFileActions.css'

export type ArtifactFileTarget = {
  sessionId: string
  snapshotId: string | null
  path: string
}

export type ArtifactApplication = { id: string, name: string }

export type ArtifactFileOperations = {
  listApplications: (target: ArtifactFileTarget) => Promise<{ applications: ArtifactApplication[], message?: string }>
  open: (target: ArtifactFileTarget, applicationId: string) => Promise<string>
  reveal: (target: ArtifactFileTarget) => Promise<string>
  exportDesktop: (target: ArtifactFileTarget) => Promise<string>
}

export function ArtifactFileActions({
  fileName,
  operations,
  target,
}: {
  fileName: string
  operations: ArtifactFileOperations
  target: ArtifactFileTarget
}) {
  const applicationListId = useId()
  const dialogId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const pendingRef = useRef(false)
  const [showApplications, setShowApplications] = useState(false)
  const [applications, setApplications] = useState<ArtifactApplication[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [applicationMessage, setApplicationMessage] = useState<string | null>(null)

  async function toggleApplications() {
    if (pendingRef.current) return
    if (showApplications) {
      setShowApplications(false)
      return
    }
    pendingRef.current = true
    setShowApplications(true)
    setApplications([])
    setApplicationMessage(null)
    setMessage(null)
    setIsBusy(true)
    try {
      const result = await operations.listApplications(target)
      setApplications(result.applications)
      setApplicationMessage(result.message || (result.applications.length === 0 ? 'No installed viewers are available for this file.' : null))
    } catch (error) {
      setApplicationMessage(error instanceof Error ? error.message : 'Unable to find available viewers.')
    } finally {
      pendingRef.current = false
      setIsBusy(false)
    }
  }

  async function performAction(action: () => Promise<string>) {
    if (pendingRef.current) return
    pendingRef.current = true
    setIsBusy(true)
    setMessage(null)
    setShowApplications(false)
    try {
      setMessage(await action())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to complete the file action.')
    } finally {
      pendingRef.current = false
      setIsBusy(false)
    }
  }

  return (
    <div className="artifact-file-operations">
      <button type="button" className="button button--secondary artifact-actions-trigger" aria-label={`Actions for ${fileName}`} aria-haspopup="dialog" aria-controls={dialogId} ref={menuButtonRef} onClick={() => {
        const dialog = dialogRef.current
        if (!dialog) return
        const bounds = menuButtonRef.current!.getBoundingClientRect()
        dialog.style.top = `${Math.max(16, Math.min(bounds.bottom + 8, window.innerHeight - 400))}px`
        dialog.style.right = `${Math.max(16, window.innerWidth - bounds.right)}px`
        dialog.showModal()
      }}><DotsThree aria-hidden="true" size={24} /></button>
      {createPortal(<dialog ref={dialogRef} id={dialogId} className="artifact-actions-dialog" aria-label={`Actions for ${fileName}`} onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close() }} onClose={() => { setShowApplications(false); menuButtonRef.current?.focus() }} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        if (showApplications) {
          event.preventDefault()
          setShowApplications(false)
          openButtonRef.current?.focus()
        }
      }
    }}>
      <header><strong>{fileName}</strong><button type="button" aria-label="Close file actions" onClick={() => dialogRef.current?.close()}><X aria-hidden="true" /></button></header>
      <div aria-label={`Actions for ${fileName}`} className="artifact-file-operation-buttons" role="group">
        <button
          aria-controls={applicationListId}
          aria-expanded={showApplications}
          className="button button--secondary"
          disabled={isBusy}
          onClick={() => void toggleApplications()}
          ref={openButtonRef}
          type="button"
        >
          <ArrowSquareOut aria-hidden="true" /> Open in…
        </button>
        <button className="button button--secondary" disabled={isBusy} onClick={() => void performAction(() => operations.reveal(target))} type="button">
          <FolderOpen aria-hidden="true" /> Show in folder
        </button>
        <button className="button button--secondary" disabled={isBusy} onClick={() => void performAction(() => operations.exportDesktop(target))} type="button">
          <Desktop aria-hidden="true" /> Export to Desktop
        </button>
      </div>
      {showApplications ? (
        <div aria-label={`Available viewers for ${fileName}`} className="artifact-application-list" id={applicationListId} role="group">
          {applications.map((application) => (
            <button
              className="button button--secondary"
              disabled={isBusy}
              key={application.id}
              onClick={() => {
                openButtonRef.current?.focus()
                void performAction(() => operations.open(target, application.id))
              }}
              type="button"
            >{application.name}</button>
          ))}
          {applicationMessage ? <p role="status">{applicationMessage}</p> : null}
        </div>
      ) : null}
      <div aria-live="polite" className="artifact-file-operation-status" role="status">
        {isBusy ? <><CircleNotch aria-hidden="true" className="spin" /> {showApplications ? 'Finding available viewers…' : 'Working…'}</> : message}
      </div>
      </dialog>, document.body)}
    </div>
  )
}
