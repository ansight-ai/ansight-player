import type { AgentReasoning, ProviderReasoningEffort } from '../agentReasoning'
import type {
  SessionAnalysisRecord,
  SessionApplicationEvent,
  SessionAnnotation,
  SessionArtifactSnapshot,
  SessionImageFrame,
  SessionLogEntry,
  SessionLogStream,
  SessionMetricChannel,
  SessionMetricSample,
  SessionNetworkRequest,
  SessionTouchInputRecord,
  SessionVisualTreeSnapshot,
} from '../replay/sessionViewerData'

export type LocalReplayBootstrap = {
  schema: string
  mode: 'explorer' | 'session'
  initialSessionId?: string | null
  supportsLiveSessions: boolean
  supportsDeviceLocation: boolean
  supportsRouteReplay: boolean
  supportsTrends: boolean
  supportsTestHistory: boolean
  supportsRegisteredApps: boolean
  supportsEnrollmentInvites: boolean
  supportsSettings: boolean
  supportsAppGraphProgress: boolean
  supportsAppGraphRecording: boolean
  supportsCloudSessions: boolean
  supportsDeviceManagement: boolean
  supportsSessionAdministration: boolean
  supportsAccountManagement: boolean
  supportsHostHealth: boolean
  supportsTestExecution: boolean
  supportsTaskExtraction: boolean
  mapboxAccessToken?: string | null
}

export type LocalGettingStartedState = {
  opened: boolean
  skipped: boolean
  notificationSent: boolean
  replayedSessionId: string | null
  automationSaved: boolean
  capturePath: 'sdk' | 'external' | null
}

export type LocalTaskExtractionCapabilities = {
  schema: string
  supportsHosted: boolean
  isHostedSignedIn: boolean
  canUseModel: boolean
  supportsDirectWebSocket: boolean
  taskTypeDefinitions: string
}

export type MaestroFlowExtraction = {
  suggestedName: string
  source: string
  generatedActionCount: number
  diagnostics: string[]
}

export type AppiumScriptExtraction = {
  suggestedName: string
  source: string
  generatedActionCount: number
  diagnostics: string[]
}

export type WorkspaceTestExtraction = {
  suggestedName: string
  testName?: string | null
  source: string
  generatedActionCount: number
  diagnostics: string[]
}

export type WorkspaceTestDraft = {
  draftId: string
  sessionId: string
  appId: string
  startUtc: string
  endUtc: string
  title: string
  extraction: WorkspaceTestExtraction
  source: string
  taskSectionIds: string[]
  skipTaskSections: boolean
  assertions: string
  generationNotes: string
  reasoning: string
  needsRegeneration: boolean
  lastExecutionId?: string | null
  lastTraceRunId?: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

export type LocalTaskAuthoringReference = {
  kind: 'tool' | 'artifactProvider' | 'artifact'
  mention: string
  id: string
  name: string
  description: string
  policy?: string | null
  providerId?: string | null
  artifactId?: string | null
}

export type LocalTaskAuthoringReferenceCatalog = {
  schema: string
  sessionId: string
  isLive: boolean
  capturedAtUtc?: string | null
  references: LocalTaskAuthoringReference[]
  supportModules: LocalTaskSupportModule[]
  message: string
}

export type LocalTaskSupportModule = {
  path: string
  source: string
  isDeclaration: boolean
}

export type LocalTaskExtractionProgress = {
  stage: string
  message: string
  occurredAtUtc: string
}

export type LocalTaskExtractionDraft = {
  suggestedName: string
  summary: string
  source: string
  taskId: string
  draftRootPath: string
  sourcePath: string
  validationWarnings: string[]
}

export type LocalTaskExtractionAssertion = {
  assertionId: string
  passed: boolean
  message: string
  expected?: unknown
  actual?: unknown
}

export type LocalTaskExtractionToolCall = {
  sequence: number
  toolName: string
  startedAtUtc: string
  durationMilliseconds: number
  isError: boolean
  message: string
}

export type LocalTaskExtractionTestResult = {
  status: string
  message: string
  runId: string
  sessionId: string
  durationMilliseconds: number
  assertions: LocalTaskExtractionAssertion[]
  toolCalls: LocalTaskExtractionToolCall[]
  standardError: string
}

export type LocalTaskExtractionFailureDebugFinding = {
  kind: string
  message: string
}

export type LocalTaskExtractionSuggestedSelector = {
  selector: Record<string, unknown>
  rationale: string
  snapshotId?: string | null
  capturedAtUtc?: string | null
}

export type LocalTaskExtractionFailureDebugResult = {
  summary: string
  failureKind: string
  findings: LocalTaskExtractionFailureDebugFinding[]
  suggestedSelectors: LocalTaskExtractionSuggestedSelector[]
  analyzedAtUtc: string
}

export type LocalTaskExtractionTokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
  reasoningOutputTokens: number
}

