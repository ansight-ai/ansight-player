import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { TaskSourceEntry } from './taskSourceTrace'

const SourceCodeEditor = lazy(() => import('./TraceSourceCodeEditor'))

export function TaskSourceViewer({ sources }: { sources: TaskSourceEntry[] }) {
  const [open, setOpen] = useState(false)
  return <div className="local-task-source-actions">
    {sources.some((source) => source.modules.length > 0)
      ? <button type="button" onClick={() => setOpen(true)}>View executed code</button>
      : <span>Source code was not recorded for this run. Rerun with tracing enabled to capture it.</span>}
    {open ? <TaskSourceModal sources={sources} onClose={() => setOpen(false)} /> : null}
  </div>
}

function TaskSourceModal({ sources, onClose }: { sources: TaskSourceEntry[], onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const files = sources.flatMap((source) => source.modules.map((module) => ({ source, module })))
  const selected = files[selectedIndex]
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])
  return <dialog ref={dialogRef} className="local-task-source-modal" aria-labelledby="task-source-title"
    onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="local-task-source-body">
      <header>
        <div><h3 id="task-source-title">Executed task code</h3><p>Source captured when this run loaded each workspace module.</p></div>
        <button type="button" aria-label="Close executed code" onClick={onClose}>Close</button>
      </header>
      <div className="local-task-source-controls">
        {files.length > 0 ? <label>File <select value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>
          {files.map(({ source, module }, index) => <option key={index} value={index}>
            {source.taskId} · {source.invocation} · {module.path}
          </option>)}
        </select></label> : <p>No module source was captured.</p>}
        {sources.filter((source) => source.captureError).map((source, index) => <p role="status" key={index}>{source.taskId}: {source.captureError}</p>)}
        {selected ? <>
          <code className="local-task-source-hash">SHA-256 {selected.module.sha256}</code>
          {selected.module.wasTruncated ? <p role="status">Source truncated: showing {selected.module.content.length.toLocaleString()} of {selected.module.originalCharacterCount.toLocaleString()} characters. The hash identifies the full source.</p> : null}
        </> : null}
      </div>
      <div className="local-task-source-editor">
        {selected ? <Suspense fallback={<p>Loading code viewer…</p>}><SourceCodeEditor key={selectedIndex} module={selected.module} /></Suspense> : null}
      </div>
    </div>
  </dialog>
}
