import { ArrowClockwise, CircleNotch, FloppyDisk, HardDrives, MagnifyingGlass, PushPin, Trash, UploadSimple, WifiSlash, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { addSessionRange } from './sessionSelection'
import type { LocalOperationResult, LocalSessionCachePlan, LocalSessionSummary } from './types'

type SessionStorageSettings = {
  sessionAutoCleanupEnabled: boolean
  sessionAutoCleanupRetentionDays: number
  sessionAutoCompactionAgeDays: number
  sessionAutoCleanupMaximumCacheBytes: number
}

const cacheSizeOptions = [512, 1024, 2048, 5120, 10240, 25600, 51200].map((megabytes) => megabytes * 1024 * 1024)

export function SessionAdministrationPanel({
  onClose,
  onSessionsChanged,
  sessions,
}: {
  onClose: () => void
  onSessionsChanged: () => void
  sessions: LocalSessionSummary[]
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<SessionAdministrationView>('storage')
  const [bulkQuery, setBulkQuery] = useState('')
  const [cachePlan, setCachePlan] = useState<LocalSessionCachePlan | null>(null)
  const [storageSettings, setStorageSettings] = useState<SessionStorageSettings | null>(null)
  const [storageDraft, setStorageDraft] = useState<SessionStorageSettings | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingOperation, setPendingOperation] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const selectionAnchorRef = useRef<string | null>(null)

  const loadStorageSettings = useCallback(async () => {
    try {
      const response = await fetch('api/settings/session-storage', { cache: 'no-store' })
      if (!response.ok) throw new Error(await readError(response))
      const next = await response.json() as SessionStorageSettings
      setStorageSettings(next)
      setStorageDraft(next)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to load session storage settings.'))
    }
  }, [])

  const loadCachePlan = useCallback(async () => {
    try {
      const response = await fetch('api/session-cache', { cache: 'no-store' })
      if (!response.ok) throw new Error(await readError(response))
      setCachePlan(await response.json() as LocalSessionCachePlan)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to inspect the local session cache.'))
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadStorageSettings(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadStorageSettings])
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadCachePlan(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadCachePlan])

  const bulkCandidates = useMemo(() => sessions.filter((session) => selectedIds.has(session.sessionId)), [selectedIds, sessions])
  const visibleSessions = useMemo(() => {
    const query = bulkQuery.trim().toLocaleLowerCase()
    return query
      ? sessions.filter((session) => [session.name, session.appName, session.clientName, session.appId]
        .some((value) => value?.toLocaleLowerCase().includes(query)))
      : sessions
  }, [bulkQuery, sessions])
  const areAllVisibleSelected = visibleSessions.length > 0
    && visibleSessions.every((session) => selectedIds.has(session.sessionId))
  const hasStorageChanges = storageSettings !== null && storageDraft !== null
    && JSON.stringify(storageSettings) !== JSON.stringify(storageDraft)

  async function saveStorageSettings(event: FormEvent) {
    event.preventDefault()
    if (!storageDraft || pendingOperation) return
    const wasSaved = await runJsonOperation(
      'save-storage-settings',
      'api/settings/session-storage',
      storageDraft,
      'Session storage settings saved.',
    )
    if (wasSaved) setStorageSettings(storageDraft)
  }

  async function runBulkOperation(operation: 'pin' | 'unpin' | 'disconnect' | 'delete') {
    if (bulkCandidates.length === 0) return
    if (operation === 'delete' && !window.confirm(`Delete ${bulkCandidates.length} selected session(s) permanently?`)) return
    const wasCompleted = await runJsonOperation(
      `bulk-${operation}`,
      'api/sessions/bulk',
      { operation, sessionIds: bulkCandidates.map((session) => session.sessionId) },
      `Bulk ${operation} completed.`,
    )
    if (wasCompleted) {
      setSelectedIds(new Set())
      selectionAnchorRef.current = null
    }
  }

  function toggleSessionSelection(event: ChangeEvent<HTMLInputElement>, sessionId: string) {
    const orderedIds = visibleSessions.map((session) => session.sessionId)
    if ('shiftKey' in event.nativeEvent && event.nativeEvent.shiftKey) {
      setSelectedIds((current) => addSessionRange(current, orderedIds, selectionAnchorRef.current, sessionId))
      if (!selectionAnchorRef.current || !orderedIds.includes(selectionAnchorRef.current)) {
        selectionAnchorRef.current = sessionId
      }
      return
    }

    selectionAnchorRef.current = sessionId
    const isSelected = event.target.checked
    setSelectedIds((current) => {
      const next = new Set(current)
      if (isSelected) next.add(sessionId)
      else next.delete(sessionId)
      return next
    })
  }

  function toggleVisibleSelection() {
    selectionAnchorRef.current = null
    setSelectedIds((current) => {
      const next = new Set(current)
      visibleSessions.forEach((session) => {
        if (areAllVisibleSelected) next.delete(session.sessionId)
        else next.add(session.sessionId)
      })
      return next
    })
  }

  async function runJsonOperation(operation: string, url: string, body: unknown, successMessage: string): Promise<boolean> {
    setPendingOperation(operation)
    setMessage(null)
    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalOperationResult
      if (!response.ok || !result.isSuccess) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      setMessage(result.message || successMessage)
      onSessionsChanged()
      await loadCachePlan()
      return true
    } catch (error) {
      setMessage(resolveError(error, `Unable to complete ${operation}.`))
      return false
    } finally {
      setPendingOperation(null)
    }
  }

  async function importArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || pendingOperation) return
    setPendingOperation('import')
    setMessage(null)
    try {
      const response = await fetch('api/sessions/import', {
        body: file,
        headers: { 'Content-Type': 'application/zip' },
        method: 'POST',
      })
      const result = await response.json() as LocalOperationResult
      if (!response.ok || !result.isSuccess) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      setMessage(result.message)
      onSessionsChanged()
      await loadCachePlan()
    } catch (error) {
      setMessage(resolveError(error, 'Unable to import the session archive.'))
    } finally {
      event.target.value = ''
      setPendingOperation(null)
    }
  }

  async function applyCachePlan() {
    if (!cachePlan || cachePlan.items.length === 0 || !window.confirm(`Delete ${cachePlan.items.length} unpinned, inactive session(s) from the cache?`)) return
    await runJsonOperation('cache-prune', 'api/session-cache/apply', { sessionIds: cachePlan.items.map((item) => item.sessionId) }, 'Cache cleanup complete.')
  }

  return (
    <div className="local-admin-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !pendingOperation) onClose()
    }}>
      <section aria-label="Session storage" aria-modal="true" className="local-admin-panel local-admin-panel--wide local-session-admin-panel" role="dialog">
        <header className="local-admin-header">
          <div><p className="eyebrow">Session storage</p><span>Import captures and manage local storage</span></div>
          <button aria-label="Close session storage" className="local-icon-button" disabled={!!pendingOperation} onClick={onClose} type="button"><X aria-hidden="true" /></button>
        </header>
        {message ? <p className="inline-message local-admin-message">{message}</p> : null}
        <nav aria-label="Session storage sections" className="local-session-admin-tabs">
          <button aria-current={activeView === 'storage' ? 'page' : undefined} className={activeView === 'storage' ? 'local-session-admin-tab--active' : undefined} onClick={() => setActiveView('storage')} type="button"><HardDrives aria-hidden="true" /><span>Storage</span></button>
          <button aria-current={activeView === 'bulk' ? 'page' : undefined} className={activeView === 'bulk' ? 'local-session-admin-tab--active' : undefined} onClick={() => setActiveView('bulk')} type="button"><PushPin aria-hidden="true" /><span>Bulk actions</span>{bulkCandidates.length > 0 ? <i>{bulkCandidates.length}</i> : null}</button>
        </nav>
        {activeView === 'bulk' ? (
          <main className="local-session-admin-view local-session-admin-view--bulk">
            <div className="local-session-bulk-toolbar">
              <label><MagnifyingGlass aria-hidden="true" /><input aria-label="Search sessions for bulk actions" onChange={(event) => setBulkQuery(event.target.value)} placeholder="Search sessions or apps" type="search" value={bulkQuery} /></label>
              <div>
                <span>{bulkCandidates.length} of {sessions.length} selected</span>
                <button disabled={visibleSessions.length === 0 || !!pendingOperation} onClick={toggleVisibleSelection} type="button">{areAllVisibleSelected ? 'Deselect visible' : 'Select visible'}</button>
                <button disabled={bulkCandidates.length === 0 || !!pendingOperation} onClick={() => {
                  setSelectedIds(new Set())
                  selectionAnchorRef.current = null
                }} type="button">Clear</button>
              </div>
            </div>
            <div aria-label="Sessions available for bulk actions" className="local-session-bulk-list" role="group">
              {visibleSessions.map((session) => {
                const isSelected = selectedIds.has(session.sessionId)
                return <label className={isSelected ? 'local-session-bulk-item local-session-bulk-item--selected' : 'local-session-bulk-item'} key={session.sessionId} title="Shift-click to select a range; Command/Control-click or click to toggle">
                  <input checked={isSelected} disabled={!!pendingOperation} onChange={(event) => toggleSessionSelection(event, session.sessionId)} type="checkbox" />
                  <span><strong>{session.name || session.appName || session.clientName || session.appId}</strong><small>{session.appName && session.name ? session.appName : session.appId}</small></span>
                  <i>{session.isConnected ? 'Live' : session.isPinned ? 'Pinned' : 'Recorded'}</i>
                </label>
              })}
              {visibleSessions.length === 0 ? <div className="local-admin-empty"><MagnifyingGlass aria-hidden="true" /><span>No sessions match that search.</span></div> : null}
            </div>
            <footer className="local-session-bulk-actions">
              <span>{bulkCandidates.length > 0 ? `${bulkCandidates.length} session${bulkCandidates.length === 1 ? '' : 's'} ready for an action` : 'Select sessions to enable bulk actions'}</span>
              <div className="local-admin-actions">
                <button disabled={bulkCandidates.length === 0 || !!pendingOperation} onClick={() => void runBulkOperation('pin')} type="button"><PushPin aria-hidden="true" />Pin</button>
                <button disabled={bulkCandidates.length === 0 || !!pendingOperation} onClick={() => void runBulkOperation('unpin')} type="button">Unpin</button>
                <button disabled={!bulkCandidates.some((session) => session.isConnected) || !!pendingOperation} onClick={() => void runBulkOperation('disconnect')} type="button"><WifiSlash aria-hidden="true" />Disconnect live</button>
                <button className="button--danger" disabled={bulkCandidates.some((session) => session.isConnected) || bulkCandidates.length === 0 || !!pendingOperation} onClick={() => void runBulkOperation('delete')} type="button"><Trash aria-hidden="true" />Delete selected</button>
              </div>
            </footer>
          </main>
        ) : null}
        {activeView === 'storage' ? (
          <main className="local-session-admin-view">
            <div className="local-session-storage-view">
              <section className="local-admin-section">
                <div className="local-admin-section-heading"><div><UploadSimple aria-hidden="true" /><span><strong>Import archive</strong><small>Open an .ansight-session.zip capture</small></span></div></div>
                <input accept=".zip,.ansight-session.zip,application/zip" hidden onChange={importArchive} ref={importInputRef} type="file" />
                <button className="button button--secondary local-session-import-button" disabled={!!pendingOperation} onClick={() => importInputRef.current?.click()} type="button"><UploadSimple aria-hidden="true" />Choose archive</button>
              </section>
              <section className="local-admin-section">
                <div className="local-admin-section-heading"><div><HardDrives aria-hidden="true" /><span><strong>Local cache</strong><small>{cachePlan ? `${formatBytes(cachePlan.totalCacheSizeBytes)} across ${cachePlan.sessionCount} sessions` : 'Inspecting storage'}</small></span></div><button aria-label="Refresh cache plan" className="local-text-button" disabled={!!pendingOperation} onClick={() => void loadCachePlan()} type="button"><ArrowClockwise aria-hidden="true" />Refresh</button></div>
                {cachePlan ? <>
                  <div className="local-cache-meter"><i style={{ width: `${Math.min(100, cachePlan.maximumCacheSizeBytes > 0 ? cachePlan.totalCacheSizeBytes / cachePlan.maximumCacheSizeBytes * 100 : 0)}%` }} /></div>
                  <p role="status">{formatBytes(cachePlan.totalCacheSizeBytes)} of {formatBytes(cachePlan.maximumCacheSizeBytes)} used. {cachePlan.autoCleanupEnabled ? 'Ansight automatically removes older, unpinned and inactive sessions only after this limit is exceeded.' : 'Automatic cleanup is off.'}</p>
                  {cachePlan.autoCleanupEnabled && cachePlan.totalCacheSizeBytes >= cachePlan.maximumCacheSizeBytes * 0.8 ? <p role="status">{cachePlan.totalCacheSizeBytes > cachePlan.maximumCacheSizeBytes ? 'Storage is over its limit; pinned or live sessions may prevent further cleanup.' : 'Storage is approaching its limit.'}</p> : null}
                  {cachePlan.lastAutoCleanupDeletedCount > 0 ? <p role="status">Last automatic cleanup removed {cachePlan.lastAutoCleanupDeletedCount} session(s) on {new Date(cachePlan.lastAutoCleanupUtc!).toLocaleString()}.</p> : null}
                  <p>{cachePlan.items.length} manual cleanup candidate{cachePlan.items.length === 1 ? '' : 's'} · projected {formatBytes(cachePlan.projectedCacheSizeBytes)}</p>
                  <div className="local-admin-actions">
                    <button className="button button--secondary" disabled={!!pendingOperation} onClick={() => void runJsonOperation('compact', 'api/session-cache/compact', {}, 'Cache compaction complete.')} type="button">Compact cache</button>
                    <button className="button button--danger" disabled={cachePlan.items.length === 0 || !!pendingOperation} onClick={() => void applyCachePlan()} type="button"><Trash aria-hidden="true" />Prune candidates</button>
                  </div>
                </> : <div className="local-admin-empty"><CircleNotch aria-hidden="true" className="spin" /><span>Inspecting storage</span></div>}
              </section>
              <section className="local-admin-section local-session-storage-settings">
                <div className="local-admin-section-heading"><div><HardDrives aria-hidden="true" /><span><strong>Cleanup settings</strong><small>Control automatic cleanup and manual cleanup candidates</small></span></div></div>
                {storageDraft ? <form className="local-admin-form" onSubmit={saveStorageSettings}>
                  <label className="local-admin-checkbox local-admin-form--wide"><input checked={storageDraft.sessionAutoCleanupEnabled} onChange={(event) => setStorageDraft({ ...storageDraft, sessionAutoCleanupEnabled: event.target.checked })} type="checkbox" />Automatic cleanup</label>
                  <p className="local-session-storage-help local-admin-form--wide">Automatic cleanup compacts older captures and removes unpinned, inactive sessions only when the cache exceeds its limit.</p>
                  <label>Manual cleanup age (days)<input max="365" min="1" onChange={(event) => setStorageDraft({ ...storageDraft, sessionAutoCleanupRetentionDays: Number(event.target.value) })} required type="number" value={storageDraft.sessionAutoCleanupRetentionDays} /></label>
                  <label>Compact after (days)<input max="365" min="1" onChange={(event) => setStorageDraft({ ...storageDraft, sessionAutoCompactionAgeDays: Number(event.target.value) })} required type="number" value={storageDraft.sessionAutoCompactionAgeDays} /></label>
                  <label className="local-admin-form--wide">Maximum session cache<select onChange={(event) => setStorageDraft({ ...storageDraft, sessionAutoCleanupMaximumCacheBytes: Number(event.target.value) })} value={storageDraft.sessionAutoCleanupMaximumCacheBytes}>
                    {!cacheSizeOptions.includes(storageDraft.sessionAutoCleanupMaximumCacheBytes) ? <option value={storageDraft.sessionAutoCleanupMaximumCacheBytes}>{formatBytes(storageDraft.sessionAutoCleanupMaximumCacheBytes)}</option> : null}
                    {cacheSizeOptions.map((bytes) => <option key={bytes} value={bytes}>{formatBytes(bytes)}</option>)}
                  </select></label>
                  <p className="local-session-storage-help local-admin-form--wide">Manual pruning includes old sessions even below the cache limit. Pinned and live sessions are protected.</p>
                  <div className="local-admin-actions local-admin-form--wide"><button className="button button--primary" disabled={!hasStorageChanges || !!pendingOperation} type="submit"><FloppyDisk aria-hidden="true" />Save settings</button></div>
                </form> : <div className="local-admin-empty"><CircleNotch aria-hidden="true" className="spin" /><span>Loading cleanup settings</span></div>}
              </section>
            </div>
          </main>
        ) : null}
      </section>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

async function readError(response: Response): Promise<string> { try { return ((await response.json()) as { message?: string }).message || `HTTP ${response.status}` } catch { return `HTTP ${response.status}` } }
function resolveError(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback }

type SessionAdministrationView = 'bulk' | 'storage'
