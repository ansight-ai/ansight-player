import { ArrowClockwise, Bug, ChartBar, CheckCircle, CircleNotch, Clock, Code, Coins, FloppyDisk, Play, Robot, Stop, TestTube, Trash, WarningCircle, X, XCircle } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { agentReasoningModes, defaultAgentReasoning, type AgentReasoning } from '../agentReasoning'
import { TypeScriptTaskEditor, type TypeScriptEditorDiagnostics } from './TypeScriptTaskEditor'
import { TestTaskSectionIntake } from './TestTaskSectionIntake'
import { readSessionOperationStream } from './sessionOperationStream'
import type { SessionAnnotation } from '../replay/sessionViewerData'
import type { AppiumScriptExtraction, LocalDeviceInventory, LocalOperationResult, LocalSessionSummary, LocalTaskAuthoringReference, LocalTaskAuthoringReferenceCatalog, LocalTaskExtraction, LocalTaskExtractionCapabilities, LocalTaskExtractionFailureDebugResult, LocalTaskExtractionTrace, LocalTestExecution, MaestroFlowExtraction, WorkspaceTestExtraction } from './types'

type SelectedPeriod = {
  startMs: number
  endMs: number
  focusMs: number
}

type ExtractionFormat = 'ansight' | 'test' | 'maestro' | 'appium'
type ExternalDraftResult = { status: 'passed' | 'failed'; message: string; output: string }
const maximumGenerationNotesCharacters = 4000