export type LocalTaskExtractionRunCost = {
  costMicros?: number | null
  providerCostMicros?: number
  customerCostMicros?: number | null
  currency: string
  status: string
}

export type LocalTaskExtractionModelPassTrace = {
  sequence: number
  responseId?: string | null
  model?: string
  reasoning?: string | null
  serviceTier?: string | null
  startedAtUtc: string
  completedAtUtc: string
  durationMilliseconds: number
  tokens: LocalTaskExtractionTokenUsage
  functionCalls: string[]
}

export type LocalTaskExtractionTrace = {
  status: 'collecting' | 'complete' | 'failed'
  message?: string | null
  runId?: string | null
  tokens: LocalTaskExtractionTokenUsage
  calculatedCost?: LocalTaskExtractionRunCost | null
  modelPasses: LocalTaskExtractionModelPassTrace[]
}

export type LocalTaskExtraction = {
  schema: string
  extractionId: string
  status: 'queued' | 'running' | 'ready' | 'needsReview' | 'failed' | 'cancelled' | 'committed'
  message: string
  sessionId: string
  appId: string
  workspacePath: string
  startUtc: string
  endUtc: string
  taskName: string
  description: string
  mode: 'hosted' | 'directWebSocket'
  model: string
  reasoning: AgentReasoning
  reasoningEffort: ProviderReasoningEffort
  reasoningConfigurationRevision: string
  validateSelectors: boolean
  createdAtUtc: string
  updatedAtUtc: string
  progress: LocalTaskExtractionProgress[]
  draft?: LocalTaskExtractionDraft | null
  testStatus: string
  testMessage?: string | null
  testResult?: LocalTaskExtractionTestResult | null
  committedPath?: string | null
  trace?: LocalTaskExtractionTrace | null
}

export type LocalAppGraphLiveNode = {
  id: string
  kind: 'screen' | 'dialog' | 'state'
  name: string
  parentScreen?: string | null
  synonyms: string[]
  purpose: string
  description: string
  scrollStatus: 'unknown' | 'not_scrollable' | 'in_progress' | 'complete' | 'blocked'
  confidence: number
  firstObservedUtc: string
  updatedUtc: string
}

export type LocalAppGraphLiveEdge = {
  id: string
  from: string
  to: string
  automationId: string
  semanticMeaning: string
  confidence: number
  firstObservedUtc: string
  updatedUtc: string
}

export type LocalAppGraphLiveNavigationHost = {
  id: string
  kind: 'flyout' | 'drawer' | 'bottom_tabs' | 'top_tabs' | 'navigation_rail' | 'shell' | 'other'
  name: string
  destinationId: string
  activeChildDestinationId: string
  childDestinationIds: string[]
  framework: string
  technology?: LocalAppGraphNavigationTechnology
  confidence: number
  firstObservedUtc: string
  updatedUtc: string
}

export type LocalAppGraphLiveTabGroup = {
  id: string
  parentDestinationId: string
  selectedDestinationId: string
  tabDestinationIds: string[]
  technology?: LocalAppGraphNavigationTechnology
  confidence: number
  firstObservedUtc: string
  updatedUtc: string
}

export type LocalAppGraphNavigationTechnology = {
  framework: string
  kind: string
  navigationToolId: string
  structureFingerprint: string
}

export type LocalAppGraphNavigationTechnologyKind = {
  kind: string
  label: string
  normalizedRole: 'flyout' | 'drawer' | 'bottom_tabs' | 'top_tabs' | 'navigation_rail' | 'shell' | 'other'
  supportsNavigationHost: boolean
  supportsTabGroup: boolean
}

export type LocalAppGraphNavigationController = {
  framework: string
  label: string
  navigationToolId: string
  structureFingerprint: string
  guidance: string
  kinds: LocalAppGraphNavigationTechnologyKind[]
}

export type LocalAppGraphNavigationDiscoveryResult = {
  isSuccess: boolean
  message: string
  controllers: LocalAppGraphNavigationController[]
}

export type LocalAppGraphLiveCoverage = {
  safeActionsObserved: number
  actionsExplored: number
  scrollContainersObserved: number
  scrollContainersCompleted: number
  gaps: string[]
}

export type LocalAppGraphLiveAction = {
  id: string
  destinationId: string
  toolName: string
  automationId: string
  selector: Record<string, unknown>
  semanticMeaning: string
  status: 'queued' | 'attempted' | 'explored' | 'blocked' | 'unsafe' | 'unavailable'
  attemptCount: number
  lastOutcome: string
  resultDestinationId?: string | null
  firstObservedUtc: string
  updatedUtc: string
}

