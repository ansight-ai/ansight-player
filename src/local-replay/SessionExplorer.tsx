import { CircleNotch, Clock, MagnifyingGlass, MonitorPlay, PushPin, Trash } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SessionIcon } from './SessionIcon'
import type { LocalSessionSummary } from './types'

const sessionsPerBatch = 6

export function SessionExplorer({
  canPinSession,
  headingAction,
  isLoading,
  onDeleteSession,
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
  onSetSessionPinned: (sessionId: string, isPinned: boolean) => Promise<void>
  onSelectSession: (sessionId: string) => void
  onShowTeamSessions: () => void
  selectedSessionId: string | null
  sessions: LocalSessionSummary[]
  supportsCloudSessions: boolean
}) {
  const [query, setQuery] = useState('')
  const [visibleSessionCount, setVisibleSessionCount] = useState(sessionsPerBatch)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [pinningSessionIds, setPinningSessionIds] = useState<Set<string>>(() => new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const sessionListRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const matchingSessions = normalized ? sessions.filter((session) => [
      session.name,
      session.clientName,
      session.appName,
      session.appId,
      session.sessionId,
      ...session.tags,
    ].some((value) => value?.toLowerCase().includes(normalized))) : sessions
    return [...matchingSessions].sort((left, right) => Number(right.isPinned) - Number(left.isPinned))
  }, [query, sessions])
  const visibleSessions = filteredSessions.slice(0, visibleSessionCount)
  const pinnedSessions = visibleSessions.filter((session) => session.isPinned)
  const sessionGroups = [
    ...(pinnedSessions.length ? [{ key: 'pinned', label: 'Pinned', sessions: pinnedSessions }] : []),
    ...groupSessionsByDay(visibleSessions.filter((session) => !session.isPinned)),
  ]
  const hasMoreSessions = visibleSessionCount < filteredSessions.length

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

      <label className="local-session-search">
        <MagnifyingGlass aria-hidden="true" />
        <input
          aria-label="Search sessions"
          disabled={isLoading}
          onChange={(event) => {
            setQuery(event.target.value)
            setVisibleSessionCount(sessionsPerBatch)
            sessionListRef.current?.scrollTo({ top: 0 })
          }}
          placeholder="Search sessions"
          type="search"
          value={query}
        />
      </label>

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
            <strong>{query.trim() ? 'No matching sessions' : 'No sessions found'}</strong>
            <span>{query.trim() ? 'Try a different search.' : 'Launch an Ansight-enabled app or import a capture.'}</span>
          </div>
        ) : (
          <>
            {sessionGroups.map((group) => (
              <section className="local-session-day-group" key={group.key}>
                <h2>{group.label}</h2>
                {group.sessions.map((session) => {
                  const isSelected = session.sessionId === selectedSessionId
                  const sessionTitle = session.name?.trim() || session.appName?.trim() || session.clientName?.trim() || session.appId
                  const isPinning = pinningSessionIds.has(session.sessionId)
                  return (
                    <article
                      className={isSelected ? 'local-session-card local-session-card--selected' : 'local-session-card'}
                      key={session.sessionId}
                    >
                      <button
                        className="local-session-card-select"
                        onClick={() => onSelectSession(session.sessionId)}
                        type="button"
                      >
                        <SessionIcon appIconUrl={session.appIconUrl} platform={session.runtimePlatform} />
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
                      <button
                        aria-label={`Delete ${sessionTitle} session`}
                        className="local-session-delete-button"
                        disabled={session.isConnected || isPinning || deletingSessionId === session.sessionId}
                        onClick={() => {
                          if (!window.confirm('Delete this session permanently? Its capture, search index, metrics, and trends history will be removed.')) {
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
                        title={session.isConnected ? 'Disconnect the live session before deleting it' : 'Delete session'}
                        type="button"
                      >
                        <Trash aria-hidden="true" />
                      </button>
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
    </aside>
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