export function TaskExtractionPanel({
  initialFormat,
  initialSelectedTaskSectionIds,
  initialSkipTaskSections,
  initialTaskName,
  initialTestAssertions,
  initialGenerationNotes,
  onAnnotateOnReplay,
  onClose,
  onOpenTests,
  period,
  session,
  sessions,
}: {
  initialFormat?: ExtractionFormat
  initialSelectedTaskSectionIds?: string[]
  initialSkipTaskSections?: boolean
  initialTaskName?: string
  initialTestAssertions?: string
  initialGenerationNotes?: string
  onAnnotateOnReplay: (annotationId: string | null, returnTest: { name: string; assertions: string; generationNotes: string; selectedTaskSectionIds: string[]; skipTaskSections: boolean }) => void
  onClose: () => void
  onOpenTests: (appId: string, testId: string) => void
  period: SelectedPeriod
  session: LocalSessionSummary
  sessions: LocalSessionSummary[]
}) {
  const [taskName, setTaskName] = useState(initialTaskName ?? '')
  const [format, setFormat] = useState<ExtractionFormat>(initialFormat ?? 'ansight')
  const [description, setDescription] = useState('')
  const [reasoning, setReasoning] = useState<AgentReasoning>(defaultAgentReasoning)
  const [testReasoning, setTestReasoning] = useState<AgentReasoning>(defaultAgentReasoning)
  const [maestroReasoning, setMaestroReasoning] = useState<AgentReasoning>(defaultAgentReasoning)
  const [validateSelectors, setValidateSelectors] = useState(true)
  const [capabilities, setCapabilities] = useState<LocalTaskExtractionCapabilities | null>(null)
  const [authoringReferences, setAuthoringReferences] = useState<LocalTaskAuthoringReferenceCatalog | null>(null)
  const [extraction, setExtraction] = useState<LocalTaskExtraction | null>(null)
  const [draftSource, setDraftSource] = useState('')
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const [editorDiagnostics, setEditorDiagnostics] = useState<TypeScriptEditorDiagnostics>({ errorCount: 0, isReady: false, warningCount: 0 })
  const [testSessionId, setTestSessionId] = useState('')
  const [testInput, setTestInput] = useState('{}')
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDebugging, setIsDebugging] = useState(false)
  const [debugResult, setDebugResult] = useState<LocalTaskExtractionFailureDebugResult | null>(null)
  const [isTraceOpen, setIsTraceOpen] = useState(false)
  const [maestroDraft, setMaestroDraft] = useState<MaestroFlowExtraction | null>(null)
  const [maestroTitle, setMaestroTitle] = useState('')
  const [maestroSource, setMaestroSource] = useState('')
  const [maestroSavedPath, setMaestroSavedPath] = useState('')
  const [isMaestroBusy, setIsMaestroBusy] = useState(false)
  const [appiumDraft, setAppiumDraft] = useState<AppiumScriptExtraction | null>(null)
  const [appiumTitle, setAppiumTitle] = useState('')
  const [appiumSource, setAppiumSource] = useState('')
  const [appiumSavedPath, setAppiumSavedPath] = useState('')
  const [isAppiumBusy, setIsAppiumBusy] = useState(false)
  const [workspaceTestDraft, setWorkspaceTestDraft] = useState<WorkspaceTestExtraction | null>(null)
  const [testTitle, setTestTitle] = useState('')
  const [testSource, setTestSource] = useState('')
  const [testSavedPath, setTestSavedPath] = useState('')
  const [testAssertions, setTestAssertions] = useState(initialTestAssertions ?? '')
  const [generationNotes, setGenerationNotes] = useState(initialGenerationNotes ?? '')
  const [taskSectionAnnotations, setTaskSectionAnnotations] = useState<SessionAnnotation[]>([])
  const [selectedTaskSectionIds, setSelectedTaskSectionIds] = useState<string[]>([])
  const loadedTaskSectionsForSessionRef = useRef<string | null>(null)
  const [skipTaskSections, setSkipTaskSections] = useState(initialSkipTaskSections ?? false)
  const [isLoadingTaskSections, setIsLoadingTaskSections] = useState(true)
  const [isLoadingTaskDrafts, setIsLoadingTaskDrafts] = useState(true)
  const [isTestDraftBusy, setIsTestDraftBusy] = useState(false)
  const [testGenerationProgress, setTestGenerationProgress] = useState('')
  const [testGenerationStages, setTestGenerationStages] = useState<string[]>([])
  const [testGenerationElapsedSeconds, setTestGenerationElapsedSeconds] = useState(0)
  const [isTestDraftStale, setIsTestDraftStale] = useState(false)
  const [draftRunInventory, setDraftRunInventory] = useState<LocalDeviceInventory | null>(null)
  const [draftRunDeviceKey, setDraftRunDeviceKey] = useState('')
  const [draftRunApplicationPath, setDraftRunApplicationPath] = useState('')
  const [excludedDraftTaskIds, setExcludedDraftTaskIds] = useState<string[]>([])
  const [draftRun, setDraftRun] = useState<LocalTestExecution | null>(null)
  const [isStartingDraftRun, setIsStartingDraftRun] = useState(false)
  const [taskSectionExtractions, setTaskSectionExtractions] = useState<Record<string, LocalTaskExtraction>>({})
  const [previousTaskSectionExtractions, setPreviousTaskSectionExtractions] = useState<Record<string, LocalTaskExtraction>>({})
  const [taskSectionErrors, setTaskSectionErrors] = useState<Record<string, string>>({})
  const [discardedTaskSectionIds, setDiscardedTaskSectionIds] = useState<string[]>([])
  const [startingTaskSectionIds, setStartingTaskSectionIds] = useState<string[]>([])
  const [reviewTaskSectionId, setReviewTaskSectionId] = useState<string | null>(null)
  const [taskEditorStates, setTaskEditorStates] = useState<Record<string, { source: string; isDirty: boolean }>>({})
  const [reviewReturnState, setReviewReturnState] = useState<{
    taskName: string
    description: string
    extraction: LocalTaskExtraction | null
    draftSource: string
    isDraftDirty: boolean
  } | null>(null)
  const [externalValidation, setExternalValidation] = useState<ExternalDraftResult | null>(null)
  const [externalTest, setExternalTest] = useState<ExternalDraftResult | null>(null)
  const [isExternalBusy, setIsExternalBusy] = useState(false)

  const liveTargets = useMemo(
    () => sessions.filter((candidate) => candidate.isConnected && candidate.appId === session.appId),
    [session.appId, sessions],
  )
  const isAgentRunning = extraction?.status === 'queued' || extraction?.status === 'running'
  const isTestRunning = extraction?.testStatus === 'running'
  const isTraceFinalizing = extraction?.trace?.status === 'collecting'
  const isExtractionFormDisabled = isAgentRunning || isTestRunning || isSubmitting
  const canDebugFailure = !!extraction?.testResult && !['passed', 'succeeded'].includes(extraction.testStatus)
  const resolvedTestSessionId = testSessionId && liveTargets.some((candidate) => candidate.sessionId === testSessionId)
    ? testSessionId
    : liveTargets[0]?.sessionId ?? ''
  const selectedLiveTarget = liveTargets.find((target) => target.sessionId === resolvedTestSessionId)
  const externalSource = format === 'maestro' ? maestroSource : format === 'appium' ? appiumSource : testSource
  const externalDraft = format === 'maestro' ? maestroDraft : format === 'appium' ? appiumDraft : workspaceTestDraft
  const externalSavedPath = format === 'maestro' ? maestroSavedPath : format === 'appium' ? appiumSavedPath : testSavedPath
  const isExternalGenerating = format === 'maestro' ? isMaestroBusy : format === 'appium' ? isAppiumBusy : isTestDraftBusy
  const selectedTaskAnnotations = skipTaskSections ? [] : taskSectionAnnotations.filter((annotation) => annotation.annotationId && selectedTaskSectionIds.includes(annotation.annotationId))
  const readyTaskDrafts = selectedTaskAnnotations.map((annotation) => taskSectionExtractions[annotation.annotationId!]).filter((item): item is LocalTaskExtraction => !!item?.draft && item.status === 'ready')
  const includedTaskDrafts = readyTaskDrafts.filter((item) => !excludedDraftTaskIds.includes(item.extractionId))
  const selectedDraftRunDevice = draftRunInventory?.devices.find((device) => `${device.platform}:${device.identifier}` === draftRunDeviceKey)
  const reviewAnnotation = taskSectionAnnotations.find((annotation) => annotation.annotationId === reviewTaskSectionId)
  const visiblePeriod = reviewAnnotation
    ? { startMs: Date.parse(reviewAnnotation.startUtc!), endMs: Date.parse(reviewAnnotation.endUtc!), focusMs: Date.parse(reviewAnnotation.startUtc!) }
    : period

  function clearExternalChecks() {
    setExternalValidation(null)
    setExternalTest(null)
  }

  function markTestDraftStale() {
    if (workspaceTestDraft) setIsTestDraftStale(true)
    clearExternalChecks()
  }

  useEffect(() => {
    if (!workspaceTestDraft) return
    let active = true
    void fetch('api/devices', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Unable to load devices and simulators.')
      return await response.json() as LocalDeviceInventory
    }).then((inventory) => {
      if (!active) return
      setDraftRunInventory(inventory)
      setDraftRunDeviceKey((current) => current || (inventory.devices.find((device) => device.isBooted && device.isAvailable)
        ? `${inventory.devices.find((device) => device.isBooted && device.isAvailable)!.platform}:${inventory.devices.find((device) => device.isBooted && device.isAvailable)!.identifier}` : ''))
    }).catch((error: unknown) => { if (active) setMessage(resolveError(error, 'Unable to load devices and simulators.')) })
    return () => { active = false }
  }, [workspaceTestDraft])

  useEffect(() => {
    if (!draftRun || !['queued', 'running'].includes(draftRun.status)) return
    const interval = window.setInterval(() => {
      void fetch('api/tests/executions', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) return
        const executions = await response.json() as LocalTestExecution[]
        const updated = executions.find((item) => item.executionId === draftRun.executionId)
        if (updated) setDraftRun(updated)
      }).catch(() => undefined)
    }, 900)
    return () => window.clearInterval(interval)
  }, [draftRun])

  const applyExtraction = useCallback((nextExtraction: LocalTaskExtraction) => {
    setExtraction(nextExtraction)
    if (nextExtraction.draft) {
      setDraftSource(nextExtraction.draft.source)
      setIsDraftDirty(false)
    } else {
      setDraftSource('')
      setIsDraftDirty(false)
    }
  }, [])

  const loadCapabilities = useCallback(async () => {
    try {
      const response = await fetch('api/task-extractions/capabilities', { cache: 'no-store' })
      const body = await response.json() as LocalTaskExtractionCapabilities | LocalOperationResult
      if (!response.ok || !('supportsHosted' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setCapabilities(body)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to load task extraction capabilities.'))
    }
  }, [])

  const loadAuthoringReferences = useCallback(async () => {
    try {
      const response = await fetch(
        `api/task-extractions/references?sessionId=${encodeURIComponent(session.sessionId)}`,
        { cache: 'no-store' },
      )
      const body = await response.json() as LocalTaskAuthoringReferenceCatalog | LocalOperationResult
      if (!response.ok || !('references' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      setAuthoringReferences(body)
    } catch (error) {
      setAuthoringReferences({
        schema: 'ansight.local-task-authoring-references/v1',
        sessionId: session.sessionId,
        isLive: session.isConnected,
        references: [],
        supportModules: [],
        message: resolveError(error, 'Unable to load app-tool references.'),
      })
    }
  }, [session.isConnected, session.sessionId])

  const refreshExtraction = useCallback(async (extractionId: string) => {
    try {
      const response = await fetch(`api/task-extractions/${encodeURIComponent(extractionId)}`, { cache: 'no-store' })
      const body = await response.json() as LocalTaskExtraction | LocalOperationResult
      if (!response.ok || !('extractionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      applyExtraction(body)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to refresh task extraction progress.'))
    }
  }, [applyExtraction])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCapabilities()
      void loadAuthoringReferences()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadAuthoringReferences, loadCapabilities])

  useEffect(() => {
    if (format !== 'test' || loadedTaskSectionsForSessionRef.current === session.sessionId) return undefined
    let active = true
    async function loadTaskSections() {
      setIsLoadingTaskSections(true)
      try {
        const response = await fetch(`api/sessions/${encodeURIComponent(session.sessionId)}/annotations`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const annotations = (await response.json() as SessionAnnotation[])
          .filter((annotation) => {
            const start = Date.parse(annotation.startUtc ?? '')
            const end = Date.parse(annotation.endUtc ?? '')
            return !!annotation.annotationId && !!annotation.label?.trim()
              && Number.isFinite(start) && Number.isFinite(end)
              && start >= period.startMs && end <= period.endMs && end > start
          })
          .sort((left, right) => Date.parse(left.startUtc ?? '') - Date.parse(right.startUtc ?? ''))
        if (!active) return
        loadedTaskSectionsForSessionRef.current = session.sessionId
        setTaskSectionAnnotations(annotations)
        const availableIds = annotations.map((annotation) => annotation.annotationId!)
        setSelectedTaskSectionIds(initialSelectedTaskSectionIds
          ? initialSelectedTaskSectionIds.filter((id) => availableIds.includes(id))
          : availableIds)
      } catch (error) {
        if (active) setMessage(resolveError(error, 'Unable to load range annotations.'))
      } finally {
        if (active) setIsLoadingTaskSections(false)
      }
    }
    void loadTaskSections()
    return () => { active = false }
  }, [format, initialSelectedTaskSectionIds, period.endMs, period.startMs, session.sessionId])

  useEffect(() => {
    if (format !== 'test' || isLoadingTaskSections) return undefined
    let active = true
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('api/task-extractions', { cache: 'no-store' })
          if (!response.ok) return
          const existing = await response.json() as LocalTaskExtraction[]
          if (!active || !Array.isArray(existing)) return
          const restored: Record<string, LocalTaskExtraction> = {}
          for (const annotation of taskSectionAnnotations) {
            const matching = existing
              .filter((item) => item.sessionId === session.sessionId
                && Date.parse(item.startUtc) === Date.parse(annotation.startUtc ?? '')
                && Date.parse(item.endUtc) === Date.parse(annotation.endUtc ?? ''))
              .sort((left, right) => Date.parse(right.createdAtUtc) - Date.parse(left.createdAtUtc))
            const latest = matching[0]
            const preferred = latest?.status === 'failed' || latest?.status === 'cancelled'
              ? matching.find((item) => item.status === 'ready' && !!item.draft) ?? latest
              : latest
            if (annotation.annotationId && preferred) restored[annotation.annotationId] = preferred
          }
          setTaskSectionExtractions((current) => ({ ...restored, ...current }))
        } catch {
          // Draft restoration is best effort; generation can proceed without it.
        } finally {
          if (active) setIsLoadingTaskDrafts(false)
        }
      })()
    }, 0)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [format, isLoadingTaskSections, session.sessionId, taskSectionAnnotations])

  useEffect(() => {
    if (!extraction || (!isAgentRunning && !isTestRunning && !isTraceFinalizing)) return undefined
    const interval = window.setInterval(() => void refreshExtraction(extraction.extractionId), 700)
    return () => window.clearInterval(interval)
  }, [extraction, isAgentRunning, isTestRunning, isTraceFinalizing, refreshExtraction])

  useEffect(() => {
    if (!isTestDraftBusy) return undefined
    const startedAt = Date.now()
    const interval = window.setInterval(() => setTestGenerationElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(interval)
  }, [isTestDraftBusy])

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      if (isTraceOpen) setIsTraceOpen(false)
      else if (reviewTaskSectionId) leaveTaskReview()
      else onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  })

  useEffect(() => {
    const running = Object.entries(taskSectionExtractions).filter(([, item]) => item.status === 'queued' || item.status === 'running')
    if (running.length === 0) return undefined
    const interval = window.setInterval(() => {
      for (const [annotationId, item] of running) void refreshTaskSectionExtraction(annotationId, item)
    }, 900)
    return () => window.clearInterval(interval)
  }, [taskSectionExtractions])

  async function refreshTaskSectionExtraction(annotationId: string, item: LocalTaskExtraction) {
    try {
      const response = await fetch(`api/task-extractions/${encodeURIComponent(item.extractionId)}`, { cache: 'no-store' })
      const body = await response.json() as LocalTaskExtraction | LocalOperationResult
      if (!response.ok || !('extractionId' in body)) return
      setTaskSectionExtractions((current) => ({ ...current, [annotationId]: body }))
      if (body.status === 'ready') {
        setPreviousTaskSectionExtractions((current) => { const next = { ...current }; delete next[annotationId]; return next })
      }
    } catch {
      // Keep the last known state through transient polling failures.
    }
  }

  function openTaskReview(annotationId: string) {
    if (reviewTaskSectionId === annotationId) return
    const taskExtraction = taskSectionExtractions[annotationId]
    if (!taskExtraction) return
    if (!reviewTaskSectionId) setReviewReturnState({ taskName, description, extraction, draftSource, isDraftDirty })
    else {
      if (extraction) void refreshTaskSectionExtraction(reviewTaskSectionId, extraction)
      setTaskEditorStates((current) => ({ ...current, [reviewTaskSectionId]: { source: draftSource, isDirty: isDraftDirty } }))
    }
    setReviewTaskSectionId(annotationId)
    setFormat('ansight')
    setTaskName(taskExtraction.taskName)
    setDescription(taskExtraction.description)
    applyExtraction(taskExtraction)
    const savedEditor = taskEditorStates[annotationId]
    if (savedEditor) {
      setDraftSource(savedEditor.source)
      setIsDraftDirty(savedEditor.isDirty)
    }
    setMessage(null)
  }

  function leaveTaskReview(discarded = false) {
    if (!reviewTaskSectionId) return
    const taskExtraction = extraction ?? taskSectionExtractions[reviewTaskSectionId]
    if (!discarded && taskExtraction) void refreshTaskSectionExtraction(reviewTaskSectionId, taskExtraction)
    if (!discarded) setTaskEditorStates((current) => ({ ...current, [reviewTaskSectionId]: { source: draftSource, isDirty: isDraftDirty } }))
    setReviewTaskSectionId(null)
    setFormat('test')
    setTaskName(reviewReturnState?.taskName ?? '')
    setDescription(reviewReturnState?.description ?? '')
    setExtraction(reviewReturnState?.extraction ?? null)
    setDraftSource(reviewReturnState?.draftSource ?? '')
    setIsDraftDirty(reviewReturnState?.isDraftDirty ?? false)
    setReviewReturnState(null)
    setMessage(null)
  }

  async function startAnnotatedTask(annotation: SessionAnnotation, replaceExtractionId?: string) {
    const annotationId = annotation.annotationId!
    setStartingTaskSectionIds((current) => [...current, annotationId])
    setTestGenerationProgress(`Starting task extraction: ${annotation.label}…`)
    try {
      const response = await fetch('api/task-extractions/start', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: annotation.startUtc,
          endUtc: annotation.endUtc,
          description: [annotation.label!.trim(), annotation.notes?.trim()].filter(Boolean).join('\n'),
          reasoning: testReasoning,
          validateSelectors: true,
          replaceExtractionId,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalTaskExtraction | LocalOperationResult
      if (!response.ok || !('extractionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      if (replaceExtractionId) {
        const previous = taskSectionExtractions[annotationId]
        if (previous) setPreviousTaskSectionExtractions((current) => ({ ...current, [annotationId]: previous }))
      }
      setTaskSectionExtractions((current) => ({ ...current, [annotationId]: body }))
      setTaskSectionErrors((current) => { const next = { ...current }; delete next[annotationId]; return next })
      setDiscardedTaskSectionIds((current) => current.filter((id) => id !== annotationId))
    } catch (error) {
      setTaskSectionErrors((current) => ({ ...current, [annotationId]: resolveError(error, 'Unable to start task extraction.') }))
    } finally {
      setStartingTaskSectionIds((current) => current.filter((id) => id !== annotationId))
    }
  }

  async function startAnnotatedTasks() {
    for (const annotation of selectedTaskAnnotations) {
      const current = taskSectionExtractions[annotation.annotationId!]
      if (current && current.status !== 'failed' && current.status !== 'cancelled') continue
      await startAnnotatedTask(annotation)
    }
  }

  function extractAnnotatedTask(section: { period: SelectedPeriod; name: string }) {
    const annotation = taskSectionAnnotations.find((item) => item.label?.trim() === section.name
      && Date.parse(item.startUtc ?? '') === section.period.startMs
      && Date.parse(item.endUtc ?? '') === section.period.endMs)
    if (!annotation?.annotationId) return
    if (!selectedTaskSectionIds.includes(annotation.annotationId) || skipTaskSections) {
      setSelectedTaskSectionIds((current) => [...new Set([...current, annotation.annotationId!])])
      setSkipTaskSections(false)
      markTestDraftStale()
    }
    if (taskSectionExtractions[annotation.annotationId]) openTaskReview(annotation.annotationId)
    else void startAnnotatedTask(annotation)
  }

  async function startExtraction() {
    if (!description.trim() || isSubmitting || isAgentRunning || isTestRunning) return
    setIsSubmitting(true)
    setMessage(null)
    setDebugResult(null)
    setIsTraceOpen(false)
    try {
      const response = await fetch('api/task-extractions/start', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(visiblePeriod.startMs).toISOString(),
          endUtc: new Date(visiblePeriod.endMs).toISOString(),
          taskName: reviewTaskSectionId && extraction && taskName.trim() === extraction.taskName ? null : taskName.trim() || null,
          description: description.trim(),
          reasoning,
          validateSelectors,
          replaceExtractionId: extraction?.draft && extraction.status !== 'committed' ? extraction.extractionId : undefined,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalTaskExtraction | LocalOperationResult
      if (!response.ok || !('extractionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      applyExtraction(body)
      if (reviewTaskSectionId) {
        if (extraction?.draft) setPreviousTaskSectionExtractions((current) => ({ ...current, [reviewTaskSectionId]: extraction }))
        setTaskSectionExtractions((current) => ({ ...current, [reviewTaskSectionId]: body }))
        setTaskEditorStates((current) => { const next = { ...current }; delete next[reviewTaskSectionId]; return next })
      }
      setMessage(body.message)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to start task extraction.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function previewMaestro() {
    if (isMaestroBusy) return
    setIsMaestroBusy(true)
    setMessage(null)
    clearExternalChecks()
    setMaestroSavedPath('')
    try {
      const title = taskName.trim() || session.name || `Recorded ${session.appId} workflow`
      const response = await fetch('api/task-extractions/maestro-preview', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(period.startMs).toISOString(),
          endUtc: new Date(period.endMs).toISOString(),
          title,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as MaestroFlowExtraction | LocalOperationResult
      if (!response.ok || !('source' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setMaestroDraft(body)
      setMaestroTitle(title)
      setMaestroSource(body.source)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to generate Maestro flow.'))
    } finally {
      setIsMaestroBusy(false)
    }
  }

  async function saveMaestro() {
    if (!maestroDraft || !maestroSource.trim() || isMaestroBusy) return
    setIsMaestroBusy(true)
    setMessage(null)
    try {
      const response = await fetch('api/task-extractions/maestro-save', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(period.startMs).toISOString(),
          endUtc: new Date(period.endMs).toISOString(),
          title: maestroTitle,
          source: maestroSource,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as { filePath: string } | LocalOperationResult
      if (!response.ok || !('filePath' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setMaestroSavedPath(body.filePath)
      setMessage(`Saved Maestro flow to ${body.filePath}`)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to save Maestro flow.'))
    } finally {
      setIsMaestroBusy(false)
    }
  }

  async function refineMaestro() {
    if (!maestroDraft || !maestroSource.trim() || isMaestroBusy) return
    setIsMaestroBusy(true)
    setMessage(null)
    clearExternalChecks()
    try {
      const response = await fetch('api/task-extractions/maestro-refine', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(period.startMs).toISOString(),
          endUtc: new Date(period.endMs).toISOString(),
          title: maestroTitle,
          source: maestroSource,
          reasoning: maestroReasoning,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as { source: string; model: string } | LocalOperationResult
      if (!response.ok || !('source' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setMaestroSource(body.source)
      setMaestroSavedPath('')
      setMessage(`Maestro draft refined with ${body.model}. Review it before saving.`)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to refine Maestro flow.'))
    } finally {
      setIsMaestroBusy(false)
    }
  }

  function downloadMaestro() {
    if (!maestroDraft || !maestroSource.trim()) return
    const url = URL.createObjectURL(new Blob([maestroSource], { type: 'application/yaml;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${maestroDraft.suggestedName}.yaml`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function previewAppium() {
    if (isAppiumBusy) return
    setIsAppiumBusy(true)
    setMessage(null)
    clearExternalChecks()
    setAppiumSavedPath('')
    try {
      const title = taskName.trim() || session.name || `Recorded ${session.appId} workflow`
      const response = await fetch('api/task-extractions/appium-preview', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(period.startMs).toISOString(),
          endUtc: new Date(period.endMs).toISOString(),
          title,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as AppiumScriptExtraction | LocalOperationResult
      if (!response.ok || !('source' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setAppiumDraft(body)
      setAppiumTitle(title)
      setAppiumSource(body.source)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to generate Appium script.'))
    } finally {
      setIsAppiumBusy(false)
    }
  }

  async function saveAppium() {
    if (!appiumDraft || !appiumSource.trim() || isAppiumBusy) return
    setIsAppiumBusy(true)
    setMessage(null)
    try {
      const response = await fetch('api/task-extractions/appium-save', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(period.startMs).toISOString(),
          endUtc: new Date(period.endMs).toISOString(),
          title: appiumTitle,
          source: appiumSource,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as { filePath: string } | LocalOperationResult
      if (!response.ok || !('filePath' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setAppiumSavedPath(body.filePath)
      setMessage(`Saved Appium script to ${body.filePath}`)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to save Appium script.'))
    } finally {
      setIsAppiumBusy(false)
    }
  }

  function downloadAppium() {
    if (!appiumDraft || !appiumSource.trim()) return
    const url = URL.createObjectURL(new Blob([appiumSource], { type: 'text/javascript;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${appiumDraft.suggestedName}.test.mjs`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function previewTest() {
    if (isTestDraftBusy || isLoadingTaskSections || isLoadingTaskDrafts || (!skipTaskSections && selectedTaskSectionIds.length === 0)) return
    setIsTestDraftBusy(true)
    setTestGenerationProgress('Reading the selected replay…')
    setTestGenerationStages(['Reading the selected replay…'])
    setTestGenerationElapsedSeconds(0)
    setMessage(null)
    clearExternalChecks()
    setTestSavedPath('')
    setDraftRun(null)
    try {
      const title = taskName.trim() || session.name || `Recorded ${session.appId} workflow`
      const response = await fetch('api/task-extractions/test-preview', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(period.startMs).toISOString(),
          endUtc: new Date(period.endMs).toISOString(),
          title,
          hasExplicitTitle: !!taskName.trim(),
          assertions: testAssertions.split('\n').map((item) => item.trim()).filter(Boolean),
          taskSectionIds: skipTaskSections ? [] : selectedTaskSectionIds,
          reasoning: testReasoning,
          generationNotes: generationNotes.trim(),
        }),
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        method: 'POST',
      })
      const body = response.headers.get('Content-Type')?.includes('application/x-ndjson')
        ? await readSessionOperationStream<WorkspaceTestExtraction>(response, (progress) => {
          setTestGenerationProgress(progress.message)
          setTestGenerationStages((current) => current.at(-1) === progress.message ? current : [...current, progress.message])
        })
        : await response.json() as WorkspaceTestExtraction | LocalOperationResult
      if (!response.ok || !('source' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setWorkspaceTestDraft(body)
      setTestTitle(body.testName || title)
      setTaskName(body.testName || title)
      setTestSource(body.source)
      setIsTestDraftStale(false)
      await startAnnotatedTasks()
    } catch (error) {
      setMessage(resolveError(error, 'Unable to generate Ansight test.'))
    } finally {
      setIsTestDraftBusy(false)
    }
  }

  async function saveTest() {
    if (!workspaceTestDraft || !testSource.trim() || isTestDraftBusy || isTestDraftStale) return
    setIsTestDraftBusy(true)
    setMessage(null)
    try {
      const response = await fetch('api/task-extractions/test-save', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(period.startMs).toISOString(),
          endUtc: new Date(period.endMs).toISOString(),
          title: testTitle,
          source: testSource,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as { filePath: string } | LocalOperationResult
      if (!response.ok || !('filePath' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setTestSavedPath(body.filePath)
      setMessage(`Saved Ansight test to ${body.filePath}`)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to save Ansight test.'))
    } finally {
      setIsTestDraftBusy(false)
    }
  }

  async function runDraftTest() {
    if (!workspaceTestDraft || !testSource.trim() || isTestDraftStale || externalValidation?.status !== 'passed' || !selectedDraftRunDevice?.isAvailable || isStartingDraftRun) return
    setIsStartingDraftRun(true)
    setMessage(null)
    setDraftRun(null)
    try {
      const response = await fetch('api/task-extractions/test-draft-run', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(period.startMs).toISOString(),
          endUtc: new Date(period.endMs).toISOString(),
          source: testSource,
          taskSectionIds: skipTaskSections ? [] : selectedTaskSectionIds,
          taskExtractionIds: includedTaskDrafts.map((item) => item.extractionId),
          platform: selectedDraftRunDevice.platform,
          deviceIdentifier: selectedDraftRunDevice.identifier,
          deviceKind: selectedDraftRunDevice.kind,
          applicationPath: draftRunApplicationPath.trim() || null,
          reasoning: testReasoning,
          captureTrace: true,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalTestExecution | LocalOperationResult
      if (!response.ok || !('executionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      setDraftRun(body)
      setMessage(`Draft test started on ${selectedDraftRunDevice.name}.`)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to start draft test.'))
    } finally {
      setIsStartingDraftRun(false)
    }
  }

  function downloadTest() {
    if (!workspaceTestDraft || !testSource.trim() || isTestDraftStale) return
    const url = URL.createObjectURL(new Blob([testSource], { type: 'application/yaml;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${workspaceTestDraft.suggestedName}.yaml`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function reviewExternalDraft(play: boolean) {
    if (!externalSource.trim() || isExternalBusy || isExternalGenerating || (format === 'test' && isTestDraftStale)) return
    if (play && (externalValidation?.status !== 'passed' || !selectedLiveTarget?.runtimeDeviceIdentifier)) return
    setIsExternalBusy(true)
    setMessage(null)
    if (play) setExternalTest(null)
    else { setExternalValidation(null); setExternalTest(null) }
    try {
      const response = await fetch(format === 'test' ? 'api/task-extractions/test-validate' : `api/task-extractions/external-${play ? 'test' : 'validate'}`, {
        body: JSON.stringify({
          sessionId: session.sessionId,
          title: testTitle,
          format,
          source: externalSource,
          deviceId: play ? selectedLiveTarget?.runtimeDeviceIdentifier : null,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as ExternalDraftResult | LocalOperationResult
      if (!response.ok || !('status' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      if (play) setExternalTest(body)
      else setExternalValidation(body)
    } catch (error) {
      const result: ExternalDraftResult = { status: 'failed', message: resolveError(error, play ? 'Unable to play the draft.' : 'Unable to validate the draft.'), output: '' }
      if (play) setExternalTest(result)
      else setExternalValidation(result)
    } finally {
      setIsExternalBusy(false)
    }
  }

  async function syncDraft(): Promise<LocalTaskExtraction> {
    if (!extraction?.draft) throw new Error('Wait for the agent to produce a task draft.')
    if (!editorDiagnostics.isReady) throw new Error('Wait for the TypeScript compiler to finish checking the draft.')
    if (editorDiagnostics.errorCount > 0) {
      throw new Error(`Resolve ${editorDiagnostics.errorCount} TypeScript error${editorDiagnostics.errorCount === 1 ? '' : 's'} before validating the draft.`)
    }
    if (!isDraftDirty && extraction.status !== 'needsReview') return extraction

    const response = await fetch(`api/task-extractions/${encodeURIComponent(extraction.extractionId)}/draft`, {
      body: JSON.stringify({ source: draftSource }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const body = await response.json() as LocalTaskExtraction | LocalOperationResult
    if (!response.ok || !('extractionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
    applyExtraction(body)
    setDebugResult(null)
    return body
  }

  async function validateDraft() {
    if (!extraction?.draft || isSubmitting) return
    setIsSubmitting(true)
    setMessage(null)
    setDebugResult(null)
    try {
      const validated = await syncDraft()
      setMessage(validated.status === 'ready' || validated.status === 'committed'
        ? 'The TypeScript draft passed semantic and repository static validation.'
        : validated.message)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to validate the task draft.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function debugFailure() {
    if (!extraction || !canDebugFailure || isDebugging) return
    setIsDebugging(true)
    setMessage(null)
    try {
      const response = await fetch(`api/task-extractions/${encodeURIComponent(extraction.extractionId)}/debug`, {
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalTaskExtractionFailureDebugResult | LocalOperationResult
      if (!response.ok || !('failureKind' in body)) {
        throw new Error(('message' in body && body.message) || `HTTP ${response.status}`)
      }
      setDebugResult(body)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to debug the failed task run.'))
    } finally {
      setIsDebugging(false)
    }
  }

  async function testDraft() {
    if (!extraction || !resolvedTestSessionId || isSubmitting) return
    setIsSubmitting(true)
    setMessage(null)
    setDebugResult(null)
    try {
      const validated = await syncDraft()
      if (validated.status !== 'ready' && validated.status !== 'committed') {
        throw new Error(validated.message)
      }
      let input: unknown
      try {
        input = JSON.parse(testInput)
      } catch {
        throw new Error('Test input must be valid JSON.')
      }
      if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Test input must be a JSON object.')
      const response = await fetch(`api/task-extractions/${encodeURIComponent(extraction.extractionId)}/test`, {
        body: JSON.stringify({ sessionId: resolvedTestSessionId, input }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalTaskExtraction | LocalOperationResult
      if (!response.ok || !('extractionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      applyExtraction(body)
      setMessage('Draft test started. The connected app may change while the task runs.')
    } catch (error) {
      setMessage(resolveError(error, 'Unable to test the task draft.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function commitDraft() {
    if (!extraction || isSubmitting) return
    setIsSubmitting(true)
    setMessage(null)
    try {
      const validated = await syncDraft()
      if (validated.status === 'committed') return
      if (validated.status !== 'ready') throw new Error(validated.message)
      const response = await fetch(`api/task-extractions/${encodeURIComponent(extraction.extractionId)}/commit`, {
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalTaskExtraction | LocalOperationResult
      if (!response.ok || !('extractionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      applyExtraction(body)
      setMessage(body.message)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to save the task draft.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function cancelExtraction() {
    if (!extraction) return
    const response = await fetch(`api/task-extractions/${encodeURIComponent(extraction.extractionId)}/cancel`, {
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const body = await response.json() as LocalTaskExtraction | LocalOperationResult
    if ('extractionId' in body) applyExtraction(body)
    setMessage(body.message)
  }

  async function discardTaskDraft(annotationId: string | null, target: LocalTaskExtraction) {
    if (isSubmitting || target.status === 'queued' || target.status === 'running' || target.testStatus === 'running') return
    setIsSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch(`api/task-extractions/${encodeURIComponent(target.extractionId)}/discard`, {
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalOperationResult
      if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`)
      if (annotationId) {
        const previous = previousTaskSectionExtractions[annotationId]
        setTaskSectionExtractions((current) => {
          const next = { ...current }
          if (previous && target.status !== 'ready') next[annotationId] = previous
          else delete next[annotationId]
          return next
        })
        setDiscardedTaskSectionIds((current) => current.includes(annotationId) ? current : [...current, annotationId])
        setTaskEditorStates((current) => { const next = { ...current }; delete next[annotationId]; return next })
        setPreviousTaskSectionExtractions((current) => { const next = { ...current }; delete next[annotationId]; return next })
        if (reviewTaskSectionId === annotationId) leaveTaskReview(true)
      } else {
        setExtraction(null)
        setDraftSource('')
        setIsDraftDirty(false)
      }
      setMessage(annotationId && previousTaskSectionExtractions[annotationId] && target.status !== 'ready'
        ? 'Task draft discarded. The previous draft is available again.'
        : 'Task draft discarded. Select Extract task to generate it again.')
    } catch (error) {
      setMessage(resolveError(error, 'Unable to discard task draft.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function restorePreviousDraft(annotationId: string) {
    const previous = previousTaskSectionExtractions[annotationId]
    if (!previous) return
    setTaskSectionExtractions((current) => ({ ...current, [annotationId]: previous }))
    setPreviousTaskSectionExtractions((current) => { const next = { ...current }; delete next[annotationId]; return next })
    if (reviewTaskSectionId === annotationId) applyExtraction(previous)
    setMessage('Previous draft restored after regeneration failed.')
  }

  return (
    <div className="local-admin-backdrop local-task-extraction-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !isSubmitting) onClose() }}>
      <section aria-label="Extraction explorer" className="local-admin-panel local-task-extraction-panel">
        <header className="local-admin-header">
          <div>
            <p className="eyebrow">Extraction explorer</p>
            <span>{reviewAnnotation ? `${reviewAnnotation.label} · ` : ''}{formatDate(visiblePeriod.startMs)} – {formatDate(visiblePeriod.endMs)} · {formatDuration(visiblePeriod.endMs - visiblePeriod.startMs)}</span>
          </div>
          <div className="local-admin-actions">
            {reviewTaskSectionId ? <button className="button button--secondary" onClick={() => leaveTaskReview()} type="button">Back to test draft</button> : null}
            <button aria-label="Close extraction explorer" className="button button--secondary" onClick={onClose} type="button"><X />Close explorer</button>
          </div>
        </header>

        {message ? <p className="inline-message local-admin-message">{message}</p> : null}

        {!reviewTaskSectionId && !(
          format === 'ansight' ? extraction || isSubmitting
            : format === 'test' ? isTestDraftBusy || workspaceTestDraft || startingTaskSectionIds.length > 0 || Object.keys(taskSectionExtractions).length > 0
              : format === 'maestro' ? isMaestroBusy || maestroDraft
                : isAppiumBusy || appiumDraft
        ) ? <nav aria-label="Extraction format" className="local-task-extraction-formats">
          {(['ansight', 'test', 'maestro', 'appium'] as const).map((option) => (
            <button
              aria-pressed={format === option}
              className={format === option ? 'is-selected' : ''}
              disabled={isExternalBusy || isExternalGenerating || isSubmitting}
              key={option}
              onClick={() => { setFormat(option); clearExternalChecks() }}
              type="button"
            >
              <strong>{option === 'ansight' ? 'Ansight task' : option === 'test' ? 'Ansight test' : option === 'maestro' ? 'Maestro flow' : 'Appium test'}</strong>
              <small>{option === 'ansight' ? 'Agent authored TypeScript' : option === 'test' ? 'Journey and assertions in YAML' : option === 'maestro' ? 'Mobile YAML flow' : 'WebdriverIO JavaScript'}</small>
            </button>
          ))}
        </nav> : null}

        {(format === 'test' || reviewTaskSectionId) && selectedTaskAnnotations.length > 0 ? (
          <nav aria-label="Generated test and task drafts" className="local-extraction-draft-tabs">
            <button aria-current={!reviewTaskSectionId ? 'page' : undefined} className={!reviewTaskSectionId ? 'is-selected' : ''} onClick={() => { if (reviewTaskSectionId) leaveTaskReview(); else setFormat('test') }} type="button"><TestTube />Test draft</button>
            {selectedTaskAnnotations.map((annotation) => {
              const annotationId = annotation.annotationId!
              const taskExtraction = taskSectionExtractions[annotationId]
              return <button aria-current={reviewTaskSectionId === annotationId ? 'page' : undefined} className={`local-extraction-task-tab${reviewTaskSectionId === annotationId ? ' is-selected' : ''}`} disabled={!taskExtraction} key={annotationId} onClick={() => openTaskReview(annotationId)} title={taskExtraction?.taskName ?? annotation.label} type="button"><Robot /><span><strong>{taskExtraction?.taskName ?? annotation.label}</strong><small>{taskExtraction?.draft ? 'Draft ready' : taskExtraction?.status ?? (discardedTaskSectionIds.includes(annotationId) ? 'Draft discarded' : 'No draft yet')}</small></span></button>
            })}
          </nav>
        ) : null}

        <div className={`local-task-extraction-grid${format === 'test' && !workspaceTestDraft ? ' local-task-extraction-grid--test-intake' : ''}`}>
          <main className="local-admin-content">
            {format === 'ansight' ? (
            <section className="local-admin-section">
              <div className="local-admin-section-heading">
                <div><Robot /><span><strong>1. Describe Ansight task</strong><small>Tell the agent what reusable task this period represents</small></span></div>
              </div>
              <div className="local-admin-form local-task-extraction-form">
                <label className="local-admin-form--wide" htmlFor="local-task-extraction-name">Task name (optional)
                  <input
                    disabled={isExtractionFormDisabled}
                    id="local-task-extraction-name"
                    maxLength={200}
                    onChange={(event) => setTaskName(event.target.value)}
                    placeholder="Derived from the extraction instructions when blank"
                    type="text"
                    value={taskName}
                  />
                </label>
                <div className="local-task-reference-field local-admin-form--wide">
                  <label htmlFor="local-task-extraction-description">What should the agent extract?</label>
                  <TaskReferenceTextarea
                    disabled={isExtractionFormDisabled}
                    onChange={setDescription}
                    references={authoringReferences?.references ?? []}
                    value={description}
                  />
                  <small>{authoringReferences === null
                    ? 'Loading app tools…'
                    : authoringReferences.references.length > 0
                      ? `Type @ to reference ${authoringReferences.isLive ? 'a current' : 'a recorded'} device tool or artifact.`
                      : authoringReferences.message}</small>
                </div>
                <label>Reasoning mode
                  <select disabled={isExtractionFormDisabled} onChange={(event) => setReasoning(event.target.value as AgentReasoning)} value={reasoning}>
                    {agentReasoningModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                </label>
                <label className="local-task-extraction-grounding local-admin-form--wide">
                  <input checked={validateSelectors} disabled={isExtractionFormDisabled} onChange={(event) => setValidateSelectors(event.target.checked)} type="checkbox" />
                  <span><strong>Require recorded selectors</strong><small>Reject literal UI selectors unless they appear in a selected visual tree or retained screenshot OCR.</small></span>
                </label>
                {capabilities && !capabilities.canUseModel ? (
                  <p className="local-task-extraction-hint local-admin-form--wide"><WarningCircle />Set OPENAI_API_KEY before starting the host to use your own model account. Ansight-hosted AI is available with ANSIGHT_AI_TRANSPORT=cloud and cloud login.</p>
                ) : null}
                <p className="local-task-extraction-hint local-admin-form--wide">Deeper reasoning may take longer and cost more with your model provider.</p>
              </div>
              {!isAgentRunning ? (
                <div className="local-admin-actions">
                  <button className="button button--primary" disabled={!description.trim() || isExtractionFormDisabled || !capabilities?.canUseModel || extraction?.status === 'committed'} onClick={() => void startExtraction()} type="button">
                    {isSubmitting ? <CircleNotch className="spin" /> : extraction ? <ArrowClockwise /> : <Robot />}{extraction ? 'Regenerate with AI' : 'Start agent extraction'}
                  </button>
                  {extraction?.draft && extraction.status !== 'committed' ? <button className="button button--danger" disabled={isSubmitting || isTestRunning} onClick={() => void discardTaskDraft(reviewTaskSectionId, extraction)} type="button"><Trash />Discard draft</button> : null}
                </div>
              ) : null}
            </section>
            ) : (
              <section className="local-admin-section local-external-extraction-form">
                {format === 'test' ? <TestTaskSectionIntake
                  annotations={taskSectionAnnotations}
                  isLoading={isLoadingTaskSections}
                  onAddAnnotation={() => onAnnotateOnReplay(null, { name: taskName, assertions: testAssertions, generationNotes, selectedTaskSectionIds, skipTaskSections })}
                  onEditAnnotation={(annotationId) => onAnnotateOnReplay(annotationId, { name: taskName, assertions: testAssertions, generationNotes, selectedTaskSectionIds, skipTaskSections })}
                  onExtractTask={extractAnnotatedTask}
                  onSelectedIdsChange={(ids) => { setSelectedTaskSectionIds(ids); markTestDraftStale() }}
                  onSkipChange={(skip) => { setSkipTaskSections(skip); markTestDraftStale() }}
                  selectedIds={selectedTaskSectionIds}
                  skip={skipTaskSections}
                /> : null}
                <div className="local-admin-section-heading"><div><Code /><span><strong>{format === 'test' ? '' : '1. '}Generate {format === 'test' ? 'Ansight test' : format === 'maestro' ? 'Maestro flow' : 'Appium test'}</strong><small>Use the interactions in this timeline period</small></span></div></div>
                <label htmlFor="local-external-task-name">Name
                  <input id="local-external-task-name" maxLength={200} onChange={(event) => { setTaskName(event.target.value); if (format === 'test') markTestDraftStale() }} placeholder={format === 'test' ? 'AI will name the test from the selected journey' : session.name || `Recorded ${session.appId} workflow`} type="text" value={taskName} />
                </label>
                {format === 'test' ? <label htmlFor="local-test-assertions">Expected final-state assertions (one per line)
                  <textarea id="local-test-assertions" onChange={(event) => setTestAssertions(event.target.value)} placeholder="The confirmation screen is visible" rows={3} value={testAssertions} />
                  <small>Leave blank for AI to suggest an observable result from the selected replay.</small>
                </label> : null}
                {format === 'test' ? <label htmlFor="local-test-generation-notes">Generation notes
                  <textarea id="local-test-generation-notes" maxLength={maximumGenerationNotesCharacters} onChange={(event) => setGenerationNotes(event.target.value)} placeholder="For example: Start from the Explore tab, use the location name shown in the recording, and verify the clipboard confirmation." rows={3} value={generationNotes} />
                  <small>Optional. Describe the starting state, test values, important steps, or expected outcome.</small>
                </label> : null}
                {format === 'test' ? <label>AI reasoning mode
                  <select disabled={isTestDraftBusy} onChange={(event) => setTestReasoning(event.target.value as AgentReasoning)} value={testReasoning}>
                    {agentReasoningModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                </label> : null}
                {format === 'test' && capabilities && !capabilities.canUseModel ? <p className="local-task-extraction-hint"><WarningCircle />AI test generation needs a configured model provider.</p> : null}
                {format === 'test' && selectedTaskAnnotations.length > 0 ? <p className="local-task-extraction-hint">Generate with AI creates one YAML test draft and starts {selectedTaskAnnotations.length} separate AI task extraction{selectedTaskAnnotations.length === 1 ? '' : 's'} from the selected annotations.</p> : null}
                <div className="local-admin-actions">
                  <button className="button button--primary" disabled={isExternalGenerating || isExternalBusy || (format === 'test' && (!capabilities?.canUseModel || isLoadingTaskSections || isLoadingTaskDrafts || (!skipTaskSections && selectedTaskSectionIds.length === 0)))} onClick={() => void (format === 'test' ? previewTest() : format === 'maestro' ? previewMaestro() : previewAppium())} type="button">
                    {isExternalGenerating ? <CircleNotch className="spin" /> : format === 'test' ? <Robot /> : <Code />}{externalDraft ? 'Regenerate draft' : format === 'test' ? 'Generate with AI' : 'Generate draft'}
                  </button>
                </div>
                {format === 'test' && isTestDraftBusy ? (
                  <div className="local-test-generation-progress" role="status" aria-live="polite">
                    <div><CircleNotch className="spin" aria-hidden="true" /><strong>{testGenerationProgress}</strong><span>{testGenerationElapsedSeconds}s elapsed</span></div>
                    <progress aria-label="Ansight test generation in progress" />
                    <ol className="local-test-generation-stages">{testGenerationStages.slice(-6).map((stage, index) => <li key={`${index}:${stage}`}>{stage}</li>)}</ol>
                  </div>
                ) : null}
                {format === 'test' && workspaceTestDraft && !isTestDraftBusy ? (
                  <div className="local-test-generation-result" role="status">
                    {isTestDraftStale ? <WarningCircle aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}
                    <span>
                      <strong>{isTestDraftStale ? 'Draft needs regeneration' : testSavedPath ? 'Test saved to workspace' : 'Test draft generated'}</strong>
                      <small>{workspaceTestDraft.testName || workspaceTestDraft.suggestedName} · {workspaceTestDraft.suggestedName}{testSavedPath ? ` · ${testSavedPath}` : ' · review and validate before running'}</small>
                    </span>
                  </div>
                ) : null}
                {format === 'test' && selectedTaskAnnotations.length > 0 && (workspaceTestDraft || isTestDraftBusy || startingTaskSectionIds.length > 0 || Object.keys(taskSectionExtractions).length > 0) ? (
                  <div className="local-test-generated-tasks">
                    <div className="local-admin-section-heading"><div><Robot /><span><strong>Reusable task drafts</strong><small>{selectedTaskAnnotations.filter((annotation) => !!taskSectionExtractions[annotation.annotationId!]?.draft).length} of {selectedTaskAnnotations.length} drafts generated from selected annotations</small></span></div></div>
                    {selectedTaskAnnotations.map((annotation) => {
                      const annotationId = annotation.annotationId!
                      const taskExtraction = taskSectionExtractions[annotationId]
                      const error = taskSectionErrors[annotationId]
                      const isRunning = startingTaskSectionIds.includes(annotationId) || (!taskExtraction && isTestDraftBusy) || taskExtraction?.status === 'queued' || taskExtraction?.status === 'running'
                      const hasFailed = !!error || taskExtraction?.status === 'failed' || taskExtraction?.status === 'cancelled'
                      const needsReview = !taskExtraction || taskExtraction.status === 'needsReview'
                      return <div className="local-test-generated-task" key={annotationId}>
                        {isRunning ? <CircleNotch className="spin" aria-hidden="true" /> : hasFailed ? <XCircle aria-hidden="true" /> : needsReview ? <WarningCircle aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}
                        <span><strong>{taskExtraction?.taskName ?? annotation.label}</strong><small>{error || taskExtraction?.progress.at(-1)?.message || taskExtraction?.message || (discardedTaskSectionIds.includes(annotationId) ? 'Draft discarded' : 'No draft yet')}</small></span>
                        {taskExtraction ? <button className="button button--secondary" onClick={() => openTaskReview(annotationId)} type="button">{taskExtraction.draft ? 'Review task' : 'View progress'}</button> : null}
                        {taskExtraction?.draft && taskExtraction.status !== 'committed' && !isRunning ? <button className="button button--secondary" disabled={isSubmitting || isTestRunning} onClick={() => void startAnnotatedTask(annotation, taskExtraction.extractionId)} type="button"><ArrowClockwise />Regenerate</button> : null}
                        {taskExtraction?.draft && taskExtraction.status !== 'committed' && !isRunning ? <button className="button button--danger" disabled={isSubmitting || isTestRunning} onClick={() => void discardTaskDraft(annotationId, taskExtraction)} type="button"><Trash />Discard</button> : null}
                        {hasFailed && previousTaskSectionExtractions[annotationId] ? <button className="button button--secondary" onClick={() => restorePreviousDraft(annotationId)} type="button">Restore previous draft</button> : null}
                        {hasFailed && !previousTaskSectionExtractions[annotationId] && !startingTaskSectionIds.includes(annotationId) ? <button className="button button--secondary" onClick={() => void startAnnotatedTask(annotation)} type="button">Retry</button> : null}
                        {!taskExtraction && !isRunning && !error ? <button className="button button--secondary" disabled={isTestDraftBusy || isSubmitting} onClick={() => void startAnnotatedTask(annotation)} type="button"><Robot />Generate task</button> : null}
                      </div>
                    })}
                    <p>Task drafts are held for review. Save each task after checking its code and testing it against a connected app.</p>
                  </div>
                ) : null}
                {format === 'maestro' && externalDraft ? <>
                  <label className="local-maestro-reasoning">AI reasoning mode
                    <select disabled={isMaestroBusy} onChange={(event) => setMaestroReasoning(event.target.value as AgentReasoning)} value={maestroReasoning}>
                      {agentReasoningModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                    </select>
                  </label>
                  <button className="button button--secondary" disabled={isMaestroBusy || !maestroSource.trim() || !capabilities?.canUseModel} onClick={() => void refineMaestro()} type="button"><Robot />Refine with AI</button>
                </> : null}
              </section>
            )}

            {format === 'ansight' && extraction ? (
              <section className="local-admin-section local-admin-section--grow">
                <div className="local-admin-section-heading">
                  <div>{extraction.status === 'running' || extraction.status === 'queued' ? <CircleNotch className="spin" /> : extraction.status === 'failed' ? <XCircle /> : extraction.status === 'needsReview' ? <WarningCircle /> : <CheckCircle />}<span><strong>{statusTitle(extraction.status)}</strong><small>{extraction.message}</small></span></div>
                  <div className="local-task-extraction-heading-actions">
                    {extraction.trace ? <button className="local-text-button" onClick={() => setIsTraceOpen(true)} type="button"><ChartBar />View trace</button> : null}
                    {isAgentRunning ? <button className="local-text-button" onClick={() => void cancelExtraction()} type="button"><Stop />Cancel</button> : null}
                  </div>
                </div>
                <div className="local-task-extraction-progress">
                  {extraction.progress.map((entry, index) => <div key={`${entry.occurredAtUtc}:${index}`}><span /> <time>{new Date(entry.occurredAtUtc).toLocaleTimeString()}</time><strong>{entry.stage}</strong><p>{entry.message}</p></div>)}
                </div>
              </section>
            ) : null}
          </main>

          <aside className="local-admin-content">
            {format === 'ansight' ? (
            <section className="local-admin-section local-admin-section--grow">
              <div className="local-admin-section-heading"><div><Code /><span><strong>2. Review task draft</strong><small>{extraction?.draft?.taskId ?? 'Waiting for the agent'}</small></span></div></div>
              {extraction?.draft ? (
                <>
                  <p className="local-task-extraction-summary">{extraction.draft.summary}</p>
                  <TypeScriptTaskEditor
                    fileName={extraction.draft.suggestedName}
                    onChange={(nextSource) => {
                      setDraftSource(nextSource)
                      setIsDraftDirty(nextSource !== extraction.draft?.source)
                    }}
                    onDiagnosticsChange={setEditorDiagnostics}
                    readOnly={isTestRunning || extraction.status === 'committed'}
                    source={draftSource}
                    supportModules={authoringReferences?.supportModules ?? []}
                    typeDefinitions={capabilities?.taskTypeDefinitions ?? ''}
                  />
                  <div className="local-task-extraction-editor-status">
                    <span>{editorDiagnostics.isReady ? `${editorDiagnostics.errorCount} errors · ${editorDiagnostics.warningCount} warnings` : 'Checking TypeScript…'}</span>
                    <span>{isDraftDirty ? 'Edited locally · validation required' : 'In sync with host draft'}</span>
                  </div>
                  {extraction.draft.validationWarnings.length ? (
                    <ul className="local-task-extraction-validation-errors">
                      {extraction.draft.validationWarnings.map((warning) => <li key={warning}><WarningCircle />{warning}</li>)}
                    </ul>
                  ) : null}
                  <div className="local-admin-actions local-task-extraction-editor-actions">
                    <button className="button button--secondary" disabled={!editorDiagnostics.isReady || isTestRunning || isSubmitting || extraction.status === 'committed'} onClick={() => void validateDraft()} type="button"><CheckCircle />3. Validate TypeScript</button>
                  </div>
                  <div className="local-task-extraction-test">
                    <div className="local-admin-section-heading"><div><TestTube /><span><strong>4. Test draft</strong><small>Runs against a connected session before saving</small></span></div></div>
                    <label>Live session<select disabled={isTestRunning} onChange={(event) => setTestSessionId(event.target.value)} value={resolvedTestSessionId}><option value="">Choose a connected session</option>{liveTargets.map((target) => <option key={target.sessionId} value={target.sessionId}>{target.name || target.clientName} · {target.sessionId}</option>)}</select></label>
                    <label>Task input<textarea disabled={isTestRunning} onChange={(event) => setTestInput(event.target.value)} rows={4} spellCheck={false} value={testInput} /></label>
                    <button className="button button--secondary" disabled={!editorDiagnostics.isReady || !resolvedTestSessionId || isTestRunning || isSubmitting || editorDiagnostics.errorCount > 0} onClick={() => void testDraft()} type="button">{isTestRunning ? <CircleNotch className="spin" /> : <Play />}Test draft</button>
                    {liveTargets.length === 0 ? <p className="local-task-extraction-hint"><WarningCircle />Connect a live <code>{session.appId}</code> session to test this draft.</p> : null}
                    {extraction.testMessage ? <p className={`local-task-extraction-result local-task-extraction-result--${extraction.testStatus}`}><strong>{extraction.testStatus}</strong>{extraction.testMessage}</p> : null}
                    {extraction.testResult?.assertions.length ? <ul className="local-task-extraction-assertions">{extraction.testResult.assertions.map((assertion) => <li key={assertion.assertionId}>{assertion.passed ? <CheckCircle /> : <XCircle />}<span><strong>{assertion.assertionId}</strong>{assertion.message}</span></li>)}</ul> : null}
                    {canDebugFailure ? <button className="button button--secondary" disabled={isDebugging || isTestRunning} onClick={() => void debugFailure()} type="button">{isDebugging ? <CircleNotch className="spin" /> : <Bug />}Debug why this task failed</button> : null}
                    {debugResult ? (
                      <div className="local-task-extraction-debug">
                        <div><Bug /><span><strong>{debugResult.failureKind}</strong><p>{debugResult.summary}</p></span></div>
                        {debugResult.findings.length ? <ul>{debugResult.findings.map((finding, index) => <li key={`${finding.kind}:${index}`}><strong>{finding.kind}</strong><span>{finding.message}</span></li>)}</ul> : null}
                        {debugResult.suggestedSelectors.length ? (
                          <div className="local-task-extraction-debug-suggestions"><strong>Selectors observed after the preceding action</strong>{debugResult.suggestedSelectors.map((suggestion, index) => <div key={`${suggestion.snapshotId ?? 'ocr'}:${index}`}><code>{JSON.stringify(suggestion.selector)}</code><small>{suggestion.rationale}</small></div>)}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="local-admin-actions">
                    <button className="button button--primary" disabled={!editorDiagnostics.isReady || extraction.status === 'committed' || isTestRunning || isSubmitting || editorDiagnostics.errorCount > 0} onClick={() => void commitDraft()} type="button"><FloppyDisk />{extraction.status === 'committed' ? 'Saved' : '5. Save to ansight/tasks'}</button>
                  </div>
                  {extraction.committedPath ? <p className="local-task-extraction-saved"><CheckCircle />{extraction.committedPath}</p> : null}
                </>
              ) : (
                <div className="local-admin-empty">{extraction?.status === 'failed' ? <XCircle /> : <Robot />}<span>{extraction?.status === 'failed' ? extraction.message : 'The agent draft will appear here when its evidence pass completes.'}</span></div>
              )}
            </section>
            ) : (
              <section className="local-admin-section local-admin-section--grow">
                <div className="local-admin-section-heading"><div><Code /><span><strong>{format === 'test' ? '' : '2. '}Review draft</strong><small>{externalDraft ? format === 'test' && !skipTaskSections ? `${selectedTaskSectionIds.length} selected sections` : `${externalDraft.generatedActionCount} recorded actions` : 'Generate a draft to continue'}</small></span></div></div>
                {externalDraft ? <>
                  {format === 'test' && isTestDraftStale ? <p className="local-task-extraction-hint"><WarningCircle />Task sections changed. Regenerate the YAML draft to include the current selection.</p> : null}
                  <p className="local-task-extraction-hint">{format === 'test' ? 'Review the journey, starting state, and outcome assertions before running the test.' : 'Check the starting state, selectors, text values, and intended outcome. Add an assertion before testing.'}</p>
                  <label htmlFor="local-external-source">{format === 'test' ? 'Ansight test YAML' : format === 'maestro' ? 'Maestro YAML' : 'Appium JavaScript'}</label>
                  <textarea
                    className="local-maestro-source"
                    id="local-external-source"
                    onChange={(event) => {
                      if (format === 'test') { setTestSource(event.target.value); setTestSavedPath(''); setDraftRun(null) }
                      else if (format === 'maestro') { setMaestroSource(event.target.value); setMaestroSavedPath('') }
                      else { setAppiumSource(event.target.value); setAppiumSavedPath('') }
                      clearExternalChecks()
                    }}
                    rows={18}
                    spellCheck={false}
                    value={externalSource}
                  />
                  {externalDraft.diagnostics.length ? <ul className="local-task-extraction-validation-errors">{externalDraft.diagnostics.map((diagnostic, index) => <li key={`${index}:${diagnostic}`}><WarningCircle />{diagnostic}</li>)}</ul> : null}
                  <div className="local-task-extraction-test">
                    <div className="local-admin-section-heading"><div><CheckCircle /><span><strong>{format === 'test' ? '' : '3. '}Validate</strong><small>{format === 'test' ? 'Check YAML and workspace test contract' : format === 'maestro' ? 'Check app ID and supported commands' : 'Check app ID and JavaScript syntax'}</small></span></div></div>
                    <button className="button button--secondary" disabled={isExternalBusy || isExternalGenerating || !externalSource.trim() || (format === 'test' && isTestDraftStale)} onClick={() => void reviewExternalDraft(false)} type="button">{isExternalBusy && !externalValidation ? <CircleNotch className="spin" /> : <CheckCircle />}Validate draft</button>
                    {externalValidation ? <ExternalReviewResult result={externalValidation} /> : null}
                  </div>
                  {format === 'test' ? <div className="local-task-extraction-test">
                    <div className="local-admin-section-heading"><div><Play /><span><strong>Run draft on device or simulator</strong><small>Runs this YAML and the ready task drafts without saving either</small></span></div></div>
                    <label>Device or simulator<select disabled={isStartingDraftRun} onChange={(event) => setDraftRunDeviceKey(event.target.value)} value={draftRunDeviceKey}><option value="">Choose a target</option>{draftRunInventory?.devices.map((device) => <option disabled={!device.isAvailable} key={`${device.platform}:${device.identifier}`} value={`${device.platform}:${device.identifier}`}>{device.name} · {device.isPhysical ? 'device' : 'simulator/emulator'} · {device.state}</option>)}</select></label>
                    <label>Application artifact (optional)<input disabled={isStartingDraftRun} onChange={(event) => setDraftRunApplicationPath(event.target.value)} placeholder="Host path to the app build, if it is not already installed" value={draftRunApplicationPath} /></label>
                    <p className="local-task-extraction-hint">Only ready drafts from this test’s selected sections can be used. Editor changes to a task draft must be applied before starting.</p>
                    {readyTaskDrafts.length ? <div className="local-draft-run-task-list" aria-label="Task drafts for this test">{readyTaskDrafts.map((item) => <label key={item.extractionId}><input checked={!excludedDraftTaskIds.includes(item.extractionId)} onChange={(event) => setExcludedDraftTaskIds((current) => event.target.checked ? current.filter((id) => id !== item.extractionId) : [...current, item.extractionId])} type="checkbox" />{item.taskName}</label>)}</div> : <p className="local-task-extraction-hint">No ready task drafts belong to these sections. The YAML journey can still run.</p>}
                    <p className="local-task-extraction-hint">{includedTaskDrafts.length} task draft{includedTaskDrafts.length === 1 ? '' : 's'} included in this run.</p>
                    <button className="button button--primary" disabled={isStartingDraftRun || isExternalGenerating || isTestDraftStale || externalValidation?.status !== 'passed' || !selectedDraftRunDevice?.isAvailable || !!draftRun && ['queued', 'running'].includes(draftRun.status)} onClick={() => void runDraftTest()} type="button">{isStartingDraftRun ? <CircleNotch className="spin" /> : <Play />}Run draft test</button>
                    {!draftRunInventory?.devices.some((device) => device.isAvailable) ? <p className="local-task-extraction-hint"><WarningCircle />Connect a device or start a simulator/emulator to run this draft.</p> : null}
                    {draftRun ? <div className="local-test-generation-result" role="status"><TestTube /><span><strong>{draftRun.status === 'succeeded' ? 'Test passed' : draftRun.status === 'failed' ? 'Test failed' : draftRun.status === 'cancelled' ? 'Test cancelled' : 'Test running'}</strong><small>{draftRun.progress.at(-1)?.message || draftRun.message}</small><small>{draftRun.executionId}</small></span></div> : null}
                  </div> : null}
                  {format !== 'test' ? <div className="local-task-extraction-test">
                    <div className="local-admin-section-heading"><div><TestTube /><span><strong>4. Test on device</strong><small>Plays the draft against a connected device</small></span></div></div>
                    <p className="local-task-extraction-hint">{format === 'maestro' ? 'Requires the Maestro CLI and a ready device.' : 'Requires a running Appium server, the matching driver, and WebdriverIO in the linked workspace.'}</p>
                    <label>Live session<select disabled={isExternalBusy} onChange={(event) => { setTestSessionId(event.target.value); setExternalTest(null) }} value={resolvedTestSessionId}><option value="">Choose a connected session</option>{liveTargets.map((target) => <option key={target.sessionId} value={target.sessionId}>{target.name || target.clientName} · {target.runtimeDeviceIdentifier || target.sessionId}</option>)}</select></label>
                    <button className="button button--secondary" disabled={isExternalBusy || externalValidation?.status !== 'passed' || !selectedLiveTarget?.runtimeDeviceIdentifier} onClick={() => void reviewExternalDraft(true)} type="button">{isExternalBusy && externalValidation ? <CircleNotch className="spin" /> : <Play />}Play test</button>
                    {!selectedLiveTarget?.runtimeDeviceIdentifier ? <p className="local-task-extraction-hint"><WarningCircle />Connect a live {session.appId} device to play this draft.</p> : null}
                    {externalTest ? <ExternalReviewResult result={externalTest} /> : null}
                  </div> : null}
                  <div className="local-task-extraction-test">
                    <div className="local-admin-section-heading"><div><FloppyDisk /><span><strong>{format === 'test' ? '' : '5. '}Save or download</strong><small>Keep the reviewed source</small></span></div></div>
                    {format === 'test' ? <p className="local-task-extraction-hint">Saving this YAML saves the test only. Ready task drafts remain here for review and must be saved individually to become workspace tasks.</p> : null}
                    <div className="local-admin-actions">
                      <button className="button button--secondary" disabled={!externalSource.trim() || (format === 'test' && isTestDraftStale)} onClick={format === 'test' ? downloadTest : format === 'maestro' ? downloadMaestro : downloadAppium} type="button">Download {format === 'appium' ? 'JavaScript' : 'YAML'}</button>
                      <button className="button button--primary" disabled={isExternalBusy || isExternalGenerating || externalValidation?.status !== 'passed' || !!externalSavedPath || (format === 'test' && isTestDraftStale)} onClick={() => void (format === 'test' ? saveTest() : format === 'maestro' ? saveMaestro() : saveAppium())} type="button"><FloppyDisk />Save to {format === 'test' ? 'ansight/tests' : format === 'maestro' ? '.maestro' : 'appium'}</button>
                    </div>
                    {externalSavedPath ? <p className="local-task-extraction-saved"><CheckCircle />{externalSavedPath}</p> : null}
                    {format === 'test' && externalSavedPath && workspaceTestDraft ? (
                      <div className="local-test-generation-next-step">
                        <button className="button button--secondary" onClick={() => onOpenTests(session.appId, workspaceTestDraft.suggestedName)} type="button"><Play />Open in Tests</button>
                        <small>Select a target, then choose Run selected. The run and its progress appear in Tests.</small>
                      </div>
                    ) : null}
                  </div>
                </> : <div className="local-admin-empty"><Code /><span>Select this format and generate a draft to review it.</span></div>}
              </section>
            )}
          </aside>
        </div>
      </section>
      {isTraceOpen && extraction?.trace ? <TaskExtractionTraceModal onClose={() => setIsTraceOpen(false)} trace={extraction.trace} /> : null}
    </div>
  )
}

function ExternalReviewResult({ result }: { result: ExternalDraftResult }) {
  return <div className={`local-task-extraction-result local-task-extraction-result--${result.status}`}><strong>{result.status}</strong>{result.message}{result.output ? <pre>{result.output}</pre> : null}</div>
}

type ActiveMention = {
  start: number
  end: number
  query: string
}

function TaskReferenceTextarea({
  disabled,
  onChange,
  references,
  value,
}: {
  disabled: boolean
  onChange: (value: string) => void
  references: LocalTaskAuthoringReference[]
  value: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = useMemo(() => {
    if (!activeMention) return []
    const query = activeMention.query.toLocaleLowerCase()
    return references
      .filter((reference) => !query
        || reference.mention.slice(1).toLocaleLowerCase().includes(query)
        || reference.name.toLocaleLowerCase().includes(query)
        || reference.description.toLocaleLowerCase().includes(query))
      .slice(0, 12)
  }, [activeMention, references])

  function updateMention(nextValue: string, cursor: number | null) {
    const nextMention = findActiveMention(nextValue, cursor)
    setActiveMention(nextMention)
    setActiveIndex(0)
  }

  function selectReference(reference: LocalTaskAuthoringReference) {
    if (!activeMention) return
    const nextValue = `${value.slice(0, activeMention.start)}${reference.mention} ${value.slice(activeMention.end)}`
    const nextCursor = activeMention.start + reference.mention.length + 1
    onChange(nextValue)
    setActiveMention(null)
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!activeMention || matches.length === 0) {
      if (event.key === 'Escape') setActiveMention(null)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      selectReference(matches[Math.min(activeIndex, matches.length - 1)])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setActiveMention(null)
    }
  }

  const isOpen = !!activeMention && matches.length > 0 && !disabled
  return (
    <div className="local-task-reference-input">
      <textarea
        aria-autocomplete="list"
        aria-controls="local-task-reference-options"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        id="local-task-extraction-description"
        onBlur={() => window.setTimeout(() => setActiveMention(null), 100)}
        onChange={(event) => {
          onChange(event.target.value)
          updateMention(event.target.value, event.target.selectionStart)
        }}
        onClick={(event) => updateMention(value, event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        placeholder="For example: Add a new customer, verify the saved customer appears in search, and use the captured form values as task inputs."
        ref={textareaRef}
        rows={5}
        value={value}
      />
      {isOpen ? (
        <div className="local-task-reference-options" id="local-task-reference-options" role="listbox">
          {matches.map((reference, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'is-active' : undefined}
              key={reference.mention}
              onMouseDown={(event) => {
                event.preventDefault()
                selectReference(reference)
              }}
              role="option"
              type="button"
            >
              <Code />
              <span><strong>{reference.name}</strong><small>{reference.description}</small></span>
              <code>{reference.mention}</code>
              <em>{formatReferenceKind(reference.kind)}{reference.policy ? ` · ${reference.policy}` : ''}</em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function findActiveMention(value: string, cursor: number | null): ActiveMention | null {
  if (cursor === null) return null
  const prefix = value.slice(0, cursor)
  const match = /(?:^|\s)(@[^\s@]*)$/.exec(prefix)
  if (!match) return null
  const mentionText = match[1]
  return {
    start: cursor - mentionText.length,
    end: cursor,
    query: mentionText.slice(1),
  }
}

function formatReferenceKind(kind: LocalTaskAuthoringReference['kind']): string {
  if (kind === 'artifactProvider') return 'Provider'
  return kind === 'artifact' ? 'Artifact' : 'Tool'
}

function TaskExtractionTraceModal({
  onClose,
  trace,
}: {
  onClose: () => void
  trace: LocalTaskExtractionTrace
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop local-task-extraction-trace-backdrop" onMouseDown={onClose}>
      <section aria-label="Task extraction trace" aria-modal="true" className="session-info-modal local-task-extraction-trace-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Task extraction</p>
            <h2>Usage trace</h2>
            <p className="muted">{trace.status === 'collecting' ? 'Usage is still being finalized.' : `${trace.modelPasses.length.toLocaleString()} model passes recorded.`}</p>
          </div>
          <button aria-label="Close extraction trace" className="button button--secondary button--icon" onClick={onClose} type="button"><X /></button>
        </div>

        <div className="local-task-extraction-trace-summary">
          <TraceMetric icon={<Coins />} label="Estimated cost" value={formatTraceCost(trace)} />
          <TraceMetric icon={<ChartBar />} label="Total tokens" value={trace.tokens.totalTokens.toLocaleString()} />
          <TraceMetric label="Input / output" value={`${trace.tokens.inputTokens.toLocaleString()} / ${trace.tokens.outputTokens.toLocaleString()}`} />
          <TraceMetric label="Cached / reasoning" value={`${trace.tokens.cachedInputTokens.toLocaleString()} / ${trace.tokens.reasoningOutputTokens.toLocaleString()}`} />
        </div>

        {trace.message ? <p className="inline-message local-task-extraction-trace-message">{trace.message}</p> : null}

        <section className="local-task-extraction-trace-passes">
          <div className="local-task-extraction-trace-section-heading">
            <div><p className="eyebrow">Trace</p><h3>Model passes</h3></div>
            {trace.runId ? <code title={trace.runId}>Run {shortIdentifier(trace.runId)}</code> : null}
          </div>
          {trace.modelPasses.length ? trace.modelPasses.map((pass) => (
            <article className="local-task-extraction-trace-pass" key={`${pass.sequence}:${pass.responseId ?? pass.completedAtUtc}`}>
              <header>
                <div><strong>Pass {pass.sequence}</strong><span>{pass.reasoning ?? 'Reasoning not recorded'}</span></div>
                <span><Clock />{formatTraceDuration(pass.durationMilliseconds)}</span>
              </header>
              <div className="local-task-extraction-trace-token-grid">
                <TraceToken label="Total" value={pass.tokens.totalTokens} />
                <TraceToken label="Input" value={pass.tokens.inputTokens} />
                <TraceToken label="Output" value={pass.tokens.outputTokens} />
                <TraceToken label="Cached" value={pass.tokens.cachedInputTokens} />
                <TraceToken label="Cache write" value={pass.tokens.cacheWriteInputTokens} />
                <TraceToken label="Reasoning" value={pass.tokens.reasoningOutputTokens} />
              </div>
              <div className="local-task-extraction-trace-pass-footer">
                <span>{new Date(pass.completedAtUtc).toLocaleTimeString()}</span>
                {pass.functionCalls.length ? <span>Tools: {pass.functionCalls.join(', ')}</span> : <span>No tool calls</span>}
                {pass.responseId ? <code title={pass.responseId}>{shortIdentifier(pass.responseId)}</code> : null}
              </div>
            </article>
          )) : <p className="local-task-extraction-hint"><CircleNotch className={trace.status === 'collecting' ? 'spin' : undefined} />Waiting for the first model pass.</p>}
        </section>
      </section>
    </div>
  )
}

function TraceMetric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return <div>{icon}<span>{label}</span><strong>{value}</strong></div>
}

function TraceToken({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value.toLocaleString()}</strong></div>
}

function formatTraceCost(trace: LocalTaskExtractionTrace): string {
  const cost = trace.calculatedCost
  if (!cost) return trace.status === 'collecting' ? 'Calculating…' : 'Unavailable'
  const micros = cost.costMicros ?? cost.customerCostMicros
  if (micros == null) return 'Unavailable'
  const currency = cost.currency || 'USD'
  const value = micros / 1_000_000
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
      maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(4)}`
  }
}

function formatTraceDuration(durationMilliseconds: number): string {
  if (durationMilliseconds < 1000) return `${durationMilliseconds.toLocaleString()} ms`
  return `${(durationMilliseconds / 1000).toFixed(durationMilliseconds < 10_000 ? 1 : 0)} s`
}

function shortIdentifier(value: string): string {
  return value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`
}

function formatDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString()
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function statusTitle(status: LocalTaskExtraction['status']): string {
  if (status === 'ready') return 'Draft ready'
  if (status === 'needsReview') return 'Draft needs review'
  if (status === 'committed') return 'Task saved'
  if (status === 'failed') return 'Extraction failed'
  if (status === 'cancelled') return 'Extraction cancelled'
  return 'Agent extracting task'
}

function resolveError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