export type LocalAppGraphLiveTraceEntry = {
  sequence: number
  stage: 'Starting' | 'Thinking' | 'ModelCompleted' | 'CallingTool' | 'ToolCompleted' | 'AppGraphUpdated' | 'InstructionCompleted' | 'Completed'
  message: string
  turn: number
  toolName?: string | null
  occurredUtc: string
}

export type LocalAppGraphLiveRun = {
  schema: 'ansight.app-graph-live/v1' | 'ansight.app-graph-live/v2' | 'ansight.app-graph-live/v3'
  runId: string
  sessionId: string
  appId?: string | null
  graphName: string
  status: 'starting' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  message: string
  currentDestinationId?: string | null
  activeToolName?: string | null
  turn: number
  startedUtc: string
  updatedUtc: string
  completedUtc?: string | null
  coverage: LocalAppGraphLiveCoverage
  nodes: LocalAppGraphLiveNode[]
  edges: LocalAppGraphLiveEdge[]
  navigationHosts?: LocalAppGraphLiveNavigationHost[]
  tabGroups?: LocalAppGraphLiveTabGroup[]
  frontier?: LocalAppGraphLiveAction[]
  trace: LocalAppGraphLiveTraceEntry[]
}

export type LocalAppGraphSummary = {
  id: string
  name: string
  intent: string
  status: string
  version: number
  currentVersionId?: string | null
  updatedAt: string
}

export type LocalAppGraphQueryResult = {
  isSuccess: boolean
  message: string
  graphs: LocalAppGraphSummary[]
}

export type LocalAppGraphRecording = {
  id: string
  sessionId: string
  appId: string
  appName: string
  appGraphId?: string | null
  baseVersionId?: string | null
  committedVersionId?: string | null
  graphName: string
  intent: string
  status: 'recording' | 'review' | 'committed' | 'cancelled'
  currentDestinationId?: string | null
  definition: import('../types').AppGraphDefinition
  evidence: Record<string, unknown>
  pendingTransition?: Record<string, unknown> | null
  startedAtUtc: string
  updatedAtUtc: string
  stoppedAtUtc?: string | null
  gaps: string[]
}

export type LocalAppGraphRecordingOperationResult = {
  isSuccess: boolean
  message: string
  recording?: LocalAppGraphRecording | null
  graphId?: string | null
  versionId?: string | null
}

export type LocalCompanionAccessMode = 'disabled' | 'session' | 'always'

export type LocalCoreSettings = {
  logCaptureLevel: 'Verbose' | 'Debug' | 'Information' | 'Warning' | 'Error' | 'Fatal'
  captureNativeSessionLogs: boolean
  captureHostOperationLogs: boolean
  captureFullHostOperationTrafficToDisk: boolean
  adbPath: string
  xcodePath: string
  sessionAutoCleanupEnabled: boolean
  sessionAutoCleanupRetentionDays: number
  sessionAutoCompactionAgeDays: number
  sessionAutoCleanupMaximumCacheBytes: number
  memorySpikeMinimumIncreasePercent: number
  memorySpikeMinimumIncreaseMegabytes: number
  companionMachineName: string
  companionTeamId: string
  companionAccessMode: LocalCompanionAccessMode
  companionAccessEnabled: boolean
  companionAccessAvailable: boolean
  companionAccessStatus: string
  companionConnectionCount: number
}

export type LocalCoreSettingsUpdateRequest = Pick<LocalCoreSettings,
  | 'logCaptureLevel'
  | 'captureNativeSessionLogs'
  | 'captureHostOperationLogs'
  | 'captureFullHostOperationTrafficToDisk'
  | 'adbPath'
  | 'xcodePath'
  | 'sessionAutoCleanupEnabled'
  | 'sessionAutoCleanupRetentionDays'
  | 'sessionAutoCompactionAgeDays'
  | 'sessionAutoCleanupMaximumCacheBytes'
  | 'memorySpikeMinimumIncreasePercent'
  | 'memorySpikeMinimumIncreaseMegabytes'
  | 'companionMachineName'
  | 'companionTeamId'
  | 'companionAccessMode'
>

export type LocalCoreSettingsUpdateResult = {
  isSuccess: boolean
  message: string
  settings: LocalCoreSettings
}

export type LocalRegisteredApp = {
  appId: string
  name: string
  codebasePath?: string | null
  automaticTrendsMonitoringEnabled: boolean
  iconImagePath?: string | null
  repositoryAutomationsEnabled: boolean
  sourceKind?: string | null
  sourceTeamId?: string | null
  sourceTeamName?: string | null
  firstSeenUtc: string
  lastSeenUtc: string
  sessionCount: number
  liveSessionCount: number
  analysisCount: number
  enrollmentInviteCount: number
}

