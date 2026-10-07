import { CircleNotch, Clock, Funnel, MagnifyingGlass, MonitorPlay, PushPin, Trash } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SessionFilterModal } from './SessionFilterModal'
import { SessionIcon } from './SessionIcon'
import { emptySessionFilters, hasSessionFilters, matchesSessionFilters, type SessionFilters } from './sessionFilters'
import { addSessionRange } from './sessionSelection'
import type { LocalSessionSummary } from './types'

const sessionsPerBatch = 6

export function SessionExplorer({
  canPinSession,
  headingAction,
  isLoading,
  onDeleteSession,
  onDeleteSessions,
  onSetSessionPinned,
  onSelectSession,
  onShowTeamSessions,
  selectedSessionId,
  sessions,
  supportsCloudSessions,
}: {
  canPinSession: (sessionId: string) => boolean
  headingAction?: ReactNode
  isLoading: boolean
  onDeleteSession: (sessionId: string) => Promise<void>
  onDeleteSessions: (sessionIds: string[]) => Promise<{ deletedSessionIds: string[]; failures: string[] }>
  onSetSessionPinned: (sessionId: string, isPinned: boolean) => Promise<void>
  onSelectSession: (sessionId: string) => void
  onShowTeamSessions: () => void
  selectedSessionId: string | null
  sessions: LocalSessionSummary[]
  supportsCloudSessions: boolean
}) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SessionFilters>(emptySessionFilters)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const closeFilters = useCallback(() => setIsFilterOpen(false), [])
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set())
  const [bulkAction, setBulkAction] = useState<'delete' | 'pin' | 'unpin' | null>(null)
  const [deleteCandidates, setDeleteCandidates] = useState<LocalSessionSummary[] | null>(null)
  const [visibleSessionCount, setVisibleSessionCount] = useState(sessionsPerBatch)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [pinningSessionIds, setPinningSessionIds] = useState<Set<string>>(() => new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const sessionListRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const selectionAnchorRef = useRef<string | null>(null)
  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const matchingSessions = sessions.filter((session) => matchesSessionFilters(session, filters) && (!normalized || [
      session.name,
      session.clientName,
      session.appName,
      session.appId,
      session.sessionId,
      ...session.tags,
    ].some((value) => value?.toLowerCase().includes(normalized))))
    return [...matchingSessions].sort((left, right) => Number(right.isPinned) - Number(left.isPinned))
  }, [filters, query, sessions])
  const selectedSessions = sessions.filter((session) => selectedSessionIds.has(session.sessionId))
  const isSelectionMode = selectedSessions.length > 0
  const hasLiveSelection = selectedSessions.some((session) => session.isConnected)
  const canPinSelection = selectedSessions.every((session) => canPinSession(session.sessionId))
  const visibleSessions = filteredSessions.slice(0, visibleSessionCount)
  const pinnedSessions = visibleSessions.filter((session) => session.isPinned)
  const sessionGroups = [
    ...(pinnedSessions.length ? [{ key: 'pinned', label: 'Pinned', sessions: pinnedSessions }] : []),
    ...groupSessionsByDay(visibleSessions.filter((session) => !session.isPinned)),
  ]
  const hasMoreSessions = visibleSessionCount < filteredSessions.length

  function selectRange(sessionId: string) {
    const orderedIds = filteredSessions.map((session) => session.sessionId)
    setSelectedSessionIds((current) => addSessionRange(current, orderedIds, selectionAnchorRef.current, sessionId))
    if (!selectionAnchorRef.current || !orderedIds.includes(selectionAnchorRef.current)) {
      selectionAnchorRef.current = sessionId
    }
  }

  function toggleSelection(sessionId: string) {
    selectionAnchorRef.current = sessionId
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  async function runBulkAction(action: 'delete' | 'pin' | 'unpin') {
    if (bulkAction || selectedSessions.length === 0) return
    if (action === 'delete') {
      if (!hasLiveSelection) setDeleteCandidates([...selectedSessions])
      return
    }
    setActionError(null)
    setBulkAction(action)
    const failures: string[] = []
    for (const session of selectedSessions) {
      try {
        await onSetSessionPinned(session.sessionId, action === 'pin')
        setSelectedSessionIds((current) => {
          const next = new Set(current)
          next.delete(session.sessionId)
          return next
        })
      } catch (error) {
        failures.push(`${session.name || session.appName || session.sessionId}: ${error instanceof Error ? error.message : 'Operation failed'}`)
      }
    }
    if (failures.length) setActionError(failures.join(' · '))
    selectionAnchorRef.current = null
    setBulkAction(null)
  }

  async function confirmBulkDelete() {
    if (!deleteCandidates || bulkAction) return
    setBulkAction('delete')
    setActionError(null)
    try {
      const result = await onDeleteSessions(deleteCandidates.map((session) => session.sessionId))
      const deletedIds = new Set(result.deletedSessionIds)
      setSelectedSessionIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))))
      if (result.failures.length) setActionError(result.failures.join(' · '))
      selectionAnchorRef.current = null
      setDeleteCandidates(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete the selected sessions.')
      setDeleteCandidates(null)
    } finally {
      setBulkAction(null)
    }
  }

  useEffect(() => {
    const root = sessionListRef.current
    const target = loadMoreRef.current
    if (!root || !target || isLoading || !hasMoreSessions) {
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleSessionCount((current) => Math.min(current + sessionsPerBatch, filteredSessions.length))
      }
    }, {
      root,
      rootMargin: '0px 0px 120px',
    })

    // Recheck after each batch, even when the sentinel stays inside the root margin.
    observer.observe(target)
    return () => observer.disconnect()
  }, [filteredSessions.length, hasMoreSessions, isLoading, query, visibleSessionCount])

  return (
    <aside className="local-session-explorer">
      <div className="local-session-explorer-heading">
        <div aria-label="Session source" className="local-session-source-toggle" role="group">
          <button aria-pressed="true" className="local-session-source-toggle--active" type="button">Local</button>
          <button disabled={!supportsCloudSessions} onClick={onShowTeamSessions} type="button">Team</button>
        </div>
        {headingAction}
      </div>

      <div className="local-session-controls">
        <div className="local-session-search-row">
          <label className="local-session-search">
            <MagnifyingGlass aria-hidden="true" />
            <input
              aria-label="Search sessions"
              disabled={isLoading}
              onChange={(event) => {
                setQuery(event.target.value)
                setVisibleSessionCount(sessionsPerBatch)
                setSelectedSessionIds(new Set())
                selectionAnchorRef.current = null
                sessionListRef.current?.scrollTo({ top: 0 })
              }}
              placeholder="Search sessions"
              type="search"
              value={query}
            />
          </label>
          <button aria-label="Filter sessions" aria-pressed={hasSessionFilters(filters)} className="local-session-filter-trigger" onClick={() => setIsFilterOpen(true)} title="Filter sessions" type="button"><Funnel aria-hidden="true" /></button>
        </div>

        {isSelectionMode ? (
          <div className="local-session-bulk-toolbar">
            <strong>{selectedSessions.length} selected</strong>
            <button disabled={bulkAction !== null || isLoading || filteredSessions.length === 0} onClick={() => setSelectedSessionIds(new Set(filteredSessions.map((session) => session.sessionId)))} type="button">Select all {filteredSessions.length}</button>
            <button disabled={bulkAction !== null || selectedSessions.length === 0} onClick={() => { setSelectedSessionIds(new Set()); selectionAnchorRef.current = null }} type="button">Clear</button>
            <div>
              <button disabled={bulkAction !== null || selectedSessions.length === 0 || !canPinSelection} onClick={() => void runBulkAction('pin')} type="button">{bulkAction === 'pin' ? 'Pinning…' : 'Pin'}</button>
              <button disabled={bulkAction !== null || selectedSessions.length === 0 || !canPinSelection} onClick={() => void runBulkAction('unpin')} type="button">{bulkAction === 'unpin' ? 'Unpinning…' : 'Unpin'}</button>
              <button aria-label={`Delete ${selectedSessions.length} selected session${selectedSessions.length === 1 ? '' : 's'}`} disabled={bulkAction !== null || selectedSessions.length === 0 || hasLiveSelection} onClick={() => void runBulkAction('delete')} title={hasLiveSelection ? 'Disconnect live sessions before deleting them' : `Delete only the ${selectedSessions.length} selected session${selectedSessions.length === 1 ? '' : 's'}`} type="button">{bulkAction === 'delete' ? 'Deleting…' : `Delete selected (${selectedSessions.length})`}</button>
            </div>
          </div>
        ) : null}
      </div>

      <div aria-busy={isLoading} className="local-session-list" ref={sessionListRef}>
        {actionError ? <p className="local-session-action-error" role="alert">{actionError}</p> : null}
        {isLoading ? (
          <>
            <span className="local-session-loading-status" role="status">Loading sessions</span>
            {Array.from({ length: sessionsPerBatch }, (_, index) => (
              <SessionPlaceholder key={index} />
            ))}
          </>
        ) : filteredSessions.length === 0 ? (
          <div className="local-session-empty">
            <MonitorPlay aria-hidden="true" />
            <strong>{query.trim() || hasSessionFilters(filters) ? 'No matching sessions' : 'No sessions found'}</strong>
            <span>{query.trim() || hasSessionFilters(filters) ? 'Adjust the search or filters.' : 'Launch an Ansight-enabled app or import a capture.'}</span>
          </div>
        ) : (
          <>
            {sessionGroups.map((group) => (
              <section className="local-session-day-group" key={group.key}>
                <h2>{group.label}</h2>
                {group.sessions.map((session) => {
                  const isSelected = session.sessionId === selectedSessionId
                  const isBulkSelected = selectedSessionIds.has(session.sessionId)
                  const sessionTitle = session.name?.trim() || session.appName?.trim() || session.clientName?.trim() || session.appId
                  const isPinning = pinningSessionIds.has(session.sessionId)
                  return (
                    <article
                      className={`local-session-card${isSelected ? ' local-session-card--selected' : ''}${isBulkSelected ? ' local-session-card--bulk-selected' : ''}`}
                      key={session.sessionId}
                    >
                      <button
                        aria-label={isSelectionMode ? `${isBulkSelected ? 'Deselect' : 'Select'} ${sessionTitle} session` : `${sessionTitle} session`}
                        aria-pressed={isSelectionMode ? isBulkSelected : undefined}
                        className="local-session-card-select"
                        disabled={bulkAction !== null}
                        onClick={(event) => {
                          if (event.shiftKey) {
                            event.preventDefault()
                            selectRange(session.sessionId)
                          } else if (isSelectionMode || event.metaKey || event.ctrlKey) {
                            event.preventDefault()
                            toggleSelection(session.sessionId)
                          } else {
                            selectionAnchorRef.current = session.sessionId
                            setSelectedSessionIds(new Set())
                            onSelectSession(session.sessionId)
                          }
                        }}
                        title={isSelectionMode ? 'Select or deselect this session; Shift-click to select a range' : 'Open session; Shift-click or Command/Control-click to select sessions'}
                        type="button"
                      >
                        <SessionIcon appIconUrl={session.appIconUrl} platform={session.runtimePlatform} selectionTick={isBulkSelected} />
                        <span className="local-session-card-content">
                          <span className="local-session-card-title">
                            <strong title={sessionTitle}>{sessionTitle}</strong>
                            {session.isConnected ? (
                              <span className="local-live-badge"><i />Live</span>
                            ) : null}
                          </span>
                          <span className="local-session-card-meta">
                            <span><Clock aria-hidden="true" />{formatSessionDuration(session)}</span>
                          </span>
                        </span>
                      </button>
                      <button
                        aria-label={`${session.isPinned ? 'Unpin' : 'Pin'} ${sessionTitle} session`}
                        aria-pressed={session.isPinned}
                        className="local-session-pin-button"
                        disabled={!canPinSession(session.sessionId) || isPinning || deletingSessionId === session.sessionId}
                        onClick={() => {
                          setActionError(null)
                          setPinningSessionIds((current) => new Set(current).add(session.sessionId))
                          void onSetSessionPinned(session.sessionId, !session.isPinned)
                            .catch((error: unknown) => {
                              setActionError(error instanceof Error ? error.message : 'Unable to update the session pin.')
                            })
                            .finally(() => setPinningSessionIds((current) => {
                              const next = new Set(current)
                              next.delete(session.sessionId)
                              return next
                            }))
                        }}
                        title={!canPinSession(session.sessionId) ? 'Open the local explorer to pin this session' : session.isPinned ? 'Unpin session' : 'Pin session'}
                        type="button"
                      >
                        {isPinning ? <CircleNotch aria-hidden="true" className="spin" /> : <PushPin aria-hidden="true" weight={session.isPinned ? 'fill' : 'regular'} />}
                      </button>
                      {!isSelectionMode ? (
                        <button
                          aria-label={`Delete only ${sessionTitle} session`}
                          className="local-session-delete-button"
                          disabled={session.isConnected || isPinning || deletingSessionId === session.sessionId}
                          onClick={() => {
                            if (!window.confirm(`Delete only this session permanently?\n\n${sessionTitle}\n${session.sessionId}\n\nOther sessions will remain. Its capture, search index, metrics, and trends history will be removed.`)) {
                              return
                            }

                            setActionError(null)
                            setDeletingSessionId(session.sessionId)
                            void onDeleteSession(session.sessionId)
                              .catch((error: unknown) => {
                                setActionError(error instanceof Error ? error.message : 'Unable to delete the session.')
                              })
                              .finally(() => setDeletingSessionId(null))
                          }}
                          title={session.isConnected ? 'Disconnect the live session before deleting it' : 'Delete only this session'}
                          type="button"
                        >
                          <Trash aria-hidden="true" />
                        </button>
                      ) : null}
                    </article>
                  )
                })}
              </section>
            ))}
            {hasMoreSessions ? (
              <div aria-hidden="true" className="local-session-load-more" ref={loadMoreRef}>
                <i />
                <i />
                <i />
              </div>
            ) : null}
          </>
        )}
      </div>
      {isFilterOpen ? <SessionFilterModal filters={filters} onApply={(next) => { setFilters(next); closeFilters(); setVisibleSessionCount(sessionsPerBatch); setSelectedSessionIds(new Set()); selectionAnchorRef.current = null; sessionListRef.current?.scrollTo({ top: 0 }) }} onClose={closeFilters} sessions={sessions} /> : null}
      {deleteCandidates ? <SessionDeleteModal candidates={deleteCandidates} isDeleting={bulkAction === 'delete'} onCancel={() => setDeleteCandidates(null)} onConfirm={() => void confirmBulkDelete()} /> : null}
    </aside>
  )
}

