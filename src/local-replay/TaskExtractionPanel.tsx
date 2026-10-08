import { ArrowClockwise, Bug, ChartBar, CheckCircle, CircleNotch, Code, FloppyDisk, Info, Play, Robot, Stop, TestTube, Trash, WarningCircle, X, XCircle } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { TaskExtractionTraceViewer } from './TaskExtractionTraceViewer'
import { TaskDraftTestControls } from './TaskDraftTestControls'
import { DraftRunDetailsModal } from './DraftRunDetailsModal'
import { DeleteSavedTestDraftDialog } from './DeleteSavedTestDraftDialog'
import { agentReasoningModes, defaultAgentReasoning, type AgentReasoning } from '../agentReasoning'
import { TypeScriptTaskEditor, type TypeScriptEditorDiagnostics } from './TypeScriptTaskEditor'
import { TestHistoryPanel } from './TestHistoryPanel'
import { YamlTestEditor } from './YamlTestEditor'
import { TestTaskSectionIntake } from './TestTaskSectionIntake'
import { readSessionOperationStream } from './sessionOperationStream'
import type { SessionAnnotation } from '../replay/sessionViewerData'
import type { AppiumScriptExtraction, LocalDevice, LocalDeviceInventory, LocalOperationResult, LocalSessionSummary, LocalTaskAuthoringReference, LocalTaskAuthoringReferenceCatalog, LocalTaskExtraction, LocalTaskExtractionCapabilities, LocalTaskExtractionFailureDebugResult, LocalTestExecution, LocalTestHistory, LocalTestRunSummary, MaestroFlowExtraction, WorkspaceTestDraft, WorkspaceTestExtraction } from './types'

type SelectedPeriod = {
  startMs: number
  endMs: number
  focusMs: number
}

type ExtractionFormat = 'ansight' | 'test' | 'maestro' | 'appium'
type ExternalDraftResult = { status: 'passed' | 'failed'; message: string; output: string }
const maximumGenerationNotesCharacters = 4000
const maximumTaskNameCharacters = 200
const defaultPanelSplitRatio = 0.42
const minimumPanelWidthPx = 320
const panelDividerWidthPx = 10
const panelSplitStorageKey = 'ansight.extraction-panel-split'