export type LocalRepositoryTask = {
  enabled: boolean
  taskId: string
  schemaVersion: number
  appId: string
  title: string
  description: string
  feature?: string | null
  keywords: string[]
  declaredHostTools: string[]
  timeoutSeconds: number
  maximumActions: number
  modulePath: string
}

export type LocalWorkspaceTest = {
  enabled: boolean
  testId: string
  name: string
  appId: string
  prompt: string
  requiredSecrets: string[]
  filePath: string
}

export type LocalRepositoryTrigger = {
  enabled: boolean
  repositoryRootPath: string
  triggerId: string
  appId: string
  eventKind: string
  automationId: string
  actionKind: string
  actionTarget: string
  maximumAttempts: number
  schemaVersion: number
  modulePath: string
}

export type LocalWorkspaceEventAnchor = {
  label: string
  eventType?: string | null
  channelId?: number | null
}

export type LocalWorkspaceTrendsMetric = {
  metricId: string
  channel: {
    type?: string | null
    name?: string | null
    source?: string | null
    kind?: string | null
    requireExactlyOne: boolean
  }
  statistic: string
  budget: {
    greaterThanOrEqual?: number | null
    lessThanOrEqual?: number | null
    absoluteLessThanOrEqual?: number | null
  }
  statisticThreshold?: number | null
  minimumSamples: number
  maximumSampleGap: string
  baselineBeforeStart: string
  tailAfterEnd: string
  regression?: {
    direction: string | number
    percent?: number | null
    absolute?: number | null
    confirmRuns: number
    baselineRuns: number
    minimumBaselineRuns: number
    seriesBy: string[]
    blocking: boolean
  } | null
  display?: {
    title?: string | null
    unit?: string | null
    scale?: number | null
    fractionDigits?: number | null
    minimum?: number | null
    maximum?: number | null
    includeZero?: boolean | null
  } | null
}

export type LocalWorkspaceTrends = {
  enabled: boolean
  trendsId: string
  appId: string
  span: {
    start: LocalWorkspaceEventAnchor
    end: LocalWorkspaceEventAnchor
    selection: number | string
    maximumDuration: string
  }
  required: boolean
  missingDataOutcome: string
  metrics: LocalWorkspaceTrendsMetric[]
  definitionHash: string
  filePath: string
}

export type LocalWorkspaceSanitizer = {
  sanitizerId: string
  modulePath: string
}

export type LocalRepositoryWorkspaceCatalog = {
  repositoryRootPath: string
  appId: string
  tests: LocalWorkspaceTest[]
  tasks: LocalRepositoryTask[]
  triggers: LocalRepositoryTrigger[]
  trends: LocalWorkspaceTrends[]
  sanitizers: LocalWorkspaceSanitizer[]
  warnings: string[]
}

export type LocalEnrollmentInvite = {
  inviteId: string
  scope: string
  appId: string
  appName: string
  schema: string
  issuedAtUtc: string
  expiresAtUtc: string
  isConsumed: boolean
  isExpired: boolean
  status: string
  sourceKind?: string | null
  isReadOnly: boolean
}

export type LocalEnrollmentInviteResult = {
  isSuccess: boolean
  message: string
  invite?: LocalEnrollmentInvite | null
  duration?: string | null
  pairingCode?: string | null
  hostAddresses: string[]
  qrImageDataUrl?: string | null
}

export type LocalTrendsMetricHistoryEntry = {
  evaluationId: string
  runId: string
  sessionId: string
  appId: string
  appVersion?: string | null
  buildNumber?: string | null
  platform?: string | null
  deviceModel?: string | null
  operatingSystemMajor?: string | null
  buildConfiguration?: string | null
  trendsId: string
  instanceIndex: number
  metricId: string
  metricKey: string
  value: number
  unit: string
  status: string | number
  evaluatedAtUtc: string
  spanGroup?: string | null
  metricDefinitionHash: string
}

export type LocalTrendsHistoryEntry = {
  evaluationId: string
  runId: string
  sessionId: string
  appId: string
  appVersion?: string | null
  buildNumber?: string | null
  decisionId: string
  metricKey: string
  comparison: string | number
  spanGroup?: string | null
  status: string | number
  currentValue: number
  baselineValue?: number | null
  absoluteDelta?: number | null
  relativeDeltaPercent?: number | null
  baselineRunCount: number
  minimumBaselineRunCount: number
  consecutiveBreachCount: number
  evaluatedAtUtc: string
  baselineAppVersion?: string | null
  platform?: string | null
  deviceModel?: string | null
  operatingSystemMajor?: string | null
  buildConfiguration?: string | null
  definitionHash: string
  metricDefinitionHash: string
  unit: string
  message: string
  blocking: boolean
  seriesKey: string
}

export type LocalTrendsYAxis = {
  unit?: string | null
  scale?: number | null
  fractionDigits?: number | null
  minimum?: number | null
  maximum?: number | null
  includeZero?: boolean | null
}

