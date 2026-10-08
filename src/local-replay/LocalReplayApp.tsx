import { readSessionTimelineLink, sessionTimelineHref, type SessionTimelineLink } from './sessionLinks'
import { observeLocalActivity } from './usage'
import { ArrowClockwise, Check, Copy, DownloadSimple, Archive, CaretDown, ChartLineUp, CircleNotch, CloudArrowUp, DeviceMobile, FlowArrow, Gear, HardDrives, Info, Link, NotePencil, Pulse, QrCode, SidebarSimple, Sparkle, SquaresFour, TestTube, Trash, UserCircle, VideoCamera, WifiHigh, X } from '@phosphor-icons/react'
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type SetStateAction } from 'react'
import { SessionIcon } from './SessionIcon'
import { SessionDeviceBadge } from './SessionDeviceBadge'
import { GithubRepositoryBadge } from '../components/GithubRepositoryBadge'
import { SessionViewerPage, type SessionReplayPanelContext, type SessionViewerSource, type TimelineEditSelection } from '../replay/pages/SessionViewerPage'
import { AccountCompanionPanel } from './AccountCompanionPanel'
import { RemoteRunnerPanel } from './RemoteRunnerPanel'
import { AboutInstallationPanel } from './AboutInstallationPanel'
import { AppGraphProgressPanel } from './AppGraphProgressPanel'
import { AppGraphRecordingPanel } from './AppGraphRecordingPanel'
import { CoreSettingsPanel } from './CoreSettingsPanel'
import { DeviceManagementPanel } from './DeviceManagementPanel'
import { DeviceLocationPanel } from './DeviceLocationPanel'
import { EditSessionMetadataPanel } from './EditSessionMetadataPanel'
import { HostHealthPanel } from './HostHealthPanel'
import { HostManagementPanel } from './HostManagementPanel'
import { GettingStartedPanel } from './GettingStartedPanel'
import { loadOptionalPlayerFeature } from './loadOptionalPlayerFeature'
import { localReplaySource } from './localSessionData'
import { TrendsPanel } from './TrendsPanel'
import { SessionExplorer } from './SessionExplorer'
import { SessionAdministrationPanel } from './SessionAdministrationPanel'
import { ShareLocalSessionModal } from './ShareLocalSessionModal'
import { SimulatorControlView } from './SimulatorControlView'
import { TeamSessionExplorer } from './TeamSessionExplorer'
import { TestHistoryPanel } from './TestHistoryPanel'
import { TestExecutionPanel } from './TestExecutionPanel'
import type { LocalAppGraphLiveRun, LocalEnrollmentInviteResult, LocalGettingStartedState, LocalOperationResult, LocalRemoteRunnerRegistration, LocalRemoteRunnerStatus, LocalReplayBootstrap, LocalSessionCachePlan, LocalSessionSummary, LocalTaskExtraction, LocalTestHistory, LocalTestRunSummary, WorkspaceTestDraft } from './types'
import type { SessionAnnotation } from '../replay/sessionViewerData'

const linkedTraceRefreshIntervalMs = 8000
const appGraphRefreshIntervalMs = 750
const isAppGraphToolVisible = false
const sessionEventRefreshDebounceMs = 250
const sessionRecoveryRefreshIntervalMs = 60_000
const sessionFailedRefreshIntervalMs = 3_000
const TaskExtractionPanel = lazy(async () => {
  const module = await import('./TaskExtractionPanel')
  return { default: module.TaskExtractionPanel }
})

interface LocalSessionSelection {
  sessionId: string | null
  link: SessionTimelineLink | null
}

type TestExtractionReturn = { name: string; assertions: string; generationNotes: string; selectedTaskSectionIds: string[]; skipTaskSections: boolean }
type TaskExtractionRequest = {
  period: TimelineEditSelection
  sessionId: string
  format?: 'ansight' | 'test'
  draftId?: string
  returnTest?: TestExtractionReturn
}