function SessionDeleteModal({ candidates, isDeleting, onCancel, onConfirm }: {
  candidates: LocalSessionSummary[]
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const onCancelRef = useRef(onCancel)
  useEffect(() => { onCancelRef.current = onCancel }, [onCancel])
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    confirmRef.current?.focus()
    return () => previousFocus?.focus()
  }, [])
  useEffect(() => {
    if (isDeleting) dialogRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isDeleting) onCancelRef.current()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const controls = [...dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (controls.length === 0) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault()
        controls.at(-1)?.focus()
      } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
        event.preventDefault()
        controls[0]?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isDeleting])

  return createPortal(
    <div className="local-session-filter-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) onCancel() }}>
      <section aria-label="Delete selected sessions" aria-modal="true" className="local-session-delete-modal" ref={dialogRef} role="dialog" tabIndex={-1}>
        <h2>Delete {candidates.length} selected session{candidates.length === 1 ? '' : 's'}?</h2>
        <p>This permanently removes their captures, search indexes, metrics, and trends history. Other sessions remain.</p>
        <ul>{candidates.slice(0, 5).map((session) => <li key={session.sessionId}>{session.name || session.appName || session.sessionId}</li>)}</ul>
        {candidates.length > 5 ? <p>And {candidates.length - 5} more.</p> : null}
        {isDeleting ? <p role="status"><CircleNotch aria-hidden="true" className="spin" /> Deleting selected sessions…</p> : null}
        <footer>
          <button disabled={isDeleting} onClick={onCancel} type="button">Cancel</button>
          <button className="local-session-delete-confirm" disabled={isDeleting} onClick={onConfirm} ref={confirmRef} type="button">{isDeleting ? 'Deleting…' : 'Delete sessions'}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

type SessionDayGroup = {
  key: string
  label: string
  sessions: LocalSessionSummary[]
}

function groupSessionsByDay(sessions: LocalSessionSummary[]): SessionDayGroup[] {
  const groups: SessionDayGroup[] = []
  for (const session of sessions) {
    const date = new Date(session.lastUpdatedUtc)
    const key = Number.isNaN(date.getTime())
      ? 'unknown'
      : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    const currentGroup = groups.at(-1)
    if (currentGroup?.key === key) {
      currentGroup.sessions.push(session)
      continue
    }

    groups.push({
      key,
      label: formatSessionDay(date),
      sessions: [session],
    })
  }

  return groups
}

function formatSessionDay(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  const today = new Date()
  const calendarDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const calendarToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const daysAgo = Math.round((calendarToday.getTime() - calendarDate.getTime()) / 86_400_000)
  if (daysAgo === 0) {
    return 'Today'
  }
  if (daysAgo === 1) {
    return 'Yesterday'
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date)
}

function SessionPlaceholder() {
  return (
    <div aria-hidden="true" className="local-session-card local-session-card--placeholder">
      <span className="local-session-placeholder-icon" />
      <span className="local-session-placeholder-content">
        <span className="local-session-placeholder-line local-session-placeholder-line--title" />
        <span className="local-session-placeholder-meta">
          <span />
        </span>
      </span>
    </div>
  )
}

function formatSessionDuration(session: LocalSessionSummary): string {
  const startedAtMs = Date.parse(session.createdUtc)
  const endedAtMs = session.isConnected ? Date.now() : Date.parse(session.lastUpdatedUtc)
  const elapsedSeconds = Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000))
  if (!Number.isFinite(elapsedSeconds)) {
    return '0s'
  }
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60)
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`
  }

  const elapsedHours = Math.round(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return `${elapsedHours}h`
  }

  return `${Math.round(elapsedHours / 24)}d`
}