export type LocalTrendsChart = {
  decisionId: string
  metricKey: string
  title?: string | null
  yAxis: LocalTrendsYAxis
  definitionHash: string
}

export type LocalTrendsSeries = {
  seriesId: string
  appId: string
  decisionId: string
  metricKey: string
  comparison: string | number
  appVersion?: string | null
  buildNumber?: string | null
  baselineAppVersion?: string | null
  spanGroup?: string | null
  platform?: string | null
  deviceModel?: string | null
  operatingSystemMajor?: string | null
  buildConfiguration?: string | null
  seriesKey: string
  definitionHash: string
  metricDefinitionHash: string
  unit: string
  latestStatus: string | number
  blocking: boolean
  points: LocalTrendsHistoryEntry[]
  chart?: LocalTrendsChart | null
}

export type LocalTrendsHistory = {
  databasePath: string
  metrics: LocalTrendsMetricHistoryEntry[]
  history: LocalTrendsHistoryEntry[]
  charts: LocalTrendsChart[]
  series: LocalTrendsSeries[]
}

export type LocalTrendsRebuildAppResult = {
  appId: string
  workspacePath: string
  metricCount: number
  historyDefinitionCount: number
  historyResultCount: number
  statusCounts: Record<string, number>
}

export type LocalTrendsRebuildResult = {
  databasePath: string
  dryRun: boolean
  appId?: string | null
  appVersion?: string | null
  metricKey?: string | null
  removedHistoryResultCount: number
  rebuiltHistoryResultCount: number
  apps: LocalTrendsRebuildAppResult[]
  skippedApps: Array<{
    appId: string
    reason: string
  }>
}

export type LocalTestBatchItemAudit = {
  index: number
  testId: string
  testName: string
  appId: string
  status: string
  message: string
  agentRunId?: string | null
  sessionId?: string | null
  agentAuditFilePath?: string | null
  durationMilliseconds: number
  totalTokens: number
  modelPassCount: number
  ansightToolCallCount: number
}

export type LocalTestBatchAudit = {
  batchRunId: string
  source: string
  workspacePath: string
  requestedTestIds: string[]
  model?: string
  reasoning?: string | null
  maximumTurnsPerInstruction: number
  maximumRoundTrips: number
  maximumToolCalls: number
  continueAfterTestFailure: boolean
  workspaceToolsEnabled: boolean
  startedUtc: string
  completedUtc?: string | null
  status: string
  message: string
  tests: LocalTestBatchItemAudit[]
  passedCount: number
  failedCount: number
  cancelledCount: number
  skippedCount: number
  durationMilliseconds: number
  totalTokens: number
}

export type LocalTestBatchHistoryEntry = {
  audit: LocalTestBatchAudit
  filePath: string
}

export type LocalTestRunSummary = {
  runId: string
  batchRunId?: string | null
  workspacePath?: string | null
  testId?: string | null
  testName?: string | null
  displayName: string
  appId?: string | null
  sessionId: string
  model?: string
  reasoning?: string | null
  status: string
  message: string
  startedUtc: string
  completedUtc: string
  durationMilliseconds: number
  totalTokens: number
  modelPassCount: number
  ansightToolCallCount: number
  calculatedCost?: LocalTestRunCost | null
  filePath: string
}

export type LocalTestHistory = {
  historyDirectoryPath: string
  batches: LocalTestBatchHistoryEntry[]
  runs: LocalTestRunSummary[]
}

export type LocalTestInstructionAudit = {
  index: number
  instruction: string
  status: string | number
  summary: string
  turns: number
  toolCalls: number
}

export type LocalTestAuditPayload = {
  content: string
  originalCharacterCount: number
  wasTruncated: boolean
  sha256: string
}

export type LocalTestTokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens?: number
  reasoningOutputTokens: number
}

export type LocalTestRunCost = {
  costMicros?: number | null
  providerCostMicros?: number
  customerCostMicros?: number | null
  currency: string
  status: string
}

export type LocalTestStartupStep = {
  name: string
  startedUtc: string
  durationMilliseconds: number
  status: string
}

export type LocalTestModelPassAudit = {
  transport?: {
    attempts: {
      mode: string
      startedUtc?: string | null
      durationMilliseconds: number
      connectionDurationMilliseconds?: number | null
      connectionSucceeded?: boolean | null
      requestPreparedMilliseconds?: number | null
      requestSentMilliseconds?: number | null
      firstResponseMilliseconds?: number | null
      responseCompletedMilliseconds?: number | null
      parsingDurationMilliseconds?: number | null
      error?: string | null
    }[]
  } | null
  sequence: number
  instructionIndex: number
  instructionTurn: number
  startedUtc: string
  durationMilliseconds: number
  succeeded: boolean
  responseId?: string | null
  responseModel?: string | null
  responseServiceTier?: string | null
  assistantText?: string | null
  functionCallCount: number
  tokens: LocalTestTokenUsage
  errorMessage?: string | null
  context?: LocalTestAuditPayload | null
}