export function LocalReplayApp() {
  useEffect(observeLocalActivity, [])
  const [cloudAnalysisSource, setCloudAnalysisSource] = useState<Pick<SessionViewerSource, 'loadAiReadState' | 'createAiExtraction' | 'archiveAiExtraction'> | null>(null)
  const [isCloudAnalysisLoading, setIsCloudAnalysisLoading] = useState(false)
  const [aiViewKind, setAiViewKind] = useState<'analysis' | 'mermaid' | null>(null)
  const sessionViewerSource = useMemo<SessionViewerSource>(() => cloudAnalysisSource
    ? { ...localReplaySource, ...cloudAnalysisSource }
    : localReplaySource, [cloudAnalysisSource])
  const [bootstrap, setBootstrap] = useState<LocalReplayBootstrap | null>(null)
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([])
  const [gettingStarted, setGettingStarted] = useState<LocalGettingStartedState | null>(null)
  const [showGettingStarted, setShowGettingStarted] = useState(false)
  const initialGettingStartedDecision = useRef(false)
  const replayMilestoneSent = useRef(false)
  const [isSessionsLoading, setIsSessionsLoading] = useState(true)
  const [sessionRefreshNonce, setSessionRefreshNonce] = useState(0)
  const [cachePlan, setCachePlan] = useState<LocalSessionCachePlan | null>(null)
  const updateGettingStarted = useCallback(async (action: string, sessionId?: string) => {
    const response = await fetch('api/getting-started', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, sessionId }),
    })
    if (!response.ok) throw new Error(`The local host could not save getting started progress (HTTP ${response.status}).`)
    const state = await response.json() as LocalGettingStartedState
    setGettingStarted(state)
    if (action === 'skip') setShowGettingStarted(false)
    return state
  }, [])
  const onGettingStartedAutomationSaved = useCallback((sessionId: string) => {
    void updateGettingStarted('automation-saved', sessionId).catch(() => {})
  }, [updateGettingStarted])

  useEffect(() => {
    if (bootstrap?.mode !== 'explorer') return
    let active = true
    void fetch('api/getting-started', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<LocalGettingStartedState>
      })
      .then((state) => { if (active) setGettingStarted(state) })
      .catch(() => { /* The player remains usable if local progress cannot load. */ })
    return () => { active = false }
  }, [bootstrap?.mode])

  useEffect(() => {
    if (!gettingStarted || isSessionsLoading || initialGettingStartedDecision.current) return
    const requested = new URLSearchParams(window.location.search).get('getting-started') === '1'
    if (requested || (!gettingStarted.opened && !gettingStarted.skipped && sessions.length === 0)) {
      const timer = window.setTimeout(() => {
        if (initialGettingStartedDecision.current) return
        initialGettingStartedDecision.current = true
        setShowGettingStarted(true)
        void updateGettingStarted(gettingStarted.skipped ? 'resume' : 'open').catch(() => {})
      }, 0)
      return () => window.clearTimeout(timer)
    }
    initialGettingStartedDecision.current = true
  }, [gettingStarted, isSessionsLoading, sessions.length, updateGettingStarted])
  useEffect(() => {
    if (bootstrap?.mode !== 'explorer') return undefined
    let active = true
    async function refreshCachePlan() {
      try {
        const response = await fetch('api/session-cache', { cache: 'no-store' })
        if (response.ok && active) setCachePlan(await response.json() as LocalSessionCachePlan)
      } catch { /* Session storage stays available through its own panel if a poll fails. */ }
    }
    void refreshCachePlan()
    const timer = window.setInterval(() => void refreshCachePlan(), 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [bootstrap?.mode, sessionRefreshNonce])
  const [sessionSelection, setSessionSelection] = useState<LocalSessionSelection>(() => {
    const link = readSessionTimelineLink(window.location.href)
    if (link) return { sessionId: link.sessionId, link }
    try { return { sessionId: window.sessionStorage.getItem(`ansight.local-session:${window.location.pathname}`), link: null } }
    catch { return { sessionId: null, link: null } }
  })
  const { sessionId: selectedSessionId, link: sessionLink } = sessionSelection
  const bulkDeletingSessionIdsRef = useRef<Set<string> | null>(null)
  const setSelectedSessionId = useCallback((value: SetStateAction<string | null>) => {
    setSessionSelection((current) => {
      const sessionId = typeof value === 'function' ? value(current.sessionId) : value
      return sessionId === current.sessionId ? current : { sessionId, link: null }
    })
  }, [])
  const [isExplorerOpen, setIsExplorerOpen] = useState(true)
  // Published on the root so the fixed session toolbar can align with the player's cards.
  const [replayPanelWidth, setReplayPanelWidth] = useState<number | null>(null)
  const [explorerMode, setExplorerMode] = useState<'local' | 'team'>('local')
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isSessionMetadataOpen, setIsSessionMetadataOpen] = useState(false)
  const [isSessionInfoOpen, setIsSessionInfoOpen] = useState(false)
  const handleSessionInfoOpenChange = useCallback((isOpen: boolean) => {
    setIsSessionInfoOpen(isOpen)
    if (!isOpen) setAiViewKind(null)
  }, [])
  const [isLocationOpen, setIsLocationOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<LocalGlobalPanel>(null)
  const runnerStatus: LocalRemoteRunnerStatus | null = null
  const runnerRegistration: LocalRemoteRunnerRegistration | null = null
  const canManageRunner = true
  const [isManageMenuOpen, setIsManageMenuOpen] = useState(false)
  const [liveViewPreference, setLiveViewPreference] = useState<LocalLiveViewPreference>({
    mode: 'simulator',
    sessionId: null,
  })
  const [linkedTraceRun, setLinkedTraceRun] = useState<LocalTestRunSummary | null>(null)
  const [appGraphRuns, setAppGraphRuns] = useState<LocalAppGraphLiveRun[]>([])
  const [appGraphPanelMode, setAppGraphPanelMode] = useState<'recording' | 'runs'>('recording')
  const [isAppGraphRefreshing, setIsAppGraphRefreshing] = useState(false)
  const [testHistoryInitialRun, setTestHistoryInitialRun] = useState<LocalTestRunSummary | null>(null)
  const [testExecutionTarget, setTestExecutionTarget] = useState<{ appId: string; testId: string } | null>(null)
  const [taskExtractionRequest, setTaskExtractionRequest] = useState<TaskExtractionRequest | null>(null)
  const [annotationWorkflow, setAnnotationWorkflow] = useState<{ id: number; annotationId: string | null; returnRequest: TaskExtractionRequest } | null>(null)
  const annotationWorkflowIdRef = useRef(0)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [sessionActionError, setSessionActionError] = useState<string | null>(null)

  async function openSessionTaskDrafts() {
    if (!selectedSessionId) return
    setSessionActionError(null)
    try {
      const [taskResponse, testResponse] = await Promise.all([
        fetch('api/task-extractions', { cache: 'no-store' }),
        fetch(`api/task-extractions/test-drafts?sessionId=${encodeURIComponent(selectedSessionId)}`, { cache: 'no-store' }),
      ])
      if (!taskResponse.ok || !testResponse.ok) throw new Error('Unable to load saved drafts.')
      const extractions = await taskResponse.json() as LocalTaskExtraction[]
      const testDrafts = await testResponse.json() as WorkspaceTestDraft[]
      const drafts = extractions.filter((item) => item.sessionId === selectedSessionId && item.draft)
      if (drafts.length === 0 && testDrafts.length === 0) {
        setSessionActionError('No generated drafts for this session yet.')
        return
      }
      const latestTestDraft = testDrafts[0]
      const startMs = latestTestDraft ? Date.parse(latestTestDraft.startUtc) : Math.min(...drafts.map((item) => Date.parse(item.startUtc)))
      const endMs = latestTestDraft ? Date.parse(latestTestDraft.endUtc) : Math.max(...drafts.map((item) => Date.parse(item.endUtc)))
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        throw new Error('The saved draft period could not be read.')
      }
      setTaskExtractionRequest({
        format: 'test',
        draftId: latestTestDraft?.draftId,
        period: { startMs, endMs, focusMs: startMs + (endMs - startMs) / 2 },
        sessionId: selectedSessionId,
      })
    } catch (error) {
      setSessionActionError(error instanceof Error ? error.message : 'Unable to open task drafts.')
    }
  }

  async function openSummary() {
    setSessionActionError(null)
    setAiViewKind('analysis')
    setIsSessionInfoOpen(true)
    if (!bootstrap?.supportsCloudSessions || cloudAnalysisSource || isCloudAnalysisLoading) return
    setIsCloudAnalysisLoading(true)
    try {
      const source = await loadOptionalPlayerFeature<Pick<SessionViewerSource, 'loadAiReadState' | 'createAiExtraction' | 'archiveAiExtraction'>>('CloudAnalysisSource')
      setCloudAnalysisSource(source)
    } catch {
      // The local summary remains available when the optional cloud flowchart is unavailable.
    } finally {
      setIsCloudAnalysisLoading(false)
    }
  }
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null)
  const [copiedSessionLinkId, setCopiedSessionLinkId] = useState<string | null>(null)
  const [exportingSessionId, setExportingSessionId] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  // Export notices are transient toasts; clear them after a few seconds.
  useEffect(() => {
    if (!exportMessage) {
      return undefined
    }
    const timer = window.setTimeout(() => setExportMessage(null), 6000)
    return () => window.clearTimeout(timer)
  }, [exportMessage])

  async function copySessionId(sessionId: string) {
    try {
      await navigator.clipboard.writeText(sessionId)
      setCopiedSessionId(sessionId)
      setSessionActionError(null)
      window.setTimeout(() => setCopiedSessionId(null), 2000)
    } catch { setSessionActionError('Unable to copy the session ID. Select the ID and copy it manually.') }
  }

  async function copySessionLink(sessionId: string) {
    try {
      await navigator.clipboard.writeText(sessionTimelineHref(window.location.href, { sessionId }))
      setCopiedSessionLinkId(sessionId)
      setSessionActionError(null)
      window.setTimeout(() => setCopiedSessionLinkId(null), 2000)
    } catch { setSessionActionError('Unable to copy the session link. Copy the URL from the address bar.') }
  }

  async function exportSession(sessionId: string) {
    setExportingSessionId(sessionId)
    setExportMessage(null)
    setSessionActionError(null)
    try {
      const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/export-desktop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const result = await response.json() as LocalOperationResult
      if (!response.ok || !result.isSuccess) throw new Error(result.message || 'Unable to export this session.')
      setExportMessage(result.message)
    } catch (error) { setSessionActionError(resolveErrorMessage(error, 'Unable to export this session.')) }
    finally { setExportingSessionId(null) }
  }
  const [message, setMessage] = useState<string | null>(null)
  const [pairingQr, setPairingQr] = useState<LocalEnrollmentInviteResult | null>(null)
  const [pairingQrError, setPairingQrError] = useState<string | null>(null)
  const [isIssuingPairingQr, setIsIssuingPairingQr] = useState(false)
  const initialSessionIdRef = useRef<string | null>(null)
  const manageMenuRef = useRef<HTMLDivElement>(null)
  const trackedSessionIds = useRef(new Set<string>())


  useEffect(() => {
    const link = selectedSessionId
      ? { sessionId: selectedSessionId, artifactId: sessionLink?.sessionId === selectedSessionId ? sessionLink.artifactId : undefined }
      : null
    const href = sessionTimelineHref(window.location.href, link)
    if (href !== window.location.href) window.history.replaceState(window.history.state, '', href)
    if (selectedSessionId) {
      try { window.sessionStorage.setItem(`ansight.local-session:${window.location.pathname}`, selectedSessionId) }
      catch { /* Storage can be unavailable in private browser contexts. */ }
    } else {
      try { window.sessionStorage.removeItem(`ansight.local-session:${window.location.pathname}`) }
      catch { /* Storage can be unavailable in private browser contexts. */ }
    }
  }, [selectedSessionId, sessionLink])

  useEffect(() => {
    function navigateToUrl() {
      const link = readSessionTimelineLink(window.location.href)
      const sessionId = link?.sessionId
        ?? sessions.find((session) => session.sessionId === initialSessionIdRef.current)?.sessionId
        ?? sessions.find((session) => session.isConnected)?.sessionId
        ?? sessions[0]?.sessionId
        ?? null
      setSessionSelection({ sessionId, link })
      setActivePanel(null)
      setExplorerMode('local')
      setIsSessionInfoOpen(false)
      setSessionActionError(null)
    }
    window.addEventListener('popstate', navigateToUrl)
    return () => window.removeEventListener('popstate', navigateToUrl)
  }, [sessions])

  useEffect(() => {
    let isMounted = true
    let retryTimeout: number | undefined
    async function loadBootstrap() {
      try {
        const response = await fetch('api/bootstrap', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`The local host returned HTTP ${response.status}.`)
        }

        const next = await response.json() as LocalReplayBootstrap
        if (isMounted) {
          initialSessionIdRef.current = next.initialSessionId ?? null
          setBootstrap(next)
          setSelectedSessionId((current) => current ?? next.initialSessionId ?? null)
          trackLocalWebEvent({ kind: 'daily_active' })
          trackLocalWebEvent({ kind: 'opened' })
        }
      } catch (error) {
        if (isMounted) {
          setMessage(resolveErrorMessage(error, 'Unable to connect to the local Ansight host.'))
          retryTimeout = window.setTimeout(() => void loadBootstrap(), 3000)
        }
      }
    }

    void loadBootstrap()
    return () => {
      isMounted = false
      if (retryTimeout !== undefined) window.clearTimeout(retryTimeout)
    }
  }, [setSelectedSessionId])

  useEffect(() => {
    if (!bootstrap) return

    let isMounted = true
    let eventRefreshTimeout: number | undefined
    let recoveryRefreshTimeout: number | undefined
    let eventSource: EventSource | null = null
    let isRefreshInProgress = false
    let isRefreshPending = false
    let lastRefreshSucceeded = false

    async function refreshSessions() {
      if (isRefreshInProgress) {
        isRefreshPending = true
        return
      }

      isRefreshInProgress = true
      try {
        do {
          isRefreshPending = false
          try {
            const response = await fetch('api/sessions', { cache: 'no-store' })
            if (!response.ok) {
              throw new Error(`The local host returned HTTP ${response.status}.`)
            }

            const next = await response.json() as LocalSessionSummary[]
            if (!isMounted) {
              return
            }

            lastRefreshSucceeded = true
            setSessions((current) => reconcileSessionSummaries(current, next))
            setSelectedSessionId((current) => {
              const bulkDeletingIds = bulkDeletingSessionIdsRef.current
              const selectable = bulkDeletingIds ? next.filter((session) => !bulkDeletingIds.has(session.sessionId)) : next
              // An explicit URL must not silently open another session when its target is missing.
              if (sessionLink && current === sessionLink.sessionId) return current
              if (current && selectable.some((session) => session.sessionId === current)) {
                return current
              }

              return selectable.find((session) => session.sessionId === initialSessionIdRef.current)?.sessionId
                ?? selectable.find((session) => session.isConnected)?.sessionId
                ?? selectable[0]?.sessionId
                ?? null
            })
            setMessage(null)
          } catch (error) {
            if (isMounted) {
              lastRefreshSucceeded = false
              setMessage(resolveErrorMessage(error, 'Unable to refresh local sessions.'))
            }
          } finally {
            if (isMounted) {
              setIsSessionsLoading(false)
            }
          }
        } while (isRefreshPending && document.visibilityState === 'visible')
      } finally {
        isRefreshInProgress = false
      }
    }

    function clearRecoveryRefresh() {
      if (recoveryRefreshTimeout !== undefined) {
        window.clearTimeout(recoveryRefreshTimeout)
        recoveryRefreshTimeout = undefined
      }
    }

    function scheduleRecoveryRefresh() {
      clearRecoveryRefresh()
      if (!isMounted || document.visibilityState !== 'visible') {
        return
      }

      recoveryRefreshTimeout = window.setTimeout(() => {
        recoveryRefreshTimeout = undefined
        void refreshSessions().finally(scheduleRecoveryRefresh)
      }, lastRefreshSucceeded ? sessionRecoveryRefreshIntervalMs : sessionFailedRefreshIntervalMs)
    }

    function scheduleEventRefresh() {
      if (document.visibilityState !== 'visible') {
        isRefreshPending = true
        return
      }

      if (eventRefreshTimeout !== undefined) {
        return
      }

      eventRefreshTimeout = window.setTimeout(() => {
        eventRefreshTimeout = undefined
        void refreshSessions().finally(scheduleRecoveryRefresh)
      }, sessionEventRefreshDebounceMs)
    }

    function openSessionEventStream() {
      if (eventSource || document.visibilityState !== 'visible') {
        return
      }

      eventSource = new EventSource('api/session-events')
      eventSource.addEventListener('ready', scheduleEventRefresh)
      eventSource.addEventListener('sessions-changed', scheduleEventRefresh)
    }

    function closeSessionEventStream() {
      eventSource?.close()
      eventSource = null
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        closeSessionEventStream()
        clearRecoveryRefresh()
        if (eventRefreshTimeout !== undefined) {
          window.clearTimeout(eventRefreshTimeout)
          eventRefreshTimeout = undefined
          isRefreshPending = true
        }
        return
      }

      openSessionEventStream()
      void refreshSessions().finally(scheduleRecoveryRefresh)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    openSessionEventStream()
    void refreshSessions().finally(scheduleRecoveryRefresh)
    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      closeSessionEventStream()
      clearRecoveryRefresh()
      if (eventRefreshTimeout !== undefined) {
        window.clearTimeout(eventRefreshTimeout)
      }
    }
  }, [bootstrap, sessionLink, sessionRefreshNonce, setSelectedSessionId])

  const selectedSession = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  )
  const refreshKey = selectedSession
    ? `${selectedSession.lastUpdatedUtc}:${selectedSession.logCount}:${selectedSession.screenshotCount}:${selectedSession.visualTreeSnapshotCount}`
    : undefined
  const liveCount = sessions.filter((session) => session.isConnected).length
  const canSwitchLiveView = selectedSession?.isConnected === true
    && selectedSession.isSimulatorOrEmulator
    && !!selectedSession.runtimeDeviceIdentifier
  const liveViewMode = liveViewPreference.sessionId === selectedSessionId
    ? liveViewPreference.mode
    : 'simulator'
  const selectedLinkedTraceRun = bootstrap?.supportsTestHistory
    && linkedTraceRun?.sessionId === selectedSessionId
    ? linkedTraceRun
    : null
  const canManageSelectedSession = bootstrap !== null
    && (bootstrap.mode === 'explorer' || selectedSession?.sessionId === bootstrap.initialSessionId)
  const hasActiveAppGraphRun = appGraphRuns.some((run) => run.status === 'starting' || run.status === 'running')
  const openDeviceLocation = useCallback(() => {
    setIsLocationOpen(true)
    trackLocalWebEvent({ kind: 'panel_opened', panel: 'device_location' })
  }, [])
  const requestTaskExtraction = useCallback((period: TimelineEditSelection) => {
    if (selectedSessionId) {
      setTaskExtractionRequest({ period, sessionId: selectedSessionId })
    }
  }, [selectedSessionId])
  const replayPanelOverride = useMemo(() => {
    if (liveViewMode !== 'simulator'
      || selectedSession?.isConnected !== true
      || !selectedSession.isSimulatorOrEmulator
      || !selectedSession.runtimeDeviceIdentifier) {
      return undefined
    }

    const deviceIdentifier = selectedSession.runtimeDeviceIdentifier
    const platform = selectedSession.runtimePlatform
    const sessionId = selectedSession.sessionId
    return ({ annotations, captureToolbar, frame, isAnnotationEditorOpen, onCreateAnnotation, selectedAnnotationId }: SessionReplayPanelContext) => (
      <SimulatorControlView
        annotations={annotations}
        captureToolbar={captureToolbar}
        deviceIdentifier={deviceIdentifier}
        frame={frame}
        isAnnotationEditorOpen={isAnnotationEditorOpen}
        key={sessionId}
        onCreateAnnotation={onCreateAnnotation}
        onOpenDeviceLocation={bootstrap?.supportsDeviceLocation ? openDeviceLocation : undefined}
        platform={platform}
        selectedAnnotationId={selectedAnnotationId}
        sessionId={sessionId}
      />
    )
  }, [
    bootstrap?.supportsDeviceLocation,
    liveViewMode,
    openDeviceLocation,
    selectedSession?.isConnected,
    selectedSession?.isSimulatorOrEmulator,
    selectedSession?.runtimeDeviceIdentifier,
    selectedSession?.runtimePlatform,
    selectedSession?.sessionId,
  ])

  const refreshAppGraphRuns = useCallback(async () => {
    if (!bootstrap?.supportsAppGraphProgress) return
    setIsAppGraphRefreshing(true)
    try {
      const query = selectedSessionId
        ? `?${new URLSearchParams({ sessionId: selectedSessionId })}`
        : ''
      const response = await fetch(`api/app-graph-runs${query}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`The local host returned HTTP ${response.status}.`)
      setAppGraphRuns(await response.json() as LocalAppGraphLiveRun[])
    } catch {
      setAppGraphRuns([])
    } finally {
      setIsAppGraphRefreshing(false)
    }
  }, [bootstrap?.supportsAppGraphProgress, selectedSessionId])

  useEffect(() => {
    if (!bootstrap?.supportsAppGraphProgress) return undefined
    const timeoutId = window.setTimeout(() => void refreshAppGraphRuns(), 0)
    const interval = window.setInterval(() => void refreshAppGraphRuns(), appGraphRefreshIntervalMs)
    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(interval)
    }
  }, [bootstrap?.supportsAppGraphProgress, refreshAppGraphRuns])

  const deleteSession = useCallback(async (sessionId: string) => {
    const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/delete`, {
      body: '{}',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const result = await response.json() as LocalOperationResult
    if (!response.ok || !result.isSuccess) {
      throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
    }

    setSessions((current) => current.filter((session) => session.sessionId !== sessionId))
    setSelectedSessionId((current) => current === sessionId ? null : current)
    setIsSessionInfoOpen(false)
  }, [setSelectedSessionId])

  const deleteSessions = useCallback(async (sessionIds: string[]) => {
    const deletingIds = new Set(sessionIds)
    bulkDeletingSessionIdsRef.current = deletingIds
    setSelectedSessionId((current) => current && deletingIds.has(current)
      ? sessions.find((session) => !deletingIds.has(session.sessionId))?.sessionId ?? null
      : current)
    try {
      if (bootstrap?.mode !== 'explorer') {
        const deletedSessionIds: string[] = []
        const failures: string[] = []
        for (const sessionId of sessionIds) {
          try { await deleteSession(sessionId); deletedSessionIds.push(sessionId) }
          catch (error) { failures.push(`${sessionId}: ${resolveErrorMessage(error, 'Unable to delete session.')}`) }
        }
        return { deletedSessionIds, failures }
      }

      const response = await fetch('api/sessions/bulk', {
        body: JSON.stringify({ operation: 'delete', sessionIds }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalOperationResult & { items?: { sessionId: string; isSuccess: boolean; message: string }[] }
      if (!result.items) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      const deletedSessionIds = result.items.filter((item) => item.isSuccess).map((item) => item.sessionId)
      const failures = result.items.filter((item) => !item.isSuccess).map((item) => `${item.sessionId}: ${item.message}`)
      if (!response.ok && failures.length === 0) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      const deleted = new Set(deletedSessionIds)
      setSessions((current) => current.filter((session) => !deleted.has(session.sessionId)))
      setIsSessionInfoOpen(false)
      setSessionRefreshNonce((current) => current + 1)
      return { deletedSessionIds, failures }
    } finally {
      bulkDeletingSessionIdsRef.current = null
    }
  }, [bootstrap?.mode, deleteSession, sessions, setSelectedSessionId])

  const setSessionPinned = useCallback(async (sessionId: string, isPinned: boolean) => {
    let endpoint = 'api/sessions/bulk'
    let body: object = { operation: isPinned ? 'pin' : 'unpin', sessionIds: [sessionId] }
    if (bootstrap?.mode !== 'explorer') {
      // The standalone player has no bulk endpoint. Preserve the full metadata when updating its pin.
      const metadataResponse = await fetch(`api/sessions/${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      if (!metadataResponse.ok) {
        throw new Error(`Unable to load session details (HTTP ${metadataResponse.status}).`)
      }

      const metadata = await metadataResponse.json() as { name?: string | null; tags: string[]; notes?: string | null }
      endpoint = `api/sessions/${encodeURIComponent(sessionId)}/metadata`
      body = { isPinned, name: metadata.name, tags: metadata.tags, notes: metadata.notes }
    }

    const response = await fetch(endpoint, {
      body: JSON.stringify(body),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const result = await response.json() as LocalOperationResult
    if (!response.ok || !result.isSuccess) {
      throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
    }

    setSessions((current) => current.map((session) => session.sessionId === sessionId ? { ...session, isPinned } : session))
    setSessionRefreshNonce((current) => current + 1)
  }, [bootstrap?.mode])

  async function deleteSelectedSession() {
    const session = selectedSession
    if (!session || !canManageSelectedSession || session.isConnected || deletingSessionId) return
    const sessionName = session.name || session.clientName || session.appId
    if (!window.confirm(`Delete “${sessionName}” permanently? Its capture, search index, metrics, and trends history will be removed.`)) {
      return
    }

    setDeletingSessionId(session.sessionId)
    setSessionActionError(null)
    try {
      await deleteSession(session.sessionId)
      setIsShareModalOpen(false)
      setActivePanel(null)
    } catch (error) {
      setSessionActionError(resolveErrorMessage(error, 'Unable to delete the session.'))
    } finally {
      setDeletingSessionId(null)
    }
  }

  function toggleGlobalPanel(panel: NonNullable<LocalGlobalPanel>) {
    const isOpening = activePanel !== panel
    setIsManageMenuOpen(false)
    setActivePanel(isOpening ? panel : null)

    if (isOpening) {
      trackLocalWebEvent({ kind: 'panel_opened', panel })
    }
  }

  function openGettingStarted() {
    setIsManageMenuOpen(false)
    setActivePanel(null)
    setShowGettingStarted(true)
    void updateGettingStarted(gettingStarted?.skipped ? 'resume' : 'open').catch(() => {})
  }

  function openGettingStartedSession(sessionId: string) {
    setSelectedSessionId(sessionId)
    setActivePanel(null)
    setShowGettingStarted(false)
  }

  function openLinkedTrace(run: LocalTestRunSummary) {
    setTestHistoryInitialRun(run)
    setActivePanel('test_history')
    trackLocalWebEvent({ kind: 'panel_opened', panel: 'test_history' })
  }

  function openTrendsSession(sessionId: string) {
    setSessionActionError(null)
    setIsSessionInfoOpen(false)
    setSelectedSessionId(sessionId)
    setIsExplorerOpen(true)
    setActivePanel(null)
  }

  function globalPanelButtonClassName(panel: NonNullable<LocalGlobalPanel>) {
    return activePanel === panel
      ? 'local-banner-button local-banner-button--active'
      : 'local-banner-button'
  }

  useEffect(() => {
    if (!selectedSessionId || !selectedSession || trackedSessionIds.current.has(selectedSessionId)) {
      return
    }

    trackedSessionIds.current.add(selectedSessionId)
    trackLocalWebEvent({
      kind: 'session_viewed',
      isLive: selectedSession?.isConnected === true,
    })
  }, [selectedSession, selectedSessionId])

  useEffect(() => {
    if (!isManageMenuOpen) {
      return undefined
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !manageMenuRef.current?.contains(event.target)) {
        setIsManageMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsManageMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isManageMenuOpen])

  useEffect(() => {
    if (!pairingQr) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPairingQr(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pairingQr])

  useEffect(() => {
    if (!bootstrap?.supportsTestHistory || !selectedSessionId) {
      return undefined
    }

    let isMounted = true
    const loadLinkedTrace = async () => {
      try {
        const query = new URLSearchParams({ limit: '1', sessionId: selectedSessionId })
        if (selectedSession?.appId) {
          query.set('appId', selectedSession.appId)
        }
        const response = await fetch(`api/test-history?${query}`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`The local host returned HTTP ${response.status}.`)
        }

        const history = await response.json() as LocalTestHistory
        if (isMounted) {
          setLinkedTraceRun(history.runs[0] ?? null)
        }
      } catch {
        if (isMounted) {
          setLinkedTraceRun(null)
        }
      }
    }

    void loadLinkedTrace()
    const interval = window.setInterval(() => void loadLinkedTrace(), linkedTraceRefreshIntervalMs)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [bootstrap?.supportsTestHistory, selectedSession?.appId, selectedSessionId])

  async function issuePairingQr() {
    if (isIssuingPairingQr) {
      return
    }

    setIsIssuingPairingQr(true)
    setPairingQrError(null)
    try {
      const response = await fetch('api/enrollment/invites', {
        body: JSON.stringify({
          appId: null,
          appName: null,
          duration: '1mo',
          hostAddress: null,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalEnrollmentInviteResult
      if (!response.ok || !result.isSuccess || !result.qrImageDataUrl) {
        throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      }

      setPairingQr(result)
    } catch (error) {
      setPairingQrError(resolveErrorMessage(error, 'Unable to issue a pairing QR.'))
    } finally {
      setIsIssuingPairingQr(false)
    }
  }

  const isSessionsSectionActive = !showGettingStarted && (activePanel === null || activePanel === 'app_graph')
  const isTestsSectionActive = activePanel === 'test_execution' || activePanel === 'test_history'
  const isTrendsSectionActive = activePanel === 'trends'
  const isManageSectionActive = activePanel === 'about'
    || activePanel === 'account'
    || activePanel === 'runner'
    || activePanel === 'apps'
    || activePanel === 'devices'
    || activePanel === 'session_admin'
    || activePanel === 'health'
    || activePanel === 'settings'
  const cacheUsagePercent = cachePlan && cachePlan.maximumCacheSizeBytes > 0
    ? Math.round(cachePlan.totalCacheSizeBytes / cachePlan.maximumCacheSizeBytes * 100)
    : 0
  const isCacheApproachingLimit = cachePlan?.autoCleanupEnabled === true && cacheUsagePercent >= 80
  const cacheFeedback = isCacheApproachingLimit
    ? cacheUsagePercent > 100
      ? 'Session storage is over its limit. Pinned or live sessions may be preventing cleanup.'
      : `Session storage is ${cacheUsagePercent}% full. Old, unpinned sessions will be removed above the limit.`
    : cachePlan?.lastAutoCleanupDeletedCount
      ? `Ansight removed ${cachePlan.lastAutoCleanupDeletedCount} old, unpinned session(s) after the cache exceeded its limit.`
      : null
  const rootClassName = [
    'local-replay-root',
    isExplorerOpen ? '' : 'local-replay-root--collapsed',
    selectedSession && !showGettingStarted ? 'local-replay-root--has-session-context' : '',
  ].filter(Boolean).join(' ')
  // The explorer carries its own hide control; the banner only offers the way back.
  const explorerToggle = (
    <button
      aria-label="Hide session explorer"
      className="local-banner-button local-banner-button--icon local-session-explorer-toggle"
      data-tooltip="Hide session explorer"
      data-tooltip-align="end"
      onClick={() => setIsExplorerOpen(false)}
      type="button"
    >
      <SidebarSimple aria-hidden="true" />
    </button>
  )

  return (
    <div className={rootClassName} style={replayPanelWidth === null ? undefined : { '--session-replay-panel-width': `${replayPanelWidth}px` } as CSSProperties}>
      <div className="local-replay-banner">
        <div className="local-replay-brand">
          {isExplorerOpen ? null : (
            <button
              aria-label="Show session explorer"
              className="local-banner-button local-banner-button--icon"
              data-tooltip="Show session explorer"
              onClick={() => setIsExplorerOpen(true)}
              type="button"
            >
              <SidebarSimple aria-hidden="true" />
            </button>
          )}
          <span>Ansight</span>
          <small>Local</small>
          <GithubRepositoryBadge />
        </div>
        <div className="local-replay-actions">
          {cacheFeedback ? <button
            aria-label={cacheFeedback}
            className={isCacheApproachingLimit ? 'local-host-status local-cache-status local-cache-status--warning' : 'local-host-status local-cache-status'}
            onClick={() => setActivePanel('session_admin')}
            type="button"
          >
            <HardDrives aria-hidden="true" />
            {isCacheApproachingLimit ? `Storage ${cacheUsagePercent}%` : 'Storage cleaned'}
            <span className="local-host-status-tooltip" role="tooltip">{cacheFeedback} Open session storage for details.</span>
          </button> : null}
          <button
            aria-describedby="local-runner-status-tooltip"
            aria-label="Manage remote runner"
            className={`local-host-status local-runner-status local-runner-status--${'disabled'}`}
            onClick={() => setActivePanel('runner')}
            type="button"
          >
            <Pulse aria-hidden="true" />
            Runner
            <span className="local-host-status-tooltip" id="local-runner-status-tooltip" role="tooltip">
              Select to manage a cloud runner.
            </span>
          </button>
          <span
            aria-describedby="local-host-status-tooltip"
            className={liveCount > 0 ? 'local-host-status local-host-status--live' : 'local-host-status'}
            tabIndex={0}
          >
            <WifiHigh aria-hidden="true" />
            {liveCount > 0 ? `${liveCount} live` : 'Host ready'}
            <span className="local-host-status-tooltip" id="local-host-status-tooltip" role="tooltip">
              {liveCount > 0
                ? `The host is available and connected to ${liveCount} ${liveCount === 1 ? 'app' : 'apps'}.`
                : 'The host is available and ready for apps to connect.'}
            </span>
          </span>
          <nav aria-label="Local explorer" className="local-global-navigation">
            {bootstrap?.mode === 'explorer' ? <button
              aria-current={showGettingStarted ? 'page' : undefined}
              className={showGettingStarted ? 'local-banner-button local-banner-button--active' : 'local-banner-button'}
              onClick={openGettingStarted}
              title="Getting started"
              type="button"
            >
              <Sparkle aria-hidden="true" />
              Getting started
            </button> : null}
            <button
              aria-current={isSessionsSectionActive ? 'page' : undefined}
              className={isSessionsSectionActive ? 'local-banner-button local-banner-button--active' : 'local-banner-button'}
              onClick={() => {
                setIsManageMenuOpen(false)
                setActivePanel(null)
                setShowGettingStarted(false)
              }}
              title="Sessions"
              type="button"
            >
              <VideoCamera aria-hidden="true" />
              Sessions
            </button>
            {bootstrap?.supportsTestExecution ? (
              <button
                aria-current={isTestsSectionActive ? 'page' : undefined}
                className={isTestsSectionActive ? 'local-banner-button local-banner-button--active' : 'local-banner-button'}
                onClick={() => {
                  setTestHistoryInitialRun(null)
                  toggleGlobalPanel('test_execution')
                }}
                title="Tests"
                type="button"
              >
                <TestTube aria-hidden="true" />
                Tests
              </button>
            ) : null}
            {bootstrap?.supportsTrends ? (
              <button
                aria-current={isTrendsSectionActive ? 'page' : undefined}
                className={isTrendsSectionActive ? 'local-banner-button local-banner-button--active' : 'local-banner-button'}
                onClick={() => toggleGlobalPanel('trends')}
                title="Trends"
                type="button"
              >
                <ChartLineUp aria-hidden="true" />
                Trends
              </button>
            ) : null}
          </nav>
          <div className="local-manage-menu" ref={manageMenuRef}>
            <button
              aria-expanded={isManageMenuOpen}
              aria-haspopup="menu"
              className={isManageSectionActive ? 'local-banner-button local-banner-button--active' : 'local-banner-button'}
              onClick={() => setIsManageMenuOpen((current) => !current)}
              title="Manage"
              type="button"
            >
              <Gear aria-hidden="true" />
              Manage
              <CaretDown aria-hidden="true" className="local-manage-menu-caret" />
            </button>
            {isManageMenuOpen ? (
              <div className="local-manage-menu-popover" role="menu">
                {bootstrap?.supportsRegisteredApps ? (
                  <button onClick={() => toggleGlobalPanel('apps')} role="menuitem" type="button">
                    <SquaresFour aria-hidden="true" />
                    <span><strong>Apps</strong><small>Registrations, app monitoring and automation</small></span>
                  </button>
                ) : null}
                {bootstrap?.supportsDeviceManagement ? (
                  <button onClick={() => toggleGlobalPanel('devices')} role="menuitem" type="button">
                    <DeviceMobile aria-hidden="true" />
                    <span><strong>Devices</strong><small>Prepare and control simulator targets</small></span>
                  </button>
                ) : null}
                {bootstrap?.supportsSessionAdministration ? (
                  <button onClick={() => toggleGlobalPanel('session_admin')} role="menuitem" type="button">
                    <Archive aria-hidden="true" />
                    <span><strong>Session storage</strong><small>Import, export and clean up captures</small></span>
                  </button>
                ) : null}
                {bootstrap?.supportsHostHealth ? (
                  <button onClick={() => toggleGlobalPanel('health')} role="menuitem" type="button">
                    <Pulse aria-hidden="true" />
                    <span><strong>Host health</strong><small>Diagnostics, permissions and logs</small></span>
                  </button>
                ) : null}
                {bootstrap?.supportsSettings ? (
                  <button onClick={() => toggleGlobalPanel('settings')} role="menuitem" type="button">
                    <Gear aria-hidden="true" />
                    <span><strong>Settings</strong><small>Configure this local host</small></span>
                  </button>
                ) : null}
                {bootstrap?.supportsAccountManagement ? (
                  <button onClick={() => toggleGlobalPanel('account')} role="menuitem" type="button">
                    <UserCircle aria-hidden="true" />
                    <span><strong>Account</strong><small>Manage your identity and companion machines</small></span>
                  </button>
                ) : null}
                {bootstrap?.supportsHostHealth ? (
                  <button className="local-manage-menu-about" onClick={() => toggleGlobalPanel('about')} role="menuitem" type="button">
                    <Info aria-hidden="true" />
                    <span><strong>About Ansight</strong><small>Version and installation details</small></span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {bootstrap?.supportsEnrollmentInvites ? (
            <div className="local-pairing-action">
              <button
                aria-expanded={pairingQr !== null}
                aria-haspopup="dialog"
                aria-label={isIssuingPairingQr ? 'Issuing pairing QR' : 'Issue pairing QR'}
                className="local-banner-button local-banner-button--icon local-pairing-qr-button"
                disabled={isIssuingPairingQr}
                onClick={() => void issuePairingQr()}
                title="Issue and open a pairing QR"
                type="button"
              >
                {isIssuingPairingQr ? <CircleNotch className="spin" aria-hidden="true" /> : <QrCode aria-hidden="true" />}
              </button>
              {pairingQrError ? <span className="local-pairing-error" role="alert">{pairingQrError}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="local-replay-layout">
        {isExplorerOpen ? explorerMode === 'team' && bootstrap?.supportsCloudSessions ? (
          <TeamSessionExplorer
            headingAction={explorerToggle}
            onOpenSession={(sessionId) => {
              setSessionActionError(null)
              setIsSessionInfoOpen(false)
              setSelectedSessionId(sessionId)
              setExplorerMode('local')
              setShowGettingStarted(false)
            }}
            onShowLocalSessions={() => setExplorerMode('local')}
          />
        ) : (
          <SessionExplorer
            canPinSession={(sessionId) => bootstrap !== null && (bootstrap.mode === 'explorer' || sessionId === bootstrap.initialSessionId)}
            headingAction={explorerToggle}
            isLoading={isSessionsLoading}
            onDeleteSession={deleteSession}
            onDeleteSessions={deleteSessions}
            onSetSessionPinned={setSessionPinned}
            onSelectSession={(sessionId) => {
              setSessionActionError(null)
              setIsSessionInfoOpen(false)
              setSelectedSessionId(sessionId)
              setShowGettingStarted(false)
            }}
            onShowTeamSessions={() => setExplorerMode('team')}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
            supportsCloudSessions={bootstrap?.supportsCloudSessions === true}
          />
        ) : null}
        <main className="local-replay-viewer">
          {selectedSession && !showGettingStarted ? (
            <div className="local-session-context-toolbar">
              <span className="local-session-context-icon">
                <SessionIcon appIconUrl={selectedSession.appIconUrl} platform={selectedSession.runtimePlatform} />
              </span>
              <span className="local-session-context-title">
                <span className="local-session-context-name">
                  <strong>{selectedSession.name || selectedSession.clientName}</strong>
                  <SessionDeviceBadge isSimulatorOrEmulator={selectedSession.isSimulatorOrEmulator} platform={selectedSession.runtimePlatform} />
                </span>
                <span className="local-session-id">
                  <span>{selectedSession.sessionId}</span>
                  <button aria-label="Copy session ID" data-tooltip="Copy session ID" type="button" onClick={() => void copySessionId(selectedSession.sessionId)}>
                    {copiedSessionId === selectedSession.sessionId ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </button>
                  <span className="local-session-copy-feedback" role="status">{copiedSessionId === selectedSession.sessionId ? 'Copied' : ''}</span>
                  <button aria-label="Copy session link" data-tooltip="Copy session link" type="button" onClick={() => void copySessionLink(selectedSession.sessionId)}>
                    {copiedSessionLinkId === selectedSession.sessionId ? <Check aria-hidden="true" /> : <Link aria-hidden="true" />}
                  </button>
                  <span className="local-session-copy-feedback" role="status">{copiedSessionLinkId === selectedSession.sessionId ? 'Link copied' : ''}</span>
                </span>
              </span>
              {canSwitchLiveView ? (
                <div aria-label="Live session view" className="local-live-view-toggle" role="group">
                  <button
                    aria-pressed={liveViewMode === 'simulator'}
                    className={liveViewMode === 'simulator' ? 'local-banner-button local-banner-button--active' : 'local-banner-button'}
                    onClick={() => setLiveViewPreference({ mode: 'simulator', sessionId: selectedSessionId })}
                    data-tooltip="Simulator"
                    type="button"
                  >
                    <DeviceMobile aria-hidden="true" />
                    Simulator
                  </button>
                  <button
                    aria-pressed={liveViewMode === 'playback'}
                    className={liveViewMode === 'playback' ? 'local-banner-button local-banner-button--active' : 'local-banner-button'}
                    onClick={() => setLiveViewPreference({ mode: 'playback', sessionId: selectedSessionId })}
                    data-tooltip="Playback"
                    type="button"
                  >
                    <VideoCamera aria-hidden="true" />
                    Playback
                  </button>
                </div>
              ) : null}
              {isAppGraphToolVisible && (bootstrap?.supportsAppGraphProgress || bootstrap?.supportsAppGraphRecording) ? (
                <button
                  aria-pressed={activePanel === 'app_graph'}
                  className={`${globalPanelButtonClassName('app_graph')}${hasActiveAppGraphRun ? ' local-banner-button--live' : ''}`}
                  onClick={() => {
                    setAppGraphPanelMode(
                      bootstrap?.supportsAppGraphRecording && selectedSession.isConnected
                        ? 'recording'
                        : 'runs',
                    )
                    toggleGlobalPanel('app_graph')
                  }}
                  data-tooltip="App Graph"
                  type="button"
                >
                  <FlowArrow aria-hidden="true" />
                  Graph
                  {hasActiveAppGraphRun ? <i aria-label="Exploration running" /> : null}
                </button>
              ) : null}
              {selectedLinkedTraceRun ? (
                <button
                  className={activePanel === 'test_history' && testHistoryInitialRun?.runId === selectedLinkedTraceRun.runId
                    ? 'local-banner-button local-banner-button--active'
                    : 'local-banner-button'}
                  onClick={() => openLinkedTrace(selectedLinkedTraceRun)}
                  data-tooltip={`Open linked trace ${selectedLinkedTraceRun.runId}`}
                  type="button"
                >
                  <FlowArrow aria-hidden="true" />
                  Trace
                </button>
              ) : null}
              <span className="local-session-context-spacer" />
              {sessionActionError ? <span className="local-session-context-error" role="alert" title={sessionActionError}>{sessionActionError}</span> : null}
              <button className="local-banner-button" disabled={selectedSession.isConnected || exportingSessionId !== null} onClick={() => void exportSession(selectedSession.sessionId)} data-tooltip={selectedSession.isConnected ? 'Finish recording before exporting this session' : 'Export session ZIP to Desktop'} type="button">
                {exportingSessionId === selectedSession.sessionId ? <CircleNotch className="spin" aria-hidden="true" /> : <DownloadSimple aria-hidden="true" />}
                {exportingSessionId === selectedSession.sessionId ? 'Exporting…' : 'Export ZIP'}
              </button>
              <button
                className="local-banner-button"
                onClick={() => { setAiViewKind(null); setIsSessionInfoOpen(true) }}
                data-tooltip="View session information"
                type="button"
              >
                <Info aria-hidden="true" />
                Info
              </button>
              {canManageSelectedSession ? (
                <button
                  className="local-banner-button"
                  onClick={() => setIsSessionMetadataOpen(true)}
                  data-tooltip="Edit session name and notes"
                  type="button"
                >
                  <NotePencil aria-hidden="true" />
                  Edit
                </button>
              ) : null}
              {bootstrap?.supportsCloudSessions ? (
                <button
                  className="local-banner-button"
                  disabled={selectedSession.isConnected}
                  onClick={() => setIsShareModalOpen(true)}
                  data-tooltip={selectedSession.isConnected ? 'Finish recording before sharing this session' : 'Share this session to a team'}
                  type="button"
                >
                  <CloudArrowUp aria-hidden="true" />
                  Share
                </button>
              ) : null}
              <button
                className="local-banner-button"
                onClick={() => void openSummary()}
                data-tooltip="Summarise this local session"
                type="button"
              >
                <Sparkle aria-hidden="true" />
                Summary
              </button>
              {bootstrap?.supportsTaskExtraction ? <button
                className="local-banner-button"
                onClick={() => void openSessionTaskDrafts()}
                data-tooltip="Open saved YAML and automation task drafts for this session"
                type="button"
              >
                <TestTube aria-hidden="true" />
                Drafts
              </button> : null}
              {canManageSelectedSession ? (
                <button
                  className="local-banner-button local-session-context-delete"
                  disabled={selectedSession.isConnected || deletingSessionId !== null}
                  onClick={() => void deleteSelectedSession()}
                  data-tooltip={selectedSession.isConnected ? 'Disconnect the live session before deleting it' : 'Delete this session permanently'}
                  type="button"
                >
                  {deletingSessionId === selectedSession.sessionId ? <CircleNotch aria-hidden="true" className="spin" /> : <Trash aria-hidden="true" />}
                  {deletingSessionId === selectedSession.sessionId ? 'Deleting…' : 'Delete'}
                </button>
              ) : null}
            </div>
          ) : null}
          {exportMessage ? <p className="inline-message local-replay-message" role="status">{exportMessage}</p> : null}
          {message && sessions.length === 0 ? <p className="inline-message local-replay-message">{message}</p> : null}
          {showGettingStarted && gettingStarted ? (
            <GettingStartedPanel
              state={gettingStarted}
              sessions={sessions}
              onAction={async (action) => {
                if (action === 'skip') setShowGettingStarted(false)
                await updateGettingStarted(action)
              }}
              onClose={() => setShowGettingStarted(false)}
              onOpenApps={() => { setShowGettingStarted(false); setActivePanel('apps') }}
              onOpenSession={openGettingStartedSession}
            />
          ) : (!bootstrap || isSessionsLoading) && !message ? (
            <div className="local-replay-loading">
              <CircleNotch className="spin" aria-hidden="true" />
              <strong>{bootstrap ? 'Loading sessions' : 'Connecting to the local host'}</strong>
            </div>
          ) : selectedSessionId && sessions.length > 0 ? (
            <SessionViewerPage
              aiViewKind={aiViewKind}
              initialArtifactId={sessionLink?.sessionId === selectedSessionId ? sessionLink.artifactId : undefined}
              isEmbedded
              isLiveSession={selectedSession?.isConnected === true}
              onReplayPanelWidthChange={setReplayPanelWidth}
              isSignedIn={false}
              onSessionInfoOpenChange={handleSessionInfoOpenChange}
              onAiViewKindChange={setAiViewKind}
              onSessionExtracted={(sessionId) => {
                setSessionActionError(null)
                setIsSessionInfoOpen(false)
                setSelectedSessionId(sessionId)
              }}
              onTaskExtractionRequested={bootstrap?.supportsTaskExtraction
                ? requestTaskExtraction
                : undefined}
              onReplayInteracted={!selectedSession?.isConnected
                ? () => {
                  if (replayMilestoneSent.current || gettingStarted?.replayedSessionId) return
                  replayMilestoneSent.current = true
                  void updateGettingStarted('replay', selectedSessionId).catch(() => { replayMilestoneSent.current = false })
                }
                : undefined}
              annotationWorkflowRequest={annotationWorkflow ? { id: annotationWorkflow.id, annotationId: annotationWorkflow.annotationId } : null}
              onAnnotationSaved={(annotation: SessionAnnotation) => {
                if (!annotationWorkflow) return
                const returnRequest = annotationWorkflow.returnRequest
                const returnTest = returnRequest.returnTest!
                const start = Date.parse(annotation.startUtc ?? '')
                const end = Date.parse(annotation.endUtc ?? '')
                const isInPeriod = !!annotation.annotationId && Number.isFinite(start) && Number.isFinite(end)
                  && start >= returnRequest.period.startMs && end <= returnRequest.period.endMs && end > start
                setTaskExtractionRequest({
                  ...returnRequest,
                  returnTest: isInPeriod ? {
                    ...returnTest,
                    selectedTaskSectionIds: [...new Set([...returnTest.selectedTaskSectionIds, annotation.annotationId!])],
                    skipTaskSections: false,
                  } : returnTest,
                })
                setAnnotationWorkflow(null)
                setSessionRefreshNonce((current) => current + 1)
              }}
              replayPanelOverride={replayPanelOverride}
              refreshKey={refreshKey}
              sessionId={selectedSessionId}
              sessionInfoOpen={isSessionInfoOpen}
              source={sessionViewerSource}
            />
          ) : (
            <div className="local-replay-welcome">
              <WifiHigh aria-hidden="true" />
              <p className="eyebrow">No sessions yet</p>
              <h2>Connect your app</h2>
              <p>Open your app project in a coding agent. Ask it to follow the <a href="https://www.ansight.ai/skills/ansight-install.md" rel="noopener noreferrer" target="_blank">Ansight install skill</a> to set up capture and verify a session.</p>
              <p>Run your app, then return here to inspect the recording.</p>
            </div>
          )}
        </main>
      </div>

      {isLocationOpen ? (
        <DeviceLocationPanel
          mapboxAccessToken={bootstrap?.mapboxAccessToken ?? ''}
          onClose={() => setIsLocationOpen(false)}
        />
      ) : null}
      {isShareModalOpen && selectedSession ? (
        <ShareLocalSessionModal
          onClose={() => setIsShareModalOpen(false)}
          onOpenAccount={() => { setIsShareModalOpen(false); setActivePanel('account') }}
          session={selectedSession}
        />
      ) : null}
      {isSessionMetadataOpen && selectedSession ? (
        <EditSessionMetadataPanel
          key={selectedSession.sessionId}
          onClose={() => setIsSessionMetadataOpen(false)}
          onSaved={(name) => {
            setSessions((current) => current.map((session) => session.sessionId === selectedSession.sessionId
              ? { ...session, name }
              : session))
            setIsSessionMetadataOpen(false)
            setSessionRefreshNonce((current) => current + 1)
          }}
          sessionId={selectedSession.sessionId}
          sessionTitle={selectedSession.name || selectedSession.clientName || selectedSession.appId}
        />
      ) : null}
      {activePanel === 'app_graph' ? (
        appGraphPanelMode === 'recording' && selectedSession?.isConnected ? (
          <AppGraphRecordingPanel
            onClose={() => setActivePanel(null)}
            onShowRuns={() => setAppGraphPanelMode('runs')}
            session={selectedSession}
          />
        ) : (
          <AppGraphProgressPanel
            isRefreshing={isAppGraphRefreshing}
            onClose={() => setActivePanel(null)}
            onRecord={bootstrap?.supportsAppGraphRecording && selectedSession?.isConnected
              ? () => setAppGraphPanelMode('recording')
              : undefined}
            onRefresh={() => void refreshAppGraphRuns()}
            runs={appGraphRuns}
          />
        )
      ) : null}
      {activePanel === 'trends' ? (
        <TrendsPanel
          onClose={() => setActivePanel(null)}
          onOpenSession={openTrendsSession}
          sessions={sessions}
        />
      ) : null}
      {activePanel === 'test_history' ? (
        <TestHistoryPanel
          appId={selectedSession?.appId}
          appName={selectedSession?.name ?? selectedSession?.clientName}
          initialRun={testHistoryInitialRun}
          onClose={() => setActivePanel(null)}
        />
      ) : null}
      {activePanel === 'test_execution' ? (
        <TestExecutionPanel
          initialAppId={testExecutionTarget?.appId}
          initialTestId={testExecutionTarget?.testId}
          onClose={() => { setActivePanel(null); setTestExecutionTarget(null) }}
          onOpenHistory={() => {
            setTestHistoryInitialRun(null)
            setActivePanel('test_history')
          }}
        />
      ) : null}
      {activePanel === 'devices' ? <DeviceManagementPanel onClose={() => setActivePanel(null)} /> : null}
      {activePanel === 'session_admin' ? (
        <SessionAdministrationPanel
          onClose={() => setActivePanel(null)}
          onSessionsChanged={() => setSessionRefreshNonce((current) => current + 1)}
          sessions={sessions}
        />
      ) : null}
      {activePanel === 'apps' ? (
        <HostManagementPanel onClose={() => setActivePanel(null)} />
      ) : null}
      {activePanel === 'about' ? <AboutInstallationPanel onClose={() => setActivePanel(null)} /> : null}
      {activePanel === 'account' ? <AccountCompanionPanel onClose={() => setActivePanel(null)} /> : null}
      {activePanel === 'runner' ? <RemoteRunnerPanel
        canManage={canManageRunner}
        onClose={() => setActivePanel(null)}
        onOpenAccount={() => setActivePanel('account')}
        registration={runnerRegistration}
        status={runnerStatus}
      /> : null}
      {activePanel === 'health' ? <HostHealthPanel onClose={() => setActivePanel(null)} /> : null}
      {activePanel === 'settings' ? <CoreSettingsPanel onClose={() => setActivePanel(null)} /> : null}
      {taskExtractionRequest ? (() => {
        const extractionSession = sessions.find((candidate) => candidate.sessionId === taskExtractionRequest.sessionId)
        return extractionSession ? (
          <TaskExtractionErrorBoundary onClose={() => setTaskExtractionRequest(null)}>
            <Suspense fallback={<TaskExtractionLoadingPanel />}>
              <TaskExtractionPanel
              key={`${extractionSession.sessionId}:${taskExtractionRequest.period.startMs}:${taskExtractionRequest.period.endMs}:${taskExtractionRequest.format ?? 'ansight'}:${taskExtractionRequest.draftId ?? ''}`}
              initialDraftId={taskExtractionRequest.draftId}
              initialFormat={taskExtractionRequest.format}
              initialSelectedTaskSectionIds={taskExtractionRequest.returnTest?.selectedTaskSectionIds}
              initialSkipTaskSections={taskExtractionRequest.returnTest?.skipTaskSections}
              initialTaskName={taskExtractionRequest.returnTest?.name}
              initialTestAssertions={taskExtractionRequest.returnTest?.assertions}
              initialGenerationNotes={taskExtractionRequest.returnTest?.generationNotes}
              onAnnotateOnReplay={(annotationId, returnTest) => {
                annotationWorkflowIdRef.current += 1
                setAnnotationWorkflow({
                  id: annotationWorkflowIdRef.current,
                  annotationId,
                  returnRequest: { ...taskExtractionRequest, format: 'test', returnTest },
                })
                setTaskExtractionRequest(null)
              }}
              onAutomationSaved={onGettingStartedAutomationSaved}
              onClose={() => setTaskExtractionRequest(null)}
              onOpenSavedTestDraft={(draft) => setTaskExtractionRequest({
                format: 'test',
                draftId: draft.draftId,
                period: { startMs: Date.parse(draft.startUtc), endMs: Date.parse(draft.endUtc), focusMs: Date.parse(draft.startUtc) },
                sessionId: draft.sessionId,
              })}
              onOpenTests={(appId, testId) => {
                setTestExecutionTarget({ appId, testId })
                setTaskExtractionRequest(null)
                setActivePanel('test_execution')
              }}
              period={taskExtractionRequest.period}
              session={extractionSession}
              sessions={sessions}
              />
            </Suspense>
          </TaskExtractionErrorBoundary>
        ) : null
      })() : null}
      {annotationWorkflow ? <div className="local-test-annotation-return" role="status">
        <NotePencil aria-hidden="true" />
        <span><strong>{annotationWorkflow.annotationId ? 'Edit the replay annotation' : 'Mark a task section on the replay'}</strong><small>{annotationWorkflow.annotationId ? 'Save the annotation to return to the test.' : 'Drag a range on the timeline, then describe it in the annotation editor.'}</small></span>
        {!annotationWorkflow.annotationId ? <button className="button button--secondary" onClick={() => { annotationWorkflowIdRef.current += 1; setAnnotationWorkflow({ ...annotationWorkflow, id: annotationWorkflowIdRef.current }) }} type="button">Choose range</button> : null}
        <button className="button button--secondary" onClick={() => { setTaskExtractionRequest(annotationWorkflow.returnRequest); setAnnotationWorkflow(null) }} type="button">Return to test</button>
      </div> : null}
      {pairingQr?.qrImageDataUrl ? (
        <div className="local-enrollment-qr-modal" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            setPairingQr(null)
          }
        }}>
          <section aria-label="Pairing QR code" aria-modal="true" role="dialog">
            <button aria-label="Close pairing QR code" className="local-icon-button" onClick={() => setPairingQr(null)} type="button">
              <X aria-hidden="true" />
            </button>
            <img alt="One-time Ansight pairing QR code" src={pairingQr.qrImageDataUrl} />
            <strong>Pair with this host</strong>
            <span>Scan with an Ansight-enabled app</span>
          </section>
        </div>
      ) : null}
    </div>
  )
}

class TaskExtractionErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <div className="local-admin-backdrop local-task-extraction-backdrop" role="presentation">
      <section aria-label="Extraction explorer unavailable" className="local-admin-panel local-task-extraction-panel">
        <header className="local-admin-header"><strong>Extraction explorer</strong><button className="button button--secondary" onClick={this.props.onClose} type="button"><X />Close explorer</button></header>
        <main className="local-admin-content">
          <h2>Reload the explorer</h2>
          <p>The task editor could not load. This can happen when the local CLI was updated while this browser tab was open.</p>
          <button className="button button--primary" onClick={() => window.location.reload()} type="button"><ArrowClockwise />Reload explorer</button>
        </main>
      </section>
    </div>
  }
}

function TaskExtractionLoadingPanel() {
  return (
    <div className="local-admin-backdrop local-task-extraction-backdrop" role="presentation">
      <section aria-label="Loading task extraction" className="local-admin-panel local-task-extraction-panel">
        <div className="local-replay-loading">
          <CircleNotch className="spin" aria-hidden="true" />
          <strong>Loading task editor</strong>
        </div>
      </section>
    </div>
  )
}

function reconcileSessionSummaries(
  current: LocalSessionSummary[],
  next: LocalSessionSummary[],
): LocalSessionSummary[] {
  if (current.length === 0) {
    return next
  }

  const currentById = new Map(current.map((session) => [session.sessionId, session]))
  const reconciled = next.map((session) => {
    const existing = currentById.get(session.sessionId)
    return existing && sessionSummariesEqual(existing, session) ? existing : session
  })
  return current.length === reconciled.length
    && current.every((session, index) => session === reconciled[index])
    ? current
    : reconciled
}

function sessionSummariesEqual(left: LocalSessionSummary, right: LocalSessionSummary): boolean {
  return left.sessionId === right.sessionId
    && left.appId === right.appId
    && left.appName === right.appName
    && left.appIconUrl === right.appIconUrl
    && left.name === right.name
    && left.clientName === right.clientName
    && left.status === right.status
    && left.isConnected === right.isConnected
    && left.isSimulatorOrEmulator === right.isSimulatorOrEmulator
    && left.runtimeDeviceIdentifier === right.runtimeDeviceIdentifier
    && left.runtimePlatform === right.runtimePlatform
    && left.technology === right.technology
    && left.isHistorical === right.isHistorical
    && left.isPinned === right.isPinned
    && left.createdUtc === right.createdUtc
    && left.lastUpdatedUtc === right.lastUpdatedUtc
    && left.logCount === right.logCount
    && left.screenshotCount === right.screenshotCount
    && left.visualTreeSnapshotCount === right.visualTreeSnapshotCount
    && left.artifactSnapshotCount === right.artifactSnapshotCount
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

type LocalWebAnalyticsEvent = {
  kind: 'daily_active' | 'opened' | 'session_viewed' | 'panel_opened'
  isLive?: boolean
  panel?: 'about' | 'account' | 'app_graph' | 'apps' | 'device_location' | 'devices' | 'health' | 'trends' | 'runner' | 'session_admin' | 'settings' | 'test_execution' | 'test_history'
}

type LocalLiveViewMode = 'simulator' | 'playback'

type LocalLiveViewPreference = {
  mode: LocalLiveViewMode
  sessionId: string | null
}


type LocalGlobalPanel = 'about' | 'account' | 'app_graph' | 'apps' | 'devices' | 'health' | 'trends' | 'runner' | 'session_admin' | 'settings' | 'test_execution' | 'test_history' | null


function trackLocalWebEvent(event: LocalWebAnalyticsEvent): void {
  void fetch('api/analytics/events', {
    body: JSON.stringify(event),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => {
    // Analytics failures must never affect the local explorer.
  })
}