export function TaskExtractionPanel({
  initialDraftId,
  initialFormat,
  wholeReplay = false,
  initialSelectedTaskSectionIds,
  initialSkipTaskSections,
  initialTaskName,
  initialTestAssertions,
  initialGenerationNotes,
  onAnnotateOnReplay,
  onClose,
  onAutomationSaved,
  onOpenSavedTestDraft,
  onOpenTests,
  period,
  session,
  sessions,
}: {
  initialDraftId?: string
  initialFormat?: ExtractionFormat
  /** Open a new test from the full replay, keeping saved drafts available for review. */
  wholeReplay?: boolean
  initialSelectedTaskSectionIds?: string[]
  initialSkipTaskSections?: boolean
  initialTaskName?: string
  initialTestAssertions?: string
  initialGenerationNotes?: string
  onAnnotateOnReplay: (annotationId: string | null, returnTest: { name: string; assertions: string; generationNotes: string; selectedTaskSectionIds: string[]; skipTaskSections: boolean }) => void
  onClose: () => void
  onAutomationSaved?: (sessionId: string) => void
  onOpenSavedTestDraft: (draft: WorkspaceTestDraft) => void
  onOpenTests: (appId: string, testId: string) => void
  period: SelectedPeriod
  session: LocalSessionSummary
  sessions: LocalSessionSummary[]
}) {
  const [taskName, setTaskName] = useState(initialTaskName ?? '')
  const [panelSplitRatio, setPanelSplitRatio] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(panelSplitStorageKey))
      return Number.isFinite(saved) && saved > 0 && saved < 1 ? saved : defaultPanelSplitRatio
    } catch { return defaultPanelSplitRatio }
  })
  const extractionGridRef = useRef<HTMLDivElement | null>(null)
  const [format, setFormat] = useState<ExtractionFormat>(initialFormat ?? 'ansight')
  const [description, setDescription] = useState('')
  const [reasoning, setReasoning] = useState<AgentReasoning>(defaultAgentReasoning)
  const [testReasoning, setTestReasoning] = useState<AgentReasoning>(defaultAgentReasoning)
  const [draftRunReasoning, setDraftRunReasoning] = useState<AgentReasoning>(defaultAgentReasoning)
  const [maestroReasoning, setMaestroReasoning] = useState<AgentReasoning>(defaultAgentReasoning)
  const [validateSelectors, setValidateSelectors] = useState(true)
  const [trimToTechnology, setTrimToTechnology] = useState(true)
  const [includeOnlyNecessaryFeatures, setIncludeOnlyNecessaryFeatures] = useState(true)
  const [isContractInfoOpen, setIsContractInfoOpen] = useState(false)
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
  const [savedTestDrafts, setSavedTestDrafts] = useState<WorkspaceTestDraft[]>([])
  const [draftToDelete, setDraftToDelete] = useState<WorkspaceTestDraft | null>(null)
  const [isDeletingSavedTestDraft, setIsDeletingSavedTestDraft] = useState(false)
  const [savedTestDraftDeleteError, setSavedTestDraftDeleteError] = useState<string | null>(null)
  const [activeTestDraftId, setActiveTestDraftId] = useState<string | null>(null)
  const [testDraftSaveStatus, setTestDraftSaveStatus] = useState<'saved' | 'saving' | 'failed' | null>(null)
  const lastSavedTestDraftFingerprintRef = useRef('')
  const loadedSavedTestDraftsRef = useRef(false)
  const [testTitle, setTestTitle] = useState('')
  const [testSource, setTestSource] = useState('')
  const [testSavedPath, setTestSavedPath] = useState('')
  const [isTestIdConflict, setIsTestIdConflict] = useState(false)
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
  const [draftInstalledDeviceKeys, setDraftInstalledDeviceKeys] = useState<string[] | null>(null)
  const [draftUnknownDeviceKeys, setDraftUnknownDeviceKeys] = useState<string[]>([])
  const [draftRunDeviceKey, setDraftRunDeviceKey] = useState('')
  const [isDraftDevicePickerOpen, setIsDraftDevicePickerOpen] = useState(false)
  const draftDeviceTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [draftRunApplicationPath, setDraftRunApplicationPath] = useState('')
  const [excludedDraftTaskIds, setExcludedDraftTaskIds] = useState<string[]>([])
  const [draftRun, setDraftRun] = useState<LocalTestExecution | null>(null)
  const [lastDraftRunExecutionId, setLastDraftRunExecutionId] = useState<string | null>(null)
  const [lastDraftTraceRunId, setLastDraftTraceRunId] = useState<string | null>(null)
  const [isDraftRunDetailsOpen, setIsDraftRunDetailsOpen] = useState(false)
  const [draftTraceRun, setDraftTraceRun] = useState<LocalTestRunSummary | null>(null)
  const [isStartingDraftRun, setIsStartingDraftRun] = useState(false)
  const [draftRunError, setDraftRunError] = useState<string | null>(null)
  const [draftRunCancellationId, setDraftRunCancellationId] = useState<string | null>(null)
  const [draftRunCancelError, setDraftRunCancelError] = useState<string | null>(null)
  const isDraftRunActive = draftRun?.status === 'queued' || draftRun?.status === 'running'
  const isCancellingDraftRun = isDraftRunActive && draftRunCancellationId === draftRun?.executionId
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
  const [isAutoValidating, setIsAutoValidating] = useState(false)
  const validationRevisionRef = useRef(0)
  const [externalTest, setExternalTest] = useState<ExternalDraftResult | null>(null)
  const [isExternalBusy, setIsExternalBusy] = useState(false)
  const [isUpdatingTestStatus, setIsUpdatingTestStatus] = useState(false)
  const testStatusRevisionRef = useRef(0)

  const liveTargets = useMemo(
    () => sessions.filter((candidate) => candidate.isConnected && candidate.appId === session.appId),
    [session.appId, sessions],
  )
  const isAgentRunning = extraction?.status === 'queued' || extraction?.status === 'running'
  const isTestRunning = extraction?.testStatus === 'running' || extraction?.testStatus === 'cancelling'
  const isTraceFinalizing = extraction?.trace?.status === 'collecting'
  const isExtractionFormDisabled = isAgentRunning || isTestRunning || isSubmitting
  const taskNameLength = taskName.trim().length
  const taskNameError = taskNameLength > maximumTaskNameCharacters
    ? `The task name exceeds the ${maximumTaskNameCharacters}-character limit by ${taskNameLength - maximumTaskNameCharacters}. Shorten it or move detailed instructions below.`
    : null
  const canDebugFailure = !!extraction?.testResult && !['passed', 'succeeded', 'cancelled'].includes(extraction.testStatus)
  const failedToolCall = extraction?.testResult?.toolCalls.find((call) => call.isError)
  const resolvedTestSessionId = testSessionId && liveTargets.some((candidate) => candidate.sessionId === testSessionId)
    ? testSessionId
    : liveTargets[0]?.sessionId ?? ''
  const selectedLiveTarget = liveTargets.find((target) => target.sessionId === resolvedTestSessionId)
  const externalSource = format === 'maestro' ? maestroSource : format === 'appium' ? appiumSource : testSource
  const externalDraft = format === 'maestro' ? maestroDraft : format === 'appium' ? appiumDraft : workspaceTestDraft
  const externalSavedPath = format === 'maestro' ? maestroSavedPath : format === 'appium' ? appiumSavedPath : testSavedPath
  const isExternalGenerating = format === 'maestro' ? isMaestroBusy : format === 'appium' ? isAppiumBusy : isTestDraftBusy
  const selectedTaskAnnotations = skipTaskSections ? [] : taskSectionAnnotations.filter((annotation) => annotation.annotationId && selectedTaskSectionIds.includes(annotation.annotationId))
  const testPeriod = selectedTaskAnnotations.reduce(
    (range, annotation) => ({
      startMs: Math.min(range.startMs, Date.parse(annotation.startUtc!)),
      endMs: Math.max(range.endMs, Date.parse(annotation.endUtc!)),
    }),
    { startMs: period.startMs, endMs: period.endMs },
  )
  const readyTaskDrafts = selectedTaskAnnotations.map((annotation) => taskSectionExtractions[annotation.annotationId!]).filter((item): item is LocalTaskExtraction => !!item?.draft && item.status === 'ready')
  const includedTaskDrafts = readyTaskDrafts.filter((item) => !excludedDraftTaskIds.includes(item.extractionId))
  const selectedDraftRunDevice = draftRunInventory?.devices.find((device) => `${device.platform}:${device.identifier}` === draftRunDeviceKey)
  const reviewAnnotation = taskSectionAnnotations.find((annotation) => annotation.annotationId === reviewTaskSectionId)
  const draftTabAnnotations = reviewAnnotation && !selectedTaskAnnotations.some((annotation) => annotation.annotationId === reviewTaskSectionId)
    ? [...selectedTaskAnnotations, reviewAnnotation]
    : selectedTaskAnnotations
  const visiblePeriod = reviewAnnotation
    ? { startMs: Date.parse(reviewAnnotation.startUtc!), endMs: Date.parse(reviewAnnotation.endUtc!), focusMs: Date.parse(reviewAnnotation.startUtc!) }
    : period

  function updatePanelSplit(clientX: number): number {
    const bounds = extractionGridRef.current?.getBoundingClientRect()
    if (!bounds) return panelSplitRatio
    const minimumRatio = Math.min(0.5, minimumPanelWidthPx / bounds.width)
    const maximumRatio = Math.max(0.5, 1 - (minimumPanelWidthPx + panelDividerWidthPx) / bounds.width)
    const next = Math.min(maximumRatio, Math.max(minimumRatio, (clientX - bounds.left) / bounds.width))
    setPanelSplitRatio(next)
    return next
  }

  function storePanelSplit(ratio: number) {
    try { window.localStorage.setItem(panelSplitStorageKey, String(ratio)) } catch { /* Resizing still works without storage. */ }
  }

  function clearExternalChecks() {
    validationRevisionRef.current += 1
    setExternalValidation(null)
    setExternalTest(null)
    setDraftRunError(null)
  }

  function updateTestSource(source: string) {
    setTestSource(source)
    setTestSavedPath('')
    clearExternalChecks()
  }

  const testDraftSavePayload = useCallback((extraction: WorkspaceTestExtraction, source: string, draftId: string | null, title: string, needsRegeneration: boolean, lastExecutionId = lastDraftRunExecutionId, lastTraceRunId = lastDraftTraceRunId) => ({
      draftId,
      sessionId: session.sessionId,
      startUtc: new Date(testPeriod.startMs).toISOString(),
      endUtc: new Date(testPeriod.endMs).toISOString(),
      title,
      extraction,
      source,
      taskSectionIds: selectedTaskSectionIds,
      skipTaskSections,
      assertions: testAssertions,
      generationNotes,
      reasoning: testReasoning,
      needsRegeneration,
      lastExecutionId,
      lastTraceRunId,
    }), [generationNotes, lastDraftRunExecutionId, lastDraftTraceRunId, testPeriod.endMs, testPeriod.startMs, selectedTaskSectionIds, session.sessionId, skipTaskSections, testAssertions, testReasoning])

  const persistTestDraft = useCallback(async (extraction: WorkspaceTestExtraction, source: string, draftId: string | null, title: string, needsRegeneration: boolean, lastExecutionId?: string | null, lastTraceRunId?: string | null) => {
    const payload = testDraftSavePayload(extraction, source, draftId, title, needsRegeneration, lastExecutionId, lastTraceRunId)
    setTestDraftSaveStatus('saving')
    try {
      const response = await fetch('api/task-extractions/test-drafts/save', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as WorkspaceTestDraft | LocalOperationResult
      if (!response.ok || !('draftId' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setActiveTestDraftId(body.draftId)
      setSavedTestDrafts((current) => [body, ...current.filter((item) => item.draftId !== body.draftId)]
        .sort((left, right) => Date.parse(right.updatedAtUtc) - Date.parse(left.updatedAtUtc)))
      lastSavedTestDraftFingerprintRef.current = JSON.stringify({ ...payload, draftId: body.draftId })
      setTestDraftSaveStatus('saved')
      onAutomationSaved?.(session.sessionId)
      return body
    } catch (error) {
      setTestDraftSaveStatus('failed')
      throw error
    }
  }, [onAutomationSaved, session.sessionId, testDraftSavePayload])

  useEffect(() => {
    if (format !== 'test' || isLoadingTaskSections || loadedSavedTestDraftsRef.current) return
    loadedSavedTestDraftsRef.current = true
    let active = true
    void (async () => {
      try {
        const response = await fetch(`api/task-extractions/test-drafts?sessionId=${encodeURIComponent(session.sessionId)}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const drafts = await response.json() as WorkspaceTestDraft[]
        if (!active) return
        setSavedTestDrafts(drafts)
        const chosen = wholeReplay ? undefined : initialDraftId
          ? drafts.find((draft) => draft.draftId === initialDraftId)
          : drafts.find((draft) => Date.parse(draft.startUtc) === period.startMs && Date.parse(draft.endUtc) === period.endMs)
        if (!chosen) return
        setActiveTestDraftId(chosen.draftId)
        setWorkspaceTestDraft(chosen.extraction)
        setTestSource(chosen.source)
        setTestTitle(chosen.title)
        setTaskName(chosen.title)
        const restoredSectionIds = chosen.skipTaskSections ? [] : chosen.taskSectionIds.filter((id) => taskSectionAnnotations.some((annotation) => annotation.annotationId === id))
        const missingSelectedAnnotations = !chosen.skipTaskSections && restoredSectionIds.length !== chosen.taskSectionIds.length
        setSelectedTaskSectionIds(restoredSectionIds)
        setSkipTaskSections(restoredSectionIds.length === 0)
        setTestAssertions(chosen.assertions)
        setGenerationNotes(chosen.generationNotes)
        setTestReasoning(agentReasoningModes.some((mode) => mode.value === chosen.reasoning) ? chosen.reasoning as AgentReasoning : defaultAgentReasoning)
        setIsTestDraftStale(chosen.needsRegeneration || missingSelectedAnnotations)
        setLastDraftRunExecutionId(chosen.lastExecutionId ?? null)
        setLastDraftTraceRunId(chosen.lastTraceRunId ?? null)
        setTestDraftSaveStatus('saved')
        lastSavedTestDraftFingerprintRef.current = JSON.stringify({
          draftId: chosen.draftId,
          sessionId: chosen.sessionId,
          startUtc: chosen.startUtc,
          endUtc: chosen.endUtc,
          title: chosen.title,
          extraction: chosen.extraction,
          source: chosen.source,
          taskSectionIds: chosen.taskSectionIds,
          skipTaskSections: chosen.skipTaskSections,
          assertions: chosen.assertions,
          generationNotes: chosen.generationNotes,
          reasoning: chosen.reasoning,
          needsRegeneration: chosen.needsRegeneration,
          lastExecutionId: chosen.lastExecutionId ?? null,
          lastTraceRunId: chosen.lastTraceRunId ?? null,
        })
        if (chosen.lastExecutionId) {
          void fetch('api/tests/executions', { cache: 'no-store' }).then(async (executionResponse) => {
            if (!executionResponse.ok || !active) return
            const executions = await executionResponse.json() as LocalTestExecution[]
            const run = executions.find((item) => item.executionId === chosen.lastExecutionId)
            if (run && active) setDraftRun(run)
          }).catch(() => undefined)
        }
      } catch (error) {
        if (active) setMessage(resolveError(error, 'Unable to load saved YAML drafts.'))
      }
    })()
    return () => { active = false }
  }, [format, initialDraftId, isLoadingTaskSections, period.endMs, period.startMs, session.sessionId, taskSectionAnnotations, wholeReplay])

  useEffect(() => {
    if (!activeTestDraftId || !workspaceTestDraft || isTestDraftBusy) return
    const payload = testDraftSavePayload(workspaceTestDraft, testSource, activeTestDraftId, taskName.trim() || testTitle, isTestDraftStale)
    if (JSON.stringify(payload) === lastSavedTestDraftFingerprintRef.current) return
    const timer = window.setTimeout(() => {
      void persistTestDraft(workspaceTestDraft, testSource, activeTestDraftId, payload.title, isTestDraftStale)
        .catch((error) => setMessage(resolveError(error, 'Unable to save YAML draft.')))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [activeTestDraftId, isTestDraftBusy, isTestDraftStale, persistTestDraft, taskName, testDraftSavePayload, testSource, testTitle, workspaceTestDraft])

  useEffect(() => {
    if (format !== 'test' || !workspaceTestDraft || isTestDraftBusy || isTestDraftStale || !testSource.trim()) {
      setIsAutoValidating(false)
      return
    }
    const controller = new AbortController()
    const revision = validationRevisionRef.current
    setIsAutoValidating(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('api/task-extractions/test-validate', {
            body: JSON.stringify({ sessionId: session.sessionId, source: testSource }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          })
          const body = await response.json() as ExternalDraftResult | LocalOperationResult
          if (controller.signal.aborted || revision !== validationRevisionRef.current) return
          setExternalValidation(response.ok && 'status' in body
            ? body
            : { status: 'failed', message: body.message || `HTTP ${response.status}`, output: '' })
        } catch (error) {
          if (!controller.signal.aborted && revision === validationRevisionRef.current) {
            setExternalValidation({ status: 'failed', message: resolveError(error, 'Unable to validate YAML.'), output: '' })
          }
        } finally {
          if (!controller.signal.aborted && revision === validationRevisionRef.current) setIsAutoValidating(false)
        }
      })()
    }, 450)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [format, isTestDraftBusy, isTestDraftStale, session.sessionId, testSource, workspaceTestDraft])

  function markTestDraftStale() {
    if (workspaceTestDraft) setIsTestDraftStale(true)
    clearExternalChecks()
  }

  async function saveCurrentTestDraftIfNeeded(): Promise<boolean> {
    if (activeTestDraftId && workspaceTestDraft) {
      const title = taskName.trim() || testTitle
      const payload = testDraftSavePayload(workspaceTestDraft, testSource, activeTestDraftId, title, isTestDraftStale)
      if (JSON.stringify(payload) !== lastSavedTestDraftFingerprintRef.current) {
        try {
          await persistTestDraft(workspaceTestDraft, testSource, activeTestDraftId, title, isTestDraftStale)
        } catch (error) {
          setMessage(resolveError(error, 'Unable to save YAML draft.'))
          return false
        }
      }
    }
    return true
  }

  async function closeWithDraftSave() {
    if (!await saveCurrentTestDraftIfNeeded()) return
    onClose()
  }

  async function openSavedTestDraft(draft: WorkspaceTestDraft) {
    if (draft.draftId === activeTestDraftId) return
    if (!await saveCurrentTestDraftIfNeeded()) return
    onOpenSavedTestDraft(draft)
  }

  async function discardSavedTestDraft() {
    if (!draftToDelete || isDeletingSavedTestDraft) return
    const draft = draftToDelete
    setIsDeletingSavedTestDraft(true)
    setSavedTestDraftDeleteError(null)
    try {
      const response = await fetch('api/task-extractions/test-drafts/discard', {
        body: JSON.stringify({ sessionId: session.sessionId, draftId: draft.draftId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setSavedTestDrafts((current) => current.filter((item) => item.draftId !== draft.draftId))
      if (activeTestDraftId === draft.draftId) {
        setActiveTestDraftId(null)
        setWorkspaceTestDraft(null)
        setTestSource('')
        setTestDraftSaveStatus(null)
        lastSavedTestDraftFingerprintRef.current = ''
      }
      setDraftToDelete(null)
    } catch (error) {
      setSavedTestDraftDeleteError(resolveError(error, 'Unable to delete YAML draft.'))
    } finally {
      setIsDeletingSavedTestDraft(false)
    }
  }

  const refreshDraftRunInventory = useCallback(async () => {
    setDraftInstalledDeviceKeys(null)
    try {
      const response = await fetch('api/devices', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load devices and simulators.')
      const inventory = await response.json() as LocalDeviceInventory
      setDraftRunInventory(inventory)
      const installedResponse = await fetch(`api/devices/installed?appId=${encodeURIComponent(session.appId)}`, { cache: 'no-store' })
      if (!installedResponse.ok) throw new Error(`Unable to check where ${session.appId} is installed.`)
      const installed = await installedResponse.json() as { installedDeviceKeys: string[]; unknownDeviceKeys: string[] }
      setDraftInstalledDeviceKeys(installed.installedDeviceKeys)
      setDraftUnknownDeviceKeys(installed.unknownDeviceKeys)
      setDraftRunDeviceKey((current) => {
        if (inventory.devices.some((device) => device.isAvailable && draftDeviceKey(device) === current)) return current
        const preferred = inventory.devices.find((device) => device.isBooted && device.isAvailable
          && installed.installedDeviceKeys.includes(draftDeviceKey(device)))
          ?? inventory.devices.find((device) => device.isAvailable
            && installed.installedDeviceKeys.includes(draftDeviceKey(device)))
        return preferred ? draftDeviceKey(preferred) : ''
      })
    } catch (error) {
      setDraftInstalledDeviceKeys([])
      setMessage(resolveError(error, 'Unable to load devices and simulators.'))
    }
  }, [session.appId])

  const closeDraftDevicePicker = useCallback(() => {
    setIsDraftDevicePickerOpen(false)
    window.requestAnimationFrame(() => draftDeviceTriggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!workspaceTestDraft) return
    void refreshDraftRunInventory()
  }, [refreshDraftRunInventory, workspaceTestDraft])

  useEffect(() => {
    if (!draftRun || !['queued', 'running'].includes(draftRun.status)) return
    const controller = new AbortController()
    const interval = window.setInterval(() => {
      void fetch('api/tests/executions', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
        if (!response.ok) return
        const executions = await response.json() as LocalTestExecution[]
        const updated = executions.find((item) => item.executionId === draftRun.executionId)
        if (updated && !controller.signal.aborted) {
          setDraftRun((current) => current?.executionId === updated.executionId && Date.parse(updated.updatedAtUtc) >= Date.parse(current.updatedAtUtc) ? updated : current)
          if (updated.result?.traceRunId) setLastDraftTraceRunId(updated.result.traceRunId)
        }
      }).catch(() => undefined)
    }, 900)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [draftRun])

  const applyExtraction = useCallback((nextExtraction: LocalTaskExtraction) => {
    setExtraction(nextExtraction)
    setTrimToTechnology(nextExtraction.trimToTechnology ?? true)
    setIncludeOnlyNecessaryFeatures(nextExtraction.includeOnlyNecessaryFeatures ?? true)
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
    const testStatusRevision = testStatusRevisionRef.current
    try {
      const response = await fetch(`api/task-extractions/${encodeURIComponent(extractionId)}`, { cache: 'no-store' })
      const body = await response.json() as LocalTaskExtraction | LocalOperationResult
      if (!response.ok || !('extractionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      if (testStatusRevision === testStatusRevisionRef.current) applyExtraction(body)
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
              && end > start
          })
          .sort((left, right) => Date.parse(left.startUtc ?? '') - Date.parse(right.startUtc ?? ''))
        if (!active) return
        loadedTaskSectionsForSessionRef.current = session.sessionId
        setTaskSectionAnnotations(annotations)
        const availableIds = annotations.map((annotation) => annotation.annotationId!)
        const nextSelectedIds = initialSkipTaskSections ? [] : initialSelectedTaskSectionIds
          ? initialSelectedTaskSectionIds.filter((id) => availableIds.includes(id))
          : annotations.filter((annotation) => Date.parse(annotation.startUtc!) >= period.startMs
            && Date.parse(annotation.endUtc!) <= period.endMs).map((annotation) => annotation.annotationId!)
        setSelectedTaskSectionIds(nextSelectedIds)
        setSkipTaskSections(nextSelectedIds.length === 0)
      } catch (error) {
        if (active) setMessage(resolveError(error, 'Unable to load range annotations.'))
      } finally {
        if (active) setIsLoadingTaskSections(false)
      }
    }
    void loadTaskSections()
    return () => { active = false }
  }, [format, initialSelectedTaskSectionIds, initialSkipTaskSections, period.endMs, period.startMs, session.sessionId])

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
      if (isContractInfoOpen) setIsContractInfoOpen(false)
      else if (isTraceOpen) setIsTraceOpen(false)
      else if (draftTraceRun) setDraftTraceRun(null)
      else if (isDraftRunDetailsOpen) setIsDraftRunDetailsOpen(false)
      else if (reviewTaskSectionId) leaveTaskReview()
      else void closeWithDraftSave()
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
    setTaskName(taskExtraction.taskNameIsAuthoritative === false && !taskExtraction.draft ? '' : taskExtraction.taskName)
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
    if (taskNameError) { setMessage(taskNameError); return }
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
          trimToTechnology,
          includeOnlyNecessaryFeatures,
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
      onAutomationSaved?.(session.sessionId)
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
      onAutomationSaved?.(session.sessionId)
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
    if (isTestDraftBusy || isLoadingTaskSections || isLoadingTaskDrafts || isStartingDraftRun || isDraftRunActive || (!skipTaskSections && selectedTaskSectionIds.length === 0)) return
    setIsTestDraftBusy(true)
    setTestGenerationProgress('Reading the selected replay…')
    setTestGenerationStages(['Reading the selected replay…'])
    setTestGenerationElapsedSeconds(0)
    setMessage(null)
    clearExternalChecks()
    setTestSavedPath('')
    setDraftRun(null)
    setLastDraftRunExecutionId(null)
    setLastDraftTraceRunId(null)
    try {
      const title = taskName.trim() || session.name || `Recorded ${session.appId} workflow`
      const response = await fetch('api/task-extractions/test-preview', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(testPeriod.startMs).toISOString(),
          endUtc: new Date(testPeriod.endMs).toISOString(),
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
      setActiveTestDraftId(null)
      setWorkspaceTestDraft(body)
      setTestTitle(body.testName || title)
      setTaskName(body.testName || title)
      setTestSource(body.source)
      setIsTestDraftStale(false)
      try {
        await persistTestDraft(body, body.source, null, body.testName || title, false, null, null)
      } catch (error) {
        setMessage(resolveError(error, 'YAML generated, but the draft could not be saved for later review.'))
      }
      await startAnnotatedTasks()
    } catch (error) {
      setMessage(resolveError(error, 'Unable to generate Ansight test.'))
    } finally {
      setIsTestDraftBusy(false)
    }
  }

  async function saveTest() {
    if (!workspaceTestDraft || !testSource.trim() || isTestDraftBusy || isTestDraftStale || isTestIdConflict) return
    setIsTestDraftBusy(true)
    setMessage(null)
    try {
      const response = await fetch('api/task-extractions/test-save', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(testPeriod.startMs).toISOString(),
          endUtc: new Date(testPeriod.endMs).toISOString(),
          title: testTitle,
          source: testSource,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as { filePath: string } | LocalOperationResult
      if (!response.ok || !('filePath' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
      setTestSavedPath(body.filePath)
      onAutomationSaved?.(session.sessionId)
      setMessage(`Saved Ansight test to ${body.filePath}`)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to save Ansight test.'))
    } finally {
      setIsTestDraftBusy(false)
    }
  }

  async function runDraftTest() {
    if (!workspaceTestDraft || !testSource.trim() || isTestDraftBusy || isTestDraftStale || externalValidation?.status !== 'passed' || !selectedDraftRunDevice?.isAvailable || isStartingDraftRun || isDraftRunActive) return
    setIsStartingDraftRun(true)
    setDraftRunError(null)
    setDraftRunCancellationId(null)
    setDraftRunCancelError(null)
    setMessage(null)
    try {
      const response = await fetch('api/task-extractions/test-draft-run', {
        body: JSON.stringify({
          sessionId: session.sessionId,
          startUtc: new Date(testPeriod.startMs).toISOString(),
          endUtc: new Date(testPeriod.endMs).toISOString(),
          source: testSource,
          taskSectionIds: skipTaskSections ? [] : selectedTaskSectionIds,
          taskExtractionIds: includedTaskDrafts.map((item) => item.extractionId),
          platform: selectedDraftRunDevice.platform,
          deviceIdentifier: selectedDraftRunDevice.identifier,
          deviceKind: selectedDraftRunDevice.kind,
          applicationPath: draftRunApplicationPath.trim() || null,
          reasoning: draftRunReasoning,
          captureTrace: true,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalTestExecution | LocalOperationResult
      if (!response.ok || !('executionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      setDraftRun(body)
      setLastDraftRunExecutionId(body.executionId)
      setLastDraftTraceRunId(body.result?.traceRunId ?? null)
    } catch (error) {
      setDraftRunError(resolveError(error, 'Unable to start draft test.'))
    } finally {
      setIsStartingDraftRun(false)
    }
  }

  async function cancelDraftRun() {
    if (!draftRun || !isDraftRunActive || isCancellingDraftRun) return
    const executionId = draftRun.executionId
    setDraftRunCancellationId(executionId)
    setDraftRunCancelError(null)
    try {
      const response = await fetch(`api/tests/executions/${encodeURIComponent(executionId)}/cancel`, {
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json() as LocalTestExecution | LocalOperationResult
      if (!response.ok || !('executionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      setDraftRun((current) => current?.executionId === executionId && Date.parse(body.updatedAtUtc) >= Date.parse(current.updatedAtUtc) ? body : current)
    } catch (error) {
      setDraftRunCancellationId(null)
      setDraftRunCancelError(resolveError(error, 'Unable to cancel draft test.'))
    }
  }

  async function openDraftTrace(runId: string) {
    try {
      const response = await fetch(`api/test-history?appId=${encodeURIComponent(session.appId)}&limit=250`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load test trace history.')
      const history = await response.json() as LocalTestHistory
      const run = history.runs.find((item) => item.runId === runId)
      if (!run) throw new Error('The test trace is not available in history yet.')
      setIsDraftRunDetailsOpen(false)
      setDraftTraceRun(run)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to open the test trace.'))
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
    const validationRevision = validationRevisionRef.current
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
      else if (validationRevision === validationRevisionRef.current) setExternalValidation(body)
    } catch (error) {
      const result: ExternalDraftResult = { status: 'failed', message: resolveError(error, play ? 'Unable to play the draft.' : 'Unable to validate the draft.'), output: '' }
      if (play) setExternalTest(result)
      else if (validationRevision === validationRevisionRef.current) setExternalValidation(result)
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
      onAutomationSaved?.(session.sessionId)
      setMessage(body.message)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to save the task draft.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function updateTestStatus(action: 'cancel-test' | 'clear-test') {
    if (!extraction || isUpdatingTestStatus) return
    setIsUpdatingTestStatus(true)
    setMessage(null)
    testStatusRevisionRef.current += 1
    try {
      const response = await fetch(`api/task-extractions/${encodeURIComponent(extraction.extractionId)}/${action}`, {
        body: '{}', headers: { 'Content-Type': 'application/json' }, method: 'POST',
      })
      const body = await response.json() as LocalTaskExtraction | LocalOperationResult
      if (!response.ok || !('extractionId' in body)) throw new Error(body.message || `HTTP ${response.status}`)
      testStatusRevisionRef.current += 1
      // Result controls must not overwrite unsaved TypeScript edits.
      setExtraction(body)
      setDebugResult(null)
    } catch (error) {
      setMessage(resolveError(error, action === 'cancel-test' ? 'Unable to cancel the test run.' : 'Unable to clear the test result.'))
    } finally {
      setIsUpdatingTestStatus(false)
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
    if (isSubmitting || target.status === 'queued' || target.status === 'running' || target.testStatus === 'running' || target.testStatus === 'cancelling') return
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
    <div className="local-admin-backdrop local-task-extraction-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !isSubmitting) void closeWithDraftSave() }}>
      <section aria-label="Extraction explorer" className="local-admin-panel local-task-extraction-panel">
        <header className="local-admin-header">
          {(format === 'test' || reviewTaskSectionId) && draftTabAnnotations.length > 0 ? (
            <nav aria-label="Generated test and task drafts" className="local-extraction-draft-tabs">
              <button aria-current={!reviewTaskSectionId ? 'page' : undefined} className={!reviewTaskSectionId ? 'is-selected' : ''} onClick={() => { if (reviewTaskSectionId) leaveTaskReview(); else setFormat('test') }} type="button"><TestTube />Test draft</button>
              <span className="local-extraction-task-group-label">Automation tasks</span>
              {draftTabAnnotations.map((annotation) => {
                const annotationId = annotation.annotationId!
                const taskExtraction = taskSectionExtractions[annotationId]
                const taskName = taskExtraction?.taskName ?? annotation.label
                return <button aria-current={reviewTaskSectionId === annotationId ? 'page' : undefined} aria-label={`Automation task: ${taskName}`} className={`local-extraction-task-tab${reviewTaskSectionId === annotationId ? ' is-selected' : ''}`} disabled={!taskExtraction} key={annotationId} onClick={() => openTaskReview(annotationId)} title={`Automation task: ${taskName} · ${taskExtraction?.draft ? 'Draft ready' : taskExtraction?.status ?? 'No draft yet'}`} type="button"><Robot /><span><strong>{taskName}</strong></span></button>
              })}
            </nav>
          ) : <strong className="local-extraction-header-title">Extraction explorer</strong>}
          <div className="local-admin-actions">
            <button aria-label="Close extraction explorer" className="button button--secondary" onClick={() => void closeWithDraftSave()} type="button"><X />Close explorer</button>
          </div>
        </header>

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

        <div className={`local-task-extraction-grid${format === 'test' && !workspaceTestDraft ? ' local-task-extraction-grid--test-intake' : ''}`} ref={extractionGridRef} style={{ '--extraction-left-width': `${panelSplitRatio * 100}%` } as CSSProperties}>
          <main className="local-admin-content">
            {message ? <p className="inline-message local-admin-message">{message}</p> : null}
            {format === 'ansight' ? (
            <section className="local-admin-section">
              <div className="local-admin-section-heading">
                <div><Robot /><span><strong>1. Describe Ansight task</strong><small>Tell the agent what reusable task this period represents</small></span></div>
              </div>
              <div className="local-admin-form local-task-extraction-form">
                <label className="local-admin-form--wide" htmlFor="local-task-extraction-name">Task name (optional)
                  <input
                    aria-describedby="local-task-extraction-name-hint"
                    aria-invalid={!!taskNameError}
                    disabled={isExtractionFormDisabled}
                    id="local-task-extraction-name"
                    onChange={(event) => setTaskName(event.target.value)}
                    placeholder="Derived from the extraction instructions when blank"
                    type="text"
                    value={taskName}
                  />
                  <small className={`local-task-name-hint${taskNameError ? ' local-task-name-hint--error' : ''}`} id="local-task-extraction-name-hint" role={taskNameError ? 'alert' : undefined}>
                    {taskNameLength}/{maximumTaskNameCharacters} characters. {taskNameError ?? 'Leave blank for a concise AI-generated title.'}
                  </small>
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
                <div className="local-task-contract-options local-admin-form--wide">
                  <div className="local-task-contract-options-heading"><strong>Contract sent to the agent</strong><button aria-label="About contract trimming" onClick={() => setIsContractInfoOpen(true)} type="button"><Info />How trimming works</button></div>
                  <label className="local-task-extraction-grounding">
                    <input checked={trimToTechnology} disabled={isExtractionFormDisabled} onChange={(event) => setTrimToTechnology(event.target.checked)} type="checkbox" />
                    <span><strong>Trim to technology</strong><small>Leave out other framework suites and unrelated OS permission APIs.</small></span>
                  </label>
                  <label className="local-task-extraction-grounding">
                    <input checked={includeOnlyNecessaryFeatures} disabled={isExtractionFormDisabled} onChange={(event) => setIncludeOnlyNecessaryFeatures(event.target.checked)} type="checkbox" />
                    <span><strong>Include only necessary features</strong><small>Start with core task APIs and features indicated by this request and recording.</small></span>
                  </label>
                </div>
                {capabilities && !capabilities.canUseModel ? (
                  <p className="local-task-extraction-hint local-admin-form--wide"><WarningCircle />Set OPENAI_API_KEY before starting the host to use your own model account. Ansight-hosted AI is available with ANSIGHT_AI_TRANSPORT=cloud and cloud login.</p>
                ) : null}
                <p className="local-task-extraction-hint local-admin-form--wide">Deeper reasoning may take longer and cost more with your model provider.</p>
              </div>
              {!isAgentRunning ? (
                <div className="local-admin-actions">
                  <button className="button button--primary" disabled={!description.trim() || !!taskNameError || isExtractionFormDisabled || !capabilities?.canUseModel || extraction?.status === 'committed'} onClick={() => void startExtraction()} type="button">
                    {isSubmitting ? <CircleNotch className="spin" /> : extraction ? <ArrowClockwise /> : <Robot />}{extraction ? 'Regenerate with AI' : 'Start agent extraction'}
                  </button>
                  {extraction?.draft && extraction.status !== 'committed' ? <button className="button button--danger" disabled={isSubmitting || isTestRunning} onClick={() => void discardTaskDraft(reviewTaskSectionId, extraction)} type="button"><Trash />Discard draft</button> : null}
                </div>
              ) : null}
            </section>
            ) : (
              <section className="local-admin-section local-external-extraction-form">
                {format === 'test' && wholeReplay ? <p className="local-task-extraction-hint"><span><strong>Whole replay</strong> · {new Date(period.startMs).toLocaleString()} – {new Date(period.endMs).toLocaleString()}. Generate a test directly, or optionally select annotations to include reusable tasks.</span></p> : null}
                {format === 'test' && savedTestDrafts.length ? <details className="local-saved-test-drafts">
                  <summary>Saved YAML drafts ({savedTestDrafts.length})</summary>
                  <div className="local-saved-test-draft-list">{savedTestDrafts.map((draft) => <div className="local-saved-test-draft" key={draft.draftId}>
                    <span><strong>{draft.title}</strong><small>{new Date(draft.updatedAtUtc).toLocaleString()}{draft.draftId === activeTestDraftId ? ' · Open now' : ''}</small></span>
                    <button className="button button--secondary" disabled={draft.draftId === activeTestDraftId} onClick={() => void openSavedTestDraft(draft)} type="button">{draft.draftId === activeTestDraftId ? 'Open' : 'Review'}</button>
                    <button aria-label={`Delete saved YAML draft ${draft.title}`} className="button button--secondary" onClick={() => { setSavedTestDraftDeleteError(null); setDraftToDelete(draft) }} title="Delete saved YAML draft" type="button"><Trash /></button>
                  </div>)}</div>
                </details> : null}
                {format === 'test' ? <TestTaskSectionIntake
                  annotations={taskSectionAnnotations}
                  isLoading={isLoadingTaskSections}
                  period={period}
                  onAddAnnotation={() => onAnnotateOnReplay(null, { name: taskName, assertions: testAssertions, generationNotes, selectedTaskSectionIds, skipTaskSections })}
                  onEditAnnotation={(annotationId) => onAnnotateOnReplay(annotationId, { name: taskName, assertions: testAssertions, generationNotes, selectedTaskSectionIds, skipTaskSections })}
                  onExtractTask={extractAnnotatedTask}
                  onJumpToTask={openTaskReview}
                  onSelectedIdsChange={(ids) => { setSelectedTaskSectionIds(ids); setSkipTaskSections(ids.length === 0); markTestDraftStale() }}
                  selectedIds={selectedTaskSectionIds}
                  taskExtractions={taskSectionExtractions}
                /> : null}
                <div className="local-admin-section-heading"><div><Code /><span><strong>{format === 'test' ? '' : '1. '}Generate {format === 'test' ? 'Ansight test' : format === 'maestro' ? 'Maestro flow' : 'Appium test'}</strong><small>{format === 'test' ? 'Use the selected annotations and replay' : 'Use the interactions in this timeline period'}</small></span></div></div>
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
                {format === 'test' ? <label>Generation reasoning
                  <select disabled={isTestDraftBusy} onChange={(event) => setTestReasoning(event.target.value as AgentReasoning)} value={testReasoning}>
                    {agentReasoningModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                </label> : null}
                {format === 'test' && capabilities && !capabilities.canUseModel ? <p className="local-task-extraction-hint"><WarningCircle />AI test generation needs a configured model provider.</p> : null}
                {format === 'test' && selectedTaskAnnotations.length > 0 ? <p className="local-task-extraction-hint">Generation saves the YAML draft for later review and creates {selectedTaskAnnotations.length} automation task draft{selectedTaskAnnotations.length === 1 ? '' : 's'}.</p> : null}
                <div className="local-admin-actions">
                  <button className="button button--primary" disabled={isExternalGenerating || isExternalBusy || (format === 'test' && (!capabilities?.canUseModel || isLoadingTaskSections || isLoadingTaskDrafts || isStartingDraftRun || isDraftRunActive || (!skipTaskSections && selectedTaskSectionIds.length === 0)))} onClick={() => void (format === 'test' ? previewTest() : format === 'maestro' ? previewMaestro() : previewAppium())} type="button">
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
                      <strong>{isTestDraftStale ? 'Draft needs regeneration' : testSavedPath ? 'Test saved to workspace' : 'Test draft generated'}{testDraftSaveStatus === 'saved' ? ' · Saved for later' : testDraftSaveStatus === 'saving' ? ' · Saving…' : testDraftSaveStatus === 'failed' ? ' · Save failed' : ''}</strong>
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

          <div aria-label="Resize extraction panels" aria-orientation="vertical" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(panelSplitRatio * 100)} className="local-task-extraction-divider" onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const bounds = extractionGridRef.current?.getBoundingClientRect()
            if (!bounds) return
            const change = event.key === 'ArrowLeft' ? -0.025 : 0.025
            storePanelSplit(updatePanelSplit(bounds.left + (panelSplitRatio + change) * bounds.width))
          }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updatePanelSplit(event.clientX) }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePanelSplit(event.clientX) }} onPointerUp={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; storePanelSplit(updatePanelSplit(event.clientX)); event.currentTarget.releasePointerCapture(event.pointerId) }} role="separator" tabIndex={0} />
          <aside className="local-admin-content">
            {format === 'ansight' ? (
            <section className="local-admin-section local-admin-section--grow">
              <div className="local-admin-section-heading"><div><Code /><span><strong>2. Review task draft</strong><small>{extraction?.draft?.taskId ?? 'Waiting for the agent'}</small></span></div></div>
              {extraction?.draft ? (
                <>
                  <p className="local-task-extraction-summary">{extraction.draft.summary}</p>
                  <TypeScriptTaskEditor
                    automationIds={extraction.automationIds}
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
                    <span>{extraction.automationIds ? `${extraction.automationIds.length} recorded automation IDs` : 'Recorded automation IDs unavailable'}</span>
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
                    <TaskDraftTestControls
                      status={extraction.testStatus}
                      canTest={editorDiagnostics.isReady && !!resolvedTestSessionId && !isSubmitting && editorDiagnostics.errorCount === 0}
                      hasResult={extraction.testStatus !== 'idle' || !!extraction.testMessage || !!extraction.testResult || !!debugResult || !!message}
                      isUpdating={isUpdatingTestStatus || isSubmitting || isDebugging}
                      onTest={() => void testDraft()}
                      onCancel={() => void updateTestStatus('cancel-test')}
                      onClear={() => void updateTestStatus('clear-test')}
                    />
                    {liveTargets.length === 0 ? <p className="local-task-extraction-hint"><WarningCircle />Connect a live <code>{session.appId}</code> session to test this draft.</p> : null}
                    {extraction.testMessage ? <p className={`local-task-extraction-result local-task-extraction-result--${extraction.testStatus}`}><strong>{extraction.testStatus}</strong>{extraction.testMessage}</p> : null}
                    {canDebugFailure && failedToolCall ? <p className="local-task-extraction-hint">Failed call #{failedToolCall.sequence}: <code>{failedToolCall.toolName}</code></p> : null}
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
                <div className="local-admin-section-heading"><div><Code /><span><strong>{format === 'test' ? 'Review Ansight test YAML' : '2. Review draft'}</strong>{format !== 'test' ? <small>{externalDraft ? `${externalDraft.generatedActionCount} recorded actions` : 'Generate a draft to continue'}</small> : null}</span></div></div>
                {externalDraft ? <>
                  {format === 'test' && isTestDraftStale ? <p className="local-task-extraction-hint"><WarningCircle />Selected annotations changed. Regenerate the YAML draft before running.</p> : null}
                  {format !== 'test' ? <><p className="local-task-extraction-hint">Check the starting state, selectors, text values, and intended outcome. Add an assertion before testing.</p><label htmlFor="local-external-source">{format === 'maestro' ? 'Maestro YAML' : 'Appium JavaScript'}</label></> : null}
                  {format === 'test' ? <YamlTestEditor appId={session.appId} automationIds={workspaceTestDraft?.automationIds} sessionId={session.sessionId} startUtc={new Date(testPeriod.startMs).toISOString()} endUtc={new Date(testPeriod.endMs).toISOString()} currentTestPath={testSavedPath} key={session.appId} onChange={updateTestSource} onIdConflictChange={setIsTestIdConflict} source={testSource} validationError={externalValidation?.status === 'failed' ? externalValidation.message : null} /> : <textarea
                    className="local-maestro-source"
                    id="local-external-source"
                    onChange={(event) => {
                      if (format === 'maestro') { setMaestroSource(event.target.value); setMaestroSavedPath('') }
                      else { setAppiumSource(event.target.value); setAppiumSavedPath('') }
                      clearExternalChecks()
                    }}
                    rows={18}
                    spellCheck={false}
                    value={externalSource}
                  />}
                  {externalDraft.diagnostics.length ? <ul className="local-task-extraction-validation-errors">{externalDraft.diagnostics.map((diagnostic, index) => <li key={`${index}:${diagnostic}`}><WarningCircle />{diagnostic}</li>)}</ul> : null}
                  <div className="local-task-extraction-test local-task-extraction-validation">
                    {format !== 'test' ? <div className="local-admin-section-heading"><div><CheckCircle /><span><strong>3. Validate</strong><small>{format === 'maestro' ? 'Check app ID and supported commands' : 'Check app ID and JavaScript syntax'}</small></span></div></div> : null}
                    <button aria-label={externalValidation?.status === 'passed' ? 'Validate, passed' : 'Validate'} className={`button button--secondary${externalValidation?.status === 'passed' ? ' local-validation-passed' : ''}`} disabled={isExternalBusy || isExternalGenerating || isAutoValidating && format === 'test' || !externalSource.trim() || (format === 'test' && isTestDraftStale)} onClick={() => void reviewExternalDraft(false)} type="button">{isExternalBusy && !externalValidation || isAutoValidating && format === 'test' ? <CircleNotch className="spin" /> : <CheckCircle weight={externalValidation?.status === 'passed' ? 'fill' : 'regular'} />}Validate</button>
                    {externalValidation?.status === 'failed' ? <ExternalReviewResult result={externalValidation} /> : null}
                  </div>
                  {format === 'test' ? <div className="local-task-extraction-test">
                    <div className="local-admin-section-heading"><div><Play /><span><strong>Run draft</strong></span></div></div>
                    <div className="local-draft-run-device-target"><span>Device or simulator</span><button className="button button--secondary" disabled={isStartingDraftRun} onClick={() => { setIsDraftDevicePickerOpen(true); void refreshDraftRunInventory() }} ref={draftDeviceTriggerRef} type="button"><span>{selectedDraftRunDevice ? `${selectedDraftRunDevice.name} · ${friendlyDraftRuntime(selectedDraftRunDevice)}` : 'Choose a target'}</span><span>{selectedDraftRunDevice ? 'Change' : 'Choose'}</span></button></div>
                    <label>Run reasoning depth<select disabled={isStartingDraftRun || isDraftRunActive} onChange={(event) => setDraftRunReasoning(event.target.value as AgentReasoning)} value={draftRunReasoning}>{agentReasoningModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
                    <label>Application artifact (optional)<input disabled={isStartingDraftRun} onChange={(event) => setDraftRunApplicationPath(event.target.value)} placeholder="Host path to the app build, if it is not already installed" value={draftRunApplicationPath} /></label>
                    {readyTaskDrafts.length ? <fieldset className="local-draft-run-task-picker"><legend>Include Draft Tasks</legend><div className="local-draft-run-task-list">{readyTaskDrafts.map((item) => <label key={item.extractionId}><input checked={!excludedDraftTaskIds.includes(item.extractionId)} onChange={(event) => setExcludedDraftTaskIds((current) => event.target.checked ? current.filter((id) => id !== item.extractionId) : [...current, item.extractionId])} type="checkbox" />{item.taskName}</label>)}</div></fieldset> : <p className="local-task-extraction-hint">No ready task drafts belong to these sections. The YAML journey can still run.</p>}
                    <button className="button button--primary" disabled={isStartingDraftRun || isExternalGenerating || isTestDraftStale || externalValidation?.status !== 'passed' || !selectedDraftRunDevice?.isAvailable || isDraftRunActive} onClick={() => void runDraftTest()} type="button">{isStartingDraftRun ? <CircleNotch className="spin" /> : <Play />}Run draft test</button>
                    {draftRunError ? <p className="inline-message" role="alert">{draftRunError}</p> : null}
                    {draftRunCancelError ? <p className="inline-message" role="alert">{draftRunCancelError}</p> : null}
                    {isDraftRunActive ? <p className="local-task-extraction-hint">This run uses the YAML submitted when it started. Edits apply to the next run.</p> : null}
                    {!draftRunInventory?.devices.some((device) => device.isAvailable) ? <p className="local-task-extraction-hint"><WarningCircle />Connect a device or start a simulator/emulator to run this draft.</p> : null}
                    {draftRun || lastDraftTraceRunId ? <div className="local-draft-run-summary" role="status">
                      <TestTube aria-hidden="true" />
                      <span><strong>{isCancellingDraftRun ? 'Cancelling test…' : draftRun ? draftRun.status === 'succeeded' ? 'Test passed' : draftRun.status === 'failed' ? 'Test failed' : draftRun.status === 'cancelled' ? 'Test cancelled' : 'Test running' : 'Previous test run'}</strong><small>{draftRun?.progress.at(-1)?.message || draftRun?.message || 'The test trace is available for review.'}</small></span>
                      <div className="local-draft-run-summary-actions">
                        {isDraftRunActive ? <button className="button button--secondary" disabled={isCancellingDraftRun} onClick={() => void cancelDraftRun()} type="button">{isCancellingDraftRun ? <CircleNotch className="spin" /> : <Stop />}{isCancellingDraftRun ? 'Cancelling…' : 'Cancel test'}</button> : null}
                        {draftRun ? <button className="button button--secondary" onClick={() => setIsDraftRunDetailsOpen(true)} type="button">View run details</button> : null}
                        {draftRun?.result?.traceRunId || lastDraftTraceRunId ? <button className="button button--secondary" onClick={() => void openDraftTrace((draftRun?.result?.traceRunId || lastDraftTraceRunId)!)} type="button"><ChartBar />View trace</button> : null}
                      </div>
                    </div> : null}
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
                    {format === 'test' ? <p className="local-task-extraction-hint">Save to ansight/tests adds the reviewed YAML to your workspace.</p> : null}
                    <div className="local-admin-actions">
                      <button className="button button--secondary" disabled={!externalSource.trim() || (format === 'test' && isTestDraftStale)} onClick={format === 'test' ? downloadTest : format === 'maestro' ? downloadMaestro : downloadAppium} type="button">Download {format === 'appium' ? 'JavaScript' : 'YAML'}</button>
                      <button className="button button--primary" disabled={isExternalBusy || isExternalGenerating || externalValidation?.status !== 'passed' || !!externalSavedPath || (format === 'test' && (isTestDraftStale || isTestIdConflict))} onClick={() => void (format === 'test' ? saveTest() : format === 'maestro' ? saveMaestro() : saveAppium())} type="button"><FloppyDisk />Save to {format === 'test' ? 'ansight/tests' : format === 'maestro' ? '.maestro' : 'appium'}</button>
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
      {isTraceOpen && extraction?.trace ? <TaskExtractionTraceViewer onClose={() => setIsTraceOpen(false)} trace={extraction.trace} /> : null}
      {isContractInfoOpen ? <ContractTrimmingInfo onClose={() => setIsContractInfoOpen(false)} /> : null}
      {draftToDelete ? <DeleteSavedTestDraftDialog title={draftToDelete.title} updatedAtUtc={draftToDelete.updatedAtUtc} isDeleting={isDeletingSavedTestDraft} error={savedTestDraftDeleteError} onCancel={() => setDraftToDelete(null)} onConfirm={() => void discardSavedTestDraft()} /> : null}
      {isDraftDevicePickerOpen ? <DraftRunDevicePicker appId={session.appId} devices={draftRunInventory?.devices ?? []} installedDeviceKeys={draftInstalledDeviceKeys} unknownDeviceKeys={draftUnknownDeviceKeys} hasApplicationArtifact={!!draftRunApplicationPath.trim()} onClose={closeDraftDevicePicker} onRefresh={() => void refreshDraftRunInventory()} onSelect={(key) => { setDraftRunDeviceKey(key); closeDraftDevicePicker() }} selectedKey={draftRunDeviceKey} /> : null}
      {isDraftRunDetailsOpen && draftRun ? <DraftRunDetailsModal key={draftRun.executionId} cancelError={draftRunCancelError} isCancelling={isCancellingDraftRun} onCancel={isDraftRunActive ? () => void cancelDraftRun() : null} onClose={() => setIsDraftRunDetailsOpen(false)} onViewTrace={draftRun.result?.traceRunId || lastDraftTraceRunId ? () => void openDraftTrace((draftRun.result?.traceRunId || lastDraftTraceRunId)!) : null} run={draftRun} /> : null}
      {draftTraceRun ? <TestHistoryPanel appId={session.appId} initialRun={draftTraceRun} onClose={() => setDraftTraceRun(null)} /> : null}
    </div>
  )
}

function ContractTrimmingInfo({ onClose }: { onClose: () => void }) {
  return <div className="local-task-contract-info-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section aria-labelledby="local-task-contract-info-title" aria-modal="true" className="local-task-contract-info-modal" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }} role="dialog">
      <header><div><p className="eyebrow">Task extraction</p><h2 id="local-task-contract-info-title">About contract trimming</h2></div><button aria-label="Close contract trimming information" autoFocus onClick={onClose} type="button"><X /></button></header>
      <p>Trimming leaves API declarations out of the TypeScript reference sent to the agent. It does not remove recorded evidence, disable SDK features, or change the full contract used to compile your task.</p>
      <h3>Trim to technology</h3>
      <ul>
        <li><strong>Other framework suites:</strong> when the recording or published app tools identify one framework, leave out the other suites from .NET MAUI (<code>app.maui</code>), React Native (<code>app.react</code>), Flutter (<code>app.flutter</code>), and Capacitor (<code>app.capacitor</code>). For example, a MAUI recording omits the React Native, Flutter, and Capacitor suites.</li>
        <li><strong>Other OS permission APIs:</strong> an iOS recording omits <code>ansight.permissions.android</code> and Android permission names; an Android recording omits <code>ansight.permissions.ios</code> and iOS permission names.</li>
      </ul>
      <p>Mixed or unknown framework signals keep all framework suites. Mixed or unknown OS signals keep both platforms' permission APIs.</p>
      <h3>Include only necessary features</h3>
      <p>Leave out these optional API groups, and types used only by them, unless your instructions or the initial task generated from the recording indicate they are needed:</p>
      <ul>
        <li><strong>Session evidence:</strong> network requests, logs, telemetry, screenshots, captured artifacts, touches, and annotations.</li>
        <li><strong>Host tools and controls:</strong> database checks, device controls, app lifecycle, permissions, app-tool discovery, and task discovery and composition.</li>
        <li><strong>App data and storage:</strong> clipboard, files, preferences, secure storage, databases, and artifacts.</li>
        <li><strong>App diagnostics:</strong> file descriptors, Android JNI references, and runtime reflection.</li>
      </ul>
      <p>Core task definitions, assertions, UI, keyboard, session, and direct tool calls stay available, along with framework suites retained by the technology option. For example, asking to copy text keeps clipboard APIs; asking to verify a network request keeps network APIs.</p>
      <p>The agent can look up omitted declarations on demand. This may require another model pass, so token savings vary. Comments and blank lines are removed from the initial reference regardless of these options.</p>
      <div className="local-admin-actions"><button className="button button--primary" onClick={onClose} type="button">Done</button></div>
    </section>
  </div>
}

function draftDeviceKey(device: LocalDevice): string {
  return `${device.platform}:${device.identifier}`
}

function draftDeviceFormFactor(device: LocalDevice): 'Phone' | 'Tablet' | 'Other' {
  const value = `${device.formFactor ?? ''} ${device.name}`.toLocaleLowerCase()
  if (/ipad|tablet|tab\b|nexus (?:7|9|10)|pixel (?:c|tablet)/.test(value)) return 'Tablet'
  if (/iphone|pixel|galaxy|phone|moto|nexus [456]/.test(value)) return 'Phone'
  return 'Other'
}

function friendlyDraftRuntime(device: LocalDevice): string {
  const ios = /(?:^|[.\s])iOS[-\s]*(\d+)(?:[-.](\d+))?/i.exec(device.runtime)
  if (ios) return `iOS ${ios[1]}${ios[2] ? `.${ios[2]}` : ''}`
  const android = /(?:android|api)[-\s]*(\d+)/i.exec(device.runtime)
  if (android) return `Android API ${android[1]}`
  return device.runtime || (device.platform === 'ios' ? 'iOS' : device.platform === 'android' ? 'Android' : device.platform)
}

function DraftDeviceFilter({ name, onChange, options, selected, title }: {
  name: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  selected: string
  title: string
}) {
  return <fieldset className="runner-filter-choices"><legend>{title}</legend><div>{options.map((option) => <label className={selected === option.value ? 'is-selected' : ''} key={option.value}><input checked={selected === option.value} name={name} onChange={() => onChange(option.value)} type="radio" value={option.value} /><span>{option.label}</span></label>)}</div></fieldset>
}

function DraftRunDevicePicker({ appId, devices, installedDeviceKeys, unknownDeviceKeys, hasApplicationArtifact, onClose, onRefresh, onSelect, selectedKey }: {
  appId: string
  devices: LocalDevice[]
  installedDeviceKeys: string[] | null
  unknownDeviceKeys: string[]
  hasApplicationArtifact: boolean
  onClose: () => void
  onRefresh: () => void
  onSelect: (key: string) => void
  selectedKey: string
}) {
  const [query, setQuery] = useState('')
  const [formFactor, setFormFactor] = useState('')
  const [osLevel, setOsLevel] = useState('')
  const [groupBy, setGroupBy] = useState('formFactor')
  const [detailKey, setDetailKey] = useState('')
  const [installedOnly, setInstalledOnly] = useState(!hasApplicationArtifact
    && (!selectedKey || installedDeviceKeys?.includes(selectedKey) !== false))
  const osLevels = useMemo(() => [...new Set(devices.map(friendlyDraftRuntime))].sort(), [devices])
  const visible = useMemo(() => devices.filter((device) => {
    const searchable = `${device.name} ${device.identifier} ${friendlyDraftRuntime(device)}`.toLocaleLowerCase()
    return (!installedOnly || installedDeviceKeys?.includes(draftDeviceKey(device)))
      && (!formFactor || draftDeviceFormFactor(device) === formFactor)
      && (!osLevel || friendlyDraftRuntime(device) === osLevel)
      && (!query.trim() || searchable.includes(query.trim().toLocaleLowerCase()))
  }), [devices, formFactor, installedDeviceKeys, installedOnly, osLevel, query])
  const groups = useMemo(() => {
    const grouped = new Map<string, LocalDevice[]>()
    for (const device of visible) {
      const key = groupBy === 'formFactor' ? draftDeviceFormFactor(device) : friendlyDraftRuntime(device)
      grouped.set(key, [...(grouped.get(key) ?? []), device])
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [groupBy, visible])
  const detailDevice = devices.find((device) => draftDeviceKey(device) === detailKey)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return <div className="modal-backdrop local-draft-device-backdrop" onMouseDown={onClose}>
    <section aria-label="Choose a device or simulator" aria-modal="true" className="session-info-modal local-draft-device-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
      <div className="modal-heading"><div><h2>Choose a device or simulator</h2></div><button aria-label="Close device selector" className="button button--secondary button--icon" onClick={onClose} type="button"><X /></button></div>
      <div className="local-draft-device-picker runner-device-picker">
        <div className="runner-device-filters">
          <label className="local-draft-device-search"><span>Name search</span><input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="iPhone, iPad, Pixel…" type="search" value={query} /></label>
          <DraftDeviceFilter name="draft-device-installed" onChange={(value) => setInstalledOnly(value === 'installed')} options={[{ value: 'installed', label: `${appId} installed` }, { value: 'all', label: 'All devices' }]} selected={installedOnly ? 'installed' : 'all'} title="Application" />
          <DraftDeviceFilter name="draft-device-form-factor" onChange={setFormFactor} options={[{ value: '', label: 'All types' }, { value: 'Phone', label: 'Phones' }, { value: 'Tablet', label: 'Tablets' }, { value: 'Other', label: 'Other' }]} selected={formFactor} title="Form factor" />
          <DraftDeviceFilter name="draft-device-os-level" onChange={setOsLevel} options={[{ value: '', label: 'All OS levels' }, ...osLevels.map((value) => ({ value, label: value }))]} selected={osLevel} title="OS level" />
          <DraftDeviceFilter name="draft-device-group-by" onChange={setGroupBy} options={[{ value: 'formFactor', label: 'Form factor' }, { value: 'osLevel', label: 'OS level' }]} selected={groupBy} title="Group by" />
        </div>
        <div className="runner-device-selection"><span className="muted">{installedOnly && installedDeviceKeys === null ? 'Checking installed apps…' : `Showing ${visible.length} of ${devices.length}`}{unknownDeviceKeys.length ? ` · Could not check ${unknownDeviceKeys.length} device${unknownDeviceKeys.length === 1 ? '' : 's'}` : ''}</span><button className="button button--secondary" onClick={onRefresh} type="button"><ArrowClockwise />Refresh devices</button></div>
        {groups.length ? groups.map(([group, items]) => <section className="runner-device-group" key={group}><h4>{group}<span>{items.length}</span></h4><div className="runner-device-grid">{items.map((device) => {
          const key = draftDeviceKey(device)
          const factor = draftDeviceFormFactor(device)
          return <div className={`runner-device-card${selectedKey === key ? ' is-selected' : ''}${device.isAvailable ? '' : ' is-unavailable'}`} key={key}>
            <label><input checked={selectedKey === key} disabled={!device.isAvailable} name="draft-run-device" onChange={() => onSelect(key)} type="radio" value={key} />
              <span aria-hidden="true" className={`runner-device-silhouette runner-device-silhouette--${factor.toLowerCase()}`}><span /></span>
              <span className="runner-device-card-copy"><strong>{device.name}</strong><small>{friendlyDraftRuntime(device)} · {device.isPhysical ? 'Device' : 'Simulator / emulator'} · {device.isAvailable ? device.state : 'Unavailable'}</small></span>
            </label>
            <button aria-label={`Details for ${device.name}`} className="runner-device-info" onClick={() => setDetailKey((current) => current === key ? '' : key)} type="button"><Info size={18} /></button>
          </div>
        })}</div></section>) : <p className="muted">{installedOnly && installedDeviceKeys === null ? 'Checking where the app is installed…' : installedOnly && installedDeviceKeys?.length === 0 ? `No available devices have ${appId} installed. Choose All devices if you will supply an app artifact.` : devices.length ? 'No devices match these filters.' : 'No devices found. Connect a device or start a simulator, then refresh.'}</p>}
        {detailDevice ? <div className="local-draft-device-details"><strong>{detailDevice.name}</strong><span>{detailDevice.platform} · {detailDevice.runtime || 'Unknown runtime'} · {detailDevice.state}</span><code>{detailDevice.identifier}</code></div> : null}
      </div>
    </section>
  </div>
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