export type LocalTestOcrTraceEvidence = {
  provider?: string | null
  available: boolean
  message?: string | null
  capturedAtUtc: string
  screenshotFrameId?: string | null
  screenshotSha256?: string | null
  screenshotFormat?: string | null
  screenWidth: number
  screenHeight: number
  detectionCount: number
  results: LocalTestAuditPayload
  screenshotPath?: string | null
  resultsPath?: string | null
}

export type LocalTestAccessibilityTraceEvidence = {
  source: string
  capturedAtUtc: string
  nodeCount: number
  snapshotId?: string | null
  snapshot: LocalTestAuditPayload
}

export type LocalTaskSourceModule = {
  path: string
  language: string
  content: string
  sha256: string
  originalCharacterCount: number
  wasTruncated: boolean
}

export type LocalTaskSourceTrace = {
  taskId: string
  modules: LocalTaskSourceModule[]
  captureError?: string | null
}

export type LocalRepositoryTaskToolCall = {
  sequence: number
  toolName: string
  startedAtUtc?: string | null
  completedAtUtc?: string | null
  durationMilliseconds: number
  isError: boolean
  message: string
  correlationId?: string | null
  arguments?: LocalTestAuditPayload | null
  result?: LocalTestAuditPayload | null
  sourceTrace?: LocalTaskSourceTrace | null
  childCalls?: LocalRepositoryTaskToolCall[] | null
}

export type LocalTestToolCallAudit = {
  sequence: number
  instructionIndex: number
  instructionTurn: number
  callId: string
  toolName: string
  isAnsightTool: boolean
  correlationId?: string | null
  startedUtc: string
  durationMilliseconds: number
  arguments: LocalTestAuditPayload
  result: LocalTestAuditPayload
  isError: boolean
  message: string
  ocrEvidence?: LocalTestOcrTraceEvidence | null
  accessibilityEvidence?: LocalTestAccessibilityTraceEvidence | null
  taskSource?: LocalTaskSourceTrace | null
  taskCalls?: LocalRepositoryTaskToolCall[] | null
}

export type LocalTestAppGraphBinding = {
  bindingId: string
  priority: number
  mechanism: string
  configuration: Record<string, unknown>
  preconditions: string[]
  postconditions: string[]
  confidence: number
}

export type LocalTestAppGraphTransition = {
  index: number
  edgeId: string
  fromState: string
  toState: string
  action: string
  postconditions: string[]
  bindings: LocalTestAppGraphBinding[]
}

export type LocalTestAppGraphPlan = {
  graphId: string
  versionId: string
  name: string
  intent: string
  targetState: string
  transitions: LocalTestAppGraphTransition[]
}

export type LocalTestRunAudit = {
  startupSteps?: LocalTestStartupStep[]
  schemaVersion?: number
  runId: string
  batchRunId?: string | null
  workspacePath?: string | null
  workspaceTestId?: string | null
  workspaceTestName?: string | null
  appId?: string | null
  sessionId: string
  model?: string
  openAiTransport?: string | null
  openAiProtocol?: string | null
  reasoning?: string | null
  status: string | number
  message: string
  startedUtc: string
  completedUtc: string
  durationMilliseconds: number
  requestedInstructions?: string[]
  agentPrompt?: string | null
  promptCacheKey?: string | null
  environment?: Record<string, unknown> | null
  appGraphPlans?: LocalTestAppGraphPlan[]
  appGraphEnabled?: boolean
  traceEnabled?: boolean
  modelPassCount: number
  ansightToolCallCount: number
  tokens: LocalTestTokenUsage
  calculatedCost?: LocalTestRunCost | null
  instructions: LocalTestInstructionAudit[]
  modelPasses?: LocalTestModelPassAudit[]
  toolCalls: LocalTestToolCallAudit[]
}

export type LocalTestRunHistoryEntry = {
  audit: LocalTestRunAudit
  filePath: string
}

export type LocalTestHistoryInspection = {
  requestedRunId: string
  batch?: LocalTestBatchHistoryEntry | null
  runs: LocalTestRunHistoryEntry[]
}

export type LocalSessionSummary = {
  sessionId: string
  appId: string
  appName?: string | null
  appIconUrl?: string | null
  name?: string | null
  clientName: string
  status: string
  isConnected: boolean
  isSimulatorOrEmulator: boolean
  runtimeDeviceIdentifier?: string | null
  runtimePlatform?: string | null
  technology?: string | null
  captureSource: string
  isHistorical: boolean
  isPinned: boolean
  createdUtc: string
  lastUpdatedUtc: string
  logCount: number
  screenshotCount: number
  visualTreeSnapshotCount: number
  artifactSnapshotCount: number
  tags: string[]
}

export type LocalOperationResult = {
  isSuccess: boolean
  message: string
}

export type LocalDeviceCapability = {
  platform: string
  isAvailable: boolean
  backend: string
  message: string
  status?: string | null
}

export type LocalDevice = {
  identifier: string
  name: string
  platform: string
  runtime: string
  state: string
  isBooted: boolean
  isAvailable: boolean
  kind: string
  isPhysical: boolean
  isVirtual: boolean
  formFactor?: string | null
}

export type LocalDeviceInventory = {
  capabilities: LocalDeviceCapability[]
  devices: LocalDevice[]
  warnings: string[]
}

export type LocalInstalledApplication = {
  identifier: string
  name: string
  bundlePath?: string | null
  version?: string | null
  buildVersion?: string | null
  installedAtUtc?: string | null
  lastUpdatedAtUtc?: string | null
}

export type LocalAccountStatus = {
  schema: 'ansight.account-status/v1'
  isAuthenticated: boolean
  userId?: string | null
  email?: string | null
  fullName?: string | null
  company?: string | null
  authenticationMethod?: string | null
  authenticatedAtUtc?: string | null
  accessTokenExpiresAtUtc?: string | null
  canRefresh: boolean
}

export type LocalAccountOperationResult = LocalOperationResult & {
  status: LocalAccountStatus
}

export type LocalCompanionAccess = {
  mode: 'disabled' | 'session' | 'always' | number
  isEnabled: boolean
  isAvailable: boolean
  status: string
  connectionCount: number
}

export type LocalCompanionConnection = {
  sessionId: string
  deviceIdentifier: string
  deviceName: string
  model: string
  platform: string
  operatingSystemVersion: string
  appVersion: string
  targetDeviceIdentifier: string
  connectedAtUtc: string
}

export type LocalCompanionOverview = {
  schema: 'ansight.local-companion/v1'
  access: LocalCompanionAccess
  connections: LocalCompanionConnection[]
}

export type LocalCompanionMachine = {
  id: string
  teamId?: string | null
  hostId: string
  hostApplication: string
  displayName: string
  platform: string
  authorizationStatus: string
  lastSeenAt: string
  revokedAt?: string | null
  createdAt: string
  updatedAt: string
  isCurrentMachine: boolean
  isOnline: boolean
}

export type LocalHostHealthCheck = {
  name: string
  status: string
  isSuccess: boolean
  isRequired: boolean
  message: string
  path?: string | null
  signal: 'green' | 'amber' | 'red'
}

export type LocalHostHealth = {
  schema: 'ansight.host-health/v1'
  operatingSystem: string
  architecture: string
  dotNetVersion: string
  hostVersion: string
  dataDirectory: string
  logDirectory: string
  checks: LocalHostHealthCheck[]
  isHealthy: boolean
  generatedAtUtc: string
  signal: 'green' | 'amber' | 'red'
}

export type LocalHostLogFile = {
  fileName: string
  byteCount: number
  lastModifiedUtc: string
}

export type LocalSessionCacheItem = {
  sessionId: string
  appId: string
  name?: string | null
  createdUtc: string
  lastUpdatedUtc: string
  cacheSizeBytes: number
  reason: string
}

export type LocalSessionCachePlan = {
  retentionDays: number
  maximumCacheSizeBytes: number
  totalCacheSizeBytes: number
  projectedCacheSizeBytes: number
  autoCleanupEnabled: boolean
  lastAutoCleanupUtc: string | null
  lastAutoCleanupDeletedCount: number
  sessionCount: number
  pinnedSessionCount: number
  liveSessionCount: number
  retentionCandidateCount: number
  cacheCandidateCount: number
  items: LocalSessionCacheItem[]
  deleteCount: number
}

export type LocalTestExecutionProgress = {
  stage: string
  message: string
  occurredAtUtc: string
  testIndex?: number | null
  testCount?: number | null
  testId?: string | null
}

export type LocalTestExecution = {
  schema: 'ansight.local-test-execution/v1'
  executionId: string
  kind: 'single' | 'batch'
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  message: string
  workspacePath: string
  testIds: string[]
  createdAtUtc: string
  updatedAtUtc: string
  progress: LocalTestExecutionProgress[]
  result?: {
    isSuccess: boolean
    message: string
    testId?: string | null
    sessionId?: string | null
    passedCount: number
    failedCount: number
    skippedCount: number
    wasCancelled: boolean
    traceRunId?: string | null
    traceError?: string | null
  } | null
}

export type LocalCloudTeam = {
  teamId: string
  name: string
  memberCap: number
  role?: string | null
  allowedAppIds: string[]
}

export type LocalCloudTeamQueryResult = {
  isSuccess: boolean
  message: string
  teams: LocalCloudTeam[]
}

export type LocalCloudSession = {
  id: string
  teamId: string
  accessStatus: string
  runtimePlatform?: string | null
  appId?: string | null
  appName?: string | null
  sourceSessionId?: string | null
  title: string
  storageLayout: string
  streamByteSize: number
  uploadedAt: string
  authorEmail?: string | null
  authorName?: string | null
  archivedAt?: string | null
}

export type LocalCloudSessionQueryResult = {
  isSuccess: boolean
  message: string
  sessions: LocalCloudSession[]
}

export type LocalCloudSessionOpenResult = {
  isSuccess: boolean
  message: string
  importedSessionId?: string | null
}

export type LocalCloudSessionOpenProgress = {
  stage: string
  statusText: string
  progress: number
}

export type LocalSessionShareResult = {
  isSuccess: boolean
  message: string
  sessionId: string
  accessLevel: string
  team?: LocalCloudTeam | null
  sharedSession?: LocalCloudSession | null
  shareUrl?: string | null
  availableTeams: LocalCloudTeam[]
}

export type LocalSessionShareProgress = {
  stage: string
  statusText: string
  progress: number
  bytesTransferred: number
  totalBytes: number
  completedItems: number
  totalItems: number
}

export type LocalSessionVisualTreeTypeSelection = {
  visualTreeKind: string
  visualTreeFormat: string
  runtimePlatform: string
  source: string
}

export type HostDeviceInventory = {
  devices: HostDeviceDescriptor[]
  warnings: string[]
}

export type HostDeviceDescriptor = {
  identifier: string
  name: string
  platform: string
  runtime: string
  state: string
  isBooted: boolean
  isAvailable: boolean
  kind: string
}

export type DeviceLocationPoint = {
  latitude: number
  longitude: number
  timestamp?: string | null
}

export type LocationPlaybackSnapshot = {
  runId?: string | null
  isPlaying: boolean
  status: string
  message: string
  platform?: string | null
  deviceIdentifier?: string | null
  sourceFileName?: string | null
  pointCount: number
  currentPointIndex: number
  distanceMeters: number
  recordedDuration?: string | null
  mode: number
  playbackSpeedMultiplier: number
  fixedSpeedKph: number
  loop: boolean
  currentLocation?: DeviceLocationPoint | null
  startedUtc?: string | null
  completedUtc?: string | null
}

export type OperationResponse = {
  isSuccess: boolean
  message: string
}

export type LiveVisualTreeCaptureResponse = OperationResponse & {
  sessionId: string
  snapshotId?: string | null
  nodeCount: number
}

export type LocalSessionLiveUpdate = {
  sessionId: string
  requiresReset: boolean
  lastUpdatedUtc: string
  status: string
  appState?: string | number | null
  appStateChangedUtc?: string | null
  lifecycleEvents?: SessionApplicationEvent[]
  customProperties?: Record<string, Record<string, unknown>> | null
  logs: SessionLogEntry[]
  logStreams: SessionLogStream[]
  images: SessionImageFrame[]
  touches: SessionTouchInputRecord[]
  networkRequests: SessionNetworkRequest[]
  visualTreeSnapshots: SessionVisualTreeSnapshot[]
  artifactSnapshots: SessionArtifactSnapshot[]
  metricChannels: SessionMetricChannel[]
  metrics: SessionMetricSample[]
  annotations: SessionAnnotation[]
  analyses: SessionAnalysisRecord[]
  totalLogCount: number
  totalImageCount: number
  totalTouchCount: number
  totalNetworkRequestCount: number
  totalVisualTreeCount: number
  totalArtifactCount: number
  totalMetricChannelCount: number
  totalMetricSampleCount: number
  totalAnnotationCount: number
  totalAnalysisCount: number
}

export type LocalAppToolResponse = {
  success: boolean
  message: string
  artifactSnapshotId?: string | null
  envelope?: {
    type?: string
    payload?: {
      message?: string
      result?: unknown
    }
  } | null
}
export type LocalRemoteRunnerStatus = {
  enabled: boolean
  state: 'disabled' | 'starting' | 'idle' | 'busy' | 'error' | string
  message: string
  machineId?: string | null
  displayName?: string | null
  teamId?: string | null
  jobId?: string | null
  jobKind?: string | null
  lastHeartbeatAt?: string | null
  updatedAt?: string | null
}

export type LocalRemoteRunnerResponse = {
  schema: string
  runner: LocalRemoteRunnerStatus
  registration?: LocalRemoteRunnerRegistration | null
  canManage?: boolean
}

export type LocalRemoteRunnerRegistration = {
  machineId: string
  teamId: string
  displayName: string
  kinds: string[]
}
