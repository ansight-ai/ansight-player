import { resolveDeviceFrame } from '../deviceFrame'
import { deferredTelemetryReport, type DeferredTelemetryReport } from '../deferredTelemetry'
import { DeferredTelemetryStatus } from '../components/DeferredTelemetryStatus'
import { timelineCornerPaths } from '../timelineCurve'
import { formatMetricValue, isFlutterDiagnosticChannel, isFpsChannel, metricAxisMaximum, metricPresentation } from '../metricPresentation'
import { ArtifactComparisonExplorer } from '../components/ArtifactComparisonExplorer'
import type { ArtifactComparisonSource } from '../components/artifactComparison'
import { trackInspection, type InspectionFeature } from '../../local-replay/usage'
import {
  ArrowLeft,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsIn,
  ArrowsOut,
  Archive,
  CheckCircle,
  Coins,
  CaretDown,
  Check,
  CircleNotch,
  ClipboardText,
  Clock,
  Code,
  DownloadSimple,
  FileText,
  Funnel,
  Image as ImageIcon,
  Info,
  List,
  ListBullets,
  MagnifyingGlass,
  NotePencil,
  Paperclip,
  Play,
  Robot,
  Scissors,
  GlobeSimple,
  Sparkle,
  Stack,
  Tag,
  Trash,
  TreeStructure,
  UploadSimple,
  User,
  WarningCircle,
  Wrench,
  X,
} from '@phosphor-icons/react'
import { SdkCapabilityNotice, SdkTouchCaptureNotice, type SdkCapabilityFeature } from '../components/SdkCapabilityNotice'
import type { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react'
import { memo, startTransition, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { VirtualizedLogList } from '../components/VirtualizedLogList'
import type { SessionOperationProgress } from '../../local-replay/sessionOperationStream'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LiveVisualTreeCaptureToolbar, type LiveVisualTreeSource } from '../LiveVisualTreeCaptureToolbar'
import { selectFrameForVisualTree } from '../visualTreeFrame'
import { DetailRow } from '../../components/DetailRow'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { loadPlayerCurrentUserId } from '../../adapters/cloudPlayerAdapter'
import {
  VisualTreeInspector,
  type VisualTreeOverlaySelection,
} from '../components/VisualTreeInspector'
import {
  FileContentPreview,
  LargeFilePreviewWarning,
  LiveSessionFileExplorer,
} from '../components/LiveSessionFileExplorer'
import { isLargeFilePreview } from '../components/liveFilePreview'
import { resolveMediaFileFormat } from '../components/mediaFileFormat'
import { ArtifactFileActions, type ArtifactFileOperations } from '../components/ArtifactFileActions'
import { SessionEditModal } from '../SessionEditModal'
import {
  archiveTeamSession,
  canCurrentUserManageSession,
  deleteTeamSession,
  defaultTeamAttachmentLimits,
  formatBytes,
  formatSessionAccessStatus,
  loadTeamAttachmentLimits,
  type SessionDetailsUpdate,
  type TeamAttachmentLimits,
  updateSessionDetails,
} from '../teamData'
import {
  canCurrentUserAttachToSession,
  createSessionAttachment,
  createSessionAttachmentSignedUrl,
  deleteSessionAttachment,
  loadSessionAttachments,
} from '../sessionAttachmentData'
import {
  archiveSessionAiExtraction,
  aiProviders,
  createSessionAiExtraction,
  defaultModelForProvider,
  defaultPromptForSessionAiKind,
  formatAiProvider,
  formatSessionAiKind,
  formatSessionAiMode,
  formatSessionAiSourceParts,
  formatTokenCount,
  invokeSessionAiExtraction,
  loadSessionAiCapabilities,
  loadSessionAiExtractions,
  providerIsConfigured,
  sessionAiSourcePartLabels,
  type CreateSessionAiExtractionRequest,
  type SessionAiSourcePartOption,
} from '../sessionAiData'
import { formatMoneyMicros } from '../usageData'
import {
  createSessionFileSignedUrl,
  createSessionFileSignedUrls,
  createRawSessionArchiveSignedUrl,
  findImageFile,
  type SharedSessionStreamFile,
  type SessionArtifactEntry,
  type SessionAnalysisRecord,
  type SessionAnnotation,
  type SessionAnnotationGeometry,
  type SessionArtifactSnapshot,
  type SessionImageFrame,
  type SessionLiveFileContent,
  type SessionFileDatabaseQueryResult,
  type SessionLiveFileDirectory,
  type SessionLiveFileListOptions,
  type SessionLogEntry,
  type SessionLogStream,
  type SessionMetricChannel,
  type SessionMetricSample,
  type SessionNetworkBody,
  type SessionNetworkRequest,
  type SessionSnapshot,
  type SessionStorageBreakdown,
  type SessionStorageBreakdownItem,
  type SessionTouchInputRecord,
  type SessionViewerPayload,
  type SessionVisualTreeSnapshot,
  loadSessionViewerExternalPayload,
  loadSessionViewerPayload,
  loadSessionVisualTreeSnapshot,
  readCloudSessionArtifactFile,
} from '../sessionViewerData'
import type {
  AiProvider,
  SessionAiCapabilities,
  SessionAiExtractionKind,
  SessionAiExtractionMode,
  SessionAiExtractionSummary,
  SessionAiSourcePart,
  SessionAttachment,
  TeamSession,
} from '../../types'

type ViewerTab = 'live-log' | 'network' | 'annotations' | 'visual-tree' | 'artifacts' | 'files' | 'attachments'

type SessionAiForm = {
  kind: SessionAiExtractionKind
  analysisMode: SessionAiExtractionMode
  provider: AiProvider
  model: string
  sourceParts: SessionAiSourcePart[]
  promptInstructions: string
  sliceStartSeconds: string
  sliceEndSeconds: string
}

type TimelineRange = {
  startMs: number
  endMs: number
  initialMs: number
}

export type TimelineEditSelection = {
  startMs: number
  endMs: number
  focusMs: number
}

type TimelineRangeDraft = {
  currentTimestampMs: number
  currentX: number
  pointerId: number
  startTimestampMs: number
  startX: number
}

type TimelineEditAction = 'annotate' | 'extract' | 'task' | SessionTimelineTrimMode

type TimelineMetricPoint = {
  timestampMs: number
  value: number
}

type TimestampedItem<T> = {
  item: T
  timestampMs: number
}

type TimelineMetricSamplePoint = {
  channelId: number
  segmentId: number
  timestampMs: number
  value: number
}

type TimelineMetricIndex = {
  channelIds: number[]
  channelMap: Map<number, SessionMetricChannel>
  channelMaxBlocksById: Map<number, number[]>
  channelSamplesById: Map<number, TimelineMetricSamplePoint[]>
  channelSegmentsById: Map<number, TimelineMetricSamplePoint[][]>
  firstTimestampMs: number | null
  fpsSamples: TimelineMetricSamplePoint[]
  lastTimestampMs: number | null
}

type TimelineReplayIndex = {
  artifactSnapshots: Array<TimestampedItem<SessionArtifactSnapshot>>
  frames: Array<TimestampedItem<SessionImageFrame>>
  logs: Array<TimestampedItem<SessionLogEntry>>
  touches: Array<TimestampedItem<SessionTouchInputRecord>>
  visualTrees: Array<TimestampedItem<SessionVisualTreeSnapshot>>
  visualTreesByFrameId: Map<string, SessionVisualTreeSnapshot>
}

type TimelineMetricGradient = {
  endColor: string
  endX: number
  endY: number
  startColor: string
  startX: number
  startY: number
}

type TimelineMetricSegment = {
  color: string
  gradient?: TimelineMetricGradient
  path: string
}

type TimelinePlot = {
  left: number
  top: number
  right: number
  bottom: number
}

type TimelineVisibleRangeState = {
  isUserAdjusted: boolean
  rangeKey: string
  visibleRange: TimelineRange
}

type TimelineVisibleRangeDragState = {
  durationMs: number
  pointerId: number
  pointerStartMs: number
  startMs: number
}

type TimelineGestureZoomState = {
  anchorRatio: number
  anchorTimestampMs: number
  initialVisibleDurationMs: number
}

type SafariGestureEvent = Event & {
  clientX: number
  scale: number
}

type TimelineAnnotationMarker = {
  badgeX: number
  badgeY: number
  height: number
  width: number
  x: number
  y: number
}

type TimelineAnnotationDraft = {
  currentTimestampMs: number
  currentX: number
  pointerId: number
  startTimestampMs: number
  startX: number
}

type TimelineProbeLine = {
  channelId: number
  color: string
  label: string
  value: number
}

type LogListItem = {
  index: number
  log: SessionLogEntry
  timestampMs: number
}

type LogLevelFilterValue = 'all' | 'trace' | 'debug' | 'info' | 'warn' | 'error'

type LogFilterState = {
  keyword: string
  tag: string
  minimumLevel: LogLevelFilterValue
  startSeconds: string
  endSeconds: string
}

type AppLifecycleState = 'foreground' | 'background'

type LifecycleTransition = {
  state: AppLifecycleState
  timestampMs: number
}

type LifecycleBackgroundSection = {
  startMs: number
  endMs: number
}

type CachedImageUrl = {
  isObjectUrl: boolean
  url: string
}

type SessionImageUrlBatch = {
  sessionId: string
  promise: Promise<Map<string, string>>
}

export type SessionViewerSource = {
  mode: 'cloud' | 'local'
  loadPayload: (sessionId: string, superAdminMode: boolean) => Promise<SessionViewerPayload>
  loadAiReadState?: (sessionId: string) => Promise<SessionAiReadState>
  createAiExtraction?: (request: CreateSessionAiExtractionRequest) => Promise<string>
  invokeAiExtraction?: (runId: string) => Promise<void>
  archiveAiExtraction?: (sessionId: string, runId: string, shouldArchive: boolean) => Promise<void>
  refreshPayload?: (
    sessionId: string,
    current: SessionViewerPayload,
    superAdminMode: boolean,
  ) => Promise<SessionViewerPayload>
  hydratePayload?: (payload: SessionViewerPayload) => Promise<SessionViewerPayload>
  loadImageUrl?: (payload: SessionViewerPayload, frame: SessionImageFrame) => Promise<string>
  loadStorageBreakdown?: (sessionId: string) => Promise<SessionStorageBreakdown>
  optimizeSession?: (sessionId: string, encodeVideo: boolean, onProgress: (progress: SessionOptimizationProgress) => void) => Promise<SessionOptimizationResult>
  loadLiveVisualTreeSources?: (sessionId: string) => Promise<LiveVisualTreeSource[]>
  captureLiveVisualTree?: (sessionId: string, toolId: string) => Promise<string>
  upsertAnnotation?: (sessionId: string, annotation: SessionAnnotation) => Promise<string>
  deleteAnnotation?: (sessionId: string, annotationId: string) => Promise<string>
  extractTimelineRange?: (
    sessionId: string,
    startUtc: string,
    endUtc: string,
    name?: string,
  ) => Promise<SessionTimelineExtractionResult>
  trimTimelineRange?: (
    sessionId: string,
    startUtc: string,
    endUtc: string,
    mode: SessionTimelineTrimMode,
    onProgress?: (progress: SessionOperationProgress) => void,
  ) => Promise<string>
  captureLiveFile?: (
    sessionId: string,
    root: string,
    path: string,
  ) => Promise<string>
  listLiveFiles?: (
    sessionId: string,
    root: string | null,
    path: string,
    includeHidden: boolean,
    options?: SessionLiveFileListOptions,
  ) => Promise<SessionLiveFileDirectory>
  readLiveFile?: (
    sessionId: string,
    root: string,
    path: string,
    forceText?: boolean,
    allowLargeFile?: boolean,
  ) => Promise<SessionLiveFileContent>
  queryLiveDatabase?: (
    sessionId: string,
    path: string,
    sql: string,
    maxRows: number,
    root?: string,
  ) => Promise<SessionFileDatabaseQueryResult>
  readArtifactFile?: (
    sessionId: string,
    snapshotId: string | null,
    path: string,
    forceText?: boolean,
    allowLargeFile?: boolean,
  ) => Promise<SessionLiveFileContent>
  artifactFileOperations?: ArtifactFileOperations
  artifactComparison?: ArtifactComparisonSource
  queryArtifactDatabase?: (
    sessionId: string,
    snapshotId: string | null,
    path: string,
    sql: string,
    maxRows: number,
  ) => Promise<SessionFileDatabaseQueryResult>
}

export type SessionAiReadState = {
  capabilities: SessionAiCapabilities | null
  extractions: SessionAiExtractionSummary[]
  message?: string
}

export type SessionTimelineExtractionResult = {
  message: string
  extractedSessionId: string
}

export type SessionOptimizationProgress = { message: string; completed?: number | null; total?: number | null }

export type SessionOptimizationResult = {
  convertedImageCount: number
  archiveFilePath?: string | null
  isSuccess: boolean
  message: string
  removedScreenshotCount: number
  removedVisualTreeSnapshotCount: number
  removedItemCount: number
}

export type SessionTimelineTrimMode = 'cutSelection' | 'keepSelectionOnly'

type RefreshAiExtractionsOptions = {
  silent?: boolean
}

type SessionAiDurationFeedback = {
  message: string
  blocksSubmit: boolean
}

type SessionActionMessage = {
  kind: 'error' | 'success'
  message: string
}

type CloudAiAccessBlock = {
  eyebrow: string
  title: string
  message: string
  actionLabel: string
  actionHref: string
  tone: 'public' | 'status'
}

type JsonRecord = Record<string, unknown>

type DevicePropertySection = {
  title: string
  subtitle: string
  rows: DevicePropertyRow[]
}

type DevicePropertyRow = {
  label: string
  value: string
}

type AnnotationView = {
  durationDisplay: string
  focusMs: number | null
  geometrySummary: string
  hasNotes: boolean
  hasTarget: boolean
  id: string
  label: string
  notes: string
  notesPreview: string
  targetDetail: string | null
  targetSummary: string | null
  timeDisplay: string
}

type FrameAnnotationGeometryView = {
  annotationId: string
  geometry: SessionAnnotationGeometry
  isSelected: boolean
  key: string
}

type AnnotationEditorDraft = {
  annotation: SessionAnnotation
}

export type ScreenshotAnnotationGeometryDraft = {
  kind: 0 | 1
  x: number
  y: number
  width?: number
  height?: number
}

export type SessionReplayPanelContext = {
  captureToolbar?: ReactNode
  annotations: SessionAnnotation[]
  frame: SessionImageFrame | null
  isAnnotationEditorOpen: boolean
  onCreateAnnotation?: (geometry: ScreenshotAnnotationGeometryDraft) => void
  selectedAnnotationId: string | null
}

type SessionFrameImageContentBounds = {
  frameId: string
  height: number
  left: number
  top: number
  width: number
}

type FrameTouchView = {
  action: string
  opacity: number
  key: string
  x: number
  y: number
}

type SessionFrameViewportKind = 'phone' | 'tablet' | 'desktop'

const timelineChartFallbackWidth = 800
const timelineChartHeight = 220
const timelineChartHorizontalBleed = 12
// Equal side margins keep the plot centred; 72px fits the widest memory label on the right.
const timelinePlot: TimelinePlot = { left: 72, top: 12, right: 72, bottom: 30 }
const timelineCompactPlot: TimelinePlot = { left: 8, top: 10, right: 8, bottom: 18 }
const timelineLifecycleBarHeight = 14
const timelineChartValuePadding = 12
const timelineAnnotationLaneBottomInset = 4
const defaultGeometryAnnotationRenderDurationMs = 2000
const defaultTouchRenderDurationMs = 1600
const defaultLiveTimelineWindowMs = 2 * 60 * 1000
const liveSessionRefreshIntervalMs = 1000
const timelineAnnotationLaneHeight = 12
const timelineAnnotationMinimumWidth = 14
const timelineAnnotationCornerRadius = 6
const timelineAnnotationBadgeRadius = 5
const timelineAnnotationDraftThreshold = 6
const timelineAxisFractions = [1, 0.75, 0.5, 0.25, 0]
const timelineZoomInFactor = 0.9
const timelineZoomOutFactor = 1 / timelineZoomInFactor
const timelineWheelLineHeightPx = 16
const timelineScrubberMinorTicksPerMajorInterval = 3
const timelineScrubberTargetTickSpacingPx = 14
const maxCachedSessionImageFrames = 96
const sessionImagePrefetchFrameLimit = 64
const sessionImagePrefetchNeighborCount = 8
const sessionActionSuccessDismissDelayMs = 2200
const defaultLogFilterState: LogFilterState = {
  keyword: '',
  tag: '',
  minimumLevel: 'all',
  startSeconds: '',
  endSeconds: '',
}
const logLevelFilterOptions: Array<{ value: LogLevelFilterValue; label: string }> = [
  { value: 'all', label: 'All levels' },
  { value: 'trace', label: 'Trace+' },
  { value: 'debug', label: 'Debug+' },
  { value: 'info', label: 'Info+' },
  { value: 'warn', label: 'Warning+' },
  { value: 'error', label: 'Error' },
]
const logLevelSeverityByTone: Record<Exclude<LogLevelFilterValue, 'all'>, number> = {
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
}
const sessionReplayPanelDefaultWidth = 384
const sessionReplayPanelMinWidth = 300
const sessionReplayPanelMaxWidth = 720
const sessionReplayPanelReservedWidth = 620
const sessionReplayPanelWidthStorageKey = 'ansight.portal.sessionReplayPanelWidth'
const trailingTimelineSilenceToleranceMs = 2_000
const defaultSessionAiSourceParts: SessionAiSourcePart[] = ['session_metadata', 'logs', 'screenshots']
const cloudSessionViewerSource: SessionViewerSource = {
  mode: 'cloud',
  archiveAiExtraction: (_sessionId, runId, shouldArchive) => archiveSessionAiExtraction(runId, shouldArchive),
  createAiExtraction: createSessionAiExtraction,
  invokeAiExtraction: invokeSessionAiExtraction,
  loadAiReadState: loadSessionAiReadState,
  loadPayload: (sessionId, superAdminMode) => loadSessionViewerPayload(sessionId, { superAdminMode }),
  hydratePayload: loadSessionViewerExternalPayload,
}

function createDefaultSummaryAiForm(provider: AiProvider = 'openai'): SessionAiForm {
  return {
    kind: 'analysis',
    analysisMode: 'thorough',
    provider,
    model: defaultModelForProvider(provider),
    sourceParts: [...defaultSessionAiSourceParts],
    promptInstructions: defaultPromptForSessionAiKind('analysis'),
    sliceStartSeconds: '',
    sliceEndSeconds: '',
  }
}

const defaultSessionAiForm: SessionAiForm = {
  kind: 'analysis',
  analysisMode: 'thorough',
  provider: 'openai',
  model: defaultModelForProvider('openai'),
  sourceParts: [...defaultSessionAiSourceParts],
  promptInstructions: defaultPromptForSessionAiKind('analysis'),
  sliceStartSeconds: '',
  sliceEndSeconds: '',
}

async function loadSessionAiReadState(sessionId: string): Promise<SessionAiReadState> {
  const [capabilitiesResult, extractionsResult] = await Promise.allSettled([
    loadSessionAiCapabilities(sessionId),
    loadSessionAiExtractions(sessionId),
  ])

  if (extractionsResult.status === 'rejected') {
    throw extractionsResult.reason
  }

  return {
    capabilities: capabilitiesResult.status === 'fulfilled' ? capabilitiesResult.value : null,
    extractions: extractionsResult.value,
  }
}

function normalizeAiFormForCapabilities(current: SessionAiForm, capabilities: SessionAiCapabilities): SessionAiForm {
  const configuredProvider = providerIsConfigured(capabilities, current.provider)
  const nextProvider = configuredProvider
    ? current.provider
    : (aiProviders.find((provider) => providerIsConfigured(capabilities, provider.value))?.value ?? current.provider)
  const nextModel = nextProvider === current.provider ? current.model : defaultModelForProvider(nextProvider)

  if (
    nextProvider === current.provider &&
    nextModel === current.model &&
    current.analysisMode === 'thorough'
  ) {
    return current
  }

  return {
    ...current,
    analysisMode: 'thorough',
    provider: nextProvider,
    model: nextModel,
  }
}

export function SessionViewerPage({
  initialArtifactId,
  isEmbedded = false,
  isLiveSession = false,
  isSignedIn,
  onBack,
  onSessionExtracted,
  onReplayPanelWidthChange,
  onSessionInfoOpenChange,
  onTaskExtractionRequested,
  replayPanelOverride,
  refreshKey,
  sessionId,
  sessionInfoOpen,
  source = cloudSessionViewerSource,
  superAdminMode = false,
}: {
  initialArtifactId?: string
  isEmbedded?: boolean
  isLiveSession?: boolean
  isSignedIn: boolean
  onBack?: () => void
  onSessionExtracted?: (sessionId: string) => void | Promise<void>
  /** Reports the device column's width so an embedding shell can align its own chrome with the player's cards. */
  onReplayPanelWidthChange?: (width: number) => void
  onSessionInfoOpenChange?: (isOpen: boolean) => void
  onTaskExtractionRequested?: (selection: TimelineEditSelection) => void
  replayPanelOverride?: ReactNode | ((context: SessionReplayPanelContext) => ReactNode)
  refreshKey?: string | number
  sessionId: string
  sessionInfoOpen?: boolean
  source?: SessionViewerSource
  superAdminMode?: boolean
}) {
  const isLocalReplay = source.mode === 'local'
  const defaultTab: ViewerTab = initialArtifactId ? 'artifacts' : 'live-log'
  const [payload, setPayload] = useState<SessionViewerPayload | null>(null)
  const [scrubAtMs, setScrubAtMs] = useState<number | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [sessionVideoLoadState, setSessionVideoLoadState] = useState<{
    storagePath: string
    url: string | null
    failed: boolean
  } | null>(null)
  const [presentedVideoFrameId, setPresentedVideoFrameId] = useState<string | null>(null)
  const [videoMetadataVersion, setVideoMetadataVersion] = useState(0)
  const [loadingImageFrameIds, setLoadingImageFrameIds] = useState<ReadonlySet<string>>(() => new Set())
  const [activeTab, setActiveTab] = useState<ViewerTab>(defaultTab)
  function selectUsageTab(tab: ViewerTab) {
    setActiveTab(tab)
    if (!isLocalReplay) return
    const feature = ({ 'live-log': 'logs', 'network': 'network', 'visual-tree': 'visual_tree', 'artifacts': 'artifacts', 'files': 'files', 'annotations': 'annotations' } as Partial<Record<ViewerTab, InspectionFeature>>)[tab]
    if (feature) trackInspection(feature)
  }

  const [selectedLogStreamId, setSelectedLogStreamId] = useState<string | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [selectedVisualTreeSnapshotKey, setSelectedVisualTreeSnapshotKey] = useState<string | null>(null)
  const [selectedArtifactSnapshotKey, setSelectedArtifactSnapshotKey] = useState<string | null>(null)
  const [internalSessionInfoOpen, setInternalSessionInfoOpen] = useState(false)
  const [sessionInfoAiKind, setSessionInfoAiKind] = useState<SessionAiExtractionKind | null>(null)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [aiCapabilities, setAiCapabilities] = useState<SessionAiCapabilities | null>(null)
  const [aiExtractions, setAiExtractions] = useState<SessionAiExtractionSummary[]>([])
  const [aiForm, setAiForm] = useState<SessionAiForm>(defaultSessionAiForm)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isAiSubmitting, setIsAiSubmitting] = useState(false)
  const [archivingAiRunId, setArchivingAiRunId] = useState<string | null>(null)
  const [showArchivedAiRuns, setShowArchivedAiRuns] = useState(false)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<SessionAttachment[]>([])
  const [canAttachToSession, setCanAttachToSession] = useState(false)
  const [canManageSession, setCanManageSession] = useState(false)
  const [isSessionEditOpen, setIsSessionEditOpen] = useState(false)
  const [isSessionEditSubmitting, setIsSessionEditSubmitting] = useState(false)
  const [sessionEditMessage, setSessionEditMessage] = useState<string | null>(null)
  const [sessionActionMessage, setSessionActionMessage] = useState<SessionActionMessage | null>(null)
  const [shareCopyMessage, setShareCopyMessage] = useState<string | null>(null)
  const isSessionInfoOpen = sessionInfoOpen ?? internalSessionInfoOpen
  const updateSessionInfoOpen = useCallback((isOpen: boolean) => {
    if (!isOpen) setSessionInfoAiKind(null)
    setInternalSessionInfoOpen(isOpen)
    onSessionInfoOpenChange?.(isOpen)
  }, [onSessionInfoOpenChange])
  const [isSessionActionPending, setIsSessionActionPending] = useState(false)
  const [timelineEditProgress, setTimelineEditProgress] = useState<SessionOperationProgress | null>(null)
  const timelineEditInFlightRef = useRef<string | null>(null)
  const timelineEditRefreshRef = useRef<{ sessionId: string; key: string } | null>(null)
  const payloadRefreshVersionRef = useRef(0)
  const [isTimelineRangeSelecting, setIsTimelineRangeSelecting] = useState(false)
  const [timelineEditSelection, setTimelineEditSelection] = useState<TimelineEditSelection | null>(null)
  const [annotationEditorDraft, setAnnotationEditorDraft] = useState<AnnotationEditorDraft | null>(null)
  const [isAnnotationSubmitting, setIsAnnotationSubmitting] = useState(false)
  const [selectedFrameImageContentBounds, setSelectedFrameImageContentBounds] = useState<SessionFrameImageContentBounds | null>(null)
  const [showTouchLocations, setShowTouchLocations] = useState(true)
  const [visualTreeOverlay, setVisualTreeOverlay] = useState<VisualTreeOverlaySelection | null>(null)
  const [replayPanelWidth, setReplayPanelWidth] = useState(readStoredSessionReplayPanelWidth)
  useEffect(() => {
    onReplayPanelWidthChange?.(replayPanelWidth)
  }, [onReplayPanelWidthChange, replayPanelWidth])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAttachmentsLoading, setIsAttachmentsLoading] = useState(false)
  const [isAttachmentSubmitting, setIsAttachmentSubmitting] = useState(false)
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null)
  const [attachmentDraftName, setAttachmentDraftName] = useState('')
  const [attachmentDraftNotes, setAttachmentDraftNotes] = useState('')
  const [attachmentDraftFile, setAttachmentDraftFile] = useState<File | null>(null)
  const [attachmentLimits, setAttachmentLimits] = useState<TeamAttachmentLimits>(() => defaultTeamAttachmentLimits())
  const activeSessionIdRef = useRef(sessionId)
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null)
  const imageFrameCacheOrderRef = useRef<string[]>([])
  const imageUrlsByFrameIdRef = useRef<Record<string, string>>({})
  const imageObjectUrlsRef = useRef<Set<string>>(new Set())
  const imageUrlBatchRef = useRef<SessionImageUrlBatch | null>(null)
  const imageCacheRenderFrameRef = useRef<number | null>(null)
  const pendingImageFrameRequestsRef = useRef<Map<string, symbol>>(new Map())
  const pendingVisualTreeSnapshotRequestsRef = useRef<Set<string>>(new Set())
  const displayedImageFrameIdRef = useRef<string | null>(null)
  const selectedImageFrameIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(false)
  const payloadRef = useRef<SessionViewerPayload | null>(null)
  const refreshRequestRef = useRef({ refreshKey, sessionId })
  const selectedFrameViewportRef = useRef<HTMLDivElement | null>(null)
  const selectedFrameMediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const sessionVideoRef = useRef<HTMLVideoElement | null>(null)
  const pendingVideoSeekRef = useRef<{ frameId: string; targetSeconds: number } | null>(null)

  const revokeCachedImageObjectUrls = useCallback(() => {
    if (imageCacheRenderFrameRef.current !== null) {
      window.cancelAnimationFrame(imageCacheRenderFrameRef.current)
      imageCacheRenderFrameRef.current = null
    }
    for (const objectUrl of imageObjectUrlsRef.current) {
      URL.revokeObjectURL(objectUrl)
    }

    imageObjectUrlsRef.current.clear()
    imageFrameCacheOrderRef.current = []
    imageUrlsByFrameIdRef.current = {}
    imageUrlBatchRef.current = null
    pendingImageFrameRequestsRef.current.clear()
    displayedImageFrameIdRef.current = null
  }, [])

  const publishImageCache = useCallback(() => {
    if (imageCacheRenderFrameRef.current !== null) {
      return
    }

    imageCacheRenderFrameRef.current = window.requestAnimationFrame(() => {
      imageCacheRenderFrameRef.current = null
      setImageUrls({ ...imageUrlsByFrameIdRef.current })
    })
  }, [])

  const resetImageCache = useCallback(() => {
    revokeCachedImageObjectUrls()
    setImageUrls({})
    setLoadingImageFrameIds(new Set())
  }, [revokeCachedImageObjectUrls])

  const markImageFrameLoading = useCallback((frameId: string, isLoadingFrame: boolean) => {
    setLoadingImageFrameIds((current) => {
      if (current.has(frameId) === isLoadingFrame) {
        return current
      }

      const next = new Set(current)
      if (isLoadingFrame) {
        next.add(frameId)
      } else {
        next.delete(frameId)
      }

      return next
    })
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      revokeCachedImageObjectUrls()
    }
  }, [revokeCachedImageObjectUrls])

  useEffect(() => {
    activeSessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    if (sessionActionMessage?.kind !== 'success') {
      return undefined
    }

    const timeout = window.setTimeout(() => {
      setSessionActionMessage((current) => current === sessionActionMessage ? null : current)
    }, sessionActionSuccessDismissDelayMs)

    return () => window.clearTimeout(timeout)
  }, [sessionActionMessage])

  useEffect(() => {
    payloadRef.current = payload
  }, [payload])

  const sessionVideoFile = payload?.video?.file ?? null
  const sessionVideoSession = payload?.session ?? null
  const sessionVideoStoragePath = sessionVideoFile?.storagePath ?? null
  const sessionVideoUrl = sessionVideoLoadState?.storagePath === sessionVideoStoragePath
    ? sessionVideoLoadState.url
    : null
  const hasSessionVideoFailed = sessionVideoLoadState?.storagePath === sessionVideoStoragePath
    && sessionVideoLoadState.failed

  useEffect(() => {
    let isCancelled = false
    pendingVideoSeekRef.current = null
    if (source.mode !== 'cloud' || !sessionVideoFile || !sessionVideoSession) {
      return () => {
        isCancelled = true
      }
    }

    void createSessionFileSignedUrl(sessionVideoSession, sessionVideoFile)
      .then((signedUrl) => {
        if (!isCancelled) {
          setPresentedVideoFrameId(null)
          setSessionVideoLoadState({
            storagePath: sessionVideoFile.storagePath,
            url: signedUrl,
            failed: false,
          })
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSessionVideoLoadState({
            storagePath: sessionVideoFile.storagePath,
            url: null,
            failed: true,
          })
        }
      })

    return () => {
      isCancelled = true
    }
  }, [sessionVideoFile, sessionVideoSession, source.mode])

  const refreshAiExtractions = useCallback(async (options: RefreshAiExtractionsOptions = {}) => {
    if (superAdminMode || !source.loadAiReadState) {
      return
    }

    const silent = options.silent === true

    if (!silent) {
      setIsAiLoading(true)
      setAiMessage(null)
    }

    try {
      const {
        capabilities: nextCapabilities,
        extractions: nextExtractions,
        message: nextMessage,
      } = await source.loadAiReadState(sessionId)
      setAiCapabilities(nextCapabilities)
      setAiExtractions(nextExtractions)
      if (!silent) {
        setAiMessage(nextMessage ?? null)
      }
      if (nextCapabilities) {
        setAiForm((current) => normalizeAiFormForCapabilities(current, nextCapabilities))
      }
    } catch (error) {
      if (!silent) {
        setAiMessage(getErrorMessage(error, 'Unable to refresh AI extraction data.'))
      }
    } finally {
      if (!silent) {
        setIsAiLoading(false)
      }
    }
  }, [sessionId, source, superAdminMode])

  const refreshAttachments = useCallback(async (options: { silent?: boolean } = {}) => {
    if (source.mode === 'local') {
      return
    }

    const silent = options.silent === true
    if (!silent) {
      setIsAttachmentsLoading(true)
      setAttachmentMessage(null)
    }

    try {
      const nextAttachments = await loadSessionAttachments(sessionId)
      setAttachments(nextAttachments)
    } catch (error) {
      setAttachments([])
      if (!silent) {
        setAttachmentMessage(getErrorMessage(error, 'Unable to load attachments.'))
      }
    } finally {
      if (!silent) {
        setIsAttachmentsLoading(false)
      }
    }
  }, [sessionId, source.mode])

  useEffect(() => {
    let isMounted = true

    async function load() {
      setIsLoading(true)
      setMessage(null)
      resetImageCache()
      setPayload(null)
      setScrubAtMs(null)
      setSelectedLogStreamId(null)
      setAnnotationEditorDraft(null)
      setSelectedVisualTreeSnapshotKey(null)
      setSelectedArtifactSnapshotKey(null)
      setIsTimelineRangeSelecting(false)
      setTimelineEditSelection(null)
      pendingVisualTreeSnapshotRequestsRef.current.clear()

      try {
        const nextPayload = await source.loadPayload(sessionId, superAdminMode)
        if (isMounted) {
          setPayload(nextPayload)
          if (initialArtifactId) {
            const artifact = nextPayload.capture.session?.artifactSnapshots?.find(item => item.snapshotId === initialArtifactId)
            if (artifact) {
              setSelectedArtifactSnapshotKey(initialArtifactId)
              setScrubAtMs(toTimestamp(artifact.capturedAtUtc))
              setActiveTab('artifacts')
            } else setMessage(`Captured artifact '${initialArtifactId}' was not found in this session.`)
          }
        }

        void (source.hydratePayload?.(nextPayload) ?? Promise.resolve(nextPayload))
          .then((hydratedPayload) => {
            if (isMounted && activeSessionIdRef.current === sessionId && hydratedPayload !== nextPayload) {
              setPayload(hydratedPayload)
            }
          })
          .catch((error) => {
            if (isMounted && activeSessionIdRef.current === sessionId) {
              setMessage(getErrorMessage(error, 'Unable to load session evidence payloads.'))
            }
          })
      } catch (error) {
        if (isMounted) {
          setMessage(getErrorMessage(error, 'Unable to load the shared session.'))
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isMounted = false
    }
  }, [initialArtifactId, resetImageCache, sessionId, source, superAdminMode])

  useEffect(() => {
    const previous = refreshRequestRef.current
    refreshRequestRef.current = { refreshKey, sessionId }
    if (refreshKey === undefined
      || previous.sessionId !== sessionId
      || Object.is(previous.refreshKey, refreshKey)
      || (isLiveSession && source.refreshPayload)) {
      return
    }
    if (timelineEditInFlightRef.current === sessionId
      || (timelineEditRefreshRef.current?.sessionId === sessionId && timelineEditRefreshRef.current.key === refreshKey)) {
      return
    }

    let isMounted = true
    const refreshVersion = payloadRefreshVersionRef.current
    async function refresh() {
      try {
        const nextPayload = await source.loadPayload(sessionId, superAdminMode)
        const hydratedPayload = await (source.hydratePayload?.(nextPayload) ?? Promise.resolve(nextPayload))
        if (isMounted && activeSessionIdRef.current === sessionId && refreshVersion === payloadRefreshVersionRef.current) {
          setPayload(hydratedPayload)
          setMessage(null)
        }
      } catch (error) {
        if (isMounted && activeSessionIdRef.current === sessionId && refreshVersion === payloadRefreshVersionRef.current) {
          setMessage(getErrorMessage(error, 'Unable to refresh the live session.'))
        }
      }
    }

    void refresh()
    return () => {
      isMounted = false
    }
  }, [isLiveSession, refreshKey, sessionId, source, superAdminMode])

  useEffect(() => {
    const refreshPayload = source.refreshPayload
    if (!isLiveSession || !refreshPayload) {
      return undefined
    }

    let isCancelled = false
    async function refreshLiveSession() {
      while (!isCancelled) {
        const startedAt = performance.now()
        const current = payloadRef.current
        if (current && current.session.session_id === sessionId) {
          try {
            const nextPayload = await refreshPayload!(sessionId, current, superAdminMode)
            if (!isCancelled && activeSessionIdRef.current === sessionId) {
              payloadRef.current = nextPayload
              if (nextPayload !== current) {
                startTransition(() => setPayload(nextPayload))
              }
              setMessage(null)
            }
          } catch (error) {
            if (!isCancelled && activeSessionIdRef.current === sessionId) {
              setMessage(getErrorMessage(error, 'Unable to refresh the live session.'))
            }
          }
        }

        const remainingDelay = Math.max(80, liveSessionRefreshIntervalMs - (performance.now() - startedAt))
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remainingDelay)
        })
      }
    }

    void refreshLiveSession()
    return () => {
      isCancelled = true
    }
  }, [isLiveSession, sessionId, source, superAdminMode])

  useEffect(() => {
    const loadAiReadState = source.loadAiReadState
    if (superAdminMode || !loadAiReadState) {
      let isMounted = true
      void Promise.resolve().then(() => {
        if (!isMounted) {
          return
        }

        setAiCapabilities(null)
        setAiExtractions([])
        setAiMessage(null)
        setIsAiLoading(false)
      })

      return () => {
        isMounted = false
      }
    }

    const activeLoadAiReadState = loadAiReadState
    let isMounted = true

    async function loadAi() {
      setIsAiLoading(true)
      setAiMessage(null)

      try {
        const {
          capabilities: nextCapabilities,
          extractions: nextExtractions,
          message: nextMessage,
        } = await activeLoadAiReadState(sessionId)
        if (isMounted) {
          setAiCapabilities(nextCapabilities)
          setAiExtractions(nextExtractions)
          setAiMessage(nextMessage ?? null)
          if (nextCapabilities) {
            setAiForm((current) => normalizeAiFormForCapabilities(current, nextCapabilities))
          }
        }
      } catch (error) {
        if (isMounted) {
          setAiCapabilities(null)
          setAiExtractions([])
          setAiMessage(getErrorMessage(error, 'Unable to load AI extraction data.'))
        }
      } finally {
        if (isMounted) {
          setIsAiLoading(false)
        }
      }
    }

    void loadAi()

    return () => {
      isMounted = false
    }
  }, [sessionId, source, superAdminMode])

  useEffect(() => {
    let isMounted = true

    async function loadAttachments() {
      await Promise.resolve()
      if (!isMounted) {
        return
      }

      setAttachments([])
      setAttachmentMessage(null)
      if (source.mode === 'local') {
        return
      }

      try {
        const nextAttachments = await loadSessionAttachments(sessionId)
        if (isMounted) {
          setAttachments(nextAttachments)
        }
      } catch (error) {
        if (isMounted) {
          setAttachmentMessage(getErrorMessage(error, 'Unable to load attachments.'))
        }
      }
    }

    void loadAttachments()

    return () => {
      isMounted = false
    }
  }, [sessionId, source.mode])

  useEffect(() => {
    let isMounted = true
    const teamId = payload?.session?.team_id

    async function loadAttachmentLimits() {
      await Promise.resolve()
      if (!isMounted) {
        return
      }

      setAttachmentLimits(defaultTeamAttachmentLimits())
      if (!teamId || source.mode === 'local') {
        return
      }

      try {
        const limits = await loadTeamAttachmentLimits(teamId)
        if (isMounted) {
          setAttachmentLimits(limits)
        }
      } catch {
        if (isMounted) {
          setAttachmentLimits(defaultTeamAttachmentLimits())
        }
      }
    }

    void loadAttachmentLimits()

    return () => {
      isMounted = false
    }
  }, [payload?.session?.team_id, source.mode])

  useEffect(() => {
    let isMounted = true

    async function loadAttachmentAccess() {
      if (source.mode === 'local') {
        setCurrentUserId(null)
        setCanAttachToSession(false)
        setCanManageSession(false)
        return
      }

      const userId = await loadPlayerCurrentUserId()
      if (!isMounted) {
        return
      }

      setCurrentUserId(userId)
      setCanAttachToSession(false)
      setCanManageSession(false)
      if (!isSignedIn || !payload?.session || !userId) {
        return
      }

      const [canAttach, canManage] = await Promise.all([
        canCurrentUserAttachToSession(payload.session),
        canCurrentUserManageSession(payload.session),
      ])
      if (isMounted) {
        setCanAttachToSession(canAttach)
        setCanManageSession(canManage)
      }
    }

    void loadAttachmentAccess()

    return () => {
      isMounted = false
    }
  }, [isSignedIn, payload?.session, source.mode])

  const captureSession = payload?.capture.session
  const frames = useMemo(() => sortFrames(captureSession?.images ?? []), [captureSession?.images])
  const logStreams = useMemo(() => captureSession?.logStreams ?? [], [captureSession?.logStreams])
  const allLogs = useMemo(() => sortLogs(captureSession?.logs ?? []), [captureSession?.logs])
  const defaultLogStream = logStreams.find((stream) => stream.streamId === 'sdk' || stream.kind === 'ansight.sdk') ?? logStreams[0] ?? null
  const selectedLogStream = logStreams.find((stream) => stream.streamId === selectedLogStreamId) ?? defaultLogStream
  const logs = useMemo(
    () => selectedLogStream ? sortLogs(selectedLogStream.entries ?? []) : allLogs,
    [allLogs, selectedLogStream],
  )
  const sdkLogs = useMemo(
    () => sortLogs(logStreams.find((stream) => stream.streamId === 'sdk')?.entries ?? allLogs),
    [allLogs, logStreams],
  )
  const touches = useMemo(() => sortTouches(captureSession?.touches ?? []), [captureSession?.touches])
  const networkRequests = useMemo(() => sortNetworkRequests(captureSession?.networkRequests ?? []), [captureSession?.networkRequests])
  const metrics = useMemo(() => sortMetrics(captureSession?.metrics ?? []), [captureSession?.metrics])
  const metricChannels = useMemo(() => sortMetricChannels(captureSession?.metricChannels ?? []), [captureSession?.metricChannels])
  const annotations = useMemo(() => sortAnnotations(captureSession?.annotations ?? []), [captureSession?.annotations])
  const visualTrees = useMemo(() => sortVisualTrees(captureSession?.visualTreeSnapshots ?? []), [captureSession?.visualTreeSnapshots])
  const artifactSnapshots = useMemo(() => sortArtifactSnapshots(captureSession?.artifactSnapshots ?? []), [captureSession?.artifactSnapshots])
  const timelineMetricIndex = useMemo(() => buildTimelineMetricIndex(metricChannels, metrics), [metricChannels, metrics])
  const timelineReplayIndex = useMemo(() => buildTimelineReplayIndex(frames, allLogs, visualTrees, artifactSnapshots, touches), [allLogs, artifactSnapshots, frames, touches, visualTrees])
  const selectedTimelineLogs = useMemo(() => buildTimestampedItems(logs, (log) => log.timestampUtc), [logs])
  const lifecycleTransitions = useMemo(() => buildLifecycleTransitions(sdkLogs, captureSession), [captureSession, sdkLogs])
  const timelineRange = useMemo(
    () => resolveTimelineRange(payload?.session ?? null, captureSession, timelineReplayIndex, timelineMetricIndex, annotations),
    [annotations, captureSession, payload?.session, timelineMetricIndex, timelineReplayIndex],
  )
  const effectiveSessionDurationMs = resolveEffectiveSessionDurationMs(payload?.session.duration_ms ?? null, timelineRange)
  const effectiveScrubAtMs = resolveEffectiveScrubAt(scrubAtMs, timelineRange, isLiveSession)
  const isFollowingLive = isLiveSession && scrubAtMs === null
  const isAppBackgroundedAtScrub = useMemo(() => isTimestampInBackgroundState(lifecycleTransitions, effectiveScrubAtMs), [effectiveScrubAtMs, lifecycleTransitions])
  const explicitlySelectedVisualTree = useMemo(
    () => selectedVisualTreeSnapshotKey
      ? visualTrees.find((snapshot) => resolveVisualTreeSnapshotKey(snapshot) === selectedVisualTreeSnapshotKey) ?? null
      : null,
    [selectedVisualTreeSnapshotKey, visualTrees],
  )
  const selectedFrame = useMemo(
    () => (explicitlySelectedVisualTree ? selectFrameForVisualTree(frames, explicitlySelectedVisualTree) : null)
      ?? selectFrameForTimestamp(timelineReplayIndex.frames, effectiveScrubAtMs, 'previous'),
    [effectiveScrubAtMs, explicitlySelectedVisualTree, frames, timelineReplayIndex],
  )
  const sessionVideoFramesById = useMemo(
    () => new Map((payload?.video?.index.frames ?? []).map((frame) => [frame.frameId, frame])),
    [payload?.video?.index.frames],
  )
  const selectedSessionVideoFrame = selectedFrame
    ? sessionVideoFramesById.get(selectedFrame.frameId) ?? null
    : null
  const canUseSelectedSessionVideo = !!selectedSessionVideoFrame && !hasSessionVideoFailed
  const imagePrefetchFrames = useMemo(
    () => selectSessionImagePrefetchFrames(frames, selectedFrame)
      .filter((frame) => hasSessionVideoFailed || !sessionVideoFramesById.has(frame.frameId)),
    [frames, hasSessionVideoFailed, selectedFrame, sessionVideoFramesById],
  )
  useEffect(() => {
    const video = sessionVideoRef.current
    const timeBaseUnitsPerSecond = payload?.video?.index.timeBaseUnitsPerSecond ?? 0
    if (
      !video
      || !sessionVideoUrl
      || !selectedFrame
      || !selectedSessionVideoFrame
      || hasSessionVideoFailed
      || timeBaseUnitsPerSecond <= 0
      || video.readyState < HTMLMediaElement.HAVE_METADATA
    ) {
      pendingVideoSeekRef.current = null
      return
    }

    const safeOffsetUs = selectedSessionVideoFrame.durationUs > 1
      ? Math.min(1_000, Math.floor(selectedSessionVideoFrame.durationUs / 2))
      : 0
    const targetSeconds = (selectedSessionVideoFrame.presentationTimeUs + safeOffsetUs) / timeBaseUnitsPerSecond
    pendingVideoSeekRef.current = { frameId: selectedFrame.frameId, targetSeconds }
    if (Math.abs(video.currentTime - targetSeconds) <= 0.0000005 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setPresentedVideoFrameId(selectedFrame.frameId)
      return
    }

    video.currentTime = targetSeconds
  }, [
    hasSessionVideoFailed,
    payload?.video?.index.timeBaseUnitsPerSecond,
    selectedFrame,
    selectedSessionVideoFrame,
    sessionVideoUrl,
    videoMetadataVersion,
  ])
  useEffect(() => {
    const frameId = selectedFrame?.frameId ?? null
    selectedImageFrameIdRef.current = frameId
    if (frameId && imageUrlsByFrameIdRef.current[frameId]) {
      imageFrameCacheOrderRef.current = imageFrameCacheOrderRef.current
        .filter((cachedFrameId) => cachedFrameId !== frameId)
        .concat(frameId)
    }
  }, [selectedFrame?.frameId])
  const selectedVisualTree = useMemo(
    () => explicitlySelectedVisualTree ?? selectVisualTree(timelineReplayIndex, selectedFrame, effectiveScrubAtMs),
    [effectiveScrubAtMs, explicitlySelectedVisualTree, selectedFrame, timelineReplayIndex],
  )
  useEffect(() => {
    if (source.mode !== 'cloud'
      || !payload
      || !selectedVisualTree
      || selectedVisualTree.payload !== undefined) {
      return
    }

    const snapshotKey = resolveVisualTreeSnapshotKey(selectedVisualTree)
    if (pendingVisualTreeSnapshotRequestsRef.current.has(snapshotKey)) {
      return
    }

    const targetSessionId = payload.session.id
    pendingVisualTreeSnapshotRequestsRef.current.add(snapshotKey)
    void loadSessionVisualTreeSnapshot(payload, selectedVisualTree)
      .then((loadedSnapshot) => {
        if (!loadedSnapshot) {
          return
        }

        setPayload((current) => {
          if (!current || current.session.id !== targetSessionId || !current.capture.session) {
            return current
          }

          const currentTrees = current.capture.session.visualTreeSnapshots ?? []
          let didReplace = false
          const nextTrees = currentTrees.map((snapshot) => {
            if (resolveVisualTreeSnapshotKey(snapshot) !== snapshotKey) {
              return snapshot
            }

            didReplace = true
            return loadedSnapshot
          })
          return didReplace
            ? {
                ...current,
                capture: {
                  ...current.capture,
                  session: {
                    ...current.capture.session,
                    visualTreeSnapshots: nextTrees,
                  },
                },
              }
            : current
        })
      })
      .catch(() => {})
      .finally(() => {
        pendingVisualTreeSnapshotRequestsRef.current.delete(snapshotKey)
      })
  }, [payload, selectedVisualTree, source.mode])
  const selectedArtifactSnapshot = useMemo(() => {
    const explicitlySelectedSnapshot = selectedArtifactSnapshotKey
      ? artifactSnapshots.find((snapshot, index) => (
          resolveArtifactSnapshotKey(snapshot, index) === selectedArtifactSnapshotKey
        ))
      : null

    return explicitlySelectedSnapshot
      ?? selectArtifactSnapshot(timelineReplayIndex.artifactSnapshots, effectiveScrubAtMs)
  }, [artifactSnapshots, effectiveScrubAtMs, selectedArtifactSnapshotKey, timelineReplayIndex])
  const selectedImageUrl = selectedFrame && !canUseSelectedSessionVideo
    ? imageUrls[selectedFrame.frameId]
    : undefined
  const loadedTimelineFrames = useMemo(
    () => timelineReplayIndex.frames.filter(({ item }) => !!imageUrls[item.frameId]),
    [imageUrls, timelineReplayIndex.frames],
  )
  const presentedFrame = useMemo(
    () => canUseSelectedSessionVideo
      ? (selectedFrame?.frameId === presentedVideoFrameId ? selectedFrame : null)
      : selectedFrame && selectedImageUrl
        ? selectedFrame
        : selectFrameForTimestamp(loadedTimelineFrames, effectiveScrubAtMs, 'previous'),
    [canUseSelectedSessionVideo, effectiveScrubAtMs, loadedTimelineFrames, presentedVideoFrameId, selectedFrame, selectedImageUrl],
  )
  useEffect(() => {
    displayedImageFrameIdRef.current = presentedFrame?.frameId ?? null
  }, [presentedFrame?.frameId])
  const selectedFrameViewportKind = useMemo(
    () => resolveSessionFrameViewportKind(presentedFrame ?? selectedFrame, captureSession, payload?.session ?? null),
    [captureSession, payload?.session, presentedFrame, selectedFrame],
  )
  const selectedDeviceFrame = useMemo(() => {
    const device = getRecord(captureSession ? resolveDeviceProfile(captureSession) : null, 'device')
    const metadataDevice = getRecord(asRecord(payload?.session?.metadata), 'device')
    return resolveDeviceFrame([
      getString(device, 'model'), getString(device, 'product'), getString(device, 'brand'),
      getString(device, 'manufacturer'), getString(device, 'osName'), getString(metadataDevice, 'model'),
      payload?.session?.device_model, payload?.session?.device_os_name,
      payload?.session?.operating_system, payload?.session?.platform_key,
    ].filter((value): value is string => !!value), selectedFrameViewportKind)
  }, [captureSession, payload?.session, selectedFrameViewportKind])
  const frameLandscape = ((presentedFrame ?? selectedFrame)?.width ?? 0) > ((presentedFrame ?? selectedFrame)?.height ?? 0)
  const selectedFrameViewportStyle = useMemo(
    () => buildSessionFrameViewportStyle(presentedFrame ?? selectedFrame),
    [presentedFrame, selectedFrame],
  )
  const presentedImageUrl = presentedFrame ? imageUrls[presentedFrame.frameId] : undefined
  const isSelectedFramePresented = !!selectedFrame && selectedFrame.frameId === presentedFrame?.frameId
  const isSelectedVideoFramePresented = canUseSelectedSessionVideo
    && !!sessionVideoUrl
    && isSelectedFramePresented
  const hasSelectedMediaPending = !!selectedFrame
    && !isSelectedFramePresented
    && (canUseSelectedSessionVideo || loadingImageFrameIds.has(selectedFrame.frameId))
  const hasPresentedMedia = isSelectedVideoFramePresented || !!presentedImageUrl
  const frameImageLayers = useMemo(() => {
    const layers: Array<{ frame: SessionImageFrame; url: string }> = []
    if (!canUseSelectedSessionVideo && presentedFrame && presentedImageUrl) {
      layers.push({ frame: presentedFrame, url: presentedImageUrl })
    }
    return layers
  }, [canUseSelectedSessionVideo, presentedFrame, presentedImageUrl])
  const syncSelectedFrameImageContentBounds = useCallback(() => {
    const viewport = selectedFrameViewportRef.current
    const media = selectedFrameMediaRef.current
    const nextBounds = viewport && media ? measureSessionFrameMediaContentBounds(viewport, media) : null
    setSelectedFrameImageContentBounds((current) => sessionFrameImageContentBoundsEqual(current, nextBounds) ? current : nextBounds)
  }, [])
  useEffect(() => {
    const viewport = selectedFrameViewportRef.current
    const media = selectedFrameMediaRef.current
    if (!hasPresentedMedia || !viewport || !media) {
      return
    }

    syncSelectedFrameImageContentBounds()
    const resizeObserver = new ResizeObserver(syncSelectedFrameImageContentBounds)
    resizeObserver.observe(viewport)
    resizeObserver.observe(media)
    const loadEventName = media instanceof HTMLVideoElement ? 'loadeddata' : 'load'
    media.addEventListener(loadEventName, syncSelectedFrameImageContentBounds)
    return () => {
      media.removeEventListener(loadEventName, syncSelectedFrameImageContentBounds)
      resizeObserver.disconnect()
    }
  }, [hasPresentedMedia, presentedFrame?.frameId, syncSelectedFrameImageContentBounds])
  const selectedFrameStageClassName = `session-frame-stage session-frame-stage--right session-frame-stage--${selectedDeviceFrame.kind}${isLocalReplay ? ` device-shell device-shell--${selectedDeviceFrame.style}${frameLandscape ? ' device-shell--landscape' : ''}${selectedDeviceFrame.cameraControl ? ' device-shell--camera-control' : ''}${/iPad \((10th generation|A16)\)|iPad Air.*\(M[234]\)|iPad Pro.*\(M[45]\)/.test(selectedDeviceFrame.name) ? ' device-shell--camera-long-edge' : ''}` : ''}`
  const activeTouches = useMemo(
    () => selectTouchesForTimestamp(timelineReplayIndex.touches, effectiveScrubAtMs),
    [effectiveScrubAtMs, timelineReplayIndex],
  )
  const aiSourcePartOptions = useMemo(
    () => buildSessionAiSourcePartOptions(payload?.session ?? null, allLogs, frames, metrics, annotations, visualTrees, artifactSnapshots),
    [allLogs, annotations, artifactSnapshots, frames, metrics, payload?.session, visualTrees],
  )
  const hasActiveAiExtraction = useMemo(() => aiExtractions.some(isActiveAiRun), [aiExtractions])
  const annotationIds = useMemo(() => annotations.map(resolveAnnotationId), [annotations])
  const resolvedSelectedAnnotationId = annotationIds.find((annotationId) => annotationId === selectedAnnotationId) ?? annotationIds[0] ?? null
  const isActiveTabUnavailable = activeTab === 'annotations' && annotations.length === 0
  const effectiveActiveTab = isActiveTabUnavailable ? defaultTab : activeTab

  useEffect(() => {
    if (!hasActiveAiExtraction) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      void refreshAiExtractions({ silent: true })
    }, 2500)

    return () => window.clearInterval(intervalId)
  }, [hasActiveAiExtraction, refreshAiExtractions])

  function updateAiForm(updates: Partial<SessionAiForm>) {
    setAiForm((current) => {
      const nextKind = updates.kind ?? current.kind
      const didKindChange = updates.kind !== undefined && updates.kind !== current.kind
      const nextProvider = updates.provider ?? current.provider
      const didProviderChange = updates.provider !== undefined && updates.provider !== current.provider
      const shouldReplacePrompt =
        updates.promptInstructions === undefined &&
        didKindChange &&
        (current.promptInstructions.trim() === '' || current.promptInstructions === defaultPromptForSessionAiKind(current.kind))

      return {
        ...current,
        ...updates,
        kind: nextKind,
        provider: nextProvider,
        model: updates.model ?? (didProviderChange ? defaultModelForProvider(nextProvider) : current.model),
        promptInstructions: updates.promptInstructions ?? (shouldReplacePrompt ? defaultPromptForSessionAiKind(nextKind) : current.promptInstructions),
      }
    })
  }

  function updateAttachmentDraftFile(file: File | null) {
    setAttachmentDraftFile(file)
    if (file && !attachmentDraftName.trim()) {
      setAttachmentDraftName(file.name.replace(/\.[^.]+$/, '').trim() || file.name)
    }
  }

  async function handleCreateAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!payload?.session || !attachmentDraftFile) {
      setAttachmentMessage('Choose a file before adding an attachment.')
      return
    }

    setIsAttachmentSubmitting(true)
    setAttachmentMessage(null)
    try {
      const attachment = await createSessionAttachment({
        session: payload.session,
        name: attachmentDraftName,
        notes: attachmentDraftNotes,
        file: attachmentDraftFile,
        existingAttachments: attachments,
        limits: attachmentLimits,
      })
      setAttachments((current) => [attachment, ...current.filter((candidate) => candidate.id !== attachment.id)])
      setAttachmentDraftName('')
      setAttachmentDraftNotes('')
      setAttachmentDraftFile(null)
      if (attachmentFileInputRef.current) {
        attachmentFileInputRef.current.value = ''
      }
      setAttachmentMessage('Attachment added.')
    } catch (error) {
      setAttachmentMessage(getErrorMessage(error, 'Unable to add attachment.'))
    } finally {
      setIsAttachmentSubmitting(false)
    }
  }

  async function handleOpenAttachment(attachment: SessionAttachment) {
    setAttachmentMessage(null)
    try {
      const signedUrl = await createSessionAttachmentSignedUrl(attachment)
      window.open(signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setAttachmentMessage(getErrorMessage(error, 'Unable to open attachment.'))
    }
  }

  async function handleDeleteAttachment(attachment: SessionAttachment) {
    const shouldDelete = window.confirm(`Delete "${attachment.name}"?`)
    if (!shouldDelete) {
      return
    }

    setAttachmentMessage(null)
    try {
      await deleteSessionAttachment(attachment)
      setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id))
      setAttachmentMessage('Attachment deleted.')
    } catch (error) {
      setAttachmentMessage(getErrorMessage(error, 'Unable to delete attachment.'))
    }
  }

  function selectAnnotation(annotationId: string, focusMs: number | null = null) {
    setSelectedAnnotationId(annotationId)
    setActiveTab('annotations')
    if (focusMs !== null) {
      setSelectedVisualTreeSnapshotKey(null)
      setSelectedArtifactSnapshotKey(null)
      setScrubAtMs(focusMs)
    }
  }

  function openTimelineAnnotationEditor(
    startTimestampMs: number = effectiveScrubAtMs,
    endTimestampMs: number | null = null,
    focusTimestampMs: number = startTimestampMs,
  ) {
    if (!source.upsertAnnotation) {
      return
    }

    setSelectedVisualTreeSnapshotKey(null)
    setSelectedArtifactSnapshotKey(null)
    const resolvedFocusTimestampMs = endTimestampMs === null
      ? focusTimestampMs
      : Math.max(startTimestampMs, endTimestampMs)
    setScrubAtMs(endTimestampMs === null
      ? resolveScrubSelection(resolvedFocusTimestampMs, timelineRange, isLiveSession)
      : clamp(resolvedFocusTimestampMs, timelineRange.startMs, timelineRange.endMs))
    setAnnotationEditorDraft({
      annotation: createTimelineAnnotation(startTimestampMs, endTimestampMs),
    })
  }

  function openScreenshotAnnotationEditor(geometry: ScreenshotAnnotationGeometryDraft) {
    if (!source.upsertAnnotation || !selectedFrame) {
      return
    }

    setAnnotationEditorDraft({
      annotation: createScreenshotAnnotation(
        selectedFrame,
        effectiveScrubAtMs,
        geometry,
        selectedVisualTree,
      ),
    })
  }

  function editAnnotation(annotationId: string) {
    const annotation = annotations.find((candidate, index) => resolveAnnotationId(candidate, index) === annotationId)
    if (!annotation || !source.upsertAnnotation) {
      return
    }

    setAnnotationEditorDraft({
      annotation: cloneAnnotationForEditing(annotation),
    })
  }

  async function reloadAnnotationPayload() {
    const nextPayload = await source.loadPayload(sessionId, superAdminMode)
    return source.hydratePayload?.(nextPayload) ?? nextPayload
  }

  async function saveAnnotation(annotation: SessionAnnotation) {
    if (!source.upsertAnnotation) {
      return
    }

    setIsAnnotationSubmitting(true)
    setSessionActionMessage(null)
    try {
      const resultMessage = await source.upsertAnnotation(sessionId, annotation)
      const nextPayload = await reloadAnnotationPayload()
      if (activeSessionIdRef.current === sessionId) {
        setPayload(nextPayload)
        setSelectedAnnotationId(annotation.annotationId ?? null)
        setActiveTab('annotations')
        setAnnotationEditorDraft(null)
        setSessionActionMessage({ kind: 'success', message: resultMessage })
      }
    } catch (error) {
      setSessionActionMessage({
        kind: 'error',
        message: getErrorMessage(error, 'Unable to save the annotation.'),
      })
    } finally {
      setIsAnnotationSubmitting(false)
    }
  }

  async function deleteAnnotation(annotationId: string) {
    if (!source.deleteAnnotation || !window.confirm('Delete this annotation?')) {
      return
    }

    setIsAnnotationSubmitting(true)
    setSessionActionMessage(null)
    try {
      const resultMessage = await source.deleteAnnotation(sessionId, annotationId)
      const nextPayload = await reloadAnnotationPayload()
      if (activeSessionIdRef.current === sessionId) {
        setPayload(nextPayload)
        setSelectedAnnotationId(null)
        setAnnotationEditorDraft(null)
        setSessionActionMessage({ kind: 'success', message: resultMessage })
      }
    } catch (error) {
      setSessionActionMessage({
        kind: 'error',
        message: getErrorMessage(error, 'Unable to delete the annotation.'),
      })
    } finally {
      setIsAnnotationSubmitting(false)
    }
  }

  function toggleAiSourcePart(part: SessionAiSourcePart) {
    setAiForm((current) => {
      const sourceParts = current.sourceParts.includes(part)
        ? current.sourceParts.filter((currentPart) => currentPart !== part)
        : [...current.sourceParts, part]
      return { ...current, sourceParts }
    })
  }

  async function handleCreateAiExtraction(extractionKind: SessionAiExtractionKind = aiForm.kind, formOverride?: SessionAiForm) {
    if (!payload || !source.createAiExtraction) {
      return
    }

    const requestForm = extractionKind === 'analysis'
      ? createDefaultSummaryAiForm(payload.video ? 'gemini' : 'openai')
      : formOverride ?? aiForm
    const accessBlock = isLocalReplay && !aiCapabilities
      ? null
      : resolveCloudAiAccessBlock(extractionKind, aiCapabilities, requestForm.provider, {
        isPublicViewer: !isLocalReplay && (!isSignedIn || isEmbedded),
      })
    if (accessBlock) {
      setAiMessage(accessBlock.message)
      return
    }

    const promptInstructions = requestForm.kind === extractionKind ? requestForm.promptInstructions : defaultPromptForSessionAiKind(extractionKind)
    const sliceStartMs = parseOptionalSecondsAsMilliseconds(requestForm.sliceStartSeconds)
    const sliceEndMs = parseOptionalSecondsAsMilliseconds(requestForm.sliceEndSeconds)
    const durationFeedback = resolveSessionAiDurationFeedback(effectiveSessionDurationMs, aiCapabilities, requestForm)
    if (durationFeedback?.blocksSubmit) {
      setAiMessage(durationFeedback.message)
      return
    }
    if (sliceStartMs === undefined || sliceEndMs === undefined) {
      setAiMessage('Slice values must be valid second offsets.')
      return
    }

    if (requestForm.sourceParts.length === 0) {
      setAiMessage('Choose at least one session source.')
      return
    }

    if (promptInstructions.length > 12000) {
      setAiMessage('Prompt instructions must be 12,000 characters or fewer.')
      return
    }

    setIsAiSubmitting(true)
    setAiMessage(null)

    try {
      const runId = await source.createAiExtraction({
        sessionId: payload.session.id,
        kind: extractionKind,
        analysisMode: 'thorough',
        provider: requestForm.provider,
        model: requestForm.model,
        sourceParts: requestForm.sourceParts,
        sliceStartMs,
        sliceEndMs,
        promptInstructions,
      })

      setAiMessage(source.invokeAiExtraction ? 'AI extraction queued.' : 'AI extraction started.')
      await refreshAiExtractions()

      if (source.invokeAiExtraction) {
        try {
          await source.invokeAiExtraction(runId)
          await refreshAiExtractions()
          setAiMessage('AI extraction started. Progress updates will appear below.')
        } catch (error) {
          await refreshAiExtractions()
          setAiMessage(getErrorMessage(error, 'The extraction was queued, but the processor could not be invoked.'))
        }
      } else {
        await refreshAiExtractions()
        setAiMessage('AI extraction started. Progress updates will appear below.')
      }
    } catch (error) {
      setAiMessage(getAiExtractionErrorMessage(error, 'Unable to create AI extraction.'))
    } finally {
      setIsAiSubmitting(false)
    }
  }

  async function handleArchiveAiExtraction(run: SessionAiExtractionSummary, shouldArchive: boolean) {
    if (!source.archiveAiExtraction) {
      return
    }

    setArchivingAiRunId(run.id)
    setAiMessage(null)

    try {
      await source.archiveAiExtraction(sessionId, run.id, shouldArchive)
      await refreshAiExtractions()
      setAiMessage(shouldArchive ? 'AI output archived.' : 'AI output restored.')
    } catch (error) {
      setAiMessage(getErrorMessage(error, shouldArchive ? 'Unable to archive AI output.' : 'Unable to restore AI output.'))
    } finally {
      setArchivingAiRunId(null)
    }
  }

  async function handleEditSession(details: SessionDetailsUpdate) {
    if (!payload) {
      return
    }

    setIsSessionEditSubmitting(true)
    setSessionEditMessage(null)

    try {
      const updatedSession = await updateSessionDetails(payload.session.id, details)
      setPayload((current) => (current ? { ...current, session: updatedSession } : current))
      setIsSessionEditOpen(false)
      setSessionActionMessage({ kind: 'success', message: 'Session details updated.' })
    } catch (error) {
      setSessionEditMessage(getErrorMessage(error, 'Unable to update session details.'))
    } finally {
      setIsSessionEditSubmitting(false)
    }
  }

  async function handleArchiveSession(shouldArchive: boolean) {
    if (!payload) {
      return
    }

    setIsSessionActionPending(true)
    setSessionActionMessage(null)
    try {
      const updatedSession = await archiveTeamSession(payload.session.id, shouldArchive)
      setPayload((current) => (current ? { ...current, session: updatedSession } : current))
      setSessionActionMessage({
        kind: 'success',
        message: shouldArchive ? 'Session archived.' : 'Session restored.',
      })
    } catch (error) {
      setSessionActionMessage({
        kind: 'error',
        message: getErrorMessage(error, shouldArchive ? 'Unable to archive session.' : 'Unable to restore session.'),
      })
    } finally {
      setIsSessionActionPending(false)
    }
  }

  async function handleDeleteSession() {
    if (!payload) {
      return
    }

    const shouldDelete = window.confirm(`Delete "${payload.session.title}" and its cloud files?`)
    if (!shouldDelete) {
      return
    }

    setIsSessionActionPending(true)
    setSessionActionMessage(null)

    try {
      await deleteTeamSession(payload.session)
      onBack?.()
    } catch (error) {
      setSessionActionMessage({
        kind: 'error',
        message: getErrorMessage(error, 'Unable to delete session.'),
      })
      setIsSessionActionPending(false)
    }
  }

  const loadImageFrame = useCallback((activePayload: SessionViewerPayload, activeFrame: SessionImageFrame) => {
    const frameId = activeFrame.frameId
    if (imageUrlsByFrameIdRef.current[frameId] || pendingImageFrameRequestsRef.current.has(frameId)) {
      return
    }

    const imageFile = source.loadImageUrl ? null : findImageFile(activePayload.manifest, activeFrame)
    if (!source.loadImageUrl && !imageFile) {
      return
    }

    const activeSessionId = sessionId
    const requestId = Symbol(frameId)
    pendingImageFrameRequestsRef.current.set(frameId, requestId)

    async function resolveImageUrl(): Promise<string> {
      if (source.loadImageUrl) {
        return source.loadImageUrl(activePayload, activeFrame)
      }

      let batch = imageUrlBatchRef.current
      if (!batch || batch.sessionId !== activePayload.session.id) {
        const imageFiles = (activePayload.capture.session?.images ?? [])
          .map((frame) => findImageFile(activePayload.manifest, frame))
          .filter((file): file is SharedSessionStreamFile => !!file)
        batch = {
          sessionId: activePayload.session.id,
          promise: createSessionFileSignedUrls(activePayload.session, imageFiles),
        }
        imageUrlBatchRef.current = batch
      }

      const signedUrls = await batch.promise.catch(() => new Map<string, string>())
      return signedUrls.get(imageFile!.storagePath)
        ?? createSessionFileSignedUrl(activePayload.session, imageFile!)
    }

    async function loadImageUrl() {
      try {
        markImageFrameLoading(frameId, true)
        const cachedImageUrl = await createCachedSessionImageUrl(
          await resolveImageUrl(),
          selectedImageFrameIdRef.current === frameId,
        )
        if (
          !isMountedRef.current
          || activeSessionIdRef.current !== activeSessionId
          || pendingImageFrameRequestsRef.current.get(frameId) !== requestId
        ) {
          if (cachedImageUrl.isObjectUrl) {
            URL.revokeObjectURL(cachedImageUrl.url)
          }
          return
        }

        if (imageUrlsByFrameIdRef.current[frameId]) {
          if (cachedImageUrl.isObjectUrl) {
            URL.revokeObjectURL(cachedImageUrl.url)
          }
          return
        }

        if (cachedImageUrl.isObjectUrl) {
          imageObjectUrlsRef.current.add(cachedImageUrl.url)
        }

        const nextImageUrls = {
          ...imageUrlsByFrameIdRef.current,
          [frameId]: cachedImageUrl.url,
        }
        const nextCacheOrder = imageFrameCacheOrderRef.current.filter((cachedFrameId) => cachedFrameId !== frameId)
        nextCacheOrder.push(frameId)
        while (nextCacheOrder.length > maxCachedSessionImageFrames) {
          const evictedFrameIndex = nextCacheOrder.findIndex((cachedFrameId) => (
            cachedFrameId !== selectedImageFrameIdRef.current
            && cachedFrameId !== displayedImageFrameIdRef.current
          ))
          if (evictedFrameIndex < 0) {
            break
          }

          const [evictedFrameId] = nextCacheOrder.splice(evictedFrameIndex, 1)
          const evictedUrl = nextImageUrls[evictedFrameId]
          delete nextImageUrls[evictedFrameId]
          if (evictedUrl && imageObjectUrlsRef.current.delete(evictedUrl)) {
            URL.revokeObjectURL(evictedUrl)
          }
        }

        imageFrameCacheOrderRef.current = nextCacheOrder
        imageUrlsByFrameIdRef.current = nextImageUrls
        publishImageCache()
      } catch (error) {
        if (
          isMountedRef.current
          && activeSessionIdRef.current === activeSessionId
          && pendingImageFrameRequestsRef.current.get(frameId) === requestId
          && selectedImageFrameIdRef.current === frameId
        ) {
          setMessage(getErrorMessage(error, 'Unable to load session screenshots.'))
        }
      } finally {
        if (pendingImageFrameRequestsRef.current.get(frameId) === requestId) {
          pendingImageFrameRequestsRef.current.delete(frameId)
        }
        if (isMountedRef.current && activeSessionIdRef.current === activeSessionId) {
          markImageFrameLoading(frameId, false)
        }
      }
    }

    void loadImageUrl()
  }, [markImageFrameLoading, publishImageCache, sessionId, source])

  useEffect(() => {
    if (!payload) {
      return
    }

    for (const frame of imagePrefetchFrames) {
      loadImageFrame(payload, frame)
    }
  }, [imagePrefetchFrames, loadImageFrame, payload])

  useEffect(() => {
    if (!isSessionInfoOpen || sessionInfoAiKind) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        updateSessionInfoOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSessionInfoOpen, sessionInfoAiKind, updateSessionInfoOpen])

  if (isLoading) {
    return (
      <div className="dashboard">
        <section className="loading-panel" aria-live="polite">
          <CircleNotch className="spin" aria-hidden="true" />
          <h1>Loading shared session</h1>
        </section>
      </div>
    )
  }

  if (!payload || !captureSession) {
    return (
      <div className="dashboard">
        <PageHeader title="Shared session" />
        {message ? <p className="inline-message">{message}</p> : null}
        {!isEmbedded && onBack ? (
          <button className="button button--secondary" onClick={onBack} type="button">
            <ArrowLeft aria-hidden="true" />
            Back to sessions
          </button>
        ) : null}
      </div>
    )
  }

  const session = payload.session
  const sessionTitle = session.title || captureSession.clientName || captureSession.sessionId || 'Shared session'
  const sessionNotes = session.description || captureSession.notes || ''
  const sessionAuthor = resolveSessionAuthorText(session, captureSession)
  const isArchivedSession = !!session.archived_at
  const showSessionChrome = !isEmbedded
  const canShareSession = !isEmbedded && canManageSession && session.access_status === 'public_no_auth' && !isArchivedSession
  const sessionShareUrl = createSessionShareUrl(session.id)
  const sessionEmbedUrl = createSessionEmbedUrl(session.id)
  const sessionEmbedCode = createSessionEmbedCode(sessionEmbedUrl, session.title || captureSession.clientName || 'Ansight session player')
  const canCaptureLiveVisualTree = isLocalReplay && isLiveSession && !!source.captureLiveVisualTree && !!source.loadLiveVisualTreeSources
  const artifactFileReader = source.readArtifactFile ?? (!isLocalReplay
    ? (_currentSessionId: string, snapshotId: string | null, path: string, forceText?: boolean, allowLargeFile?: boolean) => (
        readCloudSessionArtifactFile(payload, snapshotId, path, forceText, allowLargeFile)
      )
    : undefined)
  const artifactDownloadCommand = !isLocalReplay ? `ansight cloud session download ${session.id}` : undefined
  const hasCloudAiSource = !!source.loadAiReadState
  const showCloudAiActions = !isLocalReplay && hasCloudAiSource
  const canRunCloudAi = hasCloudAiSource
    && !!source.createAiExtraction
    && !!source.archiveAiExtraction
    && !superAdminMode
    && (isLocalReplay || (isSignedIn && !isEmbedded && session.storage_layout !== 'archive_zip'))
  const canGenerateSummary = canRunCloudAi
  const canGenerateFlowchart = canRunCloudAi
  const summaryAiExtractions = aiExtractions.filter((run) => run.kind === 'analysis')
  const flowchartAiExtractions = aiExtractions.filter((run) => run.kind === 'mermaid')
  const visibleSummaryAiExtractions = canGenerateSummary ? summaryAiExtractions : summaryAiExtractions.filter(isPublishedAiRun)
  const visibleFlowchartAiExtractions = canGenerateFlowchart ? flowchartAiExtractions : flowchartAiExtractions.filter(isPublishedAiRun)
  const summaryAiForm = createDefaultSummaryAiForm(payload.video ? 'gemini' : 'openai')
  const summaryAccessBlock = isLocalReplay && !aiCapabilities
    ? null
    : resolveCloudAiAccessBlock('analysis', aiCapabilities, summaryAiForm.provider, {
      isPublicViewer: !isLocalReplay && !canRunCloudAi,
    })
  const flowchartAccessBlock = isLocalReplay && !aiCapabilities
    ? null
    : resolveCloudAiAccessBlock('mermaid', aiCapabilities, aiForm.provider, {
      isPublicViewer: !isLocalReplay && !canRunCloudAi,
    })
  const summaryAiDurationFeedback = resolveSessionAiDurationFeedback(effectiveSessionDurationMs, aiCapabilities, summaryAiForm)
  const aiDurationFeedback = resolveSessionAiDurationFeedback(effectiveSessionDurationMs, aiCapabilities, aiForm)
  const sessionViewerStyle = { '--session-replay-panel-width': `${replayPanelWidth}px` } as CSSProperties

  async function handleDownloadOfflineCapture() {
    setSessionActionMessage(null)
    setIsSessionActionPending(true)
    try {
      const signedUrl = await createRawSessionArchiveSignedUrl(session)
      window.open(signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setSessionActionMessage({
        kind: 'error',
        message: getErrorMessage(error, 'Unable to download the offline capture archive.'),
      })
    } finally {
      setIsSessionActionPending(false)
    }
  }

  function selectTimelineEditRange(startMs: number, endMs: number) {
    const normalizedStartMs = Math.min(startMs, endMs)
    const normalizedEndMs = Math.max(startMs, endMs)
    setSelectedVisualTreeSnapshotKey(null)
    setSelectedArtifactSnapshotKey(null)
    setScrubAtMs(clamp(normalizedEndMs, timelineRange.startMs, timelineRange.endMs))
    setIsTimelineRangeSelecting(false)
    setTimelineEditSelection({
      startMs: normalizedStartMs,
      endMs: normalizedEndMs,
      focusMs: normalizedEndMs,
    })
  }

  async function handleOptimizeSession(encodeVideo: boolean, onProgress: (progress: SessionOptimizationProgress) => void): Promise<SessionOptimizationResult> {
    if (!source.optimizeSession) {
      throw new Error('Session optimisation is not available for this viewer.')
    }

    try {
      return await source.optimizeSession(sessionId, encodeVideo, onProgress)
    } finally {
      // Optimisation can finish locally even if a subsequent video export fails.
      onProgress({ message: 'Refreshing session viewer…' })
      try {
        const nextPayload = await source.loadPayload(sessionId, superAdminMode)
        const hydratedPayload = await (source.hydratePayload?.(nextPayload) ?? Promise.resolve(nextPayload))
        if (activeSessionIdRef.current === sessionId) {
          resetImageCache()
          setPayload(hydratedPayload)
          setScrubAtMs(null)
          setSelectedVisualTreeSnapshotKey(null)
          setSelectedArtifactSnapshotKey(null)
          setMessage(null)
        }
      } catch (error) {
        if (activeSessionIdRef.current === sessionId) {
          setMessage(getErrorMessage(error, 'Unable to refresh session evidence after optimisation.'))
        }
      }
    }
  }

  async function handleTimelineEdit(action: TimelineEditAction) {
    if (!timelineEditSelection) {
      return
    }

    if (action === 'annotate') {
      const { startMs, endMs, focusMs } = timelineEditSelection
      setTimelineEditSelection(null)
      openTimelineAnnotationEditor(startMs, endMs, focusMs)
      return
    }

    if (action === 'task') {
      const selection = timelineEditSelection
      setTimelineEditSelection(null)
      onTaskExtractionRequested?.(selection)
      return
    }

    const startUtc = new Date(timelineEditSelection.startMs).toISOString()
    const endUtc = new Date(timelineEditSelection.endMs).toISOString()
    const actionLabel = action === 'extract'
      ? 'Extract session'
      : action === 'cutSelection'
        ? 'Remove selected range'
        : 'Keep only selected range'
    if (action !== 'extract' && !window.confirm(
      `${actionLabel}? This changes the stored session and cannot be undone.`,
    )) {
      return
    }

    setIsSessionActionPending(true)
    setSessionActionMessage(null)
    timelineEditInFlightRef.current = sessionId
    timelineEditRefreshRef.current = null
    payloadRefreshVersionRef.current += 1
    setTimelineEditProgress({ message: action === 'extract' ? 'Extracting selected evidence…' : 'Preparing session trim…' })
    try {
      if (action === 'extract') {
        if (!source.extractTimelineRange) {
          throw new Error('Session extraction is not available for this viewer.')
        }

        const result = await source.extractTimelineRange(sessionId, startUtc, endUtc)
        setSessionActionMessage({ kind: 'success', message: result.message })
        setTimelineEditSelection(null)
        await onSessionExtracted?.(result.extractedSessionId)
        return
      }

      if (!source.trimTimelineRange) {
        throw new Error('Session trimming is not available for this viewer.')
      }

      const resultMessage = await source.trimTimelineRange(sessionId, startUtc, endUtc, action, setTimelineEditProgress)
      setTimelineEditProgress({ message: 'Refreshing session viewer…' })
      const nextPayload = await source.loadPayload(sessionId, superAdminMode)
      const hydratedPayload = await (source.hydratePayload?.(nextPayload) ?? Promise.resolve(nextPayload))
      if (activeSessionIdRef.current !== sessionId) return
      if (isLocalReplay) {
        const capture = hydratedPayload.capture.session
        timelineEditRefreshRef.current = {
          sessionId,
          key: `${capture?.lastUpdatedUtc}:${capture?.totalLogCount ?? capture?.logs?.length ?? 0}:${capture?.totalImageCount ?? capture?.images?.length ?? 0}:${capture?.visualTreeSnapshots?.length ?? 0}`,
        }
      }
      resetImageCache()
      setPayload(hydratedPayload)
      setScrubAtMs(null)
      setSelectedVisualTreeSnapshotKey(null)
      setSelectedArtifactSnapshotKey(null)
      setTimelineEditSelection(null)
      setSessionActionMessage({ kind: 'success', message: resultMessage })
    } catch (error) {
      setSessionActionMessage({
        kind: 'error',
        message: getErrorMessage(error, `Unable to ${actionLabel.toLowerCase()}.`),
      })
    } finally {
      if (timelineEditInFlightRef.current === sessionId) timelineEditInFlightRef.current = null
      setTimelineEditProgress(null)
      setIsSessionActionPending(false)
    }
  }

  function selectVisualTreeSnapshot(snapshot: SessionVisualTreeSnapshot) {
    setVisualTreeOverlay(null)
    setSelectedVisualTreeSnapshotKey(resolveVisualTreeSnapshotKey(snapshot))
    setSelectedArtifactSnapshotKey(null)
    const timestampMs = toTimestamp(snapshot.capturedAtUtc)
    if (timestampMs !== null) {
      setScrubAtMs(timestampMs)
    }
  }

  function handleSelectArtifactSnapshot(snapshot: SessionArtifactSnapshot) {
    const snapshotIndex = artifactSnapshots.indexOf(snapshot)
    setSelectedArtifactSnapshotKey(resolveArtifactSnapshotKey(snapshot, snapshotIndex))
    setSelectedVisualTreeSnapshotKey(null)
    setVisualTreeOverlay(null)
    const timestampMs = toTimestamp(snapshot.capturedAtUtc)
    if (timestampMs !== null) {
      setScrubAtMs(timestampMs)
    }
  }

  function handleReplayResizePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    const startX = event.clientX
    const startWidth = replayPanelWidth
    let nextWidth = startWidth

    function updateWidth(clientX: number) {
      nextWidth = clampSessionReplayPanelWidth(startWidth + startX - clientX)
      setReplayPanelWidth(nextWidth)
    }

    function finishResize() {
      writeStoredSessionReplayPanelWidth(nextWidth)
      document.body.classList.remove('session-replay-resizing')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }

    function handlePointerMove(pointerEvent: globalThis.PointerEvent) {
      pointerEvent.preventDefault()
      updateWidth(pointerEvent.clientX)
    }

    function handlePointerEnd(pointerEvent: globalThis.PointerEvent) {
      pointerEvent.preventDefault()
      finishResize()
    }

    document.body.classList.add('session-replay-resizing')
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
  }

  const captureToolbar = canCaptureLiveVisualTree ? (
    <LiveVisualTreeCaptureToolbar
      capture={source.captureLiveVisualTree!}
      key={sessionId}
      loadSources={source.loadLiveVisualTreeSources!}
      sessionId={sessionId}
    />
  ) : null
  const hasInlineCaptureToolbar = typeof replayPanelOverride === 'function'
  const replayPanelContent = typeof replayPanelOverride === 'function'
    ? replayPanelOverride({
        captureToolbar,
        annotations,
        frame: selectedFrame,
        isAnnotationEditorOpen: annotationEditorDraft !== null,
        onCreateAnnotation: source.upsertAnnotation && selectedFrame
          ? openScreenshotAnnotationEditor
          : undefined,
        selectedAnnotationId: resolvedSelectedAnnotationId,
      })
    : replayPanelOverride

  return (
    <div
      className={isEmbedded ? 'dashboard session-viewer-dashboard session-viewer-dashboard--embedded' : 'dashboard session-viewer-dashboard'}
      style={sessionViewerStyle}
    >
      {showSessionChrome && onBack ? (
        <button className="button button--secondary button--compact session-back-button" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" />
          Sessions
        </button>
      ) : null}

      {showSessionChrome ? (
        <div className="session-heading-row">
          <div className="session-title-block">
            <p className="eyebrow">Session</p>
            <h1>{sessionTitle}</h1>
            <CopyTextButton className="session-id-copy" label={sessionId} text={sessionId} />
          </div>
          <div className="session-heading-actions">
            {session.storage_layout === 'archive_zip' ? (
              <button
                className="button button--secondary button--compact session-action-button"
                disabled={isSessionActionPending}
                onClick={() => void handleDownloadOfflineCapture()}
                type="button"
              >
                {isSessionActionPending ? <CircleNotch className="spin" aria-hidden="true" /> : <DownloadSimple aria-hidden="true" />}
                <span className="session-action-label">Download archive</span>
              </button>
            ) : null}
            {canManageSession ? (
              <>
                <button
                  className="button button--secondary button--compact session-action-button"
                  disabled={isSessionActionPending}
                  onClick={() => {
                    setSessionEditMessage(null)
                    setIsSessionEditOpen(true)
                  }}
                  type="button"
                >
                  <NotePencil aria-hidden="true" />
                  <span className="session-action-label">Edit</span>
                </button>
                <button className="button button--secondary button--compact session-action-button" disabled={isSessionActionPending} onClick={() => void handleArchiveSession(!isArchivedSession)} type="button">
                  {isSessionActionPending ? <CircleNotch className="spin" aria-hidden="true" /> : isArchivedSession ? <ArrowCounterClockwise aria-hidden="true" /> : <Archive aria-hidden="true" />}
                  <span className="session-action-label">{isArchivedSession ? 'Restore' : 'Archive'}</span>
                </button>
                <button className="button button--danger button--compact session-action-button" disabled={isSessionActionPending} onClick={() => void handleDeleteSession()} type="button">
                  <Trash aria-hidden="true" />
                  <span className="session-action-label">Delete</span>
                </button>
              </>
            ) : null}
            {canShareSession ? (
              <button className="button button--secondary button--compact session-action-button" onClick={() => setIsShareModalOpen(true)} type="button">
                <GlobeSimple aria-hidden="true" />
                <span className="session-action-label">Share</span>
              </button>
            ) : null}
            <button className="button button--secondary session-info-button session-action-button" onClick={() => {
              setSessionInfoAiKind(null)
              updateSessionInfoOpen(true)
            }} type="button" aria-label="Session info">
              <Info aria-hidden="true" />
              <span className="session-action-label">Info</span>
            </button>
          </div>
          {sessionNotes.trim() ? <p className="session-heading-notes muted">{sessionNotes}</p> : null}
          <p className="session-heading-author">
            <User aria-hidden="true" />
            <span>{sessionAuthor}</span>
            {isArchivedSession ? <span className="status-pill">Archived</span> : null}
          </p>
        </div>
      ) : null}

      {message ? <p className="inline-message">{message}</p> : null}
      {session.storage_layout === 'archive_zip' ? (
        <p className="inline-message">
          This is a raw offline capture archive. Download it, import it with the Ansight CLI using <code>ansight session import</code>, then publish a streamable replay using <code>ansight session share</code> to enable browser replay and cloud AI.
        </p>
      ) : null}
      {sessionActionMessage ? <p className="inline-message">{sessionActionMessage.message}</p> : null}

      <section className="session-player-shell">
        <section className="panel timeline-panel session-player-timeline">
          <div className="panel-heading">
            <div className="timeline-title-block">
              <span>{formatDateTimeFromMs(effectiveScrubAtMs)}</span>
            </div>
          </div>

          <SessionTimelineChart
            annotations={annotations}
            artifactSnapshots={artifactSnapshots}
            isFollowingLive={isFollowingLive}
            isLiveSession={isLiveSession}
            key={sessionId}
            lifecycleTransitions={lifecycleTransitions}
            metricIndex={timelineMetricIndex}
            telemetryReport={deferredTelemetryReport(captureSession)}
            range={timelineRange}
            scrubAtMs={effectiveScrubAtMs}
            selectedAnnotationId={resolvedSelectedAnnotationId}
            showTouchLocations={showTouchLocations}
            touches={timelineReplayIndex.touches}
            visualTrees={visualTrees}
            onSelectAnnotation={selectAnnotation}
            onCreateAnnotation={source.upsertAnnotation ? openTimelineAnnotationEditor : undefined}
            isRangeSelectionActive={isTimelineRangeSelecting}
            onGoLive={() => {
              if (isLocalReplay) trackInspection('playback')
              setSelectedVisualTreeSnapshotKey(null)
              setSelectedArtifactSnapshotKey(null)
              setScrubAtMs(null)
            }}
            onLeaveLive={(timestampMs) => {
              if (isLocalReplay) trackInspection('playback')
              setSelectedVisualTreeSnapshotKey(null)
              setSelectedArtifactSnapshotKey(null)
              setScrubAtMs(clamp(timestampMs, timelineRange.startMs, timelineRange.endMs))
            }}
            onScrub={(timestampMs) => {
              if (isLocalReplay) trackInspection('playback')
              setSelectedVisualTreeSnapshotKey(null)
              setSelectedArtifactSnapshotKey(null)
              setScrubAtMs(resolveScrubSelection(timestampMs, timelineRange, isLiveSession))
            }}
            onSelectTimelineRange={source.upsertAnnotation || onTaskExtractionRequested || (!isLiveSession && (source.extractTimelineRange || source.trimTimelineRange))
              ? selectTimelineEditRange
              : undefined}
            onToggleRangeSelection={() => setIsTimelineRangeSelecting((current) => !current)}
            onToggleTouchLocations={() => setShowTouchLocations((current) => !current)}
          />
          {captureSession.captureSource === 'device' && touches.length === 0 ? <SdkTouchCaptureNotice /> : null}
        </section>

        <aside
          className={canCaptureLiveVisualTree && !hasInlineCaptureToolbar
            ? 'panel session-screenshot-panel session-screenshot-panel--has-capture-action'
            : 'panel session-screenshot-panel'}
          aria-label="Session screenshots"
        >
          <button
            aria-label="Resize replay panel"
            className="session-replay-resize-handle"
            onPointerDown={handleReplayResizePointerDown}
            title="Resize replay panel"
            type="button"
          >
            <span aria-hidden="true" />
          </button>
          {!hasInlineCaptureToolbar ? captureToolbar : null}
          {replayPanelContent ?? <>
          <div className={selectedFrameStageClassName} aria-label={isLocalReplay ? `${selectedDeviceFrame.name} frame` : undefined} title={isLocalReplay ? selectedDeviceFrame.name : undefined}>
            {isLocalReplay && selectedFrame && selectedDeviceFrame.kind !== 'desktop' ? <div className="device-shell-hardware" aria-hidden="true">
              <span className="device-shell-power" /><span className="device-shell-volume-up" />
              <span className="device-shell-volume-down" /><span className="device-shell-action" />
              <span className="device-shell-camera-control" /><span className="device-shell-home" />
              <span className="device-shell-speaker" /><span className="device-shell-camera" />
            </div> : null}
            {selectedFrame ? (
              <div className="session-frame-viewport" ref={selectedFrameViewportRef} style={selectedFrameViewportStyle}>
                {isLocalReplay ? <span aria-hidden="true" className="device-screen-cutout" /> : null}
                {canUseSelectedSessionVideo && sessionVideoUrl ? (
                  <video
                    aria-label="Selected session frame"
                    className="session-frame-video session-frame-image-layer session-frame-image-layer--presented"
                    data-frame-id={presentedVideoFrameId ?? ''}
                    muted
                    onError={() => {
                      pendingVideoSeekRef.current = null
                      setPresentedVideoFrameId(null)
                      setSessionVideoLoadState({
                        storagePath: payload?.video?.file.storagePath ?? '',
                        url: null,
                        failed: true,
                      })
                    }}
                    onLoadedData={syncSelectedFrameImageContentBounds}
                    onLoadedMetadata={() => setVideoMetadataVersion((current) => current + 1)}
                    onSeeked={(event) => {
                      const pendingSeek = pendingVideoSeekRef.current
                      if (pendingSeek && Math.abs(event.currentTarget.currentTime - pendingSeek.targetSeconds) <= 0.002) {
                        setPresentedVideoFrameId(pendingSeek.frameId)
                      }
                    }}
                    playsInline
                    preload="auto"
                    ref={(element) => {
                      sessionVideoRef.current = element
                      selectedFrameMediaRef.current = element
                    }}
                    src={sessionVideoUrl}
                  />
                ) : null}
                {frameImageLayers.map(({ frame, url }) => (
                  <img
                    alt="Selected session screenshot"
                    className="session-frame-image-layer session-frame-image-layer--presented"
                    data-frame-id={frame.frameId}
                    key={frame.frameId}
                    onLoad={syncSelectedFrameImageContentBounds}
                    ref={(element) => {
                      selectedFrameMediaRef.current = element
                    }}
                    src={url}
                  />
                ))}
                {hasSelectedMediaPending ? (
                  <div aria-label="Loading selected frame" className="session-frame-loading-indicator" role="status">
                    <CircleNotch className="spin" aria-hidden="true" />
                  </div>
                ) : null}
                {hasPresentedMedia ? (
                  <>
                    {isSelectedFramePresented && selectedFrameImageContentBounds?.frameId === selectedFrame.frameId ? (
                      <div
                        className="session-frame-image-overlay-layer"
                        style={{
                          height: selectedFrameImageContentBounds.height,
                          left: selectedFrameImageContentBounds.left,
                          top: selectedFrameImageContentBounds.top,
                          width: selectedFrameImageContentBounds.width,
                        }}
                      >
                        {visualTreeOverlay && selectedVisualTree && visualTreeOverlay.snapshotId === resolveVisualTreeSnapshotKey(selectedVisualTree) ? (
                          <SessionFrameVisualTreeOverlay selection={visualTreeOverlay} />
                        ) : null}
                        <SessionFrameAnnotationOverlay
                          annotations={annotations}
                          frame={selectedFrame}
                          selectedAnnotationId={resolvedSelectedAnnotationId}
                        />
                        {source.upsertAnnotation ? (
                          <SessionFrameAnnotationAuthoringOverlay
                            isEnabled={false}
                            onCreate={openScreenshotAnnotationEditor}
                          />
                        ) : null}
                        {showTouchLocations ? <SessionFrameTouchOverlay frame={selectedFrame} scrubAtMs={effectiveScrubAtMs} touches={activeTouches} /> : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="session-frame-placeholder">
                    {hasSelectedMediaPending ? (
                      <EmptyState icon={<CircleNotch className="spin" aria-hidden="true" />} title="Loading replay" message="Preparing the selected frame." />
                    ) : (
                      <EmptyState icon={<ImageIcon aria-hidden="true" />} title="No screenshot available" message="This point in the session has no captured screenshot." />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon={<ImageIcon aria-hidden="true" />} title="No screenshot available" message="This point in the session has no captured screenshot." />
            )}
          {isAppBackgroundedAtScrub ? (
              <div className="session-frame-background-overlay" role="status">
                <span>
                  <WarningCircle aria-hidden="true" />
                  The app was backgrounded
                </span>
              </div>
            ) : null}
          </div>
          </>}

        </aside>
      </section>

      <section className="panel">
        <div className="viewer-tabs" role="tablist" aria-label="Session sections">
          <TabButton activeTab={effectiveActiveTab} badge={allLogs.length} icon={<ListBullets aria-hidden="true" />} label="Logs" tab="live-log" onSelect={selectUsageTab} />
          {isLocalReplay ? <TabButton activeTab={effectiveActiveTab} badge={networkRequests.length} icon={<GlobeSimple aria-hidden="true" />} label="Network" tab="network" onSelect={selectUsageTab} /> : null}
          {annotations.length > 0 ? <TabButton activeTab={effectiveActiveTab} badge={annotations.length} icon={<NotePencil aria-hidden="true" />} label="Annotations" tab="annotations" onSelect={selectUsageTab} /> : null}
          <TabButton activeTab={effectiveActiveTab} badge={visualTrees.length} icon={<TreeStructure aria-hidden="true" />} label="Visual tree" tab="visual-tree" onSelect={selectUsageTab} />
          <TabButton activeTab={effectiveActiveTab} badge={artifactSnapshots.length} icon={<Stack aria-hidden="true" />} label="Artifacts" tab="artifacts" onSelect={selectUsageTab} />
          {source.listLiveFiles && source.readLiveFile ? <TabButton activeTab={effectiveActiveTab} icon={<FileText aria-hidden="true" />} label="Files" tab="files" onSelect={selectUsageTab} /> : null}
          {!isLocalReplay ? <TabButton activeTab={effectiveActiveTab} badge={attachments.length} icon={<Paperclip aria-hidden="true" />} label="Attachments" tab="attachments" onSelect={selectUsageTab} /> : null}
        </div>

        {captureSession.captureSource === 'device' && sdkNoticeForTab(effectiveActiveTab) ? (
          <SdkCapabilityNotice feature={sdkNoticeForTab(effectiveActiveTab)!} />
        ) : null}

        {effectiveActiveTab === 'visual-tree' ? (
          <VisualTreeSection
            onSelectOverlay={setVisualTreeOverlay}
            onSelectSnapshot={selectVisualTreeSnapshot}
            selectedFrame={selectedFrame}
            selectedVisualTree={selectedVisualTree}
            visualTrees={visualTrees}
          />
        ) : null}
        {effectiveActiveTab === 'artifacts' ? (
          <>
          {source.artifactComparison ? <ArtifactComparisonExplorer
            key={`comparison:${sessionId}`}
            source={source.artifactComparison}
            sessionId={sessionId}
            activeArtifactId={selectedArtifactSnapshot?.snapshotId}
            refreshKey={artifactSnapshots.map(item => item.snapshotId).join(',')}
            onInspect={artifactId => {
              const candidate = artifactSnapshots.find(item => item.snapshotId === artifactId)
              if (candidate) handleSelectArtifactSnapshot(candidate)
            }}
          >
          <ArtifactsSection
            artifactFileOperations={source.artifactFileOperations}
            artifactSnapshots={artifactSnapshots}
            key={`${sessionId}:${selectedArtifactSnapshot?.snapshotId ?? 'latest'}`}
            artifactComparison={source.artifactComparison}
            artifactDownloadCommand={artifactDownloadCommand}
            onSelectSnapshot={handleSelectArtifactSnapshot}
            queryArtifactDatabase={source.queryArtifactDatabase}
            readArtifactFile={artifactFileReader}
            selectedArtifactSnapshot={selectedArtifactSnapshot}
            sessionId={sessionId}
          />
          </ArtifactComparisonExplorer> : (
          <ArtifactsSection
            artifactFileOperations={source.artifactFileOperations}
            artifactSnapshots={artifactSnapshots}
            key={`${sessionId}:${selectedArtifactSnapshot?.snapshotId ?? 'latest'}`}
            artifactComparison={source.artifactComparison}
            artifactDownloadCommand={artifactDownloadCommand}
            onSelectSnapshot={handleSelectArtifactSnapshot}
            queryArtifactDatabase={source.queryArtifactDatabase}
            readArtifactFile={artifactFileReader}
            selectedArtifactSnapshot={selectedArtifactSnapshot}
            sessionId={sessionId}
          />
          )}
          </>
        ) : null}
        {effectiveActiveTab === 'files' ? (
          <FilesSection
            captureLiveFile={source.captureLiveFile}
            externalCapture={captureSession.captureSource === 'device'}
            isLiveSession={isLiveSession}
            key={sessionId}
            listLiveFiles={source.listLiveFiles}
            queryLiveDatabase={source.queryLiveDatabase}
            readLiveFile={source.readLiveFile}
            sessionId={sessionId}
          />
        ) : null}
        {effectiveActiveTab === 'attachments' ? (
          <AttachmentsSection
            attachments={attachments}
            canAttach={canAttachToSession}
            currentUserId={currentUserId}
            draftFile={attachmentDraftFile}
            draftName={attachmentDraftName}
            draftNotes={attachmentDraftNotes}
            fileInputRef={attachmentFileInputRef}
            isLoading={isAttachmentsLoading}
            isSignedIn={isSignedIn}
            isSubmitting={isAttachmentSubmitting}
            limits={attachmentLimits}
            message={attachmentMessage}
            onDeleteAttachment={(attachment) => void handleDeleteAttachment(attachment)}
            onOpenAttachment={(attachment) => void handleOpenAttachment(attachment)}
            onRefresh={() => void refreshAttachments()}
            onSubmit={(event) => void handleCreateAttachment(event)}
            onUpdateDraftFile={updateAttachmentDraftFile}
            onUpdateDraftName={setAttachmentDraftName}
            onUpdateDraftNotes={setAttachmentDraftNotes}
          />
        ) : null}
        {effectiveActiveTab === 'live-log' ? (
          <LiveLogViewer
            className="session-tab-live-log"
            embedded
            logStreams={logStreams}
            logs={logs}
            onSelectLogStream={setSelectedLogStreamId}
            scrubAtMs={effectiveScrubAtMs}
            selectedLogStreamId={selectedLogStream?.streamId ?? null}
            timelineLogs={selectedTimelineLogs}
            timelineRange={timelineRange}
          />
        ) : null}
        {effectiveActiveTab === 'network' && (captureSession.captureSource !== 'device' || networkRequests.length > 0) ? (
          <NetworkSection requests={networkRequests} />
        ) : null}
        {effectiveActiveTab === 'annotations' ? (
          <AnnotationsSection
            annotations={annotations}
            canEdit={!!source.upsertAnnotation}
            isSubmitting={isAnnotationSubmitting}
            onDeleteAnnotation={(annotationId) => void deleteAnnotation(annotationId)}
            onEditAnnotation={editAnnotation}
            selectedAnnotationId={resolvedSelectedAnnotationId}
            onSelectAnnotation={selectAnnotation}
          />
        ) : null}
      </section>

      {isSessionInfoOpen && !sessionInfoAiKind ? (
        <SessionInfoModal
          artifactSnapshots={artifactSnapshots}
          captureSession={captureSession}
          effectiveDurationMs={effectiveSessionDurationMs}
          files={payload.manifest.files.length}
          frames={frames}
          key={sessionId}
          loadStorageBreakdown={source.loadStorageBreakdown}
          metricChannels={metricChannels}
          manifestFiles={payload.manifest.files}
          metrics={metrics}
          logs={allLogs}
          isLiveSession={isLiveSession}
          onClose={() => updateSessionInfoOpen(false)}
          onSelectAiView={showCloudAiActions ? setSessionInfoAiKind : undefined}
          onOptimizeSession={source.optimizeSession ? handleOptimizeSession : undefined}
          showSessionMetadata={isSignedIn}
          session={session}
          summaryCount={visibleSummaryAiExtractions.length}
          flowchartCount={visibleFlowchartAiExtractions.length}
          touches={touches}
          visualTrees={visualTrees}
        />
      ) : null}

      {isSessionInfoOpen && sessionInfoAiKind ? (
        <SessionInfoAiModal
          kind={sessionInfoAiKind}
          onBack={() => setSessionInfoAiKind(null)}
          onClose={() => updateSessionInfoOpen(false)}
        >
          <AnalysisSection
            aiCapabilities={aiCapabilities}
            aiDurationFeedback={sessionInfoAiKind === 'analysis' ? summaryAiDurationFeedback : aiDurationFeedback}
            aiExtractions={sessionInfoAiKind === 'analysis' ? visibleSummaryAiExtractions : visibleFlowchartAiExtractions}
            aiForm={aiForm}
            aiMessage={aiMessage}
            analyses={sessionInfoAiKind === 'analysis' ? captureSession.analyses ?? [] : []}
            archivingAiRunId={archivingAiRunId}
            accessBlock={sessionInfoAiKind === 'analysis' ? summaryAccessBlock : flowchartAccessBlock}
            hasCloudAiCapability={sessionInfoAiKind === 'analysis' ? canGenerateSummary : canGenerateFlowchart}
            isAiLoading={isAiLoading}
            isAiSubmitting={isAiSubmitting}
            kind={sessionInfoAiKind}
            onArchiveAiExtraction={(run, shouldArchive) => void handleArchiveAiExtraction(run, shouldArchive)}
            onCreateAiExtraction={(kind) => void handleCreateAiExtraction(kind)}
            onRefreshAiExtractions={() => void refreshAiExtractions()}
            onToggleAiSourcePart={toggleAiSourcePart}
            onToggleShowArchivedAiRuns={() => setShowArchivedAiRuns((current) => !current)}
            onUpdateAiForm={updateAiForm}
            readOnlyAiExtractions={sessionInfoAiKind === 'analysis' ? !canGenerateSummary : !canGenerateFlowchart}
            showArchivedAiRuns={showArchivedAiRuns}
            sourcePartOptions={aiSourcePartOptions}
            title={sessionInfoAiKind === 'analysis' ? 'Summary' : 'Flowchart'}
          />
        </SessionInfoAiModal>
      ) : null}

      {annotationEditorDraft ? (
        <AnnotationEditorModal
          draft={annotationEditorDraft}
          isSubmitting={isAnnotationSubmitting}
          onClose={() => setAnnotationEditorDraft(null)}
          onDelete={source.deleteAnnotation && annotationIds.includes(annotationEditorDraft.annotation.annotationId ?? '')
            ? (annotationId) => void deleteAnnotation(annotationId)
            : undefined}
          onSave={(annotation) => void saveAnnotation(annotation)}
        />
      ) : null}

      {timelineEditSelection ? (
        <TimelineEditModal
          canAnnotate={!!source.upsertAnnotation}
          canExtract={!isLiveSession && !!source.extractTimelineRange}
          canExtractTask={!!onTaskExtractionRequested}
          canTrim={!isLiveSession && !!source.trimTimelineRange}
          isSubmitting={isSessionActionPending}
          progress={timelineEditProgress}
          error={sessionActionMessage?.kind === 'error' ? sessionActionMessage.message : null}
          onClose={() => setTimelineEditSelection(null)}
          onSubmit={(action) => void handleTimelineEdit(action)}
          selection={timelineEditSelection}
        />
      ) : null}

      {isShareModalOpen ? (
        <SessionShareModal
          copyMessage={shareCopyMessage}
          embedCode={sessionEmbedCode}
          onClose={() => {
            setIsShareModalOpen(false)
            setShareCopyMessage(null)
          }}
          onCopy={(value, message) => void copyShareText(value, message, setShareCopyMessage)}
          shareUrl={sessionShareUrl}
          title={session.title || captureSession.clientName || 'Shared session'}
        />
      ) : null}

      {isSessionEditOpen ? (
        <SessionEditModal
          error={sessionEditMessage}
          isSubmitting={isSessionEditSubmitting}
          onClose={() => {
            setIsSessionEditOpen(false)
            setSessionEditMessage(null)
          }}
          onSubmit={handleEditSession}
          session={session}
        />
      ) : null}

    </div>
  )
}

function TimelineEditModal({
  canAnnotate,
  canExtract,
  canExtractTask,
  canTrim,
  isSubmitting,
  progress,
  error,
  onClose,
  onSubmit,
  selection,
}: {
  canAnnotate: boolean
  canExtract: boolean
  canExtractTask: boolean
  canTrim: boolean
  isSubmitting: boolean
  progress: SessionOperationProgress | null
  error: string | null
  onClose: () => void
  onSubmit: (action: TimelineEditAction) => void
  selection: TimelineEditSelection
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!isSubmitting) return
    const started = Date.now()
    const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(interval)
  }, [isSubmitting])
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, onClose])

  const duration = formatDuration(selection.endMs - selection.startMs)
  return (
    <div className="modal-backdrop" onMouseDown={isSubmitting ? undefined : onClose}>
      <section
        aria-labelledby="timeline-edit-title"
        aria-modal="true"
        className="session-info-modal timeline-edit-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Timeline selection</p>
            <h2 id="timeline-edit-title">Choose an action</h2>
            <p className="muted">
              {formatDateTimeFromMs(selection.startMs)} – {formatDateTimeFromMs(selection.endMs)} · {duration}
            </p>
          </div>
          <button aria-label="Close timeline tools" className="button button--secondary button--icon" disabled={isSubmitting} onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="timeline-edit-options">
          {canAnnotate ? (
            <button className="timeline-edit-option" disabled={isSubmitting} onClick={() => onSubmit('annotate')} type="button">
              <NotePencil aria-hidden="true" />
              <span>
                <strong>Add annotation</strong>
                <small>Describe or label the selected timeline range.</small>
              </span>
            </button>
          ) : null}
          {canExtract ? (
            <button className="timeline-edit-option" disabled={isSubmitting} onClick={() => onSubmit('extract')} type="button">
              <Archive aria-hidden="true" />
              <span>
                <strong>Extract new session</strong>
                <small>Create a separate session containing only this range. The original is unchanged.</small>
              </span>
            </button>
          ) : null}
          {canExtractTask ? (
            <button className="timeline-edit-option" disabled={isSubmitting} onClick={() => onSubmit('task')} type="button">
              <Robot aria-hidden="true" />
              <span>
                <strong>Extract test or task</strong>
                <small>Generate a Maestro flow, Appium script, or agent task from this period.</small>
              </span>
            </button>
          ) : null}
          {canTrim ? (
            <>
              <button className="timeline-edit-option timeline-edit-option--danger" disabled={isSubmitting} onClick={() => onSubmit('cutSelection')} type="button">
                <Scissors aria-hidden="true" />
                <span>
                  <strong>Remove selected range</strong>
                  <small>Delete captured evidence inside this range from the current session.</small>
                </span>
              </button>
              <button className="timeline-edit-option timeline-edit-option--danger" disabled={isSubmitting} onClick={() => onSubmit('keepSelectionOnly')} type="button">
                <Scissors aria-hidden="true" />
                <span>
                  <strong>Keep only selected range</strong>
                  <small>Delete captured evidence before and after this range from the current session.</small>
                </span>
              </button>
            </>
          ) : null}
        </div>

        {error ? <p className="inline-message inline-message--error" role="alert">{error}</p> : null}
        <div className="timeline-edit-footer">
          <span role="status">{isSubmitting
            ? <><CircleNotch className="spin" aria-hidden="true" /> {progress?.message ?? 'Updating session…'}{progress?.total ? ` ${progress.completed ?? 0} / ${progress.total}` : ''}{elapsedSeconds > 0 ? ` · ${elapsedSeconds}s` : ''}</>
            : canTrim
              ? 'Trim operations cannot be undone.'
              : 'Choose what to do with the selected range.'}</span>
          <button className="button button--secondary" disabled={isSubmitting} onClick={onClose} type="button">Cancel</button>
        </div>
      </section>
    </div>
  )
}

function SessionShareModal({
  copyMessage,
  embedCode,
  onClose,
  onCopy,
  shareUrl,
  title,
}: {
  copyMessage: string | null
  embedCode: string
  onClose: () => void
  onCopy: (value: string, message: string) => void
  shareUrl: string
  title: string
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="session-share-title"
        aria-modal="true"
        className="session-info-modal session-share-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Public share</p>
            <h2 id="session-share-title">{title}</h2>
            <p className="muted">Only sessions set to PublicNoAuth expose these links.</p>
          </div>
          <button className="button button--secondary button--icon" onClick={onClose} type="button" aria-label="Close sharing">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="session-share-stack">
          <label className="session-share-field">
            <span className="field-label">Share link</span>
            <span className="session-share-copy-row">
              <input onFocus={(event) => event.currentTarget.select()} readOnly value={shareUrl} />
              <button className="button button--secondary button--compact" onClick={() => onCopy(shareUrl, 'Share link copied.')} type="button">
                <ClipboardText aria-hidden="true" />
                Copy link
              </button>
            </span>
          </label>

          <label className="session-share-field">
            <span className="field-label">Embed iframe</span>
            <textarea className="textarea-control session-share-embed-code" onFocus={(event) => event.currentTarget.select()} readOnly rows={7} value={embedCode} />
          </label>

          <div className="session-share-actions">
            {copyMessage ? <p className="inline-message">{copyMessage}</p> : null}
            <button className="button button--secondary" onClick={() => onCopy(embedCode, 'Embed code copied.')} type="button">
              <Code aria-hidden="true" />
              Copy embed
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function SessionInfoAiModal({
  children,
  kind,
  onBack,
  onClose,
}: {
  children: ReactNode
  kind: SessionAiExtractionKind
  onBack: () => void
  onClose: () => void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('.cloud-ai-extraction-modal, .ai-extraction-info-modal')) onBack()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onBack])

  const title = kind === 'analysis' ? 'Session summary' : 'Session flowchart'
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="session-info-ai-title"
        aria-modal="true"
        className="session-info-modal session-info-ai-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading session-info-ai-heading">
          <div>
            <button className="button button--secondary button--compact" onClick={onBack} type="button">
              <ArrowLeft aria-hidden="true" />
              Session info
            </button>
            <p className="eyebrow">AI tool</p>
            <h2 id="session-info-ai-title">{title}</h2>
          </div>
          <button aria-label={`Close ${title.toLowerCase()}`} className="button button--secondary button--icon" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="session-info-ai-content">{children}</div>
      </section>
    </div>
  )
}

function SessionInfoModal({
  artifactSnapshots,
  captureSession,
  effectiveDurationMs,
  files,
  frames,
  loadStorageBreakdown,
  manifestFiles,
  metricChannels,
  metrics,
  logs,
  isLiveSession,
  onClose,
  onSelectAiView,
  onOptimizeSession,
  showSessionMetadata,
  session,
  summaryCount,
  flowchartCount,
  touches,
  visualTrees,
}: {
  artifactSnapshots: SessionArtifactSnapshot[]
  captureSession: SessionSnapshot
  effectiveDurationMs: number | null
  files: number
  frames: SessionImageFrame[]
  loadStorageBreakdown?: (sessionId: string) => Promise<SessionStorageBreakdown>
  manifestFiles: SharedSessionStreamFile[]
  metricChannels: SessionMetricChannel[]
  metrics: SessionMetricSample[]
  logs: SessionLogEntry[]
  isLiveSession: boolean
  onClose: () => void
  onSelectAiView?: (kind: SessionAiExtractionKind) => void
  onOptimizeSession?: (encodeVideo: boolean, onProgress: (progress: SessionOptimizationProgress) => void) => Promise<SessionOptimizationResult>
  showSessionMetadata: boolean
  session: TeamSession
  summaryCount: number
  flowchartCount: number
  touches: SessionTouchInputRecord[]
  visualTrees: SessionVisualTreeSnapshot[]
}) {
  const [propertyQuery, setPropertyQuery] = useState('')
  const [encodeVideo, setEncodeVideo] = useState(false)
  const [loadedStorageBreakdown, setLoadedStorageBreakdown] = useState<SessionStorageBreakdown | null>(null)
  const [storageBreakdownError, setStorageBreakdownError] = useState<string | null>(null)
  const [optimizationProgress, setOptimizationProgress] = useState<SessionOptimizationProgressState | null>(null)
  const manifestStorageBreakdown = useMemo(
    () => buildManifestStorageBreakdown(manifestFiles),
    [manifestFiles],
  )
  const storageSessionId = session.session_id || captureSession.sessionId || session.id
  const storageBreakdown = loadedStorageBreakdown ?? manifestStorageBreakdown
  const isStorageBreakdownLoading = !!loadStorageBreakdown
    && loadedStorageBreakdown === null
    && storageBreakdownError === null

  useEffect(() => {
    if (!loadStorageBreakdown) {
      return
    }

    let isDisposed = false
    void loadStorageBreakdown(storageSessionId)
      .then((breakdown) => {
        if (!isDisposed) {
          setLoadedStorageBreakdown(normalizeStorageBreakdown(breakdown))
        }
      })
      .catch((error: unknown) => {
        if (!isDisposed) {
          setStorageBreakdownError(getErrorMessage(error, 'Unable to load the storage breakdown.'))
        }
      })
    return () => {
      isDisposed = true
    }
  }, [loadStorageBreakdown, storageSessionId])

  const title = session.title || captureSession.clientName || captureSession.sessionId || 'Session Info'

  async function optimizeSession() {
    if (!onOptimizeSession) {
      return
    }

    setOptimizationProgress({ status: 'running' })
    try {
      const result = await onOptimizeSession(encodeVideo, (detail) => setOptimizationProgress({ status: 'running', detail }))
      if (loadStorageBreakdown) {
        setOptimizationProgress({ status: 'running', detail: { message: 'Refreshing storage details…' } })
        try {
          const breakdown = await loadStorageBreakdown(storageSessionId)
          setLoadedStorageBreakdown(normalizeStorageBreakdown(breakdown))
          setStorageBreakdownError(null)
        } catch (error) {
          setStorageBreakdownError(getErrorMessage(error, 'Unable to refresh the storage breakdown.'))
        }
      }
      setOptimizationProgress({ result, status: 'success' })
    } catch (error) {
      setOptimizationProgress({
        message: getErrorMessage(error, 'Unable to optimise this session.'),
        status: 'error',
      })
    }
  }

  if (optimizationProgress) {
    return (
      <SessionOptimizationProgressModal
        onBack={() => setOptimizationProgress(null)}
        onRetry={() => void optimizeSession()}
        progress={optimizationProgress}
        sessionTitle={title}
      />
    )
  }

  const sessionTags = normalizeStringArray(session.tags)
  const captureTags = normalizeStringArray(captureSession.tags)
  const tags = sessionTags.length > 0 ? sessionTags : captureTags
  const notes = session.description || captureSession.notes || ''
  const sessionMetadata = asRecord(session.metadata)
  const authorText = resolveSessionAuthorText(session, captureSession, sessionMetadata)
  const deviceProfile = resolveDeviceProfile(captureSession)
  const sessionId = session.session_id || captureSession.sessionId || 'Unknown'
  const deviceSummary = formatSessionDeviceSummary(session, deviceProfile, sessionMetadata)
  const devicePropertySections = buildDevicePropertySections(deviceProfile, captureSession, session)
  const customPropertySections = buildCustomPropertySections(captureSession.customProperties)
  const uploadMetadataRows = buildUploadMetadataRows(session, captureSession, sessionMetadata, metricChannels, metrics, frames, logs, touches, visualTrees, artifactSnapshots)
  const filteredDevicePropertySections = filterPropertySections(devicePropertySections, propertyQuery)
  const filteredCustomPropertySections = filterPropertySections(customPropertySections, propertyQuery)
  const filteredUploadMetadataRows = filterPropertyRows(uploadMetadataRows, propertyQuery)
  const propertyMatchCount = filteredDevicePropertySections.reduce((total, section) => total + section.rows.length, 0)
    + filteredCustomPropertySections.reduce((total, section) => total + section.rows.length, 0)
    + (showSessionMetadata ? filteredUploadMetadataRows.length : 0)
  const hasSearchableProperties = devicePropertySections.length > 0
    || customPropertySections.length > 0
    || (showSessionMetadata && uploadMetadataRows.length > 0)
  const hasPropertyMatches = filteredDevicePropertySections.length > 0
    || filteredCustomPropertySections.length > 0
    || (showSessionMetadata && filteredUploadMetadataRows.length > 0)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="session-info-title"
        aria-modal="true"
        className="session-info-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Session</p>
            <h2 id="session-info-title">{title}</h2>
            {showSessionMetadata ? <p className="muted">{deviceSummary}</p> : null}
            {showSessionMetadata ? <p className="session-info-storage">On disk: {formatSessionStorage(session, files)}</p> : null}
          </div>
          <button className="button button--secondary button--icon" onClick={onClose} type="button" aria-label="Close session info">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="session-info-grid">
          <SessionInfoRow copyText={sessionId === 'Unknown' ? undefined : sessionId} label="Session ID" value={sessionId} />
          <SessionInfoRow label="App ID" value={session.app_id || captureSession.appId || 'Unknown'} />
          <SessionInfoRow label="Author" value={authorText} />
          <SessionInfoRow label="Capture source" value={formatCaptureSource(captureSession)} />
          {showSessionMetadata ? <SessionInfoRow label="Access" value={formatSessionAccessStatus(session.access_status)} /> : null}
          {showSessionMetadata && session.archived_at ? <SessionInfoRow label="Archived" value={formatDateTime(session.archived_at)} /> : null}
          {showSessionMetadata ? <SessionInfoRow label="Disk size" value={formatSessionStorage(session, files)} /> : null}
          <SessionInfoRow label="OS" value={formatOperatingSystem(session, deviceProfile)} />
          <SessionInfoRow label="Duration" value={formatDuration(effectiveDurationMs)} icon={<Clock aria-hidden="true" />} />
          <SessionInfoRow label="Recorded" value={formatDateTime(session.captured_start_at || captureSession.createdUtc)} />
          <SessionInfoRow label="Last updated" value={formatDateTime(captureSession.lastUpdatedUtc || getString(sessionMetadata, 'lastUpdatedUtc') || session.captured_end_at || session.updated_at)} />
        </div>

        {captureSession.captureSource === 'device' ? <SdkCapabilityNotice feature="overview" /> : null}

        {onSelectAiView ? (
          <div className="session-info-section">
            <h3>AI tools</h3>
            <div className="session-info-ai-actions">
              <button className="session-info-ai-action" onClick={() => onSelectAiView('analysis')} type="button">
                <Robot aria-hidden="true" />
                <span>
                  <strong>Summary</strong>
                  <small>Create or review a concise AI summary of this session.</small>
                </span>
                <span className="status-pill">{summaryCount} {summaryCount === 1 ? 'result' : 'results'}</span>
              </button>
              <button className="session-info-ai-action" onClick={() => onSelectAiView('mermaid')} type="button">
                <Sparkle aria-hidden="true" />
                <span>
                  <strong>Flowchart</strong>
                  <small>Create or review a visual flow of the captured journey.</small>
                </span>
                <span className="status-pill">{flowchartCount} {flowchartCount === 1 ? 'result' : 'results'}</span>
              </button>
            </div>
          </div>
        ) : null}

        {hasSearchableProperties ? (
          <label className="session-property-search">
            <MagnifyingGlass aria-hidden="true" />
            <input
              aria-label="Search session properties"
              onChange={(event) => setPropertyQuery(event.target.value)}
              placeholder="Search session properties"
              type="search"
              value={propertyQuery}
            />
            {propertyQuery ? <span>{propertyMatchCount} matches</span> : null}
          </label>
        ) : null}

        {propertyQuery.trim() && !hasPropertyMatches ? (
          <div className="session-property-no-results">
            <MagnifyingGlass aria-hidden="true" />
            <strong>No matching properties</strong>
            <span>Try a section, property name, or value.</span>
          </div>
        ) : null}

        {filteredDevicePropertySections.length > 0 ? (
          <div className="session-info-section">
            <h3>Device properties</h3>
            <div className="session-property-sections">
              {filteredDevicePropertySections.map((section) => (
                <article className="session-property-section" key={section.title}>
                  <div>
                    <h4>{section.title}</h4>
                    <p>{section.subtitle}</p>
                  </div>
                  <div className="session-property-grid">
                    {section.rows.map((row) => (
                      <SessionPropertyRow key={`${section.title}-${row.label}`} label={row.label} value={row.value} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : devicePropertySections.length === 0 && !propertyQuery.trim() ? (
          <div className="session-info-section">
            <h3>Device properties</h3>
            <p className="muted">No device/app properties have been captured for this session.</p>
          </div>
        ) : null}

        {filteredCustomPropertySections.length > 0 ? (
          <div className="session-info-section">
            <h3>Custom properties</h3>
            <div className="session-property-sections">
              {filteredCustomPropertySections.map((section) => (
                <article className="session-property-section" key={`custom-${section.title}`}>
                  <div>
                    <h4>{section.title}</h4>
                    <p>{section.subtitle}</p>
                  </div>
                  <div className="session-property-grid">
                    {section.rows.map((row) => (
                      <SessionPropertyRow key={`${section.title}-${row.label}`} label={row.label} value={row.value} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {onOptimizeSession ? (
          <div className="session-info-section session-normalization-section">
            <div>
              <h3>Session maintenance</h3>
              <p>
                Remove redundant screenshots and visual trees, then convert screenshots to WebP.
              </p>
              <label className="session-optimization-video-option">
                <input checked={encodeVideo} disabled={isLiveSession || frames.length === 0} onChange={(event) => setEncodeVideo(event.target.checked)} type="checkbox" />
                Also encode screenshots as video in a ZIP saved to Desktop
              </label>
              <small>Video ZIPs use the sharing format; use Export ZIP for local re-import. Local WebP screenshots remain available.</small>
              {isLiveSession ? <small>Optimisation is available after this live session ends.</small> : null}
            </div>
            <button
              className="button button--secondary"
              disabled={isLiveSession}
              onClick={() => void optimizeSession()}
              type="button"
            >
              <Sparkle aria-hidden="true" />
              Optimise session
            </button>
          </div>
        ) : null}

        <SessionStorageBreakdownSection
          breakdown={storageBreakdown}
          error={storageBreakdownError}
          isLoading={isStorageBreakdownLoading}
        />

        <div className="session-info-section">
          <h3>Tags</h3>
          {tags.length > 0 ? (
            <div className="tag-row">
              {tags.map((tag) => (
                <span className="status-pill" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">No tags.</p>
          )}
        </div>

        <div className="session-info-section">
          <h3>Notes</h3>
          <p className="session-info-notes">{notes || 'No notes.'}</p>
        </div>

        {showSessionMetadata && filteredUploadMetadataRows.length > 0 ? (
          <div className="session-info-section">
            <h3>Session metadata</h3>
            <div className="session-property-grid">
              {filteredUploadMetadataRows.map((row) => (
                <SessionPropertyRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

type SessionOptimizationProgressState =
  | { status: 'running'; detail?: SessionOptimizationProgress }
  | { status: 'success'; result: SessionOptimizationResult }
  | { status: 'error'; message: string }

function SessionOptimizationProgressModal({
  onBack,
  onRetry,
  progress,
  sessionTitle,
}: {
  onBack: () => void
  onRetry: () => void
  progress: SessionOptimizationProgressState
  sessionTitle: string
}) {
  const isRunning = progress.status === 'running'
  const heading = isRunning
    ? 'Optimising session'
    : progress.status === 'success'
      ? 'Session optimised'
      : 'Optimisation failed'

  return (
    <div className="modal-backdrop" onMouseDown={isRunning ? undefined : onBack}>
      <section
        aria-labelledby="session-normalization-title"
        aria-modal="true"
        className="session-info-modal session-normalization-progress-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Session maintenance</p>
            <h2 id="session-normalization-title">{heading}</h2>
            <p className="muted">{sessionTitle}</p>
          </div>
          {!isRunning ? (
            <button className="button button--secondary button--icon" onClick={onBack} type="button" aria-label="Back to session info">
              <X aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className={`session-normalization-progress-body session-normalization-progress-body--${progress.status}`} aria-live="polite">
          {isRunning ? <CircleNotch className="spin" aria-hidden="true" /> : null}
          {progress.status === 'success' ? <CheckCircle aria-hidden="true" /> : null}
          {progress.status === 'error' ? <WarningCircle aria-hidden="true" /> : null}
          <div>
            <strong>{isRunning ? (progress.detail?.message ?? 'Preparing session optimisation…') : heading}</strong>
            {isRunning
              ? progress.detail?.total ? <p>{(progress.detail.completed ?? 0).toLocaleString()} of {progress.detail.total.toLocaleString()} processed</p> : null
              : <p>{progress.status === 'success' ? progress.result.message : progress.message}</p>}
          </div>
        </div>

        {isRunning ? (
          <div>
            <progress aria-label={progress.detail?.message ?? 'Session optimisation in progress'} max={progress.detail?.total || 1} value={progress.detail?.total ? progress.detail.completed ?? 0 : undefined} style={{ width: '100%' }} />
          </div>
        ) : null}

        {progress.status === 'success' ? (
          <div className="session-normalization-results">
            <div>
              <span>Screenshots removed</span>
              <strong>{progress.result.removedScreenshotCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Visual trees removed</span>
              <strong>{progress.result.removedVisualTreeSnapshotCount.toLocaleString()}</strong>
            </div>
            <div><span>Images converted to WebP</span><strong>{progress.result.convertedImageCount.toLocaleString()}</strong></div>
          </div>
        ) : null}

        {!isRunning ? (
          <div className="session-normalization-progress-actions">
            {progress.status === 'error' ? (
              <button className="button button--secondary" onClick={onRetry} type="button">
                <ArrowClockwise aria-hidden="true" />
                Try again
              </button>
            ) : null}
            <button className="button button--primary" onClick={onBack} type="button">
              Back to session info
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function SessionStorageBreakdownSection({
  breakdown,
  error,
  isLoading,
}: {
  breakdown: SessionStorageBreakdown
  error: string | null
  isLoading: boolean
}) {
  const items = breakdown.items.filter((item) => item.sizeBytes > 0)
  const totalSizeBytes = Math.max(
    breakdown.totalSizeBytes,
    items.reduce((total, item) => total + item.sizeBytes, 0),
  )
  const chartStyle = {
    background: buildStorageBreakdownGradient(items, totalSizeBytes),
  } satisfies CSSProperties
  const fileSummary = breakdown.fileCount === 1 ? '1 file' : `${breakdown.fileCount} files`
  const groupSummary = items.length === 1 ? '1 storage group' : `${items.length} storage groups`

  return (
    <div className="session-info-section session-storage-breakdown">
      <h3>Archive size</h3>
      {isLoading ? (
        <div className="session-storage-breakdown-loading" role="status">
          <CircleNotch aria-hidden="true" className="spin" />
          <span>Calculating the persisted file breakdown…</span>
        </div>
      ) : (
        <div className="session-storage-breakdown-layout">
          <div
            aria-label={`${formatBytes(totalSizeBytes)} on disk across ${groupSummary}`}
            className="session-storage-breakdown-chart"
            role="img"
            style={chartStyle}
          >
            <div>
              <strong>{formatBytes(totalSizeBytes)}</strong>
              <span>on disk</span>
            </div>
          </div>

          <div className="session-storage-breakdown-detail">
            <div className="session-storage-breakdown-summary">
              <strong>{formatBytes(totalSizeBytes)}</strong>
              <span>{groupSummary} · {fileSummary}</span>
            </div>
            {error ? (
              <p className="session-storage-breakdown-error" role="status">
                <WarningCircle aria-hidden="true" />
                {error}
              </p>
            ) : null}
            {items.length > 0 ? (
              <div className="session-storage-breakdown-items">
                {items.map((item) => (
                  <div className="session-storage-breakdown-item" key={item.label}>
                    <i aria-hidden="true" style={{ background: resolveStorageBreakdownColor(item.label) }} />
                    <span>{item.label}</span>
                    <small>{formatStoragePercentage(item.sizeBytes, totalSizeBytes)}</small>
                    <strong>{formatBytes(item.sizeBytes)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No persisted files were found for this session.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SessionPropertyRow({ label, value }: DevicePropertyRow) {
  return (
    <div className="session-property-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SessionInfoRow({ copyText, icon, label, value }: { copyText?: string; icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="session-info-row">
      <span>
        {icon}
        {label}
      </span>
      <div className="session-info-row__value">
        <strong>{value}</strong>
        {copyText ? <CopyTextButton accessibleLabel={`Copy ${label}`} className="session-info-row__copy" label="Copy" text={copyText} /> : null}
      </div>
    </div>
  )
}

function filterPropertySections(sections: DevicePropertySection[], query: string): DevicePropertySection[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) {
    return sections
  }

  return sections.flatMap((section) => {
    const sectionMatches = `${section.title} ${section.subtitle}`.toLocaleLowerCase().includes(normalizedQuery)
    const rows = sectionMatches ? section.rows : filterPropertyRows(section.rows, normalizedQuery)
    return rows.length > 0 ? [{ ...section, rows }] : []
  })
}

function filterPropertyRows(rows: DevicePropertyRow[], query: string): DevicePropertyRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) {
    return rows
  }

  return rows.filter((row) => `${row.label} ${row.value}`.toLocaleLowerCase().includes(normalizedQuery))
}

function SessionFrameAnnotationOverlay({
  annotations,
  frame,
  selectedAnnotationId,
}: {
  annotations: SessionAnnotation[]
  frame: SessionImageFrame | null
  selectedAnnotationId: string | null
}) {
  const geometryViews = useMemo(
    () => buildFrameAnnotationGeometryViews(annotations, frame, selectedAnnotationId),
    [annotations, frame, selectedAnnotationId],
  )

  if (geometryViews.length === 0) {
    return null
  }

  return (
    <svg aria-hidden="true" className="session-frame-annotation-overlay" focusable="false" preserveAspectRatio="none" viewBox="0 0 1 1">
      {geometryViews.map((view) => renderFrameAnnotationGeometry(view))}
    </svg>
  )
}

function SessionFrameAnnotationAuthoringOverlay({
  isEnabled,
  onCreate,
}: {
  isEnabled: boolean
  onCreate: (geometry: ScreenshotAnnotationGeometryDraft) => void
}) {
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    x: number
    y: number
  } | null>(null)
  const [draft, setDraft] = useState<ScreenshotAnnotationGeometryDraft | null>(null)

  function normalizedPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
    const bounds = svg.getBoundingClientRect()
    return {
      x: clamp((clientX - bounds.left) / Math.max(1, bounds.width), 0, 1),
      y: clamp((clientY - bounds.top) / Math.max(1, bounds.height), 0, 1),
    }
  }

  function updateDraft(svg: SVGSVGElement, clientX: number, clientY: number) {
    const drag = dragRef.current
    if (!drag) {
      return null
    }

    const point = normalizedPoint(svg, clientX, clientY)
    drag.x = point.x
    drag.y = point.y
    const isRectangle = Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) >= 6
    const nextDraft: ScreenshotAnnotationGeometryDraft = isRectangle
      ? {
          kind: 1,
          x: Math.min(drag.startX, point.x),
          y: Math.min(drag.startY, point.y),
          width: Math.abs(point.x - drag.startX),
          height: Math.abs(point.y - drag.startY),
        }
      : { kind: 0, x: drag.startX, y: drag.startY }
    setDraft(nextDraft)
    return nextDraft
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || (!isEnabled && !event.shiftKey)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const point = normalizedPoint(event.currentTarget, event.clientX, event.clientY)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft({ kind: 0, x: point.x, y: point.y })
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    updateDraft(event.currentTarget, event.clientX, event.clientY)
  }

  function handlePointerEnd(event: PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const completedDraft = updateDraft(event.currentTarget, event.clientX, event.clientY)
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraft(null)
    if (completedDraft) {
      onCreate(completedDraft)
    }
  }

  function handlePointerCancel(event: PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }

    dragRef.current = null
    setDraft(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <svg
      aria-label={isEnabled ? 'Draw an annotation point or region' : 'Hold Shift and drag to annotate the screenshot'}
      className={isEnabled
        ? 'session-frame-annotation-authoring-overlay session-frame-annotation-authoring-overlay--active'
        : 'session-frame-annotation-authoring-overlay'}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 1 1"
    >
      {draft?.kind === 1 ? (
        <rect
          className="session-frame-annotation-draft"
          height={draft.height}
          rx={0.018}
          vectorEffect="non-scaling-stroke"
          width={draft.width}
          x={draft.x}
          y={draft.y}
        />
      ) : draft ? (
        <circle className="session-frame-annotation-draft" cx={draft.x} cy={draft.y} r={0.018} vectorEffect="non-scaling-stroke" />
      ) : null}
    </svg>
  )
}

function SessionFrameTouchOverlay({
  frame,
  scrubAtMs,
  touches,
}: {
  frame: SessionImageFrame | null
  scrubAtMs: number
  touches: SessionTouchInputRecord[]
}) {
  const touchViews = useMemo(
    () => buildFrameTouchViews(touches, frame, scrubAtMs),
    [frame, scrubAtMs, touches],
  )

  if (touchViews.length === 0) {
    return null
  }

  return (
    <div aria-hidden="true" className="session-frame-touch-overlay">
      {touchViews.map((touch) => (
        <span
          className={`session-frame-touch session-frame-touch--${touch.action}`}
          key={touch.key}
          style={{
            '--session-frame-touch-opacity': touch.opacity,
            left: `${touch.x * 100}%`,
            top: `${touch.y * 100}%`,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}

function createSessionShareUrl(sessionId: string): string {
  return createPortalUrl(`/session/${encodeURIComponent(sessionId)}/`)
}

function createSessionEmbedUrl(sessionId: string): string {
  return createPortalUrl(`/embed/session/${encodeURIComponent(sessionId)}/`)
}

function createPortalUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path
  }

  return new URL(path, window.location.origin).toString()
}

function createSessionEmbedCode(embedUrl: string, title: string): string {
  const iframeTitle = `${title.trim() || 'Ansight session'} - Ansight player`
  return [
    '<iframe',
    `  title="${escapeHtmlAttribute(iframeTitle)}"`,
    `  src="${escapeHtmlAttribute(embedUrl)}"`,
    '  width="100%"',
    '  height="760"',
    '  loading="lazy"',
    '  referrerpolicy="strict-origin-when-cross-origin"',
    '  allowfullscreen>',
    '</iframe>',
  ].join('\n')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function copyShareText(value: string, successMessage: string, setMessage: (message: string | null) => void): Promise<void> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
    } else {
      copyTextWithFallback(value)
    }

    setMessage(successMessage)
  } catch {
    setMessage('Copy failed. Select the field and copy manually.')
  }
}

function copyTextWithFallback(value: string): void {
  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.top = '-1000px'
  textArea.style.left = '-1000px'
  document.body.append(textArea)
  textArea.select()

  try {
    document.execCommand('copy')
  } finally {
    textArea.remove()
  }
}

async function createCachedSessionImageUrl(url: string, isHighPriority: boolean): Promise<CachedImageUrl> {
  try {
    const response = await fetch(url, { cache: 'force-cache' })
    if (!response.ok) {
      throw new Error(`Screenshot download failed with HTTP ${response.status}.`)
    }

    const objectUrl = URL.createObjectURL(await response.blob())
    try {
      await preloadSessionImageUrl(objectUrl, isHighPriority)
      return { isObjectUrl: true, url: objectUrl }
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      throw error
    }
  } catch {
    await preloadSessionImageUrl(url, isHighPriority)
    return { isObjectUrl: false, url }
  }
}

function preloadSessionImageUrl(url: string, isHighPriority: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = isHighPriority ? 'high' : 'low'
    image.onload = () => {
      void image.decode().catch(() => undefined).then(() => resolve())
    }
    image.onerror = () => reject(new Error('Screenshot image failed to load.'))
    image.src = url
  })
}

function selectSessionImagePrefetchFrames(
  frames: SessionImageFrame[],
  selectedFrame: SessionImageFrame | null,
): SessionImageFrame[] {
  if (frames.length === 0) {
    return []
  }

  const selectedIndex = Math.max(0, selectedFrame
    ? frames.findIndex((frame) => frame.frameId === selectedFrame.frameId)
    : 0)
  const selectedFrameIds = new Set<string>()
  const selectedFrames: SessionImageFrame[] = []

  function addFrameAt(index: number) {
    const frame = frames[index]
    if (!frame || selectedFrameIds.has(frame.frameId)) {
      return
    }

    selectedFrameIds.add(frame.frameId)
    selectedFrames.push(frame)
  }

  addFrameAt(selectedIndex)
  for (let distance = 1; distance <= sessionImagePrefetchNeighborCount; distance += 1) {
    addFrameAt(selectedIndex + distance)
    addFrameAt(selectedIndex - distance)
  }

  const targetCount = Math.min(sessionImagePrefetchFrameLimit, frames.length)
  if (frames.length <= targetCount) {
    for (let index = 0; index < frames.length; index += 1) {
      addFrameAt(index)
    }
    return selectedFrames
  }

  const sampleCount = Math.max(2, targetCount - selectedFrames.length)
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    addFrameAt(Math.round((sampleIndex / (sampleCount - 1)) * (frames.length - 1)))
  }

  return selectedFrames.slice(0, targetCount)
}

function SessionTimelineChart({
  annotations,
  artifactSnapshots,
  isFollowingLive,
  isLiveSession,
  isRangeSelectionActive,
  lifecycleTransitions,
  metricIndex,
  telemetryReport,
  onGoLive,
  onLeaveLive,
  onCreateAnnotation,
  onSelectAnnotation,
  onSelectTimelineRange,
  onScrub,
  onToggleRangeSelection,
  onToggleTouchLocations,
  range,
  scrubAtMs,
  selectedAnnotationId,
  showTouchLocations,
  touches,
  visualTrees,
}: {
  annotations: SessionAnnotation[]
  artifactSnapshots: SessionArtifactSnapshot[]
  isFollowingLive: boolean
  isLiveSession: boolean
  isRangeSelectionActive: boolean
  lifecycleTransitions: LifecycleTransition[]
  metricIndex: TimelineMetricIndex
  telemetryReport: DeferredTelemetryReport | null
  onGoLive: () => void
  onLeaveLive: (timestampMs: number) => void
  onCreateAnnotation?: (startTimestampMs: number, endTimestampMs: number | null, focusTimestampMs: number) => void
  onSelectAnnotation: (annotationId: string, focusMs: number | null) => void
  onSelectTimelineRange?: (startTimestampMs: number, endTimestampMs: number, focusTimestampMs: number) => void
  onScrub: (timestampMs: number) => void
  onToggleRangeSelection: () => void
  onToggleTouchLocations: () => void
  range: TimelineRange
  scrubAtMs: number
  selectedAnnotationId: string | null
  showTouchLocations: boolean
  touches: Array<TimestampedItem<SessionTouchInputRecord>>
  visualTrees: SessionVisualTreeSnapshot[]
}) {
  const chartShellRef = useRef<HTMLDivElement>(null)
  const scrubberTrackRef = useRef<HTMLDivElement>(null)
  const chartScrubPointerIdRef = useRef<number | null>(null)
  const scrubberTrackPointerIdRef = useRef<number | null>(null)
  const visibleRangeDragRef = useRef<TimelineVisibleRangeDragState | null>(null)
  const gestureZoomRef = useRef<TimelineGestureZoomState | null>(null)
  const annotationDraftRef = useRef<TimelineAnnotationDraft | null>(null)
  const rangeDraftRef = useRef<TimelineRangeDraft | null>(null)
  const rangeKey = createTimelineRangeKey(range)
  const [visibleRangeState, setVisibleRangeState] = useState<TimelineVisibleRangeState>(() => ({
    isUserAdjusted: false,
    rangeKey,
    visibleRange: createInitialTimelineVisibleRange(range, isLiveSession),
  }))
  const [chartWidth, setChartWidth] = useState(timelineChartFallbackWidth)
  const [hoverProbeAtMs, setHoverProbeAtMs] = useState<number | null>(null)
  const [annotationDraft, setAnnotationDraft] = useState<TimelineAnnotationDraft | null>(null)
  const [rangeDraft, setRangeDraft] = useState<TimelineRangeDraft | null>(null)
  const [hiddenMetricChannelIds, setHiddenMetricChannelIds] = useState<Set<number>>(() => new Set())
  const [showFlutterMetrics, setShowFlutterMetrics] = useState(false)
  const [showAppState, setShowAppState] = useState(true)
  const [showArtifactSnapshots, setShowArtifactSnapshots] = useState(true)
  const [showVisualTreeSnapshots, setShowVisualTreeSnapshots] = useState(true)
  const shouldReconcileVisibleRange = visibleRangeState.rangeKey !== rangeKey
    || (isLiveSession && isFollowingLive && Math.abs(visibleRangeState.visibleRange.endMs - range.endMs) > 1)
  const visibleRange = !shouldReconcileVisibleRange
    ? visibleRangeState.visibleRange
    : reconcileTimelineVisibleRange(visibleRangeState, range, isFollowingLive, isLiveSession)
  const fullDuration = Math.max(1, range.endMs - range.startMs)
  const minVisibleDuration = Math.max(1_000, fullDuration / 64)
  const visibleDuration = Math.max(1, visibleRange.endMs - visibleRange.startMs)
  const canZoomOut = visibleDuration < fullDuration - 1
  const width = chartWidth
  // Only one left axis is labelled, so the plot keeps its base margins however many series scale on the left.
  const plot = useMemo(() => resolveTimelinePlot(width), [width])
  const allSeriesChart = useMemo(
    () => buildTimelineChart(metricIndex, visibleRange, range, width, plot),
    [metricIndex, plot, range, visibleRange, width],
  )
  const flutterMetricChannelIds = useMemo(
    () => new Set(metricIndex.channelIds.filter((channelId) => isFlutterDiagnosticChannel(metricIndex.channelMap.get(channelId)))),
    [metricIndex.channelIds, metricIndex.channelMap],
  )
  const flutterMetricCount = allSeriesChart.series.filter((series) => flutterMetricChannelIds.has(series.channelId)).length
  const legendSeries = allSeriesChart.series.filter((series) => showFlutterMetrics || !flutterMetricChannelIds.has(series.channelId))
  const visibleMetricChannelIds = useMemo(
    () => metricIndex.channelIds.filter((channelId) => !hiddenMetricChannelIds.has(channelId)
      && (showFlutterMetrics || !flutterMetricChannelIds.has(channelId))),
    [flutterMetricChannelIds, hiddenMetricChannelIds, metricIndex.channelIds, showFlutterMetrics],
  )
  const chart = useMemo(
    () => visibleMetricChannelIds.length === metricIndex.channelIds.length
      ? allSeriesChart
      : buildTimelineChart(metricIndex, visibleRange, range, width, plot, visibleMetricChannelIds),
    [allSeriesChart, metricIndex, plot, range, visibleMetricChannelIds, visibleRange, width],
  )
  const backgroundSections = useMemo(
    () => showAppState ? buildLifecycleBackgroundSections(lifecycleTransitions, visibleRange) : [],
    [lifecycleTransitions, showAppState, visibleRange],
  )
  const hasVisibleFpsSeries = chart.series.some((series) => isFpsChannel(metricIndex.channelMap, series.channelId))
  const height = timelineChartHeight
  const plotWidth = width - plot.left - plot.right
  const plotHeight = height - plot.top - plot.bottom
  const annotationLaneTop = plot.top + plotHeight - timelineAnnotationLaneBottomInset - timelineAnnotationLaneHeight
  const isScrubWithinVisibleRange = scrubAtMs >= visibleRange.startMs && scrubAtMs <= visibleRange.endMs
  const scrubX = xForTimestamp(scrubAtMs, visibleRange, plot.left, plotWidth)
  const probeAtMs = hoverProbeAtMs !== null && hoverProbeAtMs >= visibleRange.startMs && hoverProbeAtMs <= visibleRange.endMs
    ? hoverProbeAtMs
    : isScrubWithinVisibleRange
      ? scrubAtMs
      : null
  const probeX = probeAtMs === null ? null : xForTimestamp(probeAtMs, visibleRange, plot.left, plotWidth)
  // Series markers only accompany a hover; at rest the FPS handle alone marks the playhead.
  const isHoverProbe = hoverProbeAtMs !== null && probeAtMs === hoverProbeAtMs
  const probeLines = useMemo(
    () => probeAtMs === null ? [] : buildTimelineProbeLines(metricIndex, probeAtMs, chart.series),
    [chart.series, metricIndex, probeAtMs],
  )
  const probeHeader = probeAtMs === null ? '' : formatTimelineElapsedDuration(probeAtMs, range)
  const probePanelPadding = 10
  const probeLineHeight = 16
  const probeSwatchColumn = 12
  const probePanelWidth = Math.min(
    plotWidth - 8,
    Math.max(110, [probeHeader, ...probeLines.map((line) => line.label)].reduce((width, label) => Math.max(width, label.length * 6.2), 0) + probeSwatchColumn + probePanelPadding * 2),
  )
  const probePanelHeight = (probeLines.length + 1) * probeLineHeight + probePanelPadding * 2
  const probePanelLeft = probeX === null
    ? plot.left
    : clamp(
        probeX + 14 + probePanelWidth <= plot.left + plotWidth - 4 ? probeX + 14 : probeX - probePanelWidth - 14,
        plot.left + 4,
        plot.left + plotWidth - probePanelWidth - 4,
      )
  const probePanelTop = plot.top + 4
  const scrubRatio = timelineRatioForTimestamp(scrubAtMs, range)
  const visibleStartRatio = timelineRatioForTimestamp(visibleRange.startMs, range)
  const visibleEndRatio = timelineRatioForTimestamp(visibleRange.endMs, range)
  const scrubberTicks = useMemo(
    () => {
      const intervalStepCount = timelineScrubberMinorTicksPerMajorInterval + 1
      const targetStepCount = Math.max(intervalStepCount, Math.round(plotWidth / timelineScrubberTargetTickSpacingPx))
      const majorIntervalCount = Math.max(1, Math.round((targetStepCount - timelineScrubberMinorTicksPerMajorInterval) / intervalStepCount))
      const tickCount = majorIntervalCount * intervalStepCount + timelineScrubberMinorTicksPerMajorInterval

      return Array.from({ length: tickCount }, (_, index) => ({
        isMajor: index % intervalStepCount === timelineScrubberMinorTicksPerMajorInterval,
        ratio: (index + 1) / (tickCount + 1),
      }))
    },
    [plotWidth],
  )
  // One mark per touch start, over the full range: the scrubber does not zoom with the chart.
  const scrubberTouchMarks = useMemo(
    () => showTouchLocations
      ? touches.flatMap((timestampedTouch, index) => normalizeTouchAction(timestampedTouch.item.action) === 'down'
        ? [{ key: `${timestampedTouch.item.id || 'touch'}-${index}`, ratio: timelineRatioForTimestamp(timestampedTouch.timestampMs, range) }]
        : [])
      : [],
    [range, showTouchLocations, touches],
  )
  // FPS is the reference scale on the left; other left-scaled series still plot on their own
  // maxima but are not labelled. Without FPS the first left axis stands in.
  const labelledLeftAxisKey = (chart.axes.find((axis) => axis.axisKey === 'fps') ?? chart.axes.find((axis) => axis.kind !== 'memory'))?.axisKey ?? null
  const gradientBaseId = useId().replace(/:/g, '')

  useEffect(() => {
    const chartShell = chartShellRef.current
    if (!chartShell) {
      return
    }

    const syncChartWidth = () => {
      const measuredWidth = Math.round(chartShell.getBoundingClientRect().width)
      const horizontalBleed = resolveTimelinePlot(measuredWidth) === timelineCompactPlot ? 0 : timelineChartHorizontalBleed * 2
      setChartWidth(Math.max(320, measuredWidth + horizontalBleed))
    }
    syncChartWidth()

    const resizeObserver = new ResizeObserver(syncChartWidth)
    resizeObserver.observe(chartShell)

    return () => resizeObserver.disconnect()
  }, [])

  function yForAxisValue(value: number, maxValue: number): number {
    const usablePlotHeight = plotHeight - timelineChartValuePadding * 2
    const ratio = maxValue <= 0 ? 0 : clamp(value / maxValue, 0, 1)
    return plot.top + plotHeight - timelineChartValuePadding - ratio * usablePlotHeight
  }

  const fpsScrubValue = useMemo(
    () => resolveFpsValueAtScrub(metricIndex, range, scrubAtMs),
    [metricIndex, range, scrubAtMs],
  )
  const scrubZeroY = yForAxisValue(0, chart.leftAxisMax)
  const fpsScrubY = fpsScrubValue === null ? null : yForAxisValue(fpsScrubValue, chart.leftAxisMax)

  function toggleMetricChannel(channelId: number) {
    setHiddenMetricChannelIds((current) => {
      const next = new Set(current)
      if (next.has(channelId)) {
        next.delete(channelId)
      } else {
        next.add(channelId)
      }
      return next
    })
  }

  function timelinePointForChartClientX(svg: SVGSVGElement, clientX: number): { timestampMs: number; x: number } {
    const bounds = svg.getBoundingClientRect()
    const scaledPlotLeft = (plot.left / width) * bounds.width
    const scaledPlotWidth = Math.max(1, (plotWidth / width) * bounds.width)
    const normalizedX = clamp((clientX - bounds.left - scaledPlotLeft) / scaledPlotWidth, 0, 1)
    return {
      timestampMs: visibleRange.startMs + normalizedX * (visibleRange.endMs - visibleRange.startMs),
      x: plot.left + normalizedX * plotWidth,
    }
  }

  function scrubChartAt(svg: SVGSVGElement, clientX: number) {
    const point = timelinePointForChartClientX(svg, clientX)
    window.getSelection()?.removeAllRanges()
    onScrub(point.timestampMs)
  }

  function updateTimelineAnnotationDraft(svg: SVGSVGElement, clientX: number): TimelineAnnotationDraft | null {
    const current = annotationDraftRef.current
    if (!current) {
      return null
    }

    const point = timelinePointForChartClientX(svg, clientX)
    const nextDraft = {
      ...current,
      currentTimestampMs: point.timestampMs,
      currentX: point.x,
    }
    annotationDraftRef.current = nextDraft
    setAnnotationDraft(nextDraft)
    setHoverProbeAtMs(point.timestampMs)
    return nextDraft
  }

  function beginTimelineRangeDraft(svg: SVGSVGElement, clientX: number, pointerId: number) {
    const point = timelinePointForChartClientX(svg, clientX)
    const nextDraft: TimelineRangeDraft = {
      currentTimestampMs: point.timestampMs,
      currentX: point.x,
      pointerId,
      startTimestampMs: point.timestampMs,
      startX: point.x,
    }
    rangeDraftRef.current = nextDraft
    setRangeDraft(nextDraft)
    setHoverProbeAtMs(point.timestampMs)
    svg.setPointerCapture(pointerId)
  }

  function updateTimelineRangeDraft(svg: SVGSVGElement, clientX: number): TimelineRangeDraft | null {
    const current = rangeDraftRef.current
    if (!current) {
      return null
    }

    const point = timelinePointForChartClientX(svg, clientX)
    const nextDraft = {
      ...current,
      currentTimestampMs: point.timestampMs,
      currentX: point.x,
    }
    rangeDraftRef.current = nextDraft
    setRangeDraft(nextDraft)
    setHoverProbeAtMs(point.timestampMs)
    return nextDraft
  }

  function handleChartPointerDown(event: PointerEvent<SVGSVGElement>) {
    const isShiftRangeSelection = event.shiftKey && !!onSelectTimelineRange
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    if ((isRangeSelectionActive || isShiftRangeSelection) && onSelectTimelineRange) {
      beginTimelineRangeDraft(event.currentTarget, event.clientX, event.pointerId)
      return
    }

    if (event.shiftKey && onCreateAnnotation) {
      const point = timelinePointForChartClientX(event.currentTarget, event.clientX)
      const nextDraft: TimelineAnnotationDraft = {
        currentTimestampMs: point.timestampMs,
        currentX: point.x,
        pointerId: event.pointerId,
        startTimestampMs: point.timestampMs,
        startX: point.x,
      }
      annotationDraftRef.current = nextDraft
      setAnnotationDraft(nextDraft)
      setHoverProbeAtMs(point.timestampMs)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    chartScrubPointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubChartAt(event.currentTarget, event.clientX)
  }

  function handleChartPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (rangeDraftRef.current?.pointerId === event.pointerId) {
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      updateTimelineRangeDraft(event.currentTarget, event.clientX)
      return
    }

    if (annotationDraftRef.current?.pointerId === event.pointerId) {
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      updateTimelineAnnotationDraft(event.currentTarget, event.clientX)
      return
    }

    const point = timelinePointForChartClientX(event.currentTarget, event.clientX)
    setHoverProbeAtMs(point.timestampMs)

    if (chartScrubPointerIdRef.current === event.pointerId) {
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      onScrub(point.timestampMs)
    }
  }

  function handleChartPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (rangeDraftRef.current?.pointerId === event.pointerId && onSelectTimelineRange) {
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      const completedDraft = updateTimelineRangeDraft(event.currentTarget, event.clientX)
      rangeDraftRef.current = null
      setRangeDraft(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (completedDraft
        && Math.abs(completedDraft.currentX - completedDraft.startX) >= timelineAnnotationDraftThreshold) {
        onSelectTimelineRange(
          Math.min(completedDraft.startTimestampMs, completedDraft.currentTimestampMs),
          Math.max(completedDraft.startTimestampMs, completedDraft.currentTimestampMs),
          completedDraft.currentTimestampMs,
        )
      }
      return
    }

    if (chartScrubPointerIdRef.current === event.pointerId) {
      event.preventDefault()
      scrubChartAt(event.currentTarget, event.clientX)
      chartScrubPointerIdRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }

    if (annotationDraftRef.current?.pointerId !== event.pointerId || !onCreateAnnotation) {
      return
    }

    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    const completedDraft = updateTimelineAnnotationDraft(event.currentTarget, event.clientX)
    annotationDraftRef.current = null
    setAnnotationDraft(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!completedDraft) {
      return
    }

    const isRange = Math.abs(completedDraft.currentX - completedDraft.startX) >= timelineAnnotationDraftThreshold
    onCreateAnnotation(
      completedDraft.startTimestampMs,
      isRange ? completedDraft.currentTimestampMs : null,
      completedDraft.currentTimestampMs,
    )
  }

  function handleChartPointerCancel(event: PointerEvent<SVGSVGElement>) {
    if (rangeDraftRef.current?.pointerId === event.pointerId) {
      rangeDraftRef.current = null
      setRangeDraft(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }

    if (chartScrubPointerIdRef.current === event.pointerId) {
      chartScrubPointerIdRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }

    if (annotationDraftRef.current?.pointerId === event.pointerId) {
      annotationDraftRef.current = null
      setAnnotationDraft(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }
    setHoverProbeAtMs(null)
  }

  const zoomTimeline = useCallback((factor: number, anchorTimestampMs: number = scrubAtMs) => {
    const nextDuration = clamp(visibleDuration * factor, minVisibleDuration, fullDuration)
    const anchorMs = clamp(anchorTimestampMs, visibleRange.startMs, visibleRange.endMs)
    const anchorRatio = (anchorMs - visibleRange.startMs) / visibleDuration
    const nextCenterMs = anchorMs + (0.5 - anchorRatio) * nextDuration
    setVisibleRangeState({
      isUserAdjusted: true,
      rangeKey,
      visibleRange: createTimelineWindow(range, nextCenterMs, nextDuration),
    })
  }, [fullDuration, minVisibleDuration, range, rangeKey, scrubAtMs, visibleDuration, visibleRange.endMs, visibleRange.startMs])

  const panTimeline = useCallback((deltaMs: number) => {
    const nextStartMs = clamp(
      visibleRange.startMs + deltaMs,
      range.startMs,
      range.endMs - visibleDuration,
    )
    if (Math.abs(nextStartMs - visibleRange.startMs) <= 0.01) {
      return
    }

    const nextVisibleRange = {
      ...range,
      startMs: nextStartMs,
      endMs: nextStartMs + visibleDuration,
    }
    setVisibleRangeState({
      isUserAdjusted: true,
      rangeKey,
      visibleRange: nextVisibleRange,
    })

    if (isFollowingLive && nextVisibleRange.endMs < range.endMs - 1) {
      onLeaveLive(nextVisibleRange.endMs)
    }
  }, [isFollowingLive, onLeaveLive, range, rangeKey, visibleDuration, visibleRange.startMs])

  useEffect(() => {
    const chartShell = chartShellRef.current
    if (!chartShell) {
      return
    }

    const handleTimelineWheel = (event: WheelEvent) => {
      const isZoomGesture = (event.ctrlKey || event.metaKey)
        && Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        && event.deltaY !== 0
      if (isZoomGesture) {
        event.preventDefault()
        event.stopPropagation()
        const bounds = chartShell.getBoundingClientRect()
        const anchorRatio = bounds.width <= 0
          ? 0.5
          : clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
        const anchorTimestampMs = isFollowingLive
          ? scrubAtMs
          : visibleRange.startMs + anchorRatio * visibleDuration
        zoomTimeline(
          event.deltaY > 0 ? timelineZoomOutFactor : timelineZoomInFactor,
          anchorTimestampMs,
        )
        return
      }

      const horizontalDelta = Math.abs(event.deltaX) > 0.01
        ? event.deltaX
        : event.shiftKey
          ? event.deltaY
          : 0
      if (!canZoomOut || horizontalDelta === 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const deltaPixels = normalizeTimelineWheelDelta(horizontalDelta, event.deltaMode, chartShell.clientWidth)
      panTimeline((deltaPixels / Math.max(1, chartShell.clientWidth)) * visibleDuration)
    }

    const handleTimelineGestureStart = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent
      event.preventDefault()
      event.stopPropagation()
      const bounds = chartShell.getBoundingClientRect()
      const pointerRatio = bounds.width <= 0 || !Number.isFinite(gestureEvent.clientX)
        ? 0.5
        : clamp((gestureEvent.clientX - bounds.left) / bounds.width, 0, 1)
      const anchorTimestampMs = isFollowingLive
        ? scrubAtMs
        : visibleRange.startMs + pointerRatio * visibleDuration
      gestureZoomRef.current = {
        anchorRatio: (anchorTimestampMs - visibleRange.startMs) / visibleDuration,
        anchorTimestampMs,
        initialVisibleDurationMs: visibleDuration,
      }
    }

    const handleTimelineGestureChange = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent
      const gestureState = gestureZoomRef.current
      if (!gestureState || !Number.isFinite(gestureEvent.scale) || gestureEvent.scale <= 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const nextDuration = clamp(
        gestureState.initialVisibleDurationMs / gestureEvent.scale,
        minVisibleDuration,
        fullDuration,
      )
      const nextCenterMs = gestureState.anchorTimestampMs
        + (0.5 - gestureState.anchorRatio) * nextDuration
      setVisibleRangeState({
        isUserAdjusted: true,
        rangeKey,
        visibleRange: createTimelineWindow(range, nextCenterMs, nextDuration),
      })
    }

    const handleTimelineGestureEnd = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      gestureZoomRef.current = null
    }

    chartShell.addEventListener('wheel', handleTimelineWheel, { capture: true, passive: false })
    chartShell.addEventListener('gesturestart', handleTimelineGestureStart, { capture: true, passive: false })
    chartShell.addEventListener('gesturechange', handleTimelineGestureChange, { capture: true, passive: false })
    chartShell.addEventListener('gestureend', handleTimelineGestureEnd, { capture: true, passive: false })
    return () => {
      chartShell.removeEventListener('wheel', handleTimelineWheel, { capture: true })
      chartShell.removeEventListener('gesturestart', handleTimelineGestureStart, { capture: true })
      chartShell.removeEventListener('gesturechange', handleTimelineGestureChange, { capture: true })
      chartShell.removeEventListener('gestureend', handleTimelineGestureEnd, { capture: true })
    }
  }, [canZoomOut, fullDuration, isFollowingLive, minVisibleDuration, panTimeline, range, rangeKey, scrubAtMs, visibleDuration, visibleRange.startMs, zoomTimeline])

  function timestampForScrubberClientX(clientX: number): number | null {
    const bounds = scrubberTrackRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) {
      return null
    }

    const ratio = clamp((clientX - bounds.left) / bounds.width, 0, 1)
    return range.startMs + ratio * fullDuration
  }

  function scrubFromIndicator(clientX: number) {
    const timestampMs = timestampForScrubberClientX(clientX)
    if (timestampMs === null) {
      return
    }

    window.getSelection()?.removeAllRanges()
    onScrub(timestampMs)
  }

  function handleScrubberIndicatorStart(event: PointerEvent<HTMLSpanElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubFromIndicator(event.clientX)
  }

  function handleScrubberIndicatorMove(event: PointerEvent<HTMLSpanElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    scrubFromIndicator(event.clientX)
  }

  function handleScrubberIndicatorEnd(event: PointerEvent<HTMLSpanElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function resizeVisibleRange(edge: 'start' | 'end', clientX: number) {
    const timestampMs = timestampForScrubberClientX(clientX)
    if (timestampMs === null) {
      return
    }

    const nextVisibleRange = edge === 'start'
      ? {
          ...range,
          startMs: clamp(timestampMs, range.startMs, visibleRange.endMs - minVisibleDuration),
          endMs: visibleRange.endMs,
        }
      : {
          ...range,
          startMs: visibleRange.startMs,
          endMs: clamp(timestampMs, visibleRange.startMs + minVisibleDuration, range.endMs),
        }

    setVisibleRangeState({
      isUserAdjusted: true,
      rangeKey,
      visibleRange: nextVisibleRange,
    })

    if (isFollowingLive && nextVisibleRange.endMs < range.endMs - 1) {
      onLeaveLive(nextVisibleRange.endMs)
    }
  }

  function moveVisibleRange(clientX: number) {
    const dragState = visibleRangeDragRef.current
    const pointerMs = timestampForScrubberClientX(clientX)
    if (!dragState || pointerMs === null) {
      return
    }

    const nextStartMs = clamp(
      dragState.startMs + pointerMs - dragState.pointerStartMs,
      range.startMs,
      range.endMs - dragState.durationMs,
    )

    const nextVisibleRange = {
      ...range,
      startMs: nextStartMs,
      endMs: nextStartMs + dragState.durationMs,
    }
    setVisibleRangeState({
      isUserAdjusted: true,
      rangeKey,
      visibleRange: nextVisibleRange,
    })

    if (isFollowingLive && nextVisibleRange.endMs < range.endMs - 1) {
      onLeaveLive(nextVisibleRange.endMs)
    }
  }

  function handleVisibleRangeResizeStart(edge: 'start' | 'end', event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeVisibleRange(edge, event.clientX)
  }

  function handleVisibleRangeResizeMove(edge: 'start' | 'end', event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    resizeVisibleRange(edge, event.clientX)
  }

  function handleVisibleRangeResizeEnd(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function startVisibleRangeMove(pointerId: number, clientX: number): boolean {
    const pointerStartMs = timestampForScrubberClientX(clientX)
    if (pointerStartMs === null) {
      return false
    }

    visibleRangeDragRef.current = {
      durationMs: visibleDuration,
      pointerId,
      pointerStartMs,
      startMs: visibleRange.startMs,
    }
    return true
  }

  function handleScrubberTrackStart(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    const isVisibleWindow = event.target instanceof Element && !!event.target.closest('.timeline-visible-window')
    if (isVisibleWindow) {
      if (!startVisibleRangeMove(event.pointerId, event.clientX)) {
        return
      }
    } else {
      scrubberTrackPointerIdRef.current = event.pointerId
      scrubFromIndicator(event.clientX)
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleVisibleRangeMoveStart(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (!startVisibleRangeMove(event.pointerId, event.clientX)) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleVisibleRangeMoveMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    moveVisibleRange(event.clientX)
  }

  function handleVisibleRangeMoveEnd(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (visibleRangeDragRef.current?.pointerId === event.pointerId) {
      visibleRangeDragRef.current = null
    }
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function handleScrubberTrackMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    event.preventDefault()
    if (visibleRangeDragRef.current?.pointerId === event.pointerId) {
      moveVisibleRange(event.clientX)
    } else if (scrubberTrackPointerIdRef.current === event.pointerId) {
      scrubFromIndicator(event.clientX)
    }
  }

  function handleScrubberTrackEnd(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    event.preventDefault()
    if (scrubberTrackPointerIdRef.current === event.pointerId) {
      scrubFromIndicator(event.clientX)
      scrubberTrackPointerIdRef.current = null
    }
    if (visibleRangeDragRef.current?.pointerId === event.pointerId) {
      visibleRangeDragRef.current = null
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleScrubberTrackKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const smallStep = Math.max(1_000, fullDuration / 1_000)
    const largeStep = Math.max(10_000, fullDuration / 10)
    const nextTimestamp = {
      ArrowLeft: scrubAtMs - smallStep,
      ArrowRight: scrubAtMs + smallStep,
      Home: range.startMs,
      End: range.endMs,
      PageDown: scrubAtMs - largeStep,
      PageUp: scrubAtMs + largeStep,
    }[event.key]
    if (nextTimestamp === undefined) {
      return
    }

    event.preventDefault()
    onScrub(clamp(nextTimestamp, range.startMs, range.endMs))
  }

  return (
    <div className="timeline-chart-shell" ref={chartShellRef}>
      <div className="timeline-chart-topline">
        <div className="timeline-legend" aria-label="Timeline legend">
          {legendSeries.map((series) => {
            const isVisible = !hiddenMetricChannelIds.has(series.channelId)
            const toggleLabel = `${isVisible ? 'Hide' : 'Show'} ${series.name} telemetry`
            return (
              <button
                aria-label={toggleLabel}
                aria-pressed={isVisible}
                className="timeline-legend-series-toggle"
                key={series.channelId}
                onClick={() => toggleMetricChannel(series.channelId)}
                title={toggleLabel}
                type="button"
              >
                <i style={{ background: series.color }} />
                {series.name}
              </button>
            )
          })}
          {lifecycleTransitions.length > 0 ? (
            <button
              aria-label={showAppState ? 'Hide app state' : 'Show app state'}
              aria-pressed={showAppState}
              className="timeline-legend-series-toggle"
              onClick={() => setShowAppState((current) => !current)}
              title={showAppState ? 'Hide app state' : 'Show app state'}
              type="button"
            >
              <i className="timeline-legend-app-state" />
              App state
            </button>
          ) : null}
          {artifactSnapshots.length > 0 ? (
            <button
              aria-label={showArtifactSnapshots ? 'Hide artifact snapshots' : 'Show artifact snapshots'}
              aria-pressed={showArtifactSnapshots}
              className="timeline-legend-series-toggle"
              onClick={() => setShowArtifactSnapshots((current) => !current)}
              title={showArtifactSnapshots ? 'Hide artifact snapshots' : 'Show artifact snapshots'}
              type="button"
            >
              <svg aria-hidden="true" className="timeline-legend-marker" viewBox="0 0 16 16">
                <rect className="timeline-artifact-marker" height="9" width="9" x="3.5" y="3.5" />
              </svg>
              Artifacts
            </button>
          ) : null}
          {visualTrees.length > 0 ? (
            <button
              aria-label={showVisualTreeSnapshots ? 'Hide visual tree snapshots' : 'Show visual tree snapshots'}
              aria-pressed={showVisualTreeSnapshots}
              className="timeline-legend-series-toggle"
              onClick={() => setShowVisualTreeSnapshots((current) => !current)}
              title={showVisualTreeSnapshots ? 'Hide visual tree snapshots' : 'Show visual tree snapshots'}
              type="button"
            >
              <svg aria-hidden="true" className="timeline-legend-marker" viewBox="0 0 16 16">
                <path className="timeline-snapshot-marker" d="M 8 3 l 5 10 h -10 z" />
              </svg>
              Visual tree snapshots
            </button>
          ) : null}
          {touches.length > 0 ? (
            <button
              aria-label={showTouchLocations ? 'Hide touch locations' : 'Show touch locations'}
              aria-pressed={showTouchLocations}
              className="timeline-legend-toggle timeline-legend-toggle--touches"
              onClick={onToggleTouchLocations}
              title={showTouchLocations ? 'Hide touch locations' : 'Show touch locations'}
              type="button"
            >
              <i aria-hidden="true" className="timeline-legend-touch-swatch" />
              Touches
            </button>
          ) : null}
          {flutterMetricCount > 0 ? (
            <button
              aria-label={showFlutterMetrics ? 'Hide Flutter metrics' : 'Show Flutter metrics'}
              aria-pressed={showFlutterMetrics}
              className="timeline-legend-series-toggle timeline-legend-flutter-toggle"
              onClick={() => setShowFlutterMetrics((current) => !current)}
              title={showFlutterMetrics ? 'Hide Flutter diagnostics and their individual controls' : 'Show Flutter diagnostics and their individual controls'}
              type="button"
            >
              <CaretDown aria-hidden="true" className={showFlutterMetrics ? 'timeline-legend-flutter-caret timeline-legend-flutter-caret--open' : 'timeline-legend-flutter-caret'} />
              Flutter metrics ({flutterMetricCount})
            </button>
          ) : null}
        </div>
        <div className="timeline-chart-actions" aria-label="Timeline playback controls">
          {onSelectTimelineRange ? (
            <button
              aria-label={isRangeSelectionActive ? 'Cancel timeline range selection' : 'Select timeline range'}
              aria-pressed={isRangeSelectionActive}
              className={isRangeSelectionActive ? 'timeline-edit-button timeline-edit-button--active' : 'timeline-edit-button'}
              onClick={onToggleRangeSelection}
              title={isRangeSelectionActive
                ? 'Drag across the timeline, or cancel range selection'
                : 'Select a range action; Shift + left-click drag also selects a range'}
              type="button"
            >
              <Wrench aria-hidden="true" />
              {isRangeSelectionActive ? 'Drag range' : 'Tools'}
            </button>
          ) : null}
          {isLiveSession ? (
            <button
              aria-label={isFollowingLive ? 'Following live session' : 'Return timeline to live'}
              aria-pressed={isFollowingLive}
              className={isFollowingLive ? 'timeline-live-button timeline-live-button--active' : 'timeline-live-button'}
              disabled={isFollowingLive}
              onClick={onGoLive}
              title={isFollowingLive ? 'Following live session' : 'Return timeline to live'}
              type="button"
            >
              <Play aria-hidden="true" />
              {isFollowingLive ? 'Live' : 'Go live'}
            </button>
          ) : null}
        </div>
      </div>

      <div className={telemetryReport ? 'timeline-chart-stage timeline-chart-stage--telemetry-status' : 'timeline-chart-stage'}>
        <svg
          aria-label="Session timeline"
          className={isRangeSelectionActive ? 'timeline-chart timeline-chart--range-selecting' : 'timeline-chart'}
          onPointerCancel={handleChartPointerCancel}
          onPointerDown={handleChartPointerDown}
          onPointerLeave={() => {
            if (!annotationDraftRef.current && chartScrubPointerIdRef.current === null) {
              setHoverProbeAtMs(null)
            }
          }}
          onPointerMove={handleChartPointerMove}
          onPointerUp={handleChartPointerUp}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
        <defs>
          {/* Keeps full-height overlays such as lifecycle sections inside the plot's rounded corners. */}
          <clipPath id={`${gradientBaseId}-plot-clip`}>
            <rect height={plotHeight} rx="10" width={plotWidth} x={plot.left} y={plot.top} />
          </clipPath>
          {chart.series.flatMap((series) => series.segments.map((segment, index) => {
            if (!segment.gradient) {
              return null
            }

            return (
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={createTimelineGradientId(gradientBaseId, series.channelId, index)}
                key={`${series.channelId}-${index}`}
                x1={segment.gradient.startX}
                x2={segment.gradient.endX}
                y1={segment.gradient.startY}
                y2={segment.gradient.endY}
              >
                <stop offset="0%" stopColor={segment.gradient.startColor} />
                <stop offset="100%" stopColor={segment.gradient.endColor} />
              </linearGradient>
            )
          }))}
        </defs>
        <rect className="timeline-plot-bg" x={plot.left} y={plot.top} width={plotWidth} height={plotHeight} rx="10" />
        {chart.axes.map((axis) => {
          const right = axis.kind === 'memory'
          if (!right && axis.axisKey !== labelledLeftAxisKey) {
            return null
          }

          const axisX = right ? plot.left + plotWidth + 8 : plot.left - 8
          // The title sits flush with its tick labels on the axis edge.
          return (
            <g key={axis.axisKey} aria-label={`${axis.axisLabel} scale`}>
              <text className="timeline-axis-title" textAnchor={right ? 'start' : 'end'} x={axisX} y={plot.top - 4}>
                {axis.axisLabel}
              </text>
              {buildAxisTicks(axis.maximum).map((tick) => {
                const y = yForAxisValue(tick, axis.maximum)
                return (
                  <g key={tick}>
                    {axis.axisKey === (labelledLeftAxisKey ?? chart.axes[0]?.axisKey) ? <line className="timeline-y-grid-line" x1={plot.left} x2={plot.left + plotWidth} y1={y} y2={y} /> : null}
                    <text className="timeline-axis-label" x={axisX} y={y + 3} textAnchor={right ? 'start' : 'end'}>
                      {formatMetricValue(tick / axis.scale, axis)}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}

        <g clipPath={`url(#${gradientBaseId}-plot-clip)`}>
          {backgroundSections.map((section, index) => {
            const x = xForTimestamp(section.startMs, visibleRange, plot.left, plotWidth)
            const endX = xForTimestamp(section.endMs, visibleRange, plot.left, plotWidth)
            const sectionWidth = Math.max(1, endX - x)
            return (
              <g key={`${section.startMs}-${section.endMs}-${index}`}>
                {/* The whole span is clipped to a rounded shape so the wash and its bands share the corners. */}
                <clipPath id={`${gradientBaseId}-lifecycle-${index}`}>
                  <rect height={plotHeight} rx="8" width={sectionWidth} x={x} y={plot.top} />
                </clipPath>
                <g clipPath={`url(#${gradientBaseId}-lifecycle-${index})`}>
                  <rect className="timeline-lifecycle-background" height={plotHeight} width={sectionWidth} x={x} y={plot.top} />
                  {/* Darker bands top and bottom carry the label, so the span reads at a glance. */}
                  <rect className="timeline-lifecycle-background-bar" height={timelineLifecycleBarHeight} width={sectionWidth} x={x} y={plot.top} />
                  <rect className="timeline-lifecycle-background-bar" height={timelineLifecycleBarHeight} width={sectionWidth} x={x} y={plot.top + plotHeight - timelineLifecycleBarHeight} />
                  {sectionWidth >= 72 ? (
                    <>
                      <text className="timeline-lifecycle-background-label" textAnchor="middle" x={x + sectionWidth / 2} y={plot.top + 10}>
                        Background
                      </text>
                      <text className="timeline-lifecycle-background-label" textAnchor="middle" x={x + sectionWidth / 2} y={plot.top + plotHeight - 4}>
                        Background
                      </text>
                    </>
                  ) : null}
                </g>
              </g>
            )
          })}
        </g>

        {annotationDraft ? (
          <g aria-hidden="true" className="timeline-annotation-draft">
            {Math.abs(annotationDraft.currentX - annotationDraft.startX) >= timelineAnnotationDraftThreshold ? (
              <rect
                className="timeline-annotation-draft-highlight"
                height={Math.max(1, plotHeight - 16)}
                rx={timelineAnnotationCornerRadius}
                width={Math.abs(annotationDraft.currentX - annotationDraft.startX)}
                x={Math.min(annotationDraft.startX, annotationDraft.currentX)}
                y={plot.top + 8}
              />
            ) : (
              <rect
                className="timeline-annotation-draft-highlight"
                height={timelineAnnotationLaneHeight}
                rx={timelineAnnotationCornerRadius}
                width={timelineAnnotationMinimumWidth}
                x={clamp(
                  annotationDraft.currentX - timelineAnnotationMinimumWidth / 2,
                  plot.left,
                  plot.left + plotWidth - timelineAnnotationMinimumWidth,
                )}
                y={annotationLaneTop}
              />
            )}
            <circle
              className="timeline-annotation-draft-badge-ring"
              cx={Math.abs(annotationDraft.currentX - annotationDraft.startX) >= timelineAnnotationDraftThreshold
                ? (annotationDraft.startX + annotationDraft.currentX) / 2
                : annotationDraft.currentX}
              cy={annotationLaneTop + timelineAnnotationLaneHeight / 2}
              r={timelineAnnotationBadgeRadius + 2}
            />
            <circle
              className="timeline-annotation-draft-badge"
              cx={Math.abs(annotationDraft.currentX - annotationDraft.startX) >= timelineAnnotationDraftThreshold
                ? (annotationDraft.startX + annotationDraft.currentX) / 2
                : annotationDraft.currentX}
              cy={annotationLaneTop + timelineAnnotationLaneHeight / 2}
              r={timelineAnnotationBadgeRadius}
            />
          </g>
        ) : null}

        {rangeDraft ? (
          <g aria-hidden="true" className="timeline-range-draft">
            <rect
              className="timeline-range-draft-highlight"
              height={plotHeight}
              width={Math.max(1, Math.abs(rangeDraft.currentX - rangeDraft.startX))}
              x={Math.min(rangeDraft.startX, rangeDraft.currentX)}
              y={plot.top}
            />
            <line className="timeline-range-draft-edge" x1={rangeDraft.startX} x2={rangeDraft.startX} y1={plot.top} y2={plot.top + plotHeight} />
            <line className="timeline-range-draft-edge" x1={rangeDraft.currentX} x2={rangeDraft.currentX} y1={plot.top} y2={plot.top + plotHeight} />
          </g>
        ) : null}

        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const x = plot.left + plotWidth * tick
          return (
            <g className="timeline-grid-line" key={tick}>
              <line x1={x} x2={x} y1={plot.top} y2={plot.top + plotHeight} />
              <text x={x} y={height - 14} textAnchor={tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle'}>
                {formatTimelineElapsedDuration(visibleRange.startMs + (visibleRange.endMs - visibleRange.startMs) * tick, range)}
              </text>
            </g>
          )
        })}

        {annotations.map((annotation, index) => {
          const annotationId = resolveAnnotationId(annotation, index)
          const marker = buildTimelineAnnotationMarker(annotation, visibleRange, plot.left, plotWidth, annotationLaneTop)
          if (!marker) {
            return null
          }

          const isSelected = annotationId === selectedAnnotationId
          const focusMs = resolveAnnotationFocusMs(annotation)
          const selectCurrentAnnotation = () => onSelectAnnotation(annotationId, focusMs)
          return (
            <g
              aria-label={`Select annotation ${annotation.label || index + 1}`}
              className={isSelected ? 'timeline-annotation-marker timeline-annotation-marker--selected' : 'timeline-annotation-marker'}
              key={annotationId}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  selectCurrentAnnotation()
                }
              }}
              onPointerDown={(event) => {
                if (isRangeSelectionActive || event.button === 2 || (event.shiftKey && (onSelectTimelineRange || onCreateAnnotation))) {
                  return
                }
                event.preventDefault()
                event.stopPropagation()
                selectCurrentAnnotation()
              }}
              role="button"
              tabIndex={0}
            >
              <rect
                className="timeline-annotation-range"
                height={marker.height}
                rx={timelineAnnotationCornerRadius}
                width={marker.width}
                x={marker.x}
                y={marker.y}
              />
              <circle className="timeline-annotation-badge-ring" cx={marker.badgeX} cy={marker.badgeY} r={timelineAnnotationBadgeRadius + 2} />
              <circle className="timeline-annotation-badge" cx={marker.badgeX} cy={marker.badgeY} r={timelineAnnotationBadgeRadius} />
            </g>
          )
        })}

        {chart.series.map((series) => (
          <g key={series.channelId}>
            {series.segments.map((segment, index) => (
              <path
                className="timeline-series"
                d={segment.path}
                key={`${series.channelId}-${index}`}
                style={{ stroke: segment.gradient ? `url(#${createTimelineGradientId(gradientBaseId, series.channelId, index)})` : segment.color }}
              />
            ))}
            {series.points.map((point, index) => (
              <circle className="timeline-series-point" cx={point.x} cy={point.y} key={`${series.channelId}-point-${index}`} r="3.4" style={{ fill: point.color }} />
            ))}
          </g>
        ))}

        {showVisualTreeSnapshots && visualTrees.map((snapshot, index) => {
          const timestampMs = toTimestamp(snapshot.capturedAtUtc)
          if (timestampMs === null) {
            return null
          }
          if (timestampMs < visibleRange.startMs || timestampMs > visibleRange.endMs) {
            return null
          }

          const x = xForTimestamp(timestampMs, visibleRange, plot.left, plotWidth)
          return <path className="timeline-snapshot-marker" d={`M ${x} ${plot.top + plotHeight - 50} l 5 10 h -10 z`} key={snapshot.snapshotId ?? index} />
        })}

        {showArtifactSnapshots && artifactSnapshots.map((snapshot, index) => {
          const timestampMs = toTimestamp(snapshot.capturedAtUtc)
          if (timestampMs === null) {
            return null
          }
          if (timestampMs < visibleRange.startMs || timestampMs > visibleRange.endMs) {
            return null
          }

          const x = xForTimestamp(timestampMs, visibleRange, plot.left, plotWidth)
          return <rect className="timeline-artifact-marker" height="9" key={snapshot.snapshotId ?? index} width="9" x={x - 4.5} y={plot.top + plotHeight - 64} />
        })}

        {hasVisibleFpsSeries && isScrubWithinVisibleRange && fpsScrubY !== null ? (
          <>
            <line className="timeline-scrub-line" x1={scrubX} x2={scrubX} y1={scrubZeroY} y2={fpsScrubY} />
            <circle className="timeline-scrub-handle" cx={scrubX} cy={fpsScrubY} r="7" />
          </>
        ) : null}

        {probeAtMs !== null && probeX !== null ? (
          <g aria-label={[probeHeader, ...probeLines.map((line) => line.label)].join(', ')} className="timeline-probe" role="status">
            <line className="timeline-probe-line" x1={probeX} x2={probeX} y1={plot.top} y2={plot.top + plotHeight} />
            {isHoverProbe ? probeLines.map((line) => {
              const presentation = metricPresentation(metricIndex.channelMap.get(line.channelId), line.channelId)
              const maxValue = chart.axes.find((axis) => axis.axisKey === presentation.axisKey)?.maximum ?? 1
              return (
                <circle
                  className="timeline-probe-point"
                  cx={probeX}
                  cy={yForAxisValue(line.value * presentation.scale, maxValue)}
                  key={line.channelId}
                  r="4.2"
                  style={{ fill: line.color }}
                />
              )
            }) : null}
            <g className="timeline-probe-panel">
              <rect height={probePanelHeight} rx="6" width={probePanelWidth} x={probePanelLeft} y={probePanelTop} />
              <text className="timeline-probe-time" x={probePanelLeft + probePanelPadding} y={probePanelTop + probePanelPadding + 10}>
                {probeHeader}
              </text>
              {probeLines.map((line, index) => {
                const lineY = probePanelTop + probePanelPadding + 10 + (index + 1) * probeLineHeight
                return (
                  <g key={line.channelId}>
                    <circle className="timeline-probe-swatch" cx={probePanelLeft + probePanelPadding + 3} cy={lineY - 3.5} r="3" style={{ fill: line.color }} />
                    <text className="timeline-probe-value" x={probePanelLeft + probePanelPadding + probeSwatchColumn} y={lineY}>
                      {line.label}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        ) : null}

        {chart.series.length === 0 && !telemetryReport ? (
          <text className="timeline-empty-label" x={plot.left + plotWidth / 2} y={plot.top + plotHeight / 2} textAnchor="middle">
            Timeline markers only
          </text>
        ) : null}
        </svg>
        {telemetryReport ? (
          <div className="timeline-telemetry-overlay" style={{
            left: `${plot.left / width * 100}%`, right: `${plot.right / width * 100}%`,
            top: `${plot.top / height * 100}%`, bottom: `${plot.bottom / height * 100}%`,
          }}>
            <DeferredTelemetryStatus report={telemetryReport} />
          </div>
        ) : null}
      </div>

      {/* The stylesheet insets the track to these plot edges so it lines up with the chart's time axis. */}
      <div className="timeline-scrubber" style={{ '--timeline-plot-left': `${plot.left}px`, '--timeline-plot-right': `${plot.right}px` } as CSSProperties}>
        <span
          className={isFollowingLive ? 'timeline-scrubber-label timeline-scrubber-label--live' : 'timeline-scrubber-label'}
          onPointerCancel={handleScrubberIndicatorEnd}
          onPointerDown={handleScrubberIndicatorStart}
          onPointerMove={handleScrubberIndicatorMove}
          onPointerUp={handleScrubberIndicatorEnd}
          style={{ left: `${scrubRatio * 100}%` }}
        >
          {isFollowingLive ? `LIVE · ${formatTimelineElapsedDuration(scrubAtMs, range)}` : formatTimelineElapsedDuration(scrubAtMs, range)}
        </span>
        <div
          aria-label="Timeline scrub position"
          aria-valuemax={range.endMs}
          aria-valuemin={range.startMs}
          aria-valuenow={scrubAtMs}
          aria-valuetext={formatTimelineElapsedDuration(scrubAtMs, range)}
          className="timeline-scrubber-track"
          onKeyDown={handleScrubberTrackKeyDown}
          onPointerCancel={handleScrubberTrackEnd}
          onPointerDown={handleScrubberTrackStart}
          onPointerMove={handleScrubberTrackMove}
          onPointerUp={handleScrubberTrackEnd}
          ref={scrubberTrackRef}
          role="slider"
          tabIndex={0}
        >
          {scrubberTicks.map((tick, index) => (
            <span
              aria-hidden="true"
              className={tick.isMajor ? 'timeline-scrubber-tick timeline-scrubber-tick--major' : 'timeline-scrubber-tick'}
              key={index}
              style={{ left: `${tick.ratio * 100}%` }}
            />
          ))}
          {scrubberTouchMarks.map((mark) => (
            <span
              aria-hidden="true"
              className="timeline-scrubber-touch"
              key={mark.key}
              style={{ left: `${mark.ratio * 100}%` }}
            />
          ))}
          {canZoomOut ? (
            <div
              aria-label="Visible timeline range"
              className="timeline-visible-window"
              onPointerCancel={handleVisibleRangeMoveEnd}
              onPointerDown={handleVisibleRangeMoveStart}
              onPointerMove={handleVisibleRangeMoveMove}
              onPointerUp={handleVisibleRangeMoveEnd}
              role="group"
              style={{
                left: `${visibleStartRatio * 100}%`,
                width: `${(visibleEndRatio - visibleStartRatio) * 100}%`,
              }}
              title="Drag to move the visible timeline range"
            >
              <button
                aria-label="Resize visible timeline start"
                className="timeline-visible-window-handle timeline-visible-window-handle--start"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerCancel={handleVisibleRangeResizeEnd}
                onPointerDown={(event) => handleVisibleRangeResizeStart('start', event)}
                onPointerMove={(event) => handleVisibleRangeResizeMove('start', event)}
                onPointerUp={handleVisibleRangeResizeEnd}
                title="Resize visible timeline start"
                type="button"
              />
              <button
                aria-label="Resize visible timeline end"
                className="timeline-visible-window-handle timeline-visible-window-handle--end"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerCancel={handleVisibleRangeResizeEnd}
                onPointerDown={(event) => handleVisibleRangeResizeStart('end', event)}
                onPointerMove={(event) => handleVisibleRangeResizeMove('end', event)}
                onPointerUp={handleVisibleRangeResizeEnd}
                title="Resize visible timeline end"
                type="button"
              />
            </div>
          ) : null}
          <span className="timeline-scrubber-playhead" style={{ left: `${scrubRatio * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

/** Chooses the log stream from an anchored in-app list instead of the native select popup. */
function LogStreamPicker({
  logStreams,
  onSelect,
  selectedStreamId,
}: {
  logStreams: SessionLogStream[]
  onSelect: (streamId: string) => void
  selectedStreamId: string | null
}) {
  const [isOpen, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selectedIndex = Math.max(0, logStreams.findIndex((stream) => stream.streamId === selectedStreamId))
  const selectedStream = logStreams[selectedIndex]

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function openList() {
    setActiveIndex(selectedIndex)
    setOpen(true)
  }

  function choose(index: number) {
    const stream = logStreams[index]
    if (stream) {
      onSelect(stream.streamId)
    }
    setOpen(false)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault()
        setOpen(false)
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        openList()
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + step + logStreams.length) % logStreams.length)
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  return (
    <div className={isOpen ? 'live-log-stream-picker live-log-stream-picker--open' : 'live-log-stream-picker'} onKeyDown={handleKeyDown} ref={rootRef}>
      <button
        aria-activedescendant={isOpen ? `${listId}-${activeIndex}` : undefined}
        aria-controls={listId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Log stream"
        className="live-log-filter-control live-log-stream-picker-button"
        onClick={() => (isOpen ? setOpen(false) : openList())}
        type="button"
      >
        <Stack aria-hidden="true" />
        <span>{selectedStream?.displayName ?? 'Stream'}</span>
        <CaretDown aria-hidden="true" className="live-log-stream-picker-caret" />
      </button>
      {isOpen ? (
        <ul aria-label="Log stream" className="live-log-stream-picker-list" id={listId} role="listbox">
          {logStreams.map((stream, index) => (
            <li
              aria-selected={index === selectedIndex}
              className={index === activeIndex ? 'live-log-stream-picker-option live-log-stream-picker-option--active' : 'live-log-stream-picker-option'}
              id={`${listId}-${index}`}
              key={stream.streamId}
              onClick={() => choose(index)}
              onPointerMove={() => setActiveIndex(index)}
              role="option"
            >
              <span>{stream.displayName}</span>
              {index === selectedIndex ? <Check aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const LiveLogViewer = memo(function LiveLogViewer({
  className,
  embedded = false,
  logStreams,
  logs,
  onSelectLogStream,
  scrubAtMs,
  selectedLogStreamId,
  timelineLogs,
  timelineRange,
}: {
  className?: string
  embedded?: boolean
  logStreams: SessionLogStream[]
  logs: SessionLogEntry[]
  onSelectLogStream: (streamId: string | null) => void
  scrubAtMs: number
  selectedLogStreamId: string | null
  timelineLogs: Array<TimestampedItem<SessionLogEntry>>
  timelineRange: TimelineRange
}) {
  const [filters, setFilters] = useState<LogFilterState>(defaultLogFilterState)
  const [isAdvancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const tagOptionsId = useId()
  const availableLogs = useMemo(() => buildAvailableLogItems(timelineLogs), [timelineLogs])
  const tagOptions = useMemo(() => buildLogTagOptions(logs), [logs])
  const hasActiveFilters = hasLogFilters(filters)
  const activeAdvancedFilterCount = getAdvancedLogFilterCount(filters)
  const hasAdvancedFilters = activeAdvancedFilterCount > 0
  const filteredLogs = useMemo(
    () => hasActiveFilters ? filterLogItems(availableLogs, filters, timelineRange) : availableLogs,
    [availableLogs, filters, hasActiveFilters, timelineRange],
  )
  const visibleLogs = filteredLogs
  const visibleCount = availableLogs.length
  const activeLogIndex = upperBoundTimestamp(timelineLogs, scrubAtMs) - 1
  const filterRangeMessage = getLogFilterRangeMessage(filters)
  const rootClassName = embedded
    ? ['live-log-panel', 'live-log-panel--tab', className].filter(Boolean).join(' ')
    : className
      ? `panel live-log-panel ${className}`
      : 'panel live-log-panel'
  const updateFilters = useCallback((patch: Partial<LogFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }))
  }, [])
  const clearFilters = useCallback(() => {
    setFilters(defaultLogFilterState)
    setAdvancedFiltersOpen(false)
  }, [])
  const clearAdvancedFilters = useCallback(() => {
    updateFilters({
      tag: '',
      minimumLevel: 'all',
      startSeconds: '',
      endSeconds: '',
    })
  }, [updateFilters])
  useEffect(() => {
    if (!isAdvancedFiltersOpen) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAdvancedFiltersOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAdvancedFiltersOpen])

  const closeAdvancedFilters = useCallback(() => {
    setAdvancedFiltersOpen(false)
  }, [])

  return (
    <section className={rootClassName}>
      {embedded ? null : (
        <>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live log</p>
              <h2>{visibleCount} / {logs.length}</h2>
            </div>
            <FileText className="subdued" aria-hidden="true" />
          </div>
          <p className="muted">At {formatDateTimeFromMs(scrubAtMs)}</p>
        </>
      )}

      <div className={logStreams.length > 1 ? 'live-log-filters live-log-filters--with-streams' : 'live-log-filters'} role="search">
        {logStreams.length > 1 ? (
          <LogStreamPicker logStreams={logStreams} onSelect={onSelectLogStream} selectedStreamId={selectedLogStreamId} />
        ) : null}
        <label className="live-log-filter live-log-filter--keyword">
          <span className="live-log-filter-label">Keyword</span>
          <span className="live-log-filter-control">
            <MagnifyingGlass aria-hidden="true" />
            <input
              onChange={(event) => updateFilters({ keyword: event.target.value })}
              placeholder="Message, tag, source, event"
              type="search"
              value={filters.keyword}
            />
          </span>
        </label>
        <button
          aria-expanded={isAdvancedFiltersOpen}
          aria-haspopup="dialog"
          className={hasAdvancedFilters ? 'live-log-filter-menu-button live-log-filter-menu-button--active' : 'live-log-filter-menu-button'}
          onClick={() => setAdvancedFiltersOpen((current) => !current)}
          type="button"
        >
          <Funnel aria-hidden="true" />
          <span>Filters</span>
          {hasAdvancedFilters ? <strong>{activeAdvancedFilterCount}</strong> : null}
        </button>
        <button
          aria-label="Clear log filters"
          className="live-log-filter-clear"
          disabled={!hasActiveFilters}
          onClick={clearFilters}
          title="Clear log filters"
          type="button"
        >
          <X aria-hidden="true" />
        </button>
      </div>
      {isAdvancedFiltersOpen ? (
        <div
          className="live-log-filter-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAdvancedFilters()
            }
          }}
          role="presentation"
        >
          <div className="live-log-filter-sheet" role="dialog" aria-label="Advanced log filters" aria-modal="true">
            <div className="live-log-filter-sheet-header">
              <strong>Log filters</strong>
              <button aria-label="Close log filters" className="live-log-filter-sheet-close" onClick={closeAdvancedFilters} type="button">
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="live-log-filter-sheet-grid">
              <label className="live-log-filter">
                <span className="live-log-filter-label">Tag</span>
                <span className="live-log-filter-control">
                  <Tag aria-hidden="true" />
                  <input
                    list={tagOptions.length > 0 ? tagOptionsId : undefined}
                    onChange={(event) => updateFilters({ tag: event.target.value })}
                    placeholder="Any tag"
                    type="search"
                    value={filters.tag}
                  />
                  {tagOptions.length > 0 ? (
                    <datalist id={tagOptionsId}>
                      {tagOptions.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                  ) : null}
                </span>
              </label>
              <label className="live-log-filter">
                <span className="live-log-filter-label">Min level</span>
                <span className="live-log-filter-control">
                  <WarningCircle aria-hidden="true" />
                  <select
                    onChange={(event) => updateFilters({ minimumLevel: event.target.value as LogLevelFilterValue })}
                    value={filters.minimumLevel}
                  >
                    {logLevelFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="live-log-filter live-log-filter--time">
                <span className="live-log-filter-label">From sec</span>
                <span className="live-log-filter-control">
                  <Clock aria-hidden="true" />
                  <input
                    min="0"
                    onChange={(event) => updateFilters({ startSeconds: event.target.value })}
                    placeholder="Start"
                    step="0.1"
                    type="number"
                    value={filters.startSeconds}
                  />
                </span>
              </label>
              <label className="live-log-filter live-log-filter--time">
                <span className="live-log-filter-label">To sec</span>
                <span className="live-log-filter-control">
                  <Clock aria-hidden="true" />
                  <input
                    min="0"
                    onChange={(event) => updateFilters({ endSeconds: event.target.value })}
                    placeholder="End"
                    step="0.1"
                    type="number"
                    value={filters.endSeconds}
                  />
                </span>
              </label>
            </div>
            <div className="live-log-filter-sheet-footer">
              <button disabled={!hasAdvancedFilters} onClick={clearAdvancedFilters} type="button">Clear advanced</button>
              <button onClick={closeAdvancedFilters} type="button">Done</button>
            </div>
          </div>
        </div>
      ) : null}
      {hasActiveFilters ? (
        <p className={filterRangeMessage ? 'live-log-filter-summary live-log-filter-summary--warning' : 'live-log-filter-summary'}>
          {filteredLogs.length} / {visibleCount} matching
          {filterRangeMessage ? ` (${filterRangeMessage})` : ''}
        </p>
      ) : null}

      {logs.length === 0 ? (
        <EmptyState icon={<FileText aria-hidden="true" />} title="No logs" message="This session did not include log entries." />
      ) : visibleCount === 0 ? (
        <EmptyState icon={<FileText aria-hidden="true" />} title="No timestamped logs" message="This session's log entries have no valid timestamps." />
      ) : visibleLogs.length === 0 ? (
        <EmptyState icon={<FileText aria-hidden="true" />} title="No matching logs" message="No log entries match the active filters." />
      ) : (
        <VirtualizedLogList items={visibleLogs} renderRow={({ index, log }) => (
            <div className={index === activeLogIndex ? 'live-log-row live-log-row--active' : 'live-log-row'} key={`${log.timestampUtc ?? 'log'}-${index}`}>
              <span className="live-log-time">{formatTime(log.timestampUtc)}</span>
              <strong className={`live-log-level live-log-level--${getLogLevelTone(log)}`}>{formatLogLevel(log)}</strong>
              <p className="live-log-message">{log.message || 'No message'}</p>
            </div>
          )} />
      )}
    </section>
  )
})

type NetworkViewMode = 'table' | 'timeline'

type NetworkQuickFilter = 'all' | 'failed' | 'slow'

type NetworkDetailsTab = 'overview' | 'headers' | 'request' | 'response' | 'timing'

type NetworkQueryParameter = {
  name: string
  value: string
}

type NetworkUrlParts = {
  host: string
  path: string
  queryParameters: NetworkQueryParameter[]
}

type NetworkTimelineBounds = {
  durationMs: number
  endMs: number
  startMs: number
}

type NetworkRequestTiming = {
  durationMs: number
  startMs: number
}

const networkSlowRequestThresholdMs = 1_000
const networkDetailsDefaultWidth = 420
const networkDetailsMinimumWidth = 320
const networkRequestListMinimumWidth = 430

function NetworkSection({ requests }: { requests: SessionNetworkRequest[] }) {
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('all')
  const [status, setStatus] = useState('all')
  const [quickFilter, setQuickFilter] = useState<NetworkQuickFilter>('all')
  const [viewMode, setViewMode] = useState<NetworkViewMode>('table')
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(true)
  const [detailsWidth, setDetailsWidth] = useState(networkDetailsDefaultWidth)
  const workbenchRef = useRef<HTMLDivElement | null>(null)
  const requestRowRefs = useRef(new Map<string, HTMLButtonElement>())
  const methods = useMemo(
    () => Array.from(new Set(requests.map((request) => request.method.toUpperCase()))).sort(),
    [requests],
  )
  const filteredRequests = useMemo(() => requests.filter((request) => {
    const normalizedQuery = query.trim().toLowerCase()
    const matchesQuery = !normalizedQuery
      || request.url.toLowerCase().includes(normalizedQuery)
      || request.method.toLowerCase().includes(normalizedQuery)
      || request.errorMessage?.toLowerCase().includes(normalizedQuery)
    const matchesMethod = method === 'all' || request.method.toUpperCase() === method
    const matchesStatus = status === 'all'
      || (status === 'failed' && (request.statusCode === undefined || request.statusCode === null || request.statusCode >= 400 || !!request.errorType))
      || (request.statusCode !== undefined && request.statusCode !== null && Math.floor(request.statusCode / 100) === Number(status))
    const matchesQuickFilter = quickFilter === 'all'
      || (quickFilter === 'failed' && networkRequestFailed(request))
      || (quickFilter === 'slow' && request.durationMilliseconds >= networkSlowRequestThresholdMs)
    return matchesQuery && matchesMethod && matchesStatus && matchesQuickFilter
  }), [method, query, quickFilter, requests, status])
  const displayedRequests = useMemo(() => viewMode === 'timeline'
    ? [...filteredRequests].sort(compareNetworkRequestStartTimes)
    : filteredRequests,
  [filteredRequests, viewMode])
  const selectedRequest = filteredRequests.find((request) => request.id === selectedRequestId)
    ?? filteredRequests[filteredRequests.length - 1]
    ?? null
  const timelineBounds = useMemo(() => getNetworkTimelineBounds(displayedRequests), [displayedRequests])
  const workbenchStyle = {
    '--network-details-width': `${detailsWidth}px`,
  } as CSSProperties

  function selectRequest(request: SessionNetworkRequest) {
    setSelectedRequestId(request.id)
    setIsDetailsOpen(true)
  }

  function registerRequestRow(requestId: string, element: HTMLButtonElement | null) {
    if (element) {
      requestRowRefs.current.set(requestId, element)
    } else {
      requestRowRefs.current.delete(requestId)
    }
  }

  function handleRequestKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, requestIndex: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = Math.min(displayedRequests.length - 1, requestIndex + 1)
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, requestIndex - 1)
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = displayedRequests.length - 1
    if (nextIndex === null || nextIndex === requestIndex) return

    event.preventDefault()
    const nextRequest = displayedRequests[nextIndex]
    if (!nextRequest) return
    selectRequest(nextRequest)
    window.requestAnimationFrame(() => requestRowRefs.current.get(nextRequest.id)?.focus())
  }

  function handleDetailsResizePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const workbenchElement = workbenchRef.current
    if (!workbenchElement) return

    event.preventDefault()
    const startX = event.clientX
    const startWidth = detailsWidth
    const availableWidth = workbenchElement.getBoundingClientRect().width

    function updateWidth(clientX: number) {
      const maximumWidth = Math.max(
        networkDetailsMinimumWidth,
        Math.min(720, availableWidth - networkRequestListMinimumWidth),
      )
      setDetailsWidth(clamp(startWidth + startX - clientX, networkDetailsMinimumWidth, maximumWidth))
    }

    function finishResize() {
      document.body.classList.remove('network-details-resizing')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }

    function handlePointerMove(pointerEvent: globalThis.PointerEvent) {
      pointerEvent.preventDefault()
      updateWidth(pointerEvent.clientX)
    }

    function handlePointerEnd(pointerEvent: globalThis.PointerEvent) {
      pointerEvent.preventDefault()
      finishResize()
    }

    document.body.classList.add('network-details-resizing')
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
  }

  return (
    <section className="network-viewer">
      <div className="network-toolbar">
        <label className="network-search">
          <MagnifyingGlass aria-hidden="true" />
          <input aria-label="Filter network requests" onChange={(event) => setQuery(event.target.value)} placeholder="Filter URL or error" type="search" value={query} />
        </label>
        <select aria-label="Filter by method" onChange={(event) => setMethod(event.target.value)} value={method}>
          <option value="all">All methods</option>
          {methods.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="all">All statuses</option>
          <option value="2">2xx</option>
          <option value="3">3xx</option>
          <option value="4">4xx</option>
          <option value="5">5xx</option>
          <option value="failed">Failed</option>
        </select>
        <div aria-label="Quick filters" className="network-quick-filters">
          <button aria-pressed={quickFilter === 'failed'} onClick={() => setQuickFilter((current) => current === 'failed' ? 'all' : 'failed')} type="button">
            Failed
          </button>
          <button aria-pressed={quickFilter === 'slow'} onClick={() => setQuickFilter((current) => current === 'slow' ? 'all' : 'slow')} type="button">
            Slow ≥1s
          </button>
        </div>
        <div aria-label="Network request view" className="network-view-switcher" role="group">
          <button aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')} type="button">
            <List aria-hidden="true" />
            Table
          </button>
          <button aria-pressed={viewMode === 'timeline'} onClick={() => setViewMode('timeline')} type="button">
            <Clock aria-hidden="true" />
            Timeline
          </button>
        </div>
        <span>{filteredRequests.length} / {requests.length} requests</span>
      </div>
      {requests.length === 0 ? (
        <EmptyState icon={<GlobeSimple aria-hidden="true" />} title="No network requests" message="Requests captured by an Ansight SDK will appear here." />
      ) : (
        <div
          className={isDetailsOpen ? 'network-workbench' : 'network-workbench network-workbench--details-closed'}
          ref={workbenchRef}
          style={workbenchStyle}
        >
          {viewMode === 'table' ? (
            <div className="network-table" role="grid" aria-label="Captured network requests">
              <div className="network-row network-row--header" role="row">
                <span role="columnheader">Method</span><span role="columnheader">Status</span><span role="columnheader">Request</span><span role="columnheader">Type</span><span role="columnheader">Size</span><span role="columnheader">Duration</span>
              </div>
              {displayedRequests.map((request, requestIndex) => {
                const isSelected = request.id === selectedRequest?.id
                const urlParts = getNetworkUrlParts(request.url)
                const requestType = networkRequestType(request)
                return (
                  <button
                    aria-label={`${request.method} ${networkStatusLabel(request)} ${urlParts.host}${urlParts.path}, ${formatNetworkDuration(request.durationMilliseconds)}`}
                    aria-selected={isSelected}
                    className={isSelected ? 'network-row network-row--selected' : 'network-row'}
                    key={request.id}
                    onClick={() => selectRequest(request)}
                    onKeyDown={(event) => handleRequestKeyDown(event, requestIndex)}
                    ref={(element) => registerRequestRow(request.id, element)}
                    role="row"
                    tabIndex={isSelected ? 0 : -1}
                    type="button"
                  >
                    <strong role="gridcell">{request.method}</strong>
                    <span role="gridcell"><span className={`network-status network-status--${networkStatusTone(request)}`}>{networkStatusLabel(request)}</span></span>
                    <span className="network-endpoint" role="gridcell" title={request.url}><strong>{urlParts.path}</strong><small>{urlParts.host}</small></span>
                    <span role="gridcell" title={requestType}>{networkRequestTypeLabel(requestType)}</span>
                    <span className="network-number" role="gridcell">{formatOptionalBytes(request.responseBodySizeBytes ?? request.requestBodySizeBytes)}</span>
                    <span className="network-number" role="gridcell">{formatNetworkDuration(request.durationMilliseconds)}</span>
                  </button>
                )
              })}
              {displayedRequests.length === 0 ? <NetworkNoMatches /> : null}
            </div>
          ) : (
            <div className="network-timeline" role="grid" aria-label="Network request timeline">
              <div className="network-timeline-row network-timeline-row--header" role="row">
                <span role="columnheader">Method</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Request</span>
                <NetworkTimelineAxis bounds={timelineBounds} />
              </div>
              {displayedRequests.map((request, requestIndex) => {
                const isSelected = request.id === selectedRequest?.id
                const urlParts = getNetworkUrlParts(request.url)
                return (
                  <button
                    aria-label={`${request.method} ${networkStatusLabel(request)} ${urlParts.host}${urlParts.path}, ${formatNetworkDuration(request.durationMilliseconds)}`}
                    aria-selected={isSelected}
                    className={isSelected ? 'network-timeline-row network-timeline-row--selected' : 'network-timeline-row'}
                    key={request.id}
                    onClick={() => selectRequest(request)}
                    onKeyDown={(event) => handleRequestKeyDown(event, requestIndex)}
                    ref={(element) => registerRequestRow(request.id, element)}
                    role="row"
                    tabIndex={isSelected ? 0 : -1}
                    type="button"
                  >
                    <strong role="gridcell">{request.method}</strong>
                    <span role="gridcell"><span className={`network-status network-status--${networkStatusTone(request)}`}>{networkStatusLabel(request)}</span></span>
                    <span className="network-endpoint" role="gridcell" title={request.url}><strong>{urlParts.path}</strong><small>{urlParts.host}</small></span>
                    <span className="network-waterfall" role="gridcell">
                      <span className="network-waterfall-track">
                        {timelineBounds ? (
                          <span
                            aria-label={`Started ${formatNetworkTimelineOffset(getNetworkRequestStartMs(request) - timelineBounds.startMs)} into the visible request range and took ${formatNetworkDuration(request.durationMilliseconds)}`}
                            className={`network-waterfall-bar network-waterfall-bar--${networkStatusTone(request)}`}
                            role="img"
                            style={getNetworkWaterfallStyle(request, timelineBounds)}
                            title={`${formatNetworkTimelineOffset(getNetworkRequestStartMs(request) - timelineBounds.startMs)} · ${formatNetworkDuration(request.durationMilliseconds)}`}
                          />
                        ) : null}
                      </span>
                      <small>{formatNetworkDuration(request.durationMilliseconds)}</small>
                    </span>
                  </button>
                )
              })}
              {displayedRequests.length === 0 ? <NetworkNoMatches /> : null}
            </div>
          )}
          {isDetailsOpen ? (
            <div className="network-details-shell">
              <button
                aria-label="Resize network request details"
                className="network-details-resize-handle"
                onPointerDown={handleDetailsResizePointerDown}
                title="Resize request details"
                type="button"
              ><span aria-hidden="true" /></button>
              {selectedRequest ? <NetworkRequestDetails onClose={() => setIsDetailsOpen(false)} request={selectedRequest} /> : (
                <EmptyState icon={<Funnel aria-hidden="true" />} title="No matching requests" message="Adjust the Network filters to inspect a request." />
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function NetworkNoMatches() {
  return (
    <div className="network-no-matches">
      <Funnel aria-hidden="true" />
      <span>No requests match the active filters.</span>
    </div>
  )
}

function NetworkTimelineAxis({ bounds }: { bounds: NetworkTimelineBounds | null }) {
  const durationMs = bounds?.durationMs ?? 0
  return (
    <span aria-label="Timeline from first visible request" className="network-timeline-axis" role="columnheader">
      <span>0 ms</span>
      <span>{formatNetworkTimelineOffset(durationMs / 2)}</span>
      <span>{formatNetworkTimelineOffset(durationMs)}</span>
    </span>
  )
}

function NetworkRequestDetails({ onClose, request }: { onClose: () => void; request: SessionNetworkRequest }) {
  const [activeTab, setActiveTab] = useState<NetworkDetailsTab>('overview')
  const urlParts = getNetworkUrlParts(request.url)
  const detailsTabs: Array<{ id: NetworkDetailsTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'headers', label: 'Headers' },
    { id: 'request', label: 'Request' },
    { id: 'response', label: 'Response' },
    { id: 'timing', label: 'Timing' },
  ]

  return (
    <aside className="network-details">
      <div className="network-details-heading">
        <div className="network-details-title-row">
          <div><strong>{request.method}</strong><span className={`network-status network-status--${networkStatusTone(request)}`}>{networkStatusLabel(request)}</span></div>
          <button aria-label="Close request details" className="network-details-close" onClick={onClose} title="Close request details" type="button"><X aria-hidden="true" /></button>
        </div>
        <strong className="network-details-path">{urlParts.path}</strong>
        <span className="network-details-host">{urlParts.host}</span>
        <div className="network-details-actions">
          <CopyTextButton accessibleLabel="Copy full request URL" label="Copy URL" text={request.url} />
        </div>
      </div>
      <div aria-label="Request details" className="network-details-tabs" role="tablist">
        {detailsTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >{tab.label}</button>
        ))}
      </div>
      <div className="network-details-content" role="tabpanel">
        {activeTab === 'overview' ? (
          <>
            <dl className="network-general">
              <div><dt>Status</dt><dd>{networkStatusLabel(request)}{request.reasonPhrase ? ` ${request.reasonPhrase}` : ''}</dd></div>
              <div><dt>Type</dt><dd>{networkRequestType(request)}</dd></div>
              <div><dt>Size</dt><dd>{formatOptionalBytes(request.responseBodySizeBytes ?? request.requestBodySizeBytes)}</dd></div>
              <div><dt>Source</dt><dd>{request.source || 'Unknown'}</dd></div>
              {request.errorType ? <div><dt>Error</dt><dd>{request.errorType}{request.errorMessage ? `: ${request.errorMessage}` : ''}</dd></div> : null}
            </dl>
            <NetworkQueryParameters parameters={urlParts.queryParameters} />
          </>
        ) : null}
        {activeTab === 'headers' ? (
          <>
            <NetworkHeaders title="Request headers" headers={request.requestHeaders ?? []} />
            <NetworkHeaders title="Response headers" headers={request.responseHeaders ?? []} />
          </>
        ) : null}
        {activeTab === 'request' ? <NetworkBodyDetails title="Request body" body={request.requestBody} reportedBytes={request.requestBodySizeBytes} /> : null}
        {activeTab === 'response' ? <NetworkBodyDetails title="Response body" body={request.responseBody} reportedBytes={request.responseBodySizeBytes} /> : null}
        {activeTab === 'timing' ? (
          <dl className="network-general network-general--timing">
            <div><dt>Started</dt><dd>{formatDateTime(request.startedAtUtc)}</dd></div>
            <div><dt>Completed</dt><dd>{formatDateTime(request.completedAtUtc)}</dd></div>
            <div><dt>Duration</dt><dd>{formatNetworkDuration(request.durationMilliseconds)}</dd></div>
            <div><dt>Protocol</dt><dd>{request.protocol || 'Unknown'}</dd></div>
          </dl>
        ) : null}
      </div>
    </aside>
  )
}

function NetworkQueryParameters({ parameters }: { parameters: NetworkQueryParameter[] }) {
  if (parameters.length === 0) {
    return <p className="network-empty-section">No query parameters.</p>
  }

  return (
    <details className="network-query-parameters">
      <summary>Query parameters <span>{parameters.length}</span></summary>
      <div className="network-query-parameter-list">
        {parameters.map((parameter, index) => (
          <div key={`${parameter.name}-${index}`}><strong>{parameter.name}</strong><code>{formatNetworkQueryValue(parameter.value)}</code></div>
        ))}
      </div>
    </details>
  )
}

function NetworkBodyDetails({
  body,
  reportedBytes,
  title,
}: {
  body?: SessionNetworkBody | null
  reportedBytes?: number | null
  title: string
}) {
  const formattedBody = useMemo(() => formatNetworkBody(body), [body])
  const [showRawBody, setShowRawBody] = useState(false)
  const canFormatBody = !!body && formattedBody !== body.data

  return (
    <section className="network-body">
      <div className="network-section-heading">
        <h3>{title}</h3>
        {body ? (
          <div className="network-section-actions">
            {canFormatBody ? <button onClick={() => setShowRawBody((current) => !current)} type="button">{showRawBody ? 'Format' : 'Raw'}</button> : null}
            <CopyTextButton accessibleLabel={`Copy ${title.toLowerCase()}`} label="Copy" text={showRawBody ? body.data : formattedBody} />
          </div>
        ) : null}
      </div>
      {!body ? (
        <p>Not captured{typeof reportedBytes === 'number' ? ` (${formatOptionalBytes(reportedBytes)} reported)` : ''}.</p>
      ) : (
        <>
          <p>
            {body.contentType || 'Unknown content type'} · {body.encoding === 'base64' ? 'Base64' : 'UTF-8'} · {formatOptionalBytes(body.capturedBytes)} captured
            {body.truncated ? ` of ${formatOptionalBytes(body.totalBytes ?? reportedBytes)}` : ''}
          </p>
          <pre><code>{showRawBody ? body.data : formattedBody}</code></pre>
        </>
      )}
    </section>
  )
}

function NetworkHeaders({ headers, title }: { headers: Array<{ name: string; value: string }>; title: string }) {
  return (
    <section className="network-headers">
      <div className="network-section-heading">
        <h3>{title}</h3>
        {headers.length > 0 ? <CopyTextButton accessibleLabel={`Copy ${title.toLowerCase()}`} label="Copy" text={headers.map((header) => `${header.name}: ${header.value}`).join('\n')} /> : null}
      </div>
      {headers.length === 0 ? <p>None captured.</p> : headers.map((header, index) => (
        <div key={`${header.name}-${index}`}><strong>{header.name}</strong><code>{header.value}</code></div>
      ))}
    </section>
  )
}

function networkStatusLabel(request: SessionNetworkRequest): string {
  return request.statusCode?.toString() ?? (request.errorType ? 'Error' : 'No response')
}

function networkStatusTone(request: SessionNetworkRequest): string {
  if (request.errorType || !request.statusCode || request.statusCode >= 500) return 'error'
  if (request.statusCode >= 400) return 'warning'
  if (request.statusCode >= 300) return 'redirect'
  return 'success'
}

function networkRequestFailed(request: SessionNetworkRequest): boolean {
  return !!request.errorType || !request.statusCode || request.statusCode >= 400
}

function getNetworkUrlParts(url: string): NetworkUrlParts {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.host,
      path: decodeNetworkPath(parsed.pathname || '/'),
      queryParameters: Array.from(parsed.searchParams.entries()).map(([name, value]) => ({ name, value })),
    }
  } catch {
    return { host: 'Invalid URL', path: url, queryParameters: [] }
  }
}

function decodeNetworkPath(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function formatNetworkQueryValue(value: string): string {
  return value.replace(/<redacted>/gi, '•••• redacted')
}

function networkRequestType(request: SessionNetworkRequest): string {
  const contentType = request.responseHeaders?.find((header) => header.name.toLowerCase() === 'content-type')?.value
  return contentType?.split(';')[0] || '—'
}

function networkRequestTypeLabel(contentType: string): string {
  const normalizedType = contentType.toLowerCase()
  if (normalizedType === 'application/octet-stream') return 'Binary'
  if (normalizedType.includes('json')) return 'JSON'
  if (normalizedType.startsWith('image/')) return normalizedType.slice('image/'.length).toUpperCase()
  if (normalizedType.startsWith('text/')) return normalizedType.slice('text/'.length)
  return contentType
}

function compareNetworkRequestStartTimes(left: SessionNetworkRequest, right: SessionNetworkRequest): number {
  return getNetworkRequestStartMs(left) - getNetworkRequestStartMs(right)
}

function getNetworkRequestStartMs(request: SessionNetworkRequest): number {
  const timestampMs = Date.parse(request.startedAtUtc)
  return Number.isFinite(timestampMs) ? timestampMs : 0
}

function getNetworkTimelineBounds(requests: SessionNetworkRequest[]): NetworkTimelineBounds | null {
  const timings = requests
    .map((request): NetworkRequestTiming | null => {
      const startMs = getNetworkRequestStartMs(request)
      if (startMs <= 0) return null
      return {
        durationMs: Math.max(0, request.durationMilliseconds),
        startMs,
      }
    })
    .filter((timing): timing is NetworkRequestTiming => timing !== null)
  if (timings.length === 0) return null

  const startMs = Math.min(...timings.map((timing) => timing.startMs))
  const endMs = Math.max(...timings.map((timing) => timing.startMs + timing.durationMs))
  return {
    durationMs: Math.max(1, endMs - startMs),
    endMs,
    startMs,
  }
}

function getNetworkWaterfallStyle(request: SessionNetworkRequest, bounds: NetworkTimelineBounds): CSSProperties {
  const requestStartMs = getNetworkRequestStartMs(request)
  const leftPercent = clamp((requestStartMs - bounds.startMs) / bounds.durationMs * 100, 0, 100)
  const widthPercent = clamp(Math.max(0, request.durationMilliseconds) / bounds.durationMs * 100, 0, 100 - leftPercent)
  return {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
  }
}

function formatNetworkTimelineOffset(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0 ms'
  if (milliseconds >= 60_000) return `${(milliseconds / 60_000).toFixed(1)} min`
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`
  return `${Math.round(milliseconds)} ms`
}

function formatNetworkBody(body: SessionNetworkBody | null | undefined): string {
  if (!body || body.encoding === 'base64') return body?.data ?? ''
  const contentType = body.contentType?.toLowerCase() ?? ''
  const trimmedBody = body.data.trimStart()
  if (!contentType.includes('json') && !trimmedBody.startsWith('{') && !trimmedBody.startsWith('[')) return body.data

  try {
    return JSON.stringify(JSON.parse(body.data), null, 2)
  } catch {
    return body.data
  }
}

function formatOptionalBytes(bytes: number | null | undefined): string {
  return typeof bytes === 'number' && Number.isFinite(bytes) ? formatBytes(Math.max(0, bytes)) : '—'
}

function formatNetworkDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return '—'
  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(2)} s` : `${milliseconds.toFixed(1)} ms`
}

function TabButton({
  activeTab,
  badge,
  icon,
  label,
  onSelect,
  tab,
}: {
  activeTab: ViewerTab
  badge?: number
  icon: ReactNode
  label: string
  onSelect: (tab: ViewerTab) => void
  tab: ViewerTab
}) {
  const isActive = activeTab === tab
  return (
    <button aria-selected={isActive} className={isActive ? 'viewer-tab viewer-tab--active' : 'viewer-tab'} onClick={() => onSelect(tab)} role="tab" type="button">
      {icon}
      <span className="viewer-tab-label">{label}</span>
      {typeof badge === 'number' ? <span className="viewer-tab-badge">{badge}</span> : null}
    </button>
  )
}

function AnalysisSection({
  accessBlock,
  aiCapabilities,
  aiDurationFeedback,
  aiExtractions,
  aiForm,
  aiMessage,
  analyses,
  archivingAiRunId,
  hasCloudAiCapability,
  isAiLoading,
  isAiSubmitting,
  kind,
  onArchiveAiExtraction,
  onCreateAiExtraction,
  onRefreshAiExtractions,
  onToggleAiSourcePart,
  onToggleShowArchivedAiRuns,
  onUpdateAiForm,
  readOnlyAiExtractions,
  showArchivedAiRuns,
  sourcePartOptions,
  title,
}: {
  accessBlock: CloudAiAccessBlock | null
  aiCapabilities: SessionAiCapabilities | null
  aiDurationFeedback: SessionAiDurationFeedback | null
  aiExtractions: SessionAiExtractionSummary[]
  aiForm: SessionAiForm
  aiMessage: string | null
  analyses: SessionAnalysisRecord[]
  archivingAiRunId: string | null
  hasCloudAiCapability: boolean
  isAiLoading: boolean
  isAiSubmitting: boolean
  kind: SessionAiExtractionKind
  onArchiveAiExtraction: (run: SessionAiExtractionSummary, shouldArchive: boolean) => void
  onCreateAiExtraction: (kind: SessionAiExtractionKind) => void
  onRefreshAiExtractions: () => void
  onToggleAiSourcePart: (part: SessionAiSourcePart) => void
  onToggleShowArchivedAiRuns: () => void
  onUpdateAiForm: (updates: Partial<SessionAiForm>) => void
  readOnlyAiExtractions: boolean
  showArchivedAiRuns: boolean
  sourcePartOptions: SessionAiSourcePartOption[]
  title: string
}) {
  const [isCloudAiModalOpen, setIsCloudAiModalOpen] = useState(false)
  const hasAnalyses = analyses.length > 0
  const usesConfigurationModal = kind !== 'analysis'

  useEffect(() => {
    if (!isCloudAiModalOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsCloudAiModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCloudAiModalOpen])

  return (
    <div className="analysis-stack">
      <CloudAiResultsPanel
        accessBlock={accessBlock}
        aiDurationFeedback={aiDurationFeedback}
        aiExtractions={aiExtractions}
        aiMessage={aiMessage}
        archivingRunId={archivingAiRunId}
        isAiLoading={isAiLoading}
        isAiSubmitting={isAiSubmitting}
        kind={kind}
        onOpenExtraction={() => {
          if (usesConfigurationModal) {
            setIsCloudAiModalOpen(true)
            return
          }

          onCreateAiExtraction(kind)
        }}
        onRefreshAiExtractions={onRefreshAiExtractions}
        readOnly={readOnlyAiExtractions}
        showArchived={hasCloudAiCapability ? showArchivedAiRuns : false}
        title={title}
        onArchiveRun={onArchiveAiExtraction}
        onToggleShowArchived={onToggleShowArchivedAiRuns}
      />

      {hasAnalyses ? (
        <div className="analysis-list">
          {analyses.map((analysis, index) => (
            <article className="analysis-entry" key={analysis.analysisId || index}>
              <div>
                <p className="eyebrow">{analysis.analysisKind || 'Ansight analysis'}</p>
                <h3>{analysis.agentId || 'Ansight agent'}</h3>
                <span>{formatDateTime(analysis.completedUtc || analysis.startedUtc)}</span>
              </div>
              {analysis.finalResponse ? <MarkdownContent source={analysis.finalResponse} /> : <p className="muted">{analysis.statusMessage || 'No final response was captured.'}</p>}
              {analysis.mermaidDefinition ? <MermaidPreview definition={analysis.mermaidDefinition} /> : null}
            </article>
          ))}
        </div>
      ) : null}

      {isCloudAiModalOpen && usesConfigurationModal ? (
        <CloudAiExtractionModal
          aiCapabilities={aiCapabilities}
          aiDurationFeedback={aiDurationFeedback}
          aiExtractions={aiExtractions}
          aiForm={aiForm}
          aiMessage={aiMessage}
          archivingAiRunId={archivingAiRunId}
          isAiLoading={isAiLoading}
          isAiSubmitting={isAiSubmitting}
          kind={kind}
          onArchiveAiExtraction={onArchiveAiExtraction}
          onClose={() => setIsCloudAiModalOpen(false)}
          onCreateAiExtraction={onCreateAiExtraction}
          onRefreshAiExtractions={onRefreshAiExtractions}
          onToggleAiSourcePart={onToggleAiSourcePart}
          onToggleShowArchivedAiRuns={onToggleShowArchivedAiRuns}
          onUpdateAiForm={onUpdateAiForm}
          readOnlyAiExtractions={readOnlyAiExtractions}
          showArchivedAiRuns={showArchivedAiRuns}
          sourcePartOptions={sourcePartOptions}
          title={title}
        />
      ) : null}
    </div>
  )
}

function CloudAiResultsPanel({
  accessBlock,
  aiDurationFeedback,
  aiExtractions,
  aiMessage,
  archivingRunId,
  isAiLoading,
  isAiSubmitting,
  kind,
  onOpenExtraction,
  onRefreshAiExtractions,
  onArchiveRun,
  onToggleShowArchived,
  readOnly,
  showArchived,
  title,
}: {
  accessBlock: CloudAiAccessBlock | null
  aiDurationFeedback: SessionAiDurationFeedback | null
  aiExtractions: SessionAiExtractionSummary[]
  aiMessage: string | null
  archivingRunId: string | null
  isAiLoading: boolean
  isAiSubmitting: boolean
  kind: SessionAiExtractionKind
  onOpenExtraction: () => void
  onRefreshAiExtractions: () => void
  onArchiveRun: (run: SessionAiExtractionSummary, shouldArchive: boolean) => void
  onToggleShowArchived: () => void
  readOnly: boolean
  showArchived: boolean
  title: string
}) {
  const activeRuns = aiExtractions.filter(isActiveAiRun)
  const publishedRuns = aiExtractions.filter(isPublishedAiRun)
  const historyRuns = readOnly ? publishedRuns : aiExtractions
  const sectionTitle = kind === 'analysis' ? 'Session summaries' : 'Session flowcharts'
  const actionLabel = kind === 'analysis' ? 'Run summary' : 'New flowchart'
  const savedLabel = readOnly
    ? `${formatTokenCount(publishedRuns.length)} saved`
    : `${formatTokenCount(publishedRuns.length)} published`
  const activeLabel = activeRuns.length > 0 ? ` / ${formatTokenCount(activeRuns.length)} running` : ''
  const blocksDirectSummaryRun = kind === 'analysis' && aiDurationFeedback?.blocksSubmit === true

  return (
    <section className="cloud-ai-summary-panel" aria-label={`${title} AI results`}>
      <div className="cloud-ai-summary-heading">
        <div>
          <p className="eyebrow">Cloud AI</p>
          <h3>{sectionTitle}</h3>
          <span>{savedLabel}{activeLabel}</span>
        </div>
        <div className="cloud-ai-summary-actions">
          <button className="button button--secondary button--compact" disabled={isAiLoading} onClick={onRefreshAiExtractions} type="button">
            {isAiLoading ? <CircleNotch className="spin" aria-hidden="true" /> : <ArrowClockwise aria-hidden="true" />}
            Refresh
          </button>
          {!readOnly ? (
            <button className="button button--primary button--compact" disabled={isAiLoading || isAiSubmitting || blocksDirectSummaryRun} onClick={onOpenExtraction} type="button">
              {isAiSubmitting ? <CircleNotch className="spin" aria-hidden="true" /> : <Sparkle aria-hidden="true" />}
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>

      {aiMessage ? <p className="inline-message">{aiMessage}</p> : null}
      {kind === 'analysis' && aiDurationFeedback ? <p className="inline-message inline-message--warning cloud-ai-feedback">{aiDurationFeedback.message}</p> : null}
      {accessBlock ? <CloudAiAccessCallout block={accessBlock} /> : null}

      {activeRuns.length > 0 ? (
        <div className="cloud-ai-active-list" aria-label="Active AI extractions">
          {activeRuns.map((run) => (
            <article className="cloud-ai-active-card" key={run.id}>
              <div className="ai-run-heading">
                <div>
                  <p className="eyebrow">{formatSessionAiKind(run.kind)}</p>
                  <h3>{formatAiProvider(run.provider)} / {run.model}</h3>
                  <span>{formatDateTime(run.started_at || run.requested_at)}</span>
                </div>
                <span className={`status-pill ai-run-status ai-run-status--${run.status}`}>
                  {resolveRunStatusIcon(run.status)}
                  {run.status}
                </span>
              </div>
              <AiRunProgress run={run} />
            </article>
          ))}
        </div>
      ) : null}

      <AiExtractionHistory
        archivingRunId={archivingRunId}
        readOnly={readOnly}
        runs={historyRuns}
        showArchived={showArchived}
        onArchiveRun={onArchiveRun}
        onToggleShowArchived={onToggleShowArchived}
      />
    </section>
  )
}

function CloudAiExtractionModal({
  aiCapabilities,
  aiDurationFeedback,
  aiExtractions,
  aiForm,
  aiMessage,
  archivingAiRunId,
  isAiLoading,
  isAiSubmitting,
  kind,
  onArchiveAiExtraction,
  onClose,
  onCreateAiExtraction,
  onRefreshAiExtractions,
  onToggleAiSourcePart,
  onToggleShowArchivedAiRuns,
  onUpdateAiForm,
  readOnlyAiExtractions,
  showArchivedAiRuns,
  sourcePartOptions,
  title,
}: {
  aiCapabilities: SessionAiCapabilities | null
  aiDurationFeedback: SessionAiDurationFeedback | null
  aiExtractions: SessionAiExtractionSummary[]
  aiForm: SessionAiForm
  aiMessage: string | null
  archivingAiRunId: string | null
  isAiLoading: boolean
  isAiSubmitting: boolean
  kind: SessionAiExtractionKind
  onArchiveAiExtraction: (run: SessionAiExtractionSummary, shouldArchive: boolean) => void
  onClose: () => void
  onCreateAiExtraction: (kind: SessionAiExtractionKind) => void
  onRefreshAiExtractions: () => void
  onToggleAiSourcePart: (part: SessionAiSourcePart) => void
  onToggleShowArchivedAiRuns: () => void
  onUpdateAiForm: (updates: Partial<SessionAiForm>) => void
  readOnlyAiExtractions: boolean
  showArchivedAiRuns: boolean
  sourcePartOptions: SessionAiSourcePartOption[]
  title: string
}) {
  const titleId = useId()

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="session-info-modal cloud-ai-extraction-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Cloud AI</p>
            <h2 id={titleId}>{title} extraction</h2>
            <p className="muted">Configure sources, prompt, and provider before running a new pass.</p>
          </div>
          <button className="button button--secondary button--icon" onClick={onClose} type="button" aria-label="Close Cloud AI extraction">
            <X aria-hidden="true" />
          </button>
        </div>

        <CloudAiExtractionPanel
          aiCapabilities={aiCapabilities}
          aiDurationFeedback={aiDurationFeedback}
          aiExtractions={aiExtractions}
          aiForm={aiForm}
          aiMessage={aiMessage}
          archivingAiRunId={archivingAiRunId}
          isAiLoading={isAiLoading}
          isAiSubmitting={isAiSubmitting}
          kind={kind}
          onArchiveAiExtraction={onArchiveAiExtraction}
          onCreateAiExtraction={onCreateAiExtraction}
          onRefreshAiExtractions={onRefreshAiExtractions}
          onToggleAiSourcePart={onToggleAiSourcePart}
          onToggleShowArchivedAiRuns={onToggleShowArchivedAiRuns}
          onUpdateAiForm={onUpdateAiForm}
          readOnlyAiExtractions={readOnlyAiExtractions}
          showArchivedAiRuns={showArchivedAiRuns}
          showHeading={false}
          sourcePartOptions={sourcePartOptions}
          title={title}
        />
      </section>
    </div>
  )
}

function CloudAiExtractionPanel({
  aiCapabilities,
  aiDurationFeedback,
  aiExtractions,
  aiForm,
  aiMessage,
  archivingAiRunId,
  isAiLoading,
  isAiSubmitting,
  kind,
  onArchiveAiExtraction,
  onCreateAiExtraction,
  onRefreshAiExtractions,
  onToggleAiSourcePart,
  onToggleShowArchivedAiRuns,
  onUpdateAiForm,
  readOnlyAiExtractions,
  showHeading = true,
  showArchivedAiRuns,
  sourcePartOptions,
  title,
}: {
  aiCapabilities: SessionAiCapabilities | null
  aiDurationFeedback: SessionAiDurationFeedback | null
  aiExtractions: SessionAiExtractionSummary[]
  aiForm: SessionAiForm
  aiMessage: string | null
  archivingAiRunId: string | null
  isAiLoading: boolean
  isAiSubmitting: boolean
  kind: SessionAiExtractionKind
  onArchiveAiExtraction: (run: SessionAiExtractionSummary, shouldArchive: boolean) => void
  onCreateAiExtraction: (kind: SessionAiExtractionKind) => void
  onRefreshAiExtractions: () => void
  onToggleAiSourcePart: (part: SessionAiSourcePart) => void
  onToggleShowArchivedAiRuns: () => void
  onUpdateAiForm: (updates: Partial<SessionAiForm>) => void
  readOnlyAiExtractions: boolean
  showHeading?: boolean
  showArchivedAiRuns: boolean
  sourcePartOptions: SessionAiSourcePartOption[]
  title: string
}) {
  const promptInstructions = aiForm.kind === kind ? aiForm.promptInstructions : defaultPromptForSessionAiKind(kind)
  const configuredProvider = providerIsConfigured(aiCapabilities, aiForm.provider)
  const accessBlock = resolveCloudAiAccessBlock(kind, aiCapabilities, aiForm.provider)

  return (
    <section className={showHeading ? 'cloud-ai-panel' : 'cloud-ai-panel cloud-ai-panel--embedded'} aria-label="Cloud AI extraction">
      {showHeading ? (
        <div className="super-admin-section-heading">
          <div>
            <p className="eyebrow">Cloud AI</p>
            <h3>{title} extraction</h3>
          </div>
          {isAiLoading ? <CircleNotch className="spin subdued" aria-hidden="true" /> : <Sparkle className="subdued" aria-hidden="true" />}
        </div>
      ) : null}

      {aiMessage ? <p className="inline-message">{aiMessage}</p> : null}
      {accessBlock ? <CloudAiAccessCallout block={accessBlock} /> : null}

      <div className="cloud-ai-form">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Extraction</span>
            <span className="field-control">
              <Robot aria-hidden="true" />
              <strong>{formatSessionAiKind(kind)}</strong>
            </span>
          </label>
          <label className="field">
            <span className="field-label">Provider</span>
            <span className="field-control">
              <Sparkle aria-hidden="true" />
              <select
                disabled={isAiSubmitting}
                onChange={(event) => onUpdateAiForm({ provider: event.target.value as AiProvider })}
                value={aiForm.provider}
              >
                {aiProviders.map((provider) => (
                  <option disabled={!providerIsConfigured(aiCapabilities, provider.value)} key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Mode</span>
            <span className="field-control">
              <Sparkle aria-hidden="true" />
              <strong>Thorough</strong>
            </span>
          </label>
          <label className="field">
            <span className="field-label">Model</span>
            <span className="field-control">
              <Code aria-hidden="true" />
              <input
                disabled={isAiSubmitting}
                onChange={(event) => onUpdateAiForm({ model: event.target.value })}
                placeholder={defaultModelForProvider(aiForm.provider)}
                value={aiForm.model}
              />
            </span>
          </label>
          <div className="cloud-ai-limit">
            <Clock aria-hidden="true" />
            <span>
              {aiCapabilities
                ? `${formatDuration(secondsToMs(aiCapabilities.max_session_duration_seconds))} max session`
                : 'AI settings unavailable'}
            </span>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Slice start sec</span>
            <span className="field-control">
              <Clock aria-hidden="true" />
              <input
                disabled={isAiSubmitting}
                min={0}
                onChange={(event) => onUpdateAiForm({ sliceStartSeconds: event.target.value })}
                placeholder="Whole session"
                type="number"
                value={aiForm.sliceStartSeconds}
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Slice end sec</span>
            <span className="field-control">
              <Clock aria-hidden="true" />
              <input
                disabled={isAiSubmitting}
                min={0}
                onChange={(event) => onUpdateAiForm({ sliceEndSeconds: event.target.value })}
                placeholder="Whole session"
                type="number"
                value={aiForm.sliceEndSeconds}
              />
            </span>
          </label>
        </div>

        {aiDurationFeedback ? <p className="inline-message inline-message--warning cloud-ai-feedback">{aiDurationFeedback.message}</p> : null}

        <div className="source-part-grid" aria-label="Session sources">
          {sourcePartOptions.map((option) => {
            const isChecked = aiForm.sourceParts.includes(option.value)
            const isAvailable = option.count === undefined || option.count > 0
            return (
              <label className={isChecked ? 'source-part-option source-part-option--selected' : 'source-part-option'} key={option.value}>
                <input
                  checked={isChecked}
                  disabled={isAiSubmitting || !isAvailable}
                  onChange={() => onToggleAiSourcePart(option.value)}
                  type="checkbox"
                />
                <span>{resolveSourcePartIcon(option.value)}</span>
                <strong>{option.label}</strong>
                {option.count === undefined ? null : <small>{formatTokenCount(option.count)}</small>}
              </label>
            )
          })}
        </div>

        <div className="field cloud-ai-prompt-field">
          <span className="field-label-row">
            <label className="field-label" htmlFor="session-ai-prompt">
              Prompt
            </label>
            <button className="button button--secondary button--compact" disabled={isAiSubmitting} onClick={() => onUpdateAiForm({ kind, promptInstructions: defaultPromptForSessionAiKind(kind) })} type="button">
              <ArrowClockwise aria-hidden="true" />
              Reset
            </button>
          </span>
          <textarea
            className="textarea-control cloud-ai-prompt"
            disabled={isAiSubmitting}
            id="session-ai-prompt"
            maxLength={12000}
            onChange={(event) => onUpdateAiForm({ kind, promptInstructions: event.target.value })}
            rows={5}
            value={promptInstructions}
          />
          <span className="field-hint">{formatTokenCount(promptInstructions.length)} / 12,000 characters</span>
        </div>

        <div className="cloud-ai-actions">
          {!configuredProvider ? <span>{formatAiProvider(aiForm.provider)} key required</span> : aiDurationFeedback?.blocksSubmit ? <span>Session exceeds AI limit</span> : <span>Thorough / {formatSessionAiSourceParts(aiForm.sourceParts)}</span>}
          <button className="button button--secondary" disabled={isAiLoading} onClick={onRefreshAiExtractions} type="button">
            {isAiLoading ? <CircleNotch className="spin" aria-hidden="true" /> : <ArrowClockwise aria-hidden="true" />}
            Refresh
          </button>
          <button className="button button--primary" disabled={isAiSubmitting || isAiLoading} onClick={() => onCreateAiExtraction(kind)} type="button">
            {isAiSubmitting ? <CircleNotch className="spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
            {accessBlock ? 'Review access' : 'Run extraction'}
          </button>
        </div>
      </div>

      <AiExtractionHistory
        archivingRunId={archivingAiRunId}
        readOnly={readOnlyAiExtractions}
        runs={aiExtractions}
        showArchived={showArchivedAiRuns}
        onArchiveRun={onArchiveAiExtraction}
        onToggleShowArchived={onToggleShowArchivedAiRuns}
      />
    </section>
  )
}

function CloudAiAccessCallout({ block }: { block: CloudAiAccessBlock }) {
  const isExternalAction = /^https?:\/\//.test(block.actionHref)

  return (
    <section className={`cloud-ai-access-callout cloud-ai-access-callout--${block.tone}`} aria-label={block.title}>
      <div className="cloud-ai-access-copy">
        <span className="cloud-ai-access-icon" aria-hidden="true">
          <Sparkle />
        </span>
        <div>
          <p className="eyebrow">{block.eyebrow}</p>
          <h3>{block.title}</h3>
          <p>{block.message}</p>
        </div>
      </div>
      <a className="button button--primary" href={block.actionHref} rel={isExternalAction ? 'noreferrer noopener' : undefined} target={isExternalAction ? '_blank' : undefined}>
        <Sparkle aria-hidden="true" />
        {block.actionLabel}
      </a>
    </section>
  )
}

function AiExtractionHistory({
  archivingRunId,
  readOnly,
  runs,
  showArchived,
  onArchiveRun,
  onToggleShowArchived,
}: {
  archivingRunId: string | null
  readOnly: boolean
  runs: SessionAiExtractionSummary[]
  showArchived: boolean
  onArchiveRun: (run: SessionAiExtractionSummary, shouldArchive: boolean) => void
  onToggleShowArchived: () => void
}) {
  const [infoRun, setInfoRun] = useState<SessionAiExtractionSummary | null>(null)

  if (runs.length === 0) {
    return readOnly
      ? <EmptyState icon={<Robot aria-hidden="true" />} title="No saved AI output" message="Saved summaries and flowcharts will appear here when this session has published AI results." />
      : <EmptyState icon={<Coins aria-hidden="true" />} title="No cloud extractions" message="Token and cost records will appear after a cloud extraction runs." />
  }

  const archivedRuns = readOnly ? [] : runs.filter((run) => run.archived_at !== null)
  const visibleRuns = readOnly ? runs.filter(isPublishedAiRun) : showArchived ? runs : runs.filter((run) => run.archived_at === null)

  return (
    <div className="ai-run-list">
      <div className="ai-run-list-heading">
        <span>
          {readOnly
            ? `${formatTokenCount(visibleRuns.length)} saved`
            : `${showArchived ? `${formatTokenCount(runs.length)} passes` : `${formatTokenCount(visibleRuns.length)} visible`}${archivedRuns.length > 0 ? ` / ${formatTokenCount(archivedRuns.length)} archived` : ''}`}
        </span>
        {!readOnly && archivedRuns.length > 0 ? (
          <button className="button button--secondary button--compact" onClick={onToggleShowArchived} type="button">
            <Archive aria-hidden="true" />
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        ) : null}
      </div>

      {visibleRuns.length === 0 ? (
        <EmptyState icon={<Archive aria-hidden="true" />} title="Archived passes hidden" message="Show archived passes to inspect or restore them." />
      ) : null}

      {visibleRuns.map((run) => {
        const isArchived = run.archived_at !== null
        const isArchiving = archivingRunId === run.id
        return (
          <article className={isArchived ? 'ai-run-row ai-run-row--archived' : 'ai-run-row'} key={run.id}>
            <div className="ai-run-heading">
              <div>
                <p className="eyebrow">{formatSessionAiKind(run.kind)}</p>
                {!readOnly ? <h3>{formatAiProvider(run.provider)} / {run.model}</h3> : null}
                <span>{formatDateTime(run.completed_at || run.started_at || run.requested_at)}</span>
              </div>
              <div className="ai-run-status-actions">
                {!readOnly && isArchived ? (
                  <span className="status-pill ai-run-status ai-run-status--archived">
                    <Archive aria-hidden="true" />
                    archived
                  </span>
                ) : !readOnly ? (
                  <span className={`status-pill ai-run-status ai-run-status--${run.status}`}>
                    {resolveRunStatusIcon(run.status)}
                    {run.status}
                  </span>
                ) : null}
                {run.summary_markdown ? <CopyTextButton label="Copy markdown" text={run.summary_markdown} /> : null}
                {!readOnly ? (
                  <button className="button button--secondary button--compact" onClick={() => setInfoRun(run)} type="button">
                    <Info aria-hidden="true" />
                    Details
                  </button>
                ) : null}
                {!readOnly ? (
                  <button
                    className="button button--secondary button--compact"
                    disabled={isArchiving || isActiveAiRun(run)}
                    onClick={() => onArchiveRun(run, !isArchived)}
                    title={isActiveAiRun(run) ? 'Wait for the AI extraction to finish before archiving it.' : undefined}
                    type="button"
                  >
                    {isArchiving ? <CircleNotch className="spin" aria-hidden="true" /> : isArchived ? <ArrowCounterClockwise aria-hidden="true" /> : <Archive aria-hidden="true" />}
                    {isArchived ? 'Restore' : 'Archive'}
                  </button>
                ) : null}
              </div>
            </div>

            {isActiveAiRun(run) ? <AiRunProgress run={run} /> : null}

            {run.error_message ? <p className="inline-message">{run.error_message}</p> : null}
            {run.summary_markdown ? <MarkdownContent className="ai-run-output" showCopyAction={false} source={run.summary_markdown} /> : null}
            {run.mermaid_definition ? <MermaidPreview definition={run.mermaid_definition} /> : null}
            {run.warnings.length > 0 ? <p className="muted">{run.warnings.join(' | ')}</p> : null}
          </article>
        )
      })}

      {infoRun ? <AiExtractionInfoModal onClose={() => setInfoRun(null)} run={infoRun} /> : null}
    </div>
  )
}

function AiExtractionInfoModal({ onClose, run }: { onClose: () => void; run: SessionAiExtractionSummary }) {
  const titleId = useId()
  const diagnostics = getRecord(asRecord(run.result_json), 'ansightDiagnostics')
  const providerDiagnostics = getRecord(diagnostics, 'providerDiagnostics')
  const promptDiagnostics = getRecord(diagnostics, 'prompt')
  const policyDiagnostics = getRecord(diagnostics, 'policy')
  const turns = getRecordArray(providerDiagnostics, 'turns')
  const requestedImages = getRecordArray(providerDiagnostics, 'requestedImages')
  const providedImages = getRecordArray(providerDiagnostics, 'providedImages')
  const elapsedMs = getNumber(diagnostics, 'elapsedMs') ?? resolveAiExtractionElapsedMs(run)
  const roundTripCount = getNumber(diagnostics, 'providerRoundTripCount') ?? getNumber(providerDiagnostics, 'roundTripCount')
  const screenshotRequestRoundCount = getNumber(diagnostics, 'screenshotRequestRoundCount') ?? getNumber(providerDiagnostics, 'screenshotRequestRoundCount')
  const requestedImageCount = getNumber(diagnostics, 'imageRequestCount') ?? requestedImages.length
  const providedImageCount = getNumber(diagnostics, 'imageProvidedCount') ?? providedImages.length

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="session-info-modal ai-extraction-info-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{formatSessionAiKind(run.kind)}</p>
            <h2 id={titleId}>{formatAiProvider(run.provider)} / {run.model}</h2>
            <p className="muted">{formatDateTime(run.completed_at || run.started_at || run.requested_at)}</p>
          </div>
          <button className="button button--secondary button--icon" onClick={onClose} type="button" aria-label="Close AI extraction details">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="session-info-grid">
          <SessionInfoRow label="Status" value={run.status} />
          <SessionInfoRow label="Elapsed" value={formatPreciseDuration(elapsedMs)} icon={<Clock aria-hidden="true" />} />
          <SessionInfoRow label="Round trips" value={formatDiagnosticCount(roundTripCount)} />
          <SessionInfoRow label="Screenshot request rounds" value={formatDiagnosticCount(screenshotRequestRoundCount)} />
          <SessionInfoRow label="Images requested" value={formatDiagnosticCount(requestedImageCount)} icon={<ImageIcon aria-hidden="true" />} />
          <SessionInfoRow label="Images provided" value={formatDiagnosticCount(providedImageCount)} icon={<ImageIcon aria-hidden="true" />} />
          <SessionInfoRow label="Mode" value={formatSessionAiMode(run.analysis_mode)} />
          <SessionInfoRow label="Sources" value={formatSessionAiSourceParts(run.source_parts)} />
          <SessionInfoRow label="Started" value={formatDateTime(run.started_at || run.requested_at)} />
          <SessionInfoRow label="Completed" value={formatDateTime(run.completed_at)} />
          {run.archived_at ? <SessionInfoRow label="Archived" value={formatDateTime(run.archived_at)} /> : null}
        </div>

        <div className="session-info-section">
          <h3>Provider usage details</h3>
          <div className="ai-usage-grid" aria-label="AI provider usage details">
            <DetailRow label="Estimated customer charge" value={formatMoneyMicros(run.estimated_cost_micros, run.currency)} />
            <DetailRow label="Input" value={formatTokenCount(run.input_tokens)} />
            <DetailRow label="Output" value={formatTokenCount(run.output_tokens)} />
            <DetailRow label="Total" value={formatTokenCount(run.total_tokens)} />
            <DetailRow label="Metered" value={formatTokenCount(run.consumed_tokens)} />
            <DetailRow label="Cached" value={formatTokenCount(run.cached_input_tokens)} />
            <DetailRow label="Cache write" value={formatTokenCount(run.cache_write_tokens)} />
            <DetailRow label="Reasoning" value={formatTokenCount(run.reasoning_tokens)} />
            <DetailRow label="Prompt size" value={formatPromptSize(promptDiagnostics)} />
            <DetailRow label="Screenshot catalog" value={formatDiagnosticCount(getNumber(promptDiagnostics, 'screenshotCatalogCount'))} />
            <DetailRow label="Max wall clock" value={formatDuration(secondsToMs(getNumber(policyDiagnostics, 'maxExtractionWallClockSeconds')))} />
          </div>
        </div>

        <div className="session-info-section">
          <h3>Provider round trips</h3>
          {turns.length > 0 ? (
            <div className="ai-diagnostic-list">
              {turns.map((turn, index) => (
                <article className="ai-diagnostic-row" key={`${getString(turn, 'requestKind') ?? 'turn'}-${index}`}>
                  <h4>Round trip {index + 1}: {formatDiagnosticLabel(getString(turn, 'requestKind'))}</h4>
                  <div className="ai-diagnostic-meta">
                    <span>{formatPreciseDuration(getNumber(turn, 'durationMs'))}</span>
                    <span>{formatDiagnosticCount(getNumber(turn, 'imageCount'))} images</span>
                    <span>{formatBytes(getNumber(turn, 'imageBytes') ?? 0)}</span>
                    <span>{formatDiagnosticCount(getNumber(turn, 'outputTextLength'))} output chars</span>
                    {getBoolean(turn, 'finalOutput') ? <span>final output</span> : null}
                  </div>
                  {getArray(turn, 'imageFrameIds')?.length ? <p className="muted">{formatFrameIdList(getArray(turn, 'imageFrameIds') ?? [])}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Detailed provider round-trip diagnostics are available for newly generated extractions.</p>
          )}
        </div>

        <div className="session-info-section">
          <h3>Images</h3>
          <div className="ai-diagnostic-columns">
            <div>
              <h4>Requested</h4>
              {requestedImages.length > 0 ? renderImageRequestDiagnostics(requestedImages) : <p className="muted">No additional screenshots requested by the provider.</p>}
            </div>
            <div>
              <h4>Provided</h4>
              {providedImages.length > 0 ? renderImageDiagnostics(providedImages) : <p className="muted">No screenshot images were attached to this extraction.</p>}
            </div>
          </div>
        </div>

        {run.prompt_instructions ? (
          <div className="session-info-section">
            <h3>Prompt</h3>
            <pre className="json-block">{run.prompt_instructions}</pre>
          </div>
        ) : null}

        {diagnostics ? (
          <details className="session-info-section ai-diagnostics-raw">
            <summary>Raw diagnostics</summary>
            <pre className="json-block">{JSON.stringify(diagnostics, null, 2)}</pre>
          </details>
        ) : null}
      </section>
    </div>
  )
}

function renderImageRequestDiagnostics(requests: JsonRecord[]): ReactNode {
  const visibleRequests = requests.slice(0, 12)
  return (
    <div className="ai-diagnostic-list ai-diagnostic-list--compact">
      {visibleRequests.map((request, index) => {
        const frameId = getString(request, 'frameId') ?? 'Unknown frame'
        const reason = getString(request, 'reason')
        const provided = getBoolean(request, 'provided')
        const alreadyProvided = getBoolean(request, 'alreadyProvided')
        return (
          <article className="ai-diagnostic-row" key={`${frameId}-${index}`}>
            <h4>{frameId}</h4>
            <div className="ai-diagnostic-meta">
              <span>round {formatDiagnosticCount((getNumber(request, 'turnIndex') ?? 0) + 1)}</span>
              <span>{provided ? 'provided' : alreadyProvided ? 'already attached' : 'not provided'}</span>
            </div>
            {reason ? <p className="muted">{reason}</p> : null}
          </article>
        )
      })}
      {requests.length > visibleRequests.length ? <p className="muted">+{formatDiagnosticCount(requests.length - visibleRequests.length)} more requested screenshots</p> : null}
    </div>
  )
}

function renderImageDiagnostics(images: JsonRecord[]): ReactNode {
  const visibleImages = images.slice(0, 12)
  return (
    <div className="ai-diagnostic-list ai-diagnostic-list--compact">
      {visibleImages.map((image, index) => {
        const frameId = getString(image, 'frameId') ?? 'Unknown frame'
        const capturedAtUtc = getString(image, 'capturedAtUtc')
        return (
          <article className="ai-diagnostic-row" key={`${frameId}-${index}`}>
            <h4>{frameId}</h4>
            <div className="ai-diagnostic-meta">
              <span>{formatBytes(getNumber(image, 'byteLength') ?? 0)}</span>
              {getString(image, 'mediaType') ? <span>{getString(image, 'mediaType')}</span> : null}
              {capturedAtUtc ? <span>{formatDateTime(capturedAtUtc)}</span> : null}
            </div>
          </article>
        )
      })}
      {images.length > visibleImages.length ? <p className="muted">+{formatDiagnosticCount(images.length - visibleImages.length)} more attached screenshots</p> : null}
    </div>
  )
}

function resolveAiExtractionElapsedMs(run: SessionAiExtractionSummary): number | null {
  const startTimestamp = toTimestamp(run.started_at || run.requested_at)
  const endTimestamp = toTimestamp(run.completed_at || run.progress_updated_at)
  if (startTimestamp === null || endTimestamp === null || endTimestamp < startTimestamp) {
    return null
  }

  return endTimestamp - startTimestamp
}

function formatPromptSize(promptDiagnostics: JsonRecord | null): string {
  const systemPromptLength = getNumber(promptDiagnostics, 'systemPromptLength')
  const userPromptLength = getNumber(promptDiagnostics, 'userPromptLength')
  if (systemPromptLength === null && userPromptLength === null) {
    return 'Unknown'
  }

  return `${formatDiagnosticCount((systemPromptLength ?? 0) + (userPromptLength ?? 0))} chars`
}

function formatPreciseDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return 'Unknown'
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`
  }
  if (durationMs < 60_000) {
    const seconds = durationMs / 1_000
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
  }

  return formatDuration(durationMs)
}

function secondsToMs(seconds: number | null): number | null {
  return seconds === null ? null : seconds * 1000
}

function formatDiagnosticCount(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Unknown' : formatTokenCount(Math.trunc(value))
}

function formatDiagnosticLabel(value: string | null): string {
  if (!value) {
    return 'Unknown'
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function formatFrameIdList(values: unknown[]): string {
  const frameIds = values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const visibleFrameIds = frameIds.slice(0, 8)
  const suffix = frameIds.length > visibleFrameIds.length ? ` +${formatDiagnosticCount(frameIds.length - visibleFrameIds.length)} more` : ''
  return `Frames: ${visibleFrameIds.join(', ')}${suffix}`
}

function MarkdownContent({
  className,
  copyLabel = 'Copy markdown',
  showCopyAction = true,
  source,
}: {
  className?: string
  copyLabel?: string
  showCopyAction?: boolean
  source: string
}) {
  const markdownClassName = className ? `markdown-content ${className}` : 'markdown-content'

  return (
    <div className="copyable-analysis">
      {showCopyAction ? (
        <div className="copyable-analysis__actions">
          <CopyTextButton label={copyLabel} text={source} />
        </div>
      ) : null}
      <div className={markdownClassName}>
        <ReactMarkdown
          components={{
            code({ children, className: codeClassName }) {
              const code = String(children).replace(/\n$/, '')
              if (/\blanguage-mermaid\b/.test(codeClassName ?? '')) {
                return <MermaidPreview definition={code} />
              }

              return (
                <code className={codeClassName}>
                  {children}
                </code>
              )
            },
          }}
          remarkPlugins={[remarkGfm]}
          skipHtml
        >
          {source}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function CopyTextButton({ accessibleLabel, className, label, text }: { accessibleLabel?: string; className?: string; label: string; text: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const resetCopyStateTimerRef = useRef<number | null>(null)
  const buttonLabel = copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : label

  useEffect(() => {
    return () => {
      if (resetCopyStateTimerRef.current !== null) {
        window.clearTimeout(resetCopyStateTimerRef.current)
      }
    }
  }, [])

  function scheduleCopyStateReset(delayMs: number) {
    if (resetCopyStateTimerRef.current !== null) {
      window.clearTimeout(resetCopyStateTimerRef.current)
    }

    resetCopyStateTimerRef.current = window.setTimeout(() => {
      setCopyState('idle')
      resetCopyStateTimerRef.current = null
    }, delayMs)
  }

  async function handleCopy() {
    try {
      await copyTextToClipboard(text)
      setCopyState('copied')
      scheduleCopyStateReset(1800)
    } catch {
      setCopyState('failed')
      scheduleCopyStateReset(2400)
    }
  }

  return (
    <button
      aria-label={copyState === 'idle' ? accessibleLabel : buttonLabel}
      className={`button button--secondary button--compact copy-text-button copy-text-button--${copyState}${className ? ` ${className}` : ''}`}
      onClick={() => void handleCopy()}
      title={accessibleLabel}
      type="button"
    >
      {copyState === 'copied' ? <Check aria-hidden="true" /> : <ClipboardText aria-hidden="true" />}
      <span>{buttonLabel}</span>
    </button>
  )
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', 'true')
  textArea.style.position = 'fixed'
  textArea.style.top = '0'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.select()

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy was not available.')
    }
  } finally {
    document.body.removeChild(textArea)
  }
}

function MermaidPreview({ definition }: { definition: string }) {
  const reactId = useId()
  const diagramId = useMemo(() => `session-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactId])
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function renderDiagram() {
      setRenderedSvg(null)
      setRenderError(null)

      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
          themeVariables: {
            background: 'transparent',
            darkMode: true,
            fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            lineColor: '#64748b',
            mainBkg: '#111827',
            nodeBorder: '#475569',
            primaryColor: '#111827',
            primaryTextColor: '#f8fafc',
            secondaryColor: '#1f2937',
            tertiaryColor: '#0f172a',
          },
        })

        const renderId = `${diagramId}-${Date.now()}`
        const { svg } = await mermaid.render(renderId, definition)
        if (!cancelled) {
          setRenderedSvg(svg)
        }
      } catch (error) {
        if (!cancelled) {
          setRenderError(getErrorMessage(error, 'Unable to render Mermaid diagram.'))
        }
      }
    }

    void renderDiagram()

    return () => {
      cancelled = true
    }
  }, [definition, diagramId])

  return (
    <div className="mermaid-preview">
      <div className="copyable-analysis__actions">
        <CopyTextButton label="Copy Mermaid" text={definition} />
      </div>
      <div className="mermaid-preview__canvas">
        {renderedSvg ? (
          <div className="mermaid-preview__svg" dangerouslySetInnerHTML={{ __html: renderedSvg }} />
        ) : renderError ? (
          <p className="inline-message">{renderError}</p>
        ) : (
          <div className="mermaid-preview__loading">
            <CircleNotch className="spin" aria-hidden="true" />
            <span>Rendering Mermaid</span>
          </div>
        )}
      </div>
      <details className="mermaid-preview__source">
        <summary>Mermaid source</summary>
        <pre className="json-block">{definition}</pre>
      </details>
    </div>
  )
}

function AiRunProgress({ run }: { run: SessionAiExtractionSummary }) {
  const progressPercent = clamp(Number.isFinite(run.progress_percent) ? run.progress_percent : 0, 0, 100)

  return (
    <div className="ai-run-progress" aria-label="AI extraction progress">
      <div className="ai-run-progress-meta">
        <span>{formatAiRunProgressMessage(run)}</span>
        <strong>{progressPercent}%</strong>
      </div>
      <div className="ai-run-progress-track">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  )
}

function AnnotationsSection({
  annotations,
  canEdit,
  isSubmitting,
  onDeleteAnnotation,
  onEditAnnotation,
  onSelectAnnotation,
  selectedAnnotationId,
}: {
  annotations: SessionAnnotation[]
  canEdit: boolean
  isSubmitting: boolean
  onDeleteAnnotation: (annotationId: string) => void
  onEditAnnotation: (annotationId: string) => void
  onSelectAnnotation: (annotationId: string, focusMs: number | null) => void
  selectedAnnotationId: string | null
}) {
  const annotationViews = useMemo(() => annotations.map(buildAnnotationView), [annotations])
  const selectedAnnotation = annotationViews.find((annotation) => annotation.id === selectedAnnotationId) ?? annotationViews[0] ?? null

  if (annotationViews.length === 0) {
    return <EmptyState icon={<NotePencil aria-hidden="true" />} title="No annotations" message="This session did not include annotations." />
  }

  return (
    <div className="annotations-panel">
      <div className="annotation-card-strip" role="listbox" aria-label="Annotations">
        {annotationViews.map((annotation) => {
          const isSelected = annotation.id === selectedAnnotation?.id
          return (
            <button
              aria-selected={isSelected}
              className={isSelected ? 'annotation-card annotation-card--selected' : 'annotation-card'}
              key={annotation.id}
              onClick={() => onSelectAnnotation(annotation.id, annotation.focusMs)}
              role="option"
              type="button"
            >
              <span className="annotation-card-icon">
                {annotation.hasTarget ? <TreeStructure aria-hidden="true" /> : <NotePencil aria-hidden="true" />}
              </span>
              <span className="annotation-card-body">
                <strong>{annotation.label}</strong>
                <span>{annotation.timeDisplay}</span>
                <small>{annotation.notesPreview}</small>
              </span>
            </button>
          )
        })}
      </div>

      {selectedAnnotation ? (
        <article className="annotation-detail-card">
          <div className="annotation-detail-heading">
            <span className="annotation-detail-icon">
              {selectedAnnotation.hasTarget ? <TreeStructure aria-hidden="true" /> : <NotePencil aria-hidden="true" />}
            </span>
            <div>
              <h3>{selectedAnnotation.label}</h3>
              <span>{selectedAnnotation.timeDisplay}</span>
            </div>
            {canEdit ? (
              <div className="annotation-detail-actions">
                <button className="button button--secondary button--compact" disabled={isSubmitting} onClick={() => onEditAnnotation(selectedAnnotation.id)} type="button">
                  <NotePencil aria-hidden="true" />
                  Edit
                </button>
                <button className="button button--danger button--compact" disabled={isSubmitting} onClick={() => onDeleteAnnotation(selectedAnnotation.id)} type="button">
                  <Trash aria-hidden="true" />
                  Delete
                </button>
              </div>
            ) : null}
          </div>

          <div className="annotation-detail-meta">
            <span>{selectedAnnotation.durationDisplay}</span>
            <span>{selectedAnnotation.geometrySummary}</span>
            {selectedAnnotation.targetSummary ? <span>{selectedAnnotation.targetSummary}</span> : null}
          </div>

          {selectedAnnotation.hasNotes ? <p className="annotation-notes">{selectedAnnotation.notes}</p> : null}

          {selectedAnnotation.targetSummary ? (
            <div className="annotation-target">
              <span>Target</span>
              <strong>{selectedAnnotation.targetSummary}</strong>
              {selectedAnnotation.targetDetail ? <small>{selectedAnnotation.targetDetail}</small> : null}
            </div>
          ) : null}
        </article>
      ) : null}
    </div>
  )
}

function AnnotationEditorModal({
  draft,
  isSubmitting,
  onClose,
  onDelete,
  onSave,
}: {
  draft: AnnotationEditorDraft
  isSubmitting: boolean
  onClose: () => void
  onDelete?: (annotationId: string) => void
  onSave: (annotation: SessionAnnotation) => void
}) {
  const [comment, setComment] = useState(() => buildAnnotationComment(draft.annotation))
  const normalizedComment = normalizeAnnotationComment(comment)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!normalizedComment) {
      return
    }

    const lineBreakIndex = normalizedComment.indexOf('\n')
    const label = (lineBreakIndex < 0 ? normalizedComment : normalizedComment.slice(0, lineBreakIndex)).trim()
    const notes = lineBreakIndex < 0 ? null : normalizeAnnotationComment(normalizedComment.slice(lineBreakIndex + 1))
    const customData = { ...(draft.annotation.customData ?? {}) }
    delete customData['ansight.agentAction']
    onSave({
      ...draft.annotation,
      label,
      notes,
      source: draft.annotation.source || 'localPortal',
      customData: Object.keys(customData).length > 0 ? customData : null,
    })
  }

  const startMs = toTimestamp(draft.annotation.startUtc)
  const endMs = toTimestamp(draft.annotation.endUtc)
  const timeDisplay = startMs === null
    ? 'Current session position'
    : endMs !== null && endMs > startMs
      ? `${formatDateTimeFromMs(startMs)} – ${formatDateTimeFromMs(endMs)}`
      : formatDateTimeFromMs(startMs)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="session-info-modal annotation-editor-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-heading">
          <h2>{draft.annotation.label?.trim() ? 'Edit annotation' : 'Add annotation'}</h2>
          <button aria-label="Close annotation editor" className="annotation-editor-close" disabled={isSubmitting} onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="annotation-editor-body">
          <p className="annotation-editor-time"><Clock aria-hidden="true" />{timeDisplay}</p>
          <label className="annotation-comment-field">
            <span>Comment <strong>required</strong></span>
            <textarea
              autoFocus
              aria-keyshortcuts="Meta+Enter"
              disabled={isSubmitting}
              onChange={(event) => setComment(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !event.metaKey || event.repeat || event.nativeEvent.isComposing || isSubmitting || !normalizedComment) {
                  return
                }

                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }}
              placeholder="Describe the issue…"
              rows={7}
              value={comment}
            />
          </label>
        </div>

        <div className="annotation-editor-actions">
          {onDelete && draft.annotation.annotationId ? (
            <button className="button button--danger" disabled={isSubmitting} onClick={() => onDelete(draft.annotation.annotationId!)} type="button">
              <Trash aria-hidden="true" />
              Delete
            </button>
          ) : <span />}
          <div>
            <button className="button button--secondary" disabled={isSubmitting} onClick={onClose} type="button">Cancel</button>
            <button className="button button--primary" disabled={isSubmitting || !normalizedComment} type="submit">
              {isSubmitting ? <CircleNotch className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              Save annotation
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function AttachmentsSection({
  attachments,
  canAttach,
  currentUserId,
  draftFile,
  draftName,
  draftNotes,
  fileInputRef,
  isLoading,
  isSignedIn,
  isSubmitting,
  limits,
  message,
  onDeleteAttachment,
  onOpenAttachment,
  onRefresh,
  onSubmit,
  onUpdateDraftFile,
  onUpdateDraftName,
  onUpdateDraftNotes,
}: {
  attachments: SessionAttachment[]
  canAttach: boolean
  currentUserId: string | null
  draftFile: File | null
  draftName: string
  draftNotes: string
  fileInputRef: RefObject<HTMLInputElement | null>
  isLoading: boolean
  isSignedIn: boolean
  isSubmitting: boolean
  limits: TeamAttachmentLimits
  message: string | null
  onDeleteAttachment: (attachment: SessionAttachment) => void
  onOpenAttachment: (attachment: SessionAttachment) => void
  onRefresh: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onUpdateDraftFile: (file: File | null) => void
  onUpdateDraftName: (value: string) => void
  onUpdateDraftNotes: (value: string) => void
}) {
  const totalBytes = attachments.reduce((total, attachment) => total + Math.max(0, attachment.byte_size), 0)
  const canSubmit =
    canAttach &&
    !!draftFile &&
    draftFile.size <= limits.maxFileBytes &&
    totalBytes + draftFile.size <= limits.maxTotalBytes &&
    !!draftName.trim() &&
    !isSubmitting

  return (
    <div className="attachments-panel">
      <div className="attachments-heading">
        <div>
          <p className="eyebrow">Session context</p>
          <h3>Attachments</h3>
          <span>{formatBytes(totalBytes)} of {formatBytes(limits.maxTotalBytes)}</span>
        </div>
        <button className="button button--secondary button--icon" disabled={isLoading} onClick={onRefresh} title="Refresh attachments" type="button">
          {isLoading ? <CircleNotch className="spin" aria-hidden="true" /> : <ArrowClockwise aria-hidden="true" />}
        </button>
      </div>

      {message ? <p className="inline-message">{message}</p> : null}

      {canAttach ? (
        <form className="attachment-form" onSubmit={onSubmit}>
          <label>
            <span>Name</span>
            <input maxLength={120} onChange={(event) => onUpdateDraftName(event.target.value)} required type="text" value={draftName} />
          </label>
          <label>
            <span>Notes</span>
            <textarea maxLength={4000} onChange={(event) => onUpdateDraftNotes(event.target.value)} rows={3} value={draftNotes} />
          </label>
          <label>
            <span>File</span>
            <input
              ref={fileInputRef}
              onChange={(event) => onUpdateDraftFile(event.target.files?.[0] ?? null)}
              required
              type="file"
            />
          </label>
          <div className="attachment-form-actions">
            <span>
              {draftFile
                ? `${draftFile.name} - ${formatBytes(draftFile.size)} of ${formatBytes(limits.maxFileBytes)} max`
                : `No file selected - ${formatBytes(limits.maxFileBytes)} max`}
            </span>
            <button className="button button--primary button--compact" disabled={!canSubmit} type="submit">
              {isSubmitting ? <CircleNotch className="spin" aria-hidden="true" /> : <UploadSimple aria-hidden="true" />}
              Add
            </button>
          </div>
        </form>
      ) : (
        <p className="inline-message">
          {isSignedIn ? 'Team membership is required to add attachments.' : 'Sign in to add attachments.'}
        </p>
      )}

      {attachments.length === 0 ? (
        <EmptyState icon={<Paperclip aria-hidden="true" />} title="No attachments" message="This session has no attached files." />
      ) : (
        <div className="attachment-list">
          {attachments.map((attachment) => {
            const canDelete = !!currentUserId && attachment.uploaded_by_user_id === currentUserId
            return (
              <article className="attachment-card" key={attachment.id}>
                <span className="attachment-card-icon">
                  <FileText aria-hidden="true" />
                </span>
                <div>
                  <strong>{attachment.name}</strong>
                  <span>{attachment.original_file_name || attachment.storage_path}</span>
                  <small>{formatBytes(attachment.byte_size)} - {formatDateTime(attachment.created_at)}</small>
                  {attachment.notes ? <p>{attachment.notes}</p> : null}
                </div>
                <div className="attachment-card-actions">
                  <button className="button button--secondary button--compact" onClick={() => onOpenAttachment(attachment)} type="button">
                    Open
                  </button>
                  {canDelete ? (
                    <button className="button button--secondary button--icon attachment-delete-button" onClick={() => onDeleteAttachment(attachment)} title="Delete attachment" type="button">
                      <Trash aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ArtifactsSection({
  artifactComparison,
  artifactDownloadCommand,
  artifactFileOperations,
  artifactSnapshots,
  onSelectSnapshot,
  queryArtifactDatabase,
  readArtifactFile,
  selectedArtifactSnapshot,
  sessionId,
}: {
  artifactFileOperations?: ArtifactFileOperations
  artifactComparison?: ArtifactComparisonSource
  artifactDownloadCommand?: string
  artifactSnapshots: SessionArtifactSnapshot[]
  onSelectSnapshot: (snapshot: SessionArtifactSnapshot) => void
  queryArtifactDatabase?: SessionViewerSource['queryArtifactDatabase']
  readArtifactFile?: SessionViewerSource['readArtifactFile']
  selectedArtifactSnapshot: SessionArtifactSnapshot | null
  sessionId: string
}) {
  const [selectedArtifactEntry, setSelectedArtifactEntry] = useState<SessionArtifactEntry | null>(null)
  const [artifactContent, setArtifactContent] = useState<SessionLiveFileContent | null>(null)
  const [artifactMessage, setArtifactMessage] = useState<string | null>(null)
  const [isReadingArtifact, setIsReadingArtifact] = useState(false)
  const [isArtifactFullscreen, setIsArtifactFullscreen] = useState(false)
  const [isLargeFileAwaitingConfirmation, setIsLargeFileAwaitingConfirmation] = useState(false)
  const artifactModalRef = useRef<HTMLElement>(null)
  const artifactReadId = useRef(0)
  function closeArtifactEntry() {
    artifactReadId.current += 1
    setIsArtifactFullscreen(false)
    setSelectedArtifactEntry(null)
    setArtifactContent(null)
    setArtifactMessage(null)
    setIsReadingArtifact(false)
    setIsLargeFileAwaitingConfirmation(false)
  }
  useEffect(() => {
    if (!selectedArtifactEntry) {
      return
    }

    if (isArtifactFullscreen) {
      document.body.classList.add('artifact-file-fullscreen-open')
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isArtifactFullscreen) {
          setIsArtifactFullscreen(false)
          return
        }
        closeArtifactEntry()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const searchInput = Array.from(artifactModalRef.current?.querySelectorAll<HTMLInputElement>('.file-text-search input') ?? [])
          .find((input) => input.getClientRects().length > 0)
        if (searchInput) {
          event.preventDefault()
          searchInput.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('artifact-file-fullscreen-open')
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isArtifactFullscreen, selectedArtifactEntry])
  if (artifactSnapshots.length === 0 && !artifactComparison) {
    return (
      <EmptyState
        icon={<Archive aria-hidden="true" />}
        title="No artifacts"
        message={(
          <>
            This session did not include any{' '}
            <a href="https://www.ansight.ai/docs/sdk/dotnet/artifacts" rel="noreferrer" target="_blank">artifact snapshots</a>.
          </>
        )}
      />
    )
  }

  const snapshot = selectedArtifactSnapshot ?? artifactSnapshots[0] ?? null
  const entries = sortArtifactEntries(snapshot?.entries ?? [])
  const selectedArtifactPath = selectedArtifactEntry ? formatArtifactEntryPath(selectedArtifactEntry) : ''
  const selectedArtifactName = selectedArtifactEntry?.name || selectedArtifactPath
  const showSelectedArtifactPath = !!selectedArtifactPath && selectedArtifactPath !== selectedArtifactName

  function selectSnapshot(candidate: SessionArtifactSnapshot) {
    closeArtifactEntry()
    onSelectSnapshot(candidate)
    const files = (candidate.entries ?? []).filter((entry) => !isArtifactDirectory(entry))
    if (files.length === 1) void openArtifactEntry(files[0], false, false, candidate)
  }

  async function openArtifactEntry(
    entry: SessionArtifactEntry,
    forceText = false,
    allowLargeFile = false,
    targetSnapshot = snapshot,
  ) {
    if (!targetSnapshot || !readArtifactFile || isArtifactDirectory(entry)) {
      return
    }
    const readId = ++artifactReadId.current
    const path = formatArtifactEntryPath(entry)
    if (entry !== selectedArtifactEntry) {
      setIsArtifactFullscreen(false)
    }
    setSelectedArtifactEntry(entry)
    setArtifactContent(null)
    setArtifactMessage(null)
    setIsReadingArtifact(false)
    const isStreamingMedia = !forceText && resolveMediaFileFormat(entry.name || path, entry.mimeType, entry.fileExtension) !== null
    if (!allowLargeFile && !isStreamingMedia && isLargeFilePreview(entry.sizeBytes)) {
      setIsLargeFileAwaitingConfirmation(true)
      return
    }

    setIsLargeFileAwaitingConfirmation(false)
    setIsReadingArtifact(true)
    try {
      const content = await readArtifactFile(
        sessionId,
        targetSnapshot.snapshotId || null,
        path,
        forceText,
        allowLargeFile,
      )
      if (artifactReadId.current === readId) setArtifactContent(content)
    } catch (error) {
      if (artifactReadId.current === readId) setArtifactMessage(getErrorMessage(error, `Unable to read ${entry.name || path}.`))
    } finally {
      if (artifactReadId.current === readId) setIsReadingArtifact(false)
    }
  }

  return (
    <>
      <div className={artifactComparison ? "artifacts-panel artifacts-panel--comparison" : "artifacts-panel"}>
      {artifactDownloadCommand ? (
        <div className="artifact-local-exploration-callout">
          <Info aria-hidden="true" />
          <div>
            <strong>Need the complete artifact workspace?</strong>
            <span>JSON, XML, logs, and other text files can be previewed here. Sync this session from the local player for databases, comparisons, app-specific viewers, and native file actions, or download it with the CLI.</span>
            <code>{artifactDownloadCommand}</code>
          </div>
          <CopyTextButton accessibleLabel="Copy session download command" label="Copy command" text={artifactDownloadCommand} />
        </div>
      ) : null}
      {snapshot && !artifactComparison ? <div className="artifact-snapshot-list" aria-label="Artifact snapshots">
        {artifactSnapshots.map((candidate, index) => {
          const isSelected = candidate === snapshot
          return (
            <button
              aria-pressed={isSelected}
              className={isSelected ? 'artifact-snapshot-card artifact-snapshot-card--selected' : 'artifact-snapshot-card'}
              key={resolveArtifactSnapshotKey(candidate, index)}
              onClick={() => selectSnapshot(candidate)}
              type="button"
            >
              <strong>{formatArtifactSnapshotTitle(candidate)}</strong>
              <span>{formatDateTime(candidate.capturedAtUtc)}</span>
              <small>{formatArtifactSnapshotSummary(candidate)}</small>
            </button>
          )
        })}
      </div> : null}

      {snapshot ? <div className={selectedArtifactEntry ? 'artifact-browser artifact-browser--preview-open' : 'artifact-browser'}>
        <div className="artifact-browser-heading">
          <div>
            <p className="eyebrow">{snapshot.rootAlias || 'Artifacts'}</p>
            <h3>{formatArtifactSnapshotTitle(snapshot)}</h3>
            <span>{formatArtifactSnapshotPath(snapshot)}</span>
          </div>
          <span className="status-pill">{formatArtifactSnapshotSummary(snapshot)}</span>
        </div>

        {snapshot.truncated ? <p className="inline-message">This artifact snapshot was truncated before every entry could be captured.</p> : null}

        {entries.length === 0 ? (
          <EmptyState icon={<Archive aria-hidden="true" />} title="No artifact entries" message="The snapshot metadata was captured without a file listing." />
        ) : (
          <div className="artifact-entry-list">
            {entries.map((entry, index) => {
              const isDirectory = isArtifactDirectory(entry)
              const entryPath = formatArtifactEntryPath(entry)
              const rowContent = <>
                  <span className={isDirectory ? 'artifact-entry-icon artifact-entry-icon--directory' : 'artifact-entry-icon'}>
                    {isDirectory ? <Archive aria-hidden="true" /> : <FileText aria-hidden="true" />}
                  </span>
                  <div>
                    <strong>{entry.name || formatArtifactEntryPath(entry)}</strong>
                    <small>{formatArtifactEntryDetail(entry)}</small>
                  </div>
                  {!artifactFileOperations || entryPath !== entry.name ? <code>{entryPath}</code> : null}
                </>
              const key = `${entry.snapshotRelativePath ?? entry.relativePath ?? entry.name ?? 'entry'}-${index}`
              const entryRow = isDirectory || !readArtifactFile ? (
                <div className="artifact-entry-row" key={key}>{rowContent}</div>
              ) : (
                <button
                  className={selectedArtifactEntry === entry ? 'artifact-entry-row artifact-entry-row--selected' : 'artifact-entry-row'}
                  key={key}
                  onClick={() => void openArtifactEntry(entry)}
                  type="button"
                >{rowContent}</button>
              )
              return !isDirectory && artifactFileOperations ? (
                <div className="artifact-entry-item" key={key}>
                  {entryRow}
                  <ArtifactFileActions
                    fileName={entry.name || entryPath}
                    operations={artifactFileOperations}
                    target={{ sessionId, snapshotId: snapshot.snapshotId || null, path: entryPath }}
                  />
                </div>
              ) : entryRow
            })}
          </div>
        )}

      {selectedArtifactEntry ? (
          <section
            aria-label={`Artifact file ${selectedArtifactEntry.name || formatArtifactEntryPath(selectedArtifactEntry)}`}
            className={isArtifactFullscreen ? 'artifact-file-modal artifact-file-modal--fullscreen' : 'artifact-file-modal artifact-file-modal--inline'}
            ref={artifactModalRef}
            role="region"
          >
            <div className="artifact-file-modal-heading">
              <div>
                <p className="eyebrow">Artifact contents</p>
                <h2>{selectedArtifactName}</h2>
                {showSelectedArtifactPath ? <span>{selectedArtifactPath}</span> : null}
              </div>
              <div className="artifact-file-modal-actions">
                {artifactFileOperations ? (
                  <ArtifactFileActions
                    fileName={selectedArtifactName}
                    key={selectedArtifactPath}
                    operations={artifactFileOperations}
                    target={{ sessionId, snapshotId: snapshot.snapshotId || null, path: selectedArtifactPath }}
                  />
                ) : null}
                <button
                  aria-label={isArtifactFullscreen ? 'Exit full screen' : 'View full screen'}
                  className="button button--secondary button--icon"
                  onClick={() => setIsArtifactFullscreen((current) => !current)}
                  title={isArtifactFullscreen ? 'Exit full screen' : 'View full screen'}
                  type="button"
                >
                  {isArtifactFullscreen ? <ArrowsIn aria-hidden="true" /> : <ArrowsOut aria-hidden="true" />}
                </button>
                <button
                  aria-label="Close artifact contents"
                  className="button button--secondary button--icon"
                  onClick={closeArtifactEntry}
                  title="Close artifact contents"
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="artifact-file-modal-content">
              {artifactMessage ? <p className="inline-message">{artifactMessage}</p> : null}
              {isLargeFileAwaitingConfirmation ? (
                <LargeFilePreviewWarning
                  fileName={selectedArtifactName}
                  onCancel={closeArtifactEntry}
                  onOpen={() => void openArtifactEntry(selectedArtifactEntry, false, true)}
                  sizeBytes={selectedArtifactEntry.sizeBytes ?? 0}
                />
              ) : isReadingArtifact ? (
                <div className="live-file-download-progress" role="status">
                  <CircleNotch className="spin" aria-hidden="true" />
                  <strong>Reading {selectedArtifactEntry.name || 'artifact'}…</strong>
                  <span>{selectedArtifactEntry.sizeBytes ? formatBytes(selectedArtifactEntry.sizeBytes) : 'Loading captured contents…'}</span>
                  <progress aria-label={`Read progress for ${selectedArtifactEntry.name || 'artifact'}`} />
                </div>
              ) : artifactContent ? (
                <>
                  <ArtifactFileDetails content={artifactContent} entry={selectedArtifactEntry} snapshot={snapshot} />
                  <FileContentPreview
                    allowFullscreen={false}
                    content={artifactContent}
                    entry={{
                      name: selectedArtifactName,
                      relativePath: selectedArtifactPath,
                      rootAlias: selectedArtifactEntry.rootAlias || snapshot.rootAlias || 'artifacts',
                      kind: selectedArtifactEntry.kind || 'file',
                      sizeBytes: selectedArtifactEntry.sizeBytes,
                      fileExtension: selectedArtifactEntry.fileExtension,
                      mimeType: selectedArtifactEntry.mimeType,
                      lastModifiedUtc: selectedArtifactEntry.lastModifiedUtc,
                    }}
                    hideIdentity
                    key={`${snapshot.snapshotId ?? ''}:${selectedArtifactPath}`}
                    onOpenFullFile={() => void openArtifactEntry(selectedArtifactEntry, false, true)}
                    onViewAsText={() => void openArtifactEntry(
                      selectedArtifactEntry,
                      true,
                      isLargeFilePreview(selectedArtifactEntry.sizeBytes),
                    )}
                    queryDatabase={queryArtifactDatabase
                      ? (sql, maxRows) => queryArtifactDatabase(
                          sessionId,
                          snapshot.snapshotId || null,
                          selectedArtifactPath,
                          sql,
                          maxRows,
                        )
                      : undefined}
                  />
                </>
              ) : null}
            </div>
          </section>
      ) : null}
      </div> : null}
      </div>
    </>
  )
}

function ArtifactFileDetails({
  content,
  entry,
  snapshot,
}: {
  content: SessionLiveFileContent
  entry: SessionArtifactEntry
  snapshot: SessionArtifactSnapshot
}) {
  const details = content.artifactDetails
  const displaySizeBytes = content.sizeBytes && content.sizeBytes > 0
    ? content.sizeBytes
    : entry.sizeBytes ?? 0
  const contentType = content.mimeType || content.contentType || entry.mimeType || 'application/octet-stream'
  const entryPath = formatArtifactEntryPath(entry)

  return (
    <details className="artifact-file-details">
      <summary>
        <span>
          <strong>Artifact details</strong>
          <small>{formatBytes(displaySizeBytes)} · {contentType}</small>
        </span>
      </summary>
      <dl className="artifact-file-details-grid">
        <div>
          <dt>Downloaded</dt>
          <dd>{formatDateTime(details?.downloadedAtUtc || entry.lastModifiedUtc)}</dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{formatDateTime(snapshot.capturedAtUtc)}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(displaySizeBytes)}</dd>
        </div>
        <div>
          <dt>Content type</dt>
          <dd>{contentType}</dd>
        </div>
        <div className="artifact-file-details-wide">
          <dt>Path</dt>
          <dd><code>{entryPath}</code></dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{snapshot.source || entry.rootAlias || 'Unknown'}</dd>
        </div>
        <div>
          <dt>Snapshot ID</dt>
          <dd><code>{snapshot.snapshotId || 'Unknown'}</code></dd>
        </div>
        <div className="artifact-file-details-wide">
          <dt>SHA-256</dt>
          <dd><code>{details?.sha256 || 'Not available'}</code></dd>
        </div>
        <div className="artifact-file-details-wide">
          <dt>SHA-1</dt>
          <dd><code>{details?.sha1 || 'Not available'}</code></dd>
        </div>
        <div className="artifact-file-details-wide">
          <dt>MD5</dt>
          <dd><code>{details?.md5 || 'Not available'}</code></dd>
        </div>
      </dl>
    </details>
  )
}

function FilesSection({
  captureLiveFile,
  externalCapture,
  isLiveSession,
  listLiveFiles,
  queryLiveDatabase,
  readLiveFile,
  sessionId,
}: {
  captureLiveFile?: SessionViewerSource['captureLiveFile']
  externalCapture: boolean
  isLiveSession: boolean
  listLiveFiles?: SessionViewerSource['listLiveFiles']
  queryLiveDatabase?: SessionViewerSource['queryLiveDatabase']
  readLiveFile?: SessionViewerSource['readLiveFile']
  sessionId: string
}) {
  if (!isLiveSession) {
    return <EmptyState icon={<FileText aria-hidden="true" />} title="Files unavailable" message="Start a live capture to browse this app’s sandbox. Files saved to the timeline remain available under Artifacts." />
  }

  if (!listLiveFiles || !readLiveFile) {
    return <EmptyState icon={<FileText aria-hidden="true" />} title="Files unavailable" message="This session does not support live file browsing." />
  }

  return (
    <div className="files-panel">
      <LiveSessionFileExplorer
        captureFile={captureLiveFile}
        externalCapture={externalCapture}
        listFiles={listLiveFiles}
        queryDatabase={queryLiveDatabase}
        readFile={readLiveFile}
        sessionId={sessionId}
      />
    </div>
  )
}

function VisualTreeSection({
  onSelectOverlay,
  onSelectSnapshot,
  selectedFrame,
  selectedVisualTree,
  visualTrees,
}: {
  onSelectOverlay: (selection: VisualTreeOverlaySelection | null) => void
  onSelectSnapshot: (snapshot: SessionVisualTreeSnapshot) => void
  selectedFrame: SessionImageFrame | null
  selectedVisualTree: SessionVisualTreeSnapshot | null
  visualTrees: SessionVisualTreeSnapshot[]
}) {
  if (!selectedVisualTree) {
    return <EmptyState icon={<Code aria-hidden="true" />} title="No visual tree" message="No visual tree snapshots were captured for this session." />
  }

  const snapshotId = selectedVisualTree.snapshotId

  return (
    <div className="visual-tree-panel">
      <div aria-label="Captured visual trees" className="visual-tree-snapshot-list">
        {visualTrees.map((snapshot, index) => {
          const snapshotKey = resolveVisualTreeSnapshotKey(snapshot)
          const isSelected = snapshotKey === resolveVisualTreeSnapshotKey(selectedVisualTree)
          return (
            <button
              aria-pressed={isSelected}
              className={isSelected ? 'visual-tree-snapshot-card visual-tree-snapshot-card--selected' : 'visual-tree-snapshot-card'}
              key={`${snapshotKey}-${index}`}
              onClick={() => onSelectSnapshot(snapshot)}
              type="button"
            >
              <strong>Snapshot {index + 1}</strong>
              <span>{formatDateTime(snapshot.capturedAtUtc)}</span>
              <small>{formatVisualTreeSnapshotSummary(snapshot)}</small>
            </button>
          )
        })}
      </div>
      <VisualTreeInspector
        onSelectOverlay={onSelectOverlay}
        snapshot={selectedVisualTree}
        viewportHeight={selectedFrame?.height}
        viewportWidth={selectedFrame?.width}
        snapshotDetails={(
          <>
            <DetailRow
              label="Snapshot"
              value={snapshotId
                ? <CopyTextButton accessibleLabel="Copy snapshot ID" className="visual-tree-snapshot-id-copy" label={snapshotId} text={snapshotId} />
                : 'Unknown'}
            />
            <DetailRow label="Captured" value={formatDateTime(selectedVisualTree.capturedAtUtc)} />
            <DetailRow label="Source" value={selectedVisualTree.source || 'Unknown'} />
            <DetailRow label="Nodes" value={String(selectedVisualTree.nodeCount ?? 0)} />
            <DetailRow label="Total snapshots" value={String(visualTrees.length)} />
          </>
        )}
      />
    </div>
  )
}

function SessionFrameVisualTreeOverlay({ selection }: { selection: VisualTreeOverlaySelection }) {
  const style = {
    height: `${selection.height * 100}%`,
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.width * 100}%`,
  }
  return (
    <div className="session-frame-visual-tree-overlay" style={style}>
      <span>{selection.label}</span>
    </div>
  )
}

function resolveVisualTreeSnapshotKey(snapshot: SessionVisualTreeSnapshot): string {
  return snapshot.snapshotId || snapshot.capturedAtUtc || 'visual-tree'
}

function resolveArtifactSnapshotKey(snapshot: SessionArtifactSnapshot, index: number): string {
  return snapshot.snapshotId || [
    snapshot.capturedAtUtc,
    snapshot.source,
    snapshot.rootAlias,
    snapshot.relativePath,
    snapshot.name,
    index,
  ].map((value) => value ?? '').join(':')
}

function createTimelineAnnotation(timestampMs: number, requestedEndTimestampMs: number | null = null): SessionAnnotation {
  const annotationId = createAnnotationId()
  const startTimestampMs = requestedEndTimestampMs === null
    ? timestampMs
    : Math.min(timestampMs, requestedEndTimestampMs)
  const endTimestampMs = requestedEndTimestampMs === null
    ? null
    : Math.max(timestampMs, requestedEndTimestampMs)
  return {
    annotationId,
    startUtc: new Date(startTimestampMs).toISOString(),
    endUtc: endTimestampMs !== null && endTimestampMs > startTimestampMs
      ? new Date(endTimestampMs).toISOString()
      : null,
    label: '',
    source: 'localPortal.timeline',
    notes: null,
    captureGroupId: annotationId,
    customData: null,
    geometry: [],
    target: null,
  }
}

function createScreenshotAnnotation(
  frame: SessionImageFrame,
  scrubAtMs: number,
  geometryDraft: ScreenshotAnnotationGeometryDraft,
  visualTree: SessionVisualTreeSnapshot | null,
): SessionAnnotation {
  const annotationId = createAnnotationId()
  const capturedAtMs = toTimestamp(frame.capturedAtUtc) ?? scrubAtMs
  const capturedAtUtc = new Date(capturedAtMs).toISOString()
  const isRectangle = geometryDraft.kind === 1
  const targetBounds = isRectangle
    ? {
        x: geometryDraft.x,
        y: geometryDraft.y,
        width: geometryDraft.width ?? 0,
        height: geometryDraft.height ?? 0,
      }
    : {
        x: clamp(geometryDraft.x - 0.009, 0, 0.982),
        y: clamp(geometryDraft.y - 0.009, 0, 0.982),
        width: 0.018,
        height: 0.018,
      }

  return {
    annotationId,
    startUtc: capturedAtUtc,
    endUtc: new Date(capturedAtMs + defaultGeometryAnnotationRenderDurationMs).toISOString(),
    label: '',
    source: 'localPortal.screenshot',
    notes: null,
    captureGroupId: annotationId,
    customData: null,
    geometry: [
      {
        geometryId: createAnnotationId(),
        frameId: frame.frameId,
        capturedAtUtc,
        kind: geometryDraft.kind,
        x: geometryDraft.x,
        y: geometryDraft.y,
        width: geometryDraft.width ?? null,
        height: geometryDraft.height ?? null,
        strokeColor: '#FFFF3B30',
        strokeWidth: 3,
      },
    ],
    target: {
      kind: 'visualTreeRegion',
      source: 'localPortal.screenshot',
      targetId: `region-${createAnnotationId()}`,
      visualTreeSnapshotId: visualTree?.snapshotId ?? '',
      type: 'ScreenRegion',
      elementKind: isRectangle ? 'Rectangle' : 'Point',
      label: isRectangle ? 'Selected Screenshot Rectangle' : 'Selected Screenshot Point',
      normalizedBounds: targetBounds,
    },
  }
}

function cloneAnnotationForEditing(annotation: SessionAnnotation): SessionAnnotation {
  return {
    ...annotation,
    customData: annotation.customData ? { ...annotation.customData } : null,
    geometry: annotation.geometry?.map((geometry) => ({
      ...geometry,
      points: geometry.points?.map((point) => ({ ...point })),
    })),
    target: annotation.target
      ? {
          ...annotation.target,
          absoluteBounds: annotation.target.absoluteBounds ? { ...annotation.target.absoluteBounds } : null,
          normalizedBounds: annotation.target.normalizedBounds ? { ...annotation.target.normalizedBounds } : null,
        }
      : null,
  }
}

function createAnnotationId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

function buildAnnotationComment(annotation: SessionAnnotation): string {
  const label = normalizeAnnotationComment(annotation.label) ?? ''
  const notes = normalizeAnnotationComment(annotation.notes) ?? ''
  return notes ? `${label}\n${notes}`.trim() : label
}

function normalizeAnnotationComment(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\r\n/g, '\n').trim()
  return normalized ? normalized : null
}

function buildAnnotationView(annotation: SessionAnnotation, index: number): AnnotationView {
  const startMs = toTimestamp(annotation.startUtc)
  const endMs = resolveAnnotationEffectiveEndMs(annotation)
  const notes = annotation.notes?.trim() ?? ''
  const targetSummary = formatAnnotationTargetSummary(annotation.target)

  return {
    durationDisplay: formatAnnotationDurationDisplay(startMs, endMs),
    focusMs: resolveAnnotationFocusMs(annotation),
    geometrySummary: formatAnnotationGeometrySummary(annotation),
    hasNotes: notes.length > 0,
    hasTarget: !!annotation.target,
    id: resolveAnnotationId(annotation, index),
    label: firstNonEmpty(annotation.label, targetSummary, `Annotation ${index + 1}`) ?? `Annotation ${index + 1}`,
    notes,
    notesPreview: notes ? formatAnnotationNotesPreview(notes) : 'No notes',
    targetDetail: formatAnnotationTargetDetail(annotation.target),
    targetSummary,
    timeDisplay: formatAnnotationTimeDisplay(startMs, endMs),
  }
}

function resolveAnnotationId(annotation: SessionAnnotation, index: number): string {
  return annotation.annotationId?.trim() || `${annotation.startUtc ?? 'annotation'}-${index}`
}

function resolveAnnotationEffectiveEndMs(annotation: SessionAnnotation): number | null {
  const startMs = toTimestamp(annotation.startUtc)
  if (startMs === null) {
    return null
  }

  const endMs = toTimestamp(annotation.endUtc)
  return endMs !== null && endMs > startMs ? endMs : startMs
}

function resolveAnnotationFocusMs(annotation: SessionAnnotation): number | null {
  const startMs = toTimestamp(annotation.startUtc)
  if (startMs === null) {
    return null
  }

  const endMs = resolveAnnotationEffectiveEndMs(annotation)
  return endMs !== null && endMs > startMs ? startMs + (endMs - startMs) / 2 : startMs
}

function formatAnnotationTimeDisplay(startMs: number | null, endMs: number | null): string {
  if (startMs === null) {
    return 'Unknown time'
  }

  return endMs !== null && endMs > startMs
    ? `${formatAnnotationClockTimeFromMs(startMs)} to ${formatAnnotationClockTimeFromMs(endMs)}`
    : formatAnnotationClockTimeFromMs(startMs)
}

function formatAnnotationClockTimeFromMs(value: number): string {
  if (!Number.isFinite(value)) {
    return 'Unknown'
  }

  const date = new Date(value)
  return [
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].map((part) => String(part).padStart(2, '0')).join(':')
}

function formatAnnotationDurationDisplay(startMs: number | null, endMs: number | null): string {
  if (startMs === null || endMs === null || endMs <= startMs) {
    return 'Point annotation'
  }

  return `${formatCompactDuration(endMs - startMs)} span`
}

function formatCompactDuration(durationMs: number): string {
  const normalized = Math.max(0, durationMs)
  if (normalized >= 60 * 60 * 1000) {
    const totalHours = Math.floor(normalized / (60 * 60 * 1000))
    const minutes = Math.floor((normalized % (60 * 60 * 1000)) / (60 * 1000))
    return `${totalHours}h ${minutes}m`
  }
  if (normalized >= 60 * 1000) {
    const minutes = Math.floor(normalized / (60 * 1000))
    const seconds = Math.floor((normalized % (60 * 1000)) / 1000)
    return `${minutes}m ${seconds}s`
  }
  if (normalized >= 1000) {
    return `${Math.max(1, Math.round(normalized / 1000))}s`
  }

  return `${Math.max(1, Math.round(normalized))}ms`
}

function formatAnnotationNotesPreview(notes: string): string {
  const normalized = notes
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .trim()

  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93).trimEnd()}...`
}

function formatAnnotationGeometrySummary(annotation: SessionAnnotation): string {
  const geometry = annotation.geometry ?? []
  const geometryCount = geometry.length
  const frameCount = new Set(
    geometry
      .map((entry) => entry.frameId?.trim())
      .filter((frameId): frameId is string => !!frameId),
  ).size

  if (geometryCount === 0) {
    return 'No screenshot geometry'
  }

  if (frameCount <= 1) {
    return `${geometryCount} geometry item${geometryCount === 1 ? '' : 's'}`
  }

  return `${geometryCount} geometry items across ${frameCount} frames`
}

function buildFrameAnnotationGeometryViews(
  annotations: SessionAnnotation[],
  frame: SessionImageFrame | null,
  selectedAnnotationId: string | null,
): FrameAnnotationGeometryView[] {
  const frameId = frame?.frameId?.trim()
  if (!frameId) {
    return []
  }

  return annotations.flatMap((annotation, annotationIndex) => {
    const annotationId = resolveAnnotationId(annotation, annotationIndex)
    return (annotation.geometry ?? [])
      .filter((geometry) => geometry.frameId?.trim() === frameId)
      .map((geometry, geometryIndex) => ({
        annotationId,
        geometry,
        isSelected: annotationId === selectedAnnotationId,
        key: `${annotationId}-${geometry.geometryId?.trim() || geometryIndex}`,
      }))
  })
}

function buildSessionFrameViewportStyle(frame: SessionImageFrame | null): CSSProperties {
  const aspectRatio = resolveFrameAspectRatioCssValue(frame)
  return aspectRatio ? { aspectRatio } : {}
}

function measureSessionFrameMediaContentBounds(
  viewport: HTMLDivElement,
  media: HTMLImageElement | HTMLVideoElement,
): SessionFrameImageContentBounds | null {
  const viewportBounds = viewport.getBoundingClientRect()
  const mediaBounds = media.getBoundingClientRect()
  const naturalWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
  const naturalHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
  if (
    viewportBounds.width <= 0
    || viewportBounds.height <= 0
    || mediaBounds.width <= 0
    || mediaBounds.height <= 0
    || naturalWidth <= 0
    || naturalHeight <= 0
  ) {
    return null
  }

  const objectFit = window.getComputedStyle(media).objectFit
  let contentWidth = mediaBounds.width
  let contentHeight = mediaBounds.height
  if (objectFit === 'contain' || objectFit === 'scale-down') {
    const containedScale = Math.min(mediaBounds.width / naturalWidth, mediaBounds.height / naturalHeight)
    const scale = objectFit === 'scale-down' ? Math.min(1, containedScale) : containedScale
    contentWidth = naturalWidth * scale
    contentHeight = naturalHeight * scale
  }

  return {
    frameId: media.dataset.frameId ?? '',
    height: contentHeight,
    left: mediaBounds.left - viewportBounds.left + (mediaBounds.width - contentWidth) / 2,
    top: mediaBounds.top - viewportBounds.top + (mediaBounds.height - contentHeight) / 2,
    width: contentWidth,
  }
}

function sessionFrameImageContentBoundsEqual(
  left: SessionFrameImageContentBounds | null,
  right: SessionFrameImageContentBounds | null,
): boolean {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }

  return Math.abs(left.left - right.left) < 0.25
    && left.frameId === right.frameId
    && Math.abs(left.top - right.top) < 0.25
    && Math.abs(left.width - right.width) < 0.25
    && Math.abs(left.height - right.height) < 0.25
}

function resolveSessionFrameViewportKind(
  frame: SessionImageFrame | null,
  captureSession: SessionSnapshot | undefined,
  session: TeamSession | null,
): SessionFrameViewportKind {
  const profile = captureSession ? resolveDeviceProfile(captureSession) : null
  const sessionMetadata = asRecord(session?.metadata)
  const device = getRecord(profile, 'device')
  const metadataDevice = getRecord(sessionMetadata, 'device')
  const explicitFormFactor = normalizeSessionFrameViewportKind(firstNonEmpty(
    getString(device, 'formFactor'),
    getString(metadataDevice, 'formFactor'),
  ))
  if (explicitFormFactor) {
    return explicitFormFactor
  }

  const deviceDescriptor = [
    getString(device, 'model'),
    getString(device, 'product'),
    getString(device, 'brand'),
    getString(metadataDevice, 'model'),
    session?.device_model,
    session?.device_os_name,
    session?.operating_system,
    session?.platform_key,
  ]
    .filter((value): value is string => !!value?.trim())
    .join(' ')
    .toLowerCase()

  if (/\b(ipad|tablet)\b/.test(deviceDescriptor)) {
    return 'tablet'
  }

  if (/\b(mac|macos|windows|win32|linux|desktop)\b/.test(deviceDescriptor)) {
    return 'desktop'
  }

  const aspectRatio = resolveFrameNumericAspectRatio(frame)
  if (aspectRatio !== null) {
    if (aspectRatio >= 1.15) {
      return 'desktop'
    }

    if (aspectRatio >= 0.6) {
      return 'tablet'
    }
  }

  return 'phone'
}

function normalizeSessionFrameViewportKind(value: string | null | undefined): SessionFrameViewportKind | null {
  const normalized = value?.trim().toLowerCase()
  switch (normalized) {
    case 'phone':
    case 'mobile':
    case 'handset':
      return 'phone'
    case 'tablet':
    case 'ipad':
      return 'tablet'
    case 'desktop':
    case 'mac':
    case 'macos':
    case 'windows':
    case 'linux':
      return 'desktop'
    default:
      return null
  }
}

function resolveFrameAspectRatioCssValue(frame: SessionImageFrame | null): string | null {
  const width = normalizeFrameDimension(frame?.width)
  const height = normalizeFrameDimension(frame?.height)
  return width && height ? `${width} / ${height}` : null
}

function resolveFrameNumericAspectRatio(frame: SessionImageFrame | null): number | null {
  const width = normalizeFrameDimension(frame?.width)
  const height = normalizeFrameDimension(frame?.height)
  return width && height ? width / height : null
}

function normalizeFrameDimension(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function buildFrameTouchViews(touches: SessionTouchInputRecord[], frame: SessionImageFrame | null, scrubAtMs: number): FrameTouchView[] {
  if (!frame) {
    return []
  }

  return touches.flatMap((touch, index) => {
    const opacity = resolveTouchOpacity(touch, scrubAtMs)
    if (opacity <= 0) {
      return []
    }

    const point = resolveTouchPoint(touch, frame)
    if (!point) {
      return []
    }

    return [{
      action: normalizeTouchAction(touch.action),
      key: touch.id || `${touch.capturedAtUtc ?? 'touch'}-${index}`,
      opacity,
      x: point.x,
      y: point.y,
    }]
  })
}

function resolveTouchPoint(touch: SessionTouchInputRecord, frame: SessionImageFrame): { x: number; y: number } | null {
  const x = resolveTouchNormalizedCoordinate(touch.normalizedX, touch.x, touch.surfaceWidth, frame.width, touch.coordinateUnit)
  const y = resolveTouchNormalizedCoordinate(touch.normalizedY, touch.y, touch.surfaceHeight, frame.height, touch.coordinateUnit)
  return x === null || y === null ? null : { x, y }
}

function resolveTouchNormalizedCoordinate(
  normalizedValue: number | null | undefined,
  rawValue: number,
  surfaceLength: number | null | undefined,
  imagePixelLength: number | null | undefined,
  coordinateUnit: string,
): number | null {
  if (isUnitValue(normalizedValue)) {
    return normalizedValue
  }

  if (isNormalizedTouchCoordinateUnit(coordinateUnit) && isUnitValue(rawValue)) {
    return rawValue
  }

  const fallbackLength = typeof imagePixelLength === 'number' && Number.isFinite(imagePixelLength) && imagePixelLength > 0
    ? imagePixelLength
    : null
  const length = typeof surfaceLength === 'number' && Number.isFinite(surfaceLength) && surfaceLength > 0
    ? surfaceLength
    : fallbackLength
  if (!length || !Number.isFinite(rawValue)) {
    return null
  }

  return clamp(rawValue / length, 0, 1)
}

function touchIsActiveAt(touch: SessionTouchInputRecord, scrubAtMs: number): boolean {
  return resolveTouchOpacity(touch, scrubAtMs) > 0
}

function resolveTouchOpacity(touch: SessionTouchInputRecord, scrubAtMs: number): number {
  const capturedAtMs = toTimestamp(touch.capturedAtUtc)
  if (capturedAtMs === null || !Number.isFinite(scrubAtMs)) {
    return 0
  }

  const ageMs = scrubAtMs - capturedAtMs
  if (ageMs < 0 || ageMs > defaultTouchRenderDurationMs) {
    return 0
  }

  const progress = clamp(ageMs / defaultTouchRenderDurationMs, 0, 1)
  return clamp(1 - progress, 0, 1)
}

function normalizeTouchAction(action: string | null | undefined): string {
  switch (action?.trim().toLowerCase()) {
    case 'down':
    case 'pressed':
    case 'began':
      return 'down'
    case 'move':
    case 'moved':
      return 'move'
    case 'up':
    case 'released':
    case 'ended':
      return 'up'
    case 'cancel':
    case 'cancelled':
    case 'canceled':
      return 'cancel'
    default:
      return 'unknown'
  }
}

function isNormalizedTouchCoordinateUnit(coordinateUnit: string | null | undefined): boolean {
  const normalized = coordinateUnit?.trim().toLowerCase()
  return normalized === 'normalized' || normalized === 'unit' || normalized === 'ratio'
}

function isUnitValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function renderFrameAnnotationGeometry(view: FrameAnnotationGeometryView): ReactNode {
  const className = view.isSelected
    ? 'session-frame-annotation-shape session-frame-annotation-shape--selected'
    : 'session-frame-annotation-shape'
  const x = clampUnit(view.geometry.x)
  const y = clampUnit(view.geometry.y)

  if (isRectangleGeometry(view.geometry)) {
    const width = clamp(view.geometry.width ?? 0, 0, 1 - x)
    const height = clamp(view.geometry.height ?? 0, 0, 1 - y)
    if (width <= 0 || height <= 0) {
      return null
    }

    return (
      <rect
        className={className}
        height={height}
        key={view.key}
        rx={0.018}
        vectorEffect="non-scaling-stroke"
        width={width}
        x={x}
        y={y}
      />
    )
  }

  return (
    <circle
      className={className}
      cx={x}
      cy={y}
      key={view.key}
      r={0.018}
      vectorEffect="non-scaling-stroke"
    />
  )
}

function isRectangleGeometry(geometry: SessionAnnotationGeometry): boolean {
  return geometry.kind === 'Rectangle' || geometry.kind === 'rectangle' || geometry.kind === 1
}

function clampUnit(value: number | null | undefined): number {
  return clamp(typeof value === 'number' && Number.isFinite(value) ? value : 0, 0, 1)
}

function formatAnnotationTargetSummary(target: SessionAnnotation['target']): string | null {
  if (!target) {
    return null
  }

  return firstNonEmpty(target.label, target.type, target.elementKind, target.automationId, target.targetId)
}

function formatAnnotationTargetDetail(target: SessionAnnotation['target']): string | null {
  if (!target) {
    return null
  }

  return joinDisplay(
    target.kind,
    target.source,
    target.visualTreeSnapshotId ? `Visual tree ${target.visualTreeSnapshotId}` : null,
    target.automationId ? `Automation ${target.automationId}` : null,
    typeof target.depth === 'number' ? `Depth ${target.depth}` : null,
  )
}

function isActiveAiRun(run: SessionAiExtractionSummary): boolean {
  return run.status === 'queued' || run.status === 'running'
}

function isPublishedAiRun(run: SessionAiExtractionSummary): boolean {
  return run.archived_at === null && run.status === 'succeeded' && (!!run.summary_markdown || !!run.mermaid_definition)
}

function formatAiRunProgressMessage(run: SessionAiExtractionSummary): string {
  if (run.progress_message) {
    return run.progress_message
  }

  return run.status === 'queued' ? 'Queued for processing.' : 'Processing extraction.'
}

function buildSessionAiSourcePartOptions(
  session: TeamSession | null,
  logs: SessionLogEntry[],
  frames: SessionImageFrame[],
  metrics: SessionMetricSample[],
  annotations: SessionAnnotation[],
  visualTrees: SessionVisualTreeSnapshot[],
  artifactSnapshots: SessionArtifactSnapshot[],
): SessionAiSourcePartOption[] {
  return [
    { value: 'session_metadata', label: sessionAiSourcePartLabels.session_metadata },
    { value: 'logs', label: sessionAiSourcePartLabels.logs, count: logs.length || session?.log_count || 0 },
    { value: 'screenshots', label: sessionAiSourcePartLabels.screenshots, count: frames.length || session?.screenshot_count || 0 },
    {
      value: 'visual_tree',
      label: sessionAiSourcePartLabels.visual_tree,
      count: visualTrees.length || session?.visual_tree_snapshot_count || 0,
    },
    { value: 'metrics', label: sessionAiSourcePartLabels.metrics, count: metrics.length || session?.metric_sample_count || 0 },
    { value: 'annotations', label: sessionAiSourcePartLabels.annotations, count: annotations.length || session?.annotation_count || 0 },
    { value: 'artifacts', label: sessionAiSourcePartLabels.artifacts, count: artifactSnapshots.length || session?.artifact_snapshot_count || 0 },
  ]
}

function parseOptionalSecondsAsMilliseconds(value: string): number | null | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const seconds = Number(normalized)
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined
  }

  return Math.round(seconds * 1000)
}

function resolveCloudAiAccessBlock(
  kind: SessionAiExtractionKind,
  capabilities: SessionAiCapabilities | null,
  provider: AiProvider,
  options: { isPublicViewer?: boolean } = {},
): CloudAiAccessBlock | null {
  const extractionLabel = formatSessionAiKind(kind)
  const publicOutputLabel = kind === 'mermaid' ? 'flowcharts' : 'summaries'
  const publicEyebrow = kind === 'mermaid' ? 'AI flowcharts' : 'AI summaries'
  const publicTitle = kind === 'mermaid' ? 'Turn recordings into shareable flowcharts' : 'Turn recordings into shareable AI summaries'

  if (options.isPublicViewer) {
    return createCloudAiAccessBlock(
      publicEyebrow,
      publicTitle,
      `This public recording only shows AI output the owner has published. Ansight Cloud AI can generate ${publicOutputLabel} from session logs, screenshots, and annotations before you share.`,
      'Explore Cloud AI',
      'https://ansight.ai/pricing',
      'public',
    )
  }

  if (!capabilities) {
    return createCloudAiAccessBlock(
      'Cloud AI',
      'AI settings unavailable',
      `The AI settings for this ${extractionLabel.toLowerCase()} could not be loaded. Saved AI output remains visible when it has already been published for this session.`,
      'Contact support',
      'Ansight AI settings unavailable',
      'status',
    )
  }

  if (!providerIsConfigured(capabilities, provider)) {
    return createCloudAiAccessBlock(
      'Cloud AI',
      `${formatAiProvider(provider)} key required`,
      `${formatAiProvider(provider)} is not configured for new extraction runs.`,
      'Contact support',
      `Configure ${formatAiProvider(provider)} for Ansight AI`,
      'status',
    )
  }

  return null
}

function createCloudAiAccessBlock(
  eyebrow: string,
  title: string,
  message: string,
  actionLabel: string,
  actionDestination: string,
  tone: CloudAiAccessBlock['tone'],
): CloudAiAccessBlock {
  const actionHref = /^https?:\/\//.test(actionDestination)
    ? actionDestination
    : `mailto:sales@ansight.ai?subject=${encodeURIComponent(actionDestination)}`

  return {
    eyebrow,
    title,
    message,
    actionLabel,
    actionHref,
    tone,
  }
}

function resolveSessionAiDurationFeedback(
  sessionDurationMs: number | null,
  capabilities: SessionAiCapabilities | null,
  form: SessionAiForm,
): SessionAiDurationFeedback | null {
  const sliceStartMs = parseOptionalSecondsAsMilliseconds(form.sliceStartSeconds)
  const sliceEndMs = parseOptionalSecondsAsMilliseconds(form.sliceEndSeconds)

  if (sliceStartMs === undefined || sliceEndMs === undefined) {
    return {
      blocksSubmit: true,
      message: 'Slice values must be valid second offsets. Use numbers such as 0 and 300.',
    }
  }

  if ((sliceStartMs === null) !== (sliceEndMs === null)) {
    return {
      blocksSubmit: true,
      message: 'Provide both slice start and slice end, or leave both empty to analyse the whole session.',
    }
  }

  if (sliceStartMs !== null && sliceEndMs !== null && sliceEndMs <= sliceStartMs) {
    return {
      blocksSubmit: true,
      message: 'The slice end must be after the slice start.',
    }
  }

  if (!capabilities) {
    return null
  }

  const maxDurationMs = capabilities.max_session_duration_seconds * 1000
  if (sliceStartMs !== null && sliceEndMs !== null) {
    const sliceDurationMs = sliceEndMs - sliceStartMs
    if (sliceDurationMs > maxDurationMs) {
      return {
        blocksSubmit: true,
        message: `Selected slice is ${formatDuration(sliceDurationMs)}, but this organisation allows ${formatDuration(maxDurationMs)} per AI extraction. Shorten the selected slice.`,
      }
    }
    return null
  }

  if (sessionDurationMs !== null && sessionDurationMs > maxDurationMs) {
    return {
      blocksSubmit: true,
      message: `This session is ${formatDuration(sessionDurationMs)}, but this organisation allows ${formatDuration(maxDurationMs)} per AI extraction. Trim the session before running AI.`,
    }
  }

  return null
}

function resolveSourcePartIcon(part: SessionAiSourcePart): ReactNode {
  if (part === 'logs') {
    return <FileText aria-hidden="true" />
  }
  if (part === 'screenshots') {
    return <ImageIcon aria-hidden="true" />
  }
  if (part === 'visual_tree') {
    return <Code aria-hidden="true" />
  }
  if (part === 'metrics') {
    return <List aria-hidden="true" />
  }
  if (part === 'annotations') {
    return <NotePencil aria-hidden="true" />
  }
  if (part === 'artifacts') {
    return <Archive aria-hidden="true" />
  }

  return <Clock aria-hidden="true" />
}

function resolveRunStatusIcon(status: SessionAiExtractionSummary['status']): ReactNode {
  if (status === 'running') {
    return <CircleNotch className="spin" aria-hidden="true" />
  }
  if (status === 'succeeded') {
    return <CheckCircle aria-hidden="true" />
  }
  if (status === 'failed' || status === 'cancelled') {
    return <WarningCircle aria-hidden="true" />
  }

  return <Clock aria-hidden="true" />
}

function sortArtifactEntries(entries: SessionArtifactEntry[]): SessionArtifactEntry[] {
  return entries
    .slice()
    .sort((left, right) => Number(isArtifactDirectory(right)) - Number(isArtifactDirectory(left)) || formatArtifactEntryPath(left).localeCompare(formatArtifactEntryPath(right)))
}

function isArtifactDirectory(entry: SessionArtifactEntry): boolean {
  return entry.kind?.trim().toLowerCase() === 'directory'
}

function formatArtifactSnapshotTitle(snapshot: SessionArtifactSnapshot): string {
  return firstNonEmpty(snapshot.name, snapshot.rootAlias, snapshot.relativePath, snapshot.snapshotId) ?? 'Artifacts'
}

function formatVisualTreeSnapshotSummary(snapshot: SessionVisualTreeSnapshot): string {
  const nodeCount = snapshot.nodeCount ?? 0
  return joinDisplay(
    resolveVisualTreeKind(snapshot),
    snapshot.runtimePlatform,
    `${nodeCount} node${nodeCount === 1 ? '' : 's'}`,
    snapshot.truncated ? 'truncated' : null,
  ) ?? 'Visual tree'
}

function resolveVisualTreeKind(snapshot: SessionVisualTreeSnapshot): string | undefined {
  const payload = asRecord(snapshot.payload)
  const sourceEvidence = `${getString(payload, 'source') ?? ''} ${getString(payload, 'format') ?? ''}`
  if (/accessibility|core-simulator-ax-service/i.test(sourceEvidence)) {
    return 'accessibility'
  }

  return snapshot.visualTreeKind
}

function formatArtifactSnapshotSummary(snapshot: SessionArtifactSnapshot): string {
  return formatCountAndBytes(snapshot.fileCount ?? 0, snapshot.byteCount ?? 0)
    .replace(' / ', ', ')
    .concat(snapshot.directoryCount ? `, ${snapshot.directoryCount} folder${snapshot.directoryCount === 1 ? '' : 's'}` : '')
}

function formatArtifactSnapshotPath(snapshot: SessionArtifactSnapshot): string {
  return joinDisplay(snapshot.rootAlias, snapshot.relativePath, snapshot.rootPath) || 'Root folder'
}

function formatArtifactEntryPath(entry: SessionArtifactEntry): string {
  return firstNonEmpty(entry.snapshotRelativePath, entry.relativePath, entry.archiveRelativePath, entry.name) ?? 'Unknown'
}

function formatArtifactEntryDetail(entry: SessionArtifactEntry): string {
  if (isArtifactDirectory(entry)) {
    return 'Folder'
  }

  return joinDisplay(formatBytes(entry.sizeBytes ?? 0), entry.mimeType, formatKnownDateTime(entry.lastModifiedUtc)) ?? 'File'
}

function resolveSessionAuthorText(
  session: TeamSession,
  captureSession?: SessionSnapshot,
  sessionMetadata: JsonRecord | null = asRecord(session.metadata),
): string {
  return (
    joinDisplay(
      firstNonEmpty(session.author_name, getString(sessionMetadata, 'authorName'), getString(getRecord(sessionMetadata, 'author'), 'name'), captureSession?.author?.name),
      firstNonEmpty(session.author_email, getString(sessionMetadata, 'authorEmail'), getString(getRecord(sessionMetadata, 'author'), 'email'), captureSession?.author?.email),
      firstNonEmpty(session.author_company, getString(sessionMetadata, 'authorCompany'), getString(getRecord(sessionMetadata, 'author'), 'company'), captureSession?.author?.company),
    ) ?? 'Unknown author'
  )
}

function buildUploadMetadataRows(
  session: TeamSession,
  captureSession: SessionSnapshot,
  sessionMetadata: JsonRecord | null,
  metricChannels: SessionMetricChannel[],
  metrics: SessionMetricSample[],
  frames: SessionImageFrame[],
  logs: SessionLogEntry[],
  touches: SessionTouchInputRecord[],
  visualTrees: SessionVisualTreeSnapshot[],
  artifactSnapshots: SessionArtifactSnapshot[],
): DevicePropertyRow[] {
  const counts = getRecord(sessionMetadata, 'counts')
  const authorText = resolveSessionAuthorText(session, captureSession, sessionMetadata)

  return createPropertyRows([
    createPropertyRow('App name', firstNonEmpty(session.app_name, getString(sessionMetadata, 'appDisplayName'), captureSession.clientName)),
    createPropertyRow('Client', firstNonEmpty(getString(sessionMetadata, 'clientName'), captureSession.clientName)),
    createPropertyRow('Remote', firstNonEmpty(getString(sessionMetadata, 'remoteAddress'), captureSession.remoteAddress)),
    createPropertyRow('Config ID', firstNonEmpty(getString(sessionMetadata, 'configId'), captureSession.configId)),
    createPropertyRow('Process session ID', captureSession.processSessionId),
    createPropertyRow('App state', formatAppLifecycleState(captureSession.appState)),
    createPropertyRow('App state changed', formatKnownDateTime(captureSession.appStateChangedUtc)),
    createPropertyRow('Captured end', formatKnownDateTime(session.captured_end_at || captureSession.lastUpdatedUtc || getString(sessionMetadata, 'lastUpdatedUtc'))),
    createPropertyRow('Uploaded', formatKnownDateTime(session.uploaded_at)),
    createPropertyRow('Author', authorText),
    createPropertyRow('Storage layout', firstNonEmpty(session.storage_layout, getString(sessionMetadata, 'storageLayout'))),
    createPropertyRow('Manifest path', firstNonEmpty(session.manifest_storage_path, getString(sessionMetadata, 'manifestStoragePath'))),
    createPropertyRow('Storage path', session.storage_path),
    createPropertyRow('Archive type', session.archive_content_type),
    createPropertyRow('Metrics', formatMetricCount(metrics.length || getNumber(counts, 'metricSamples') || session.metric_sample_count, metricChannels.length || getNumber(counts, 'metricChannels') || session.metric_channel_count)),
    createPropertyRow('Touch input', String(touches.length || getNumber(counts, 'touchInput') || getNumber(counts, 'touches') || 0)),
    createPropertyRow('Annotations', String(getNumber(counts, 'annotations') ?? session.annotation_count)),
    createPropertyRow('Analyses', String(getNumber(counts, 'analyses') ?? session.analysis_count)),
    createPropertyRow('Artifact files', formatCountAndBytes(getNumber(counts, 'artifactFiles') ?? session.artifact_file_count, getNumber(counts, 'artifactBytes') ?? session.artifact_byte_size)),
    createPropertyRow('Loaded evidence', `${frames.length} screenshots / ${logs.length} logs / ${touches.length} touches / ${visualTrees.length} visual trees / ${artifactSnapshots.length} artifacts`),
  ])
}

function sdkNoticeForTab(tab: string): SdkCapabilityFeature | null {
  switch (tab) {
    case 'network': return 'network'
    case 'live-log': return 'logs'
    case 'visual-tree': return 'trees'
    case 'artifacts': return 'artifacts'
    default: return null
  }
}

function formatCaptureSource(session: SessionSnapshot): string {
  const source = session.captureSource?.trim().toLowerCase()
  if (source === 'device') return 'External monitor'
  if (source === 'sdk' || !source && session.sdkVersion) return 'Embedded SDK'
  return 'Unknown'
}

function buildDevicePropertySections(
  profile: JsonRecord | null,
  captureSession: SessionSnapshot,
  session: TeamSession,
): DevicePropertySection[] {
  const sections: DevicePropertySection[] = []
  const app = getRecord(profile, 'app')
  const device = getRecord(profile, 'device')
  const metadataDevice = getRecord(asRecord(session.metadata), 'device')
  const runtime = getRecord(profile, 'runtime')
  const engine = getRecord(runtime, 'engine')

  addDevicePropertySection(
    sections,
    'App',
    'Identity, build, and install details for the connected app.',
    [
      createPropertyRow('Name', firstNonEmpty(getString(app, 'appName'), session.app_name, captureSession.clientName)),
      createPropertyRow('App ID', firstNonEmpty(getString(app, 'appId'), session.app_id, captureSession.appId)),
      createPropertyRow('Version', firstNonEmpty(getString(app, 'versionName'), session.app_version)),
      createPropertyRow('Version code', formatValue(getValue(app, 'versionCode'))),
      createPropertyRow('Build number', formatValue(getValue(app, 'buildNumber'))),
      createPropertyRow('Install source', getString(app, 'installSource')),
      createPropertyRow('Environment code', formatValue(getValue(app, 'environmentCode'))),
      createPropertyRow('Debuggable', formatBoolean(getBoolean(app, 'debuggable'))),
      createPropertyRow('First install', formatUnixMilliseconds(getValue(app, 'firstInstallTimeMs'))),
      createPropertyRow('Last update', formatUnixMilliseconds(getValue(app, 'lastUpdateTimeMs'))),
    ],
  )

  addDevicePropertySection(
    sections,
    'Device',
    'Core device identity and OS information.',
    [
      createPropertyRow('Manufacturer', getString(device, 'manufacturer')),
      createPropertyRow('Brand', getString(device, 'brand')),
      createPropertyRow('Model', firstNonEmpty(getString(device, 'model'), session.device_model)),
      createPropertyRow('Product', getString(device, 'product')),
      createPropertyRow('Form factor', formatFormFactor(firstNonEmpty(getString(device, 'formFactor'), getString(metadataDevice, 'formFactor')))),
      createPropertyRow('Virtual device', formatVirtualDevice(
        getBoolean(device, 'isVirtual') ?? getBoolean(metadataDevice, 'isVirtual') ?? getBoolean(device, 'isEmulator') ?? session.is_emulator,
        firstNonEmpty(getString(device, 'osName'), session.device_os_name, session.operating_system),
      )),
      createPropertyRow('Class code', formatValue(getValue(device, 'deviceClassCode'))),
      createPropertyRow('OS', joinDisplay(firstNonEmpty(getString(device, 'osName'), session.device_os_name), getString(device, 'osVersion')) || formatOperatingSystem(session)),
      createPropertyRow('OS build', getString(device, 'osBuild')),
      createPropertyRow('API level', formatValue(getValue(device, 'apiLevel'))),
      createPropertyRow('Locale', getString(device, 'locale')),
      createPropertyRow('Time zone', getString(device, 'timeZone')),
    ],
  )

  addDevicePropertySection(
    sections,
    'Runtime',
    'Runtime engine and execution characteristics.',
    [
      createPropertyRow('Primary runtime', joinDisplay(formatValue(getValue(runtime, 'primary')), getString(runtime, 'primaryVersion'))),
      createPropertyRow('Engine', joinDisplay(getString(engine, 'name'), getString(engine, 'version'))),
      createPropertyRow('Runtime stack', formatRuntimeStack(getArray(runtime, 'stack'))),
      createPropertyRow('AOT', formatBoolean(getBoolean(runtime, 'aotEnabled'))),
      createPropertyRow('JIT', formatBoolean(getBoolean(runtime, 'jitEnabled'))),
    ],
  )

  addDevicePropertySection(
    sections,
    'Hardware',
    'CPU, memory, storage, display, and GPU capabilities.',
    [
      createPropertyRow('Chip', getString(device, 'chipModel')),
      createPropertyRow('CPU', joinDisplay(getString(device, 'cpuArch'), formatCoreCount(getValue(device, 'cpuCoreCount')))),
      createPropertyRow('ABI list', formatStringList(getArray(device, 'abiList'))),
      createPropertyRow('Memory', formatCapacity(getValue(device, 'memoryFreeMb'), getValue(device, 'memoryTotalMb'))),
      createPropertyRow('Storage', formatCapacity(getValue(device, 'storageFreeMb'), getValue(device, 'storageTotalMb'))),
      createPropertyRow('Display', formatDisplay(getRecord(device, 'display'))),
      createPropertyRow('GPU', formatGpu(getRecord(device, 'gpu'))),
    ],
  )

  addDevicePropertySection(
    sections,
    'Environment',
    'Battery, network, graphics, permissions, and tags.',
    [
      createPropertyRow('Battery', formatBattery(getRecord(device, 'battery'))),
      createPropertyRow('Network', formatNetwork(getRecord(device, 'network'))),
      createPropertyRow('Thermal', formatThermal(getRecord(device, 'thermal'))),
      createPropertyRow('Graphics', formatGraphics(getRecord(profile, 'graphics'))),
      createPropertyRow('Tags', formatStringList(getArray(profile, 'tags'))),
      createPropertyRow('Permissions', formatDictionary(getRecord(profile, 'permissions'))),
    ],
  )

  return sections
}

function buildCustomPropertySections(customProperties: unknown): DevicePropertySection[] {
  const properties = asRecord(customProperties)
  if (!properties) {
    return []
  }

  return Object.entries(properties)
    .map(([group, values]) => {
      const groupTitle = group.trim()
      const groupRecord = asRecord(values)
      if (!groupTitle || !groupRecord) {
        return null
      }

      const rows = createPropertyRows(
        Object.entries(groupRecord).map(([key, value]) =>
          key.trim() ? createPropertyRow(key, formatCustomPropertyValue(value)) : null,
        ),
      )
      if (rows.length === 0) {
        return null
      }

      return {
        title: groupTitle,
        subtitle: `${rows.length} ${rows.length === 1 ? 'property' : 'properties'}`,
        rows,
      }
    })
    .filter((section): section is DevicePropertySection => section !== null)
}

function formatCustomPropertyValue(value: unknown): string | null {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return formatValue(value)
  }

  return null
}

function addDevicePropertySection(
  sections: DevicePropertySection[],
  title: string,
  subtitle: string,
  rows: Array<DevicePropertyRow | null>,
) {
  const visibleRows = createPropertyRows(rows)
  if (visibleRows.length === 0) {
    return
  }

  sections.push({ title, subtitle, rows: visibleRows })
}

function createPropertyRows(rows: Array<DevicePropertyRow | null>): DevicePropertyRow[] {
  return rows.filter((row): row is DevicePropertyRow => row !== null)
}

function createPropertyRow(label: string, value: unknown): DevicePropertyRow | null {
  const normalized = formatValue(value)
  return normalized ? { label, value: normalized } : null
}

function resolveDeviceProfile(captureSession: SessionSnapshot): JsonRecord | null {
  const directProfile = asRecord(captureSession.deviceProfile)
  if (directProfile) {
    return directProfile
  }

  const rawProfile = captureSession.deviceProfileJson?.trim()
  if (!rawProfile) {
    return null
  }

  try {
    return asRecord(JSON.parse(rawProfile))
  } catch {
    return null
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : null
}

function getRecord(record: JsonRecord | null | undefined, key: string): JsonRecord | null {
  return asRecord(record?.[key])
}

function getArray(record: JsonRecord | null | undefined, key: string): unknown[] | null {
  const value = record?.[key]
  return Array.isArray(value) ? value : null
}

function getRecordArray(record: JsonRecord | null | undefined, key: string): JsonRecord[] {
  return (getArray(record, key) ?? []).map(asRecord).filter((entry): entry is JsonRecord => entry !== null)
}

function getValue(record: JsonRecord | null | undefined, key: string): unknown {
  return record?.[key]
}

function getString(record: JsonRecord | null | undefined, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNumber(record: JsonRecord | null | undefined, key: string): number | null {
  return toFiniteNumber(record?.[key])
}

function getBoolean(record: JsonRecord | null | undefined, key: string): boolean | null {
  const value = record?.[key]
  return typeof value === 'boolean' ? value : null
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) {
      return normalized
    }
  }

  return null
}

function joinDisplay(...values: Array<string | null | undefined>): string | null {
  const filtered = values
    .map((value) => value?.trim())
    .filter((value): value is string => !!value)
  return filtered.length === 0 ? null : filtered.join(' | ')
}

function formatValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === 'boolean') {
    return formatBoolean(value)
  }

  return null
}

function formatKnownDateTime(value: string | null | undefined): string | null {
  return value ? formatDateTime(value) : null
}

function formatUnixMilliseconds(value: unknown): string | null {
  const timestamp = toFiniteNumber(value)
  if (timestamp === null) {
    return null
  }

  try {
    return formatDateTime(new Date(timestamp).toISOString())
  } catch {
    return String(timestamp)
  }
}

function formatBoolean(value: boolean | null | undefined): string | null {
  if (value === true) {
    return 'Yes'
  }
  if (value === false) {
    return 'No'
  }

  return null
}

function formatFormFactor(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  switch (normalized) {
    case 'phone':
      return 'Phone'
    case 'tablet':
      return 'Tablet'
    case 'desktop':
      return 'Desktop'
    case 'tv':
      return 'TV'
    case 'watch':
      return 'Watch'
    case 'car':
      return 'Car'
    case 'vr':
      return 'VR'
    case 'unknown':
      return 'Unknown form factor'
    default:
      return normalized
  }
}

function formatVirtualDevice(value: boolean | null | undefined, osName?: string | null): string | null {
  if (value === true) {
    if (isApplePlatform(osName)) {
      return 'Simulator'
    }
    if (isAndroidPlatform(osName)) {
      return 'Emulator'
    }
    return 'Virtual device'
  }
  if (value === false) {
    return 'Physical device'
  }

  return null
}

function isApplePlatform(osName?: string | null): boolean {
  const normalized = osName?.trim().toLowerCase()
  return !!normalized && (normalized.includes('ios') || normalized.includes('maccatalyst') || normalized.includes('mac'))
}

function isAndroidPlatform(osName?: string | null): boolean {
  return !!osName?.trim().toLowerCase().includes('android')
}

function formatRuntimeStack(stack: unknown[] | null): string | null {
  if (!stack || stack.length === 0) {
    return null
  }

  return joinDisplay(
    ...stack
      .map((entry) => {
        const record = asRecord(entry)
        return joinDisplay(getString(record, 'name'), getString(record, 'version'), formatValue(getValue(record, 'runtimeCode')))
      })
      .filter((entry): entry is string => !!entry),
  )
}

function formatStringList(values: unknown[] | null): string | null {
  if (!values || values.length === 0) {
    return null
  }

  return joinDisplay(...values.map(formatValue))
}

function formatDictionary(record: JsonRecord | null): string | null {
  if (!record) {
    return null
  }

  const entries = Object.entries(record)
    .map(([key, value]) => {
      const normalizedValue = formatValue(value)
      return key.trim() && normalizedValue ? `${key}: ${normalizedValue}` : null
    })
    .filter((entry): entry is string => entry !== null)

  return entries.length === 0 ? null : entries.join('\n')
}

function formatCapacity(freeMb: unknown, totalMb: unknown): string | null {
  const free = toFiniteNumber(freeMb)
  const total = toFiniteNumber(totalMb)
  if (free === null && total === null) {
    return null
  }

  if (free !== null && total !== null) {
    return `${formatMegabytes(free)} free of ${formatMegabytes(total)}`
  }

  return free !== null ? `${formatMegabytes(free)} free` : `${formatMegabytes(total ?? 0)} total`
}

function formatDisplay(display: JsonRecord | null): string | null {
  if (!display) {
    return null
  }

  const width = toFiniteNumber(getValue(display, 'widthPx'))
  const height = toFiniteNumber(getValue(display, 'heightPx'))
  const resolution = width !== null && height !== null ? `${width}x${height}` : null

  return joinDisplay(
    resolution,
    formatUnit(getValue(display, 'densityDpi'), 'dpi'),
    formatUnit(getValue(display, 'refreshRateHz'), 'Hz'),
    getBoolean(display, 'hdrSupported') === true ? 'HDR supported' : null,
  )
}

function formatGpu(gpu: JsonRecord | null): string | null {
  if (!gpu) {
    return null
  }

  return joinDisplay(
    getString(gpu, 'vendor'),
    getString(gpu, 'model'),
    getString(gpu, 'renderer'),
    getString(gpu, 'driverVersion') ? `driver ${getString(gpu, 'driverVersion')}` : null,
    formatMegabytesValue(getValue(gpu, 'vramMb'), 'VRAM'),
    getString(gpu, 'featureLevel'),
    formatPrefixedValue('API', getValue(gpu, 'apiCode')),
  )
}

function formatBattery(battery: JsonRecord | null): string | null {
  if (!battery) {
    return null
  }

  return joinDisplay(
    formatUnit(getValue(battery, 'levelPct'), '%', false),
    formatUnit(getValue(battery, 'temperatureC'), 'C'),
    formatPrefixedValue('state', getValue(battery, 'stateCode')),
    formatPrefixedValue('health', getValue(battery, 'healthCode')),
  )
}

function formatNetwork(network: JsonRecord | null): string | null {
  if (!network) {
    return null
  }

  const metered = getBoolean(network, 'metered')
  return joinDisplay(
    getString(network, 'effectiveType'),
    metered === null ? null : metered ? 'Metered' : 'Unmetered',
    formatUnit(getValue(network, 'rttMs'), 'ms RTT'),
    formatKbps(getValue(network, 'downKbps')),
    formatPrefixedValue('transport', getValue(network, 'transportCode')),
  )
}

function formatThermal(thermal: JsonRecord | null): string | null {
  const status = formatValue(getValue(thermal, 'statusCode'))
  return status ? `Status ${status}` : null
}

function formatGraphics(graphics: JsonRecord | null): string | null {
  if (!graphics) {
    return null
  }

  const vsync = getBoolean(graphics, 'vsyncEnabled')
  return joinDisplay(
    formatPrefixedValue('target', getValue(graphics, 'fpsTarget'), 'FPS'),
    vsync === null ? null : vsync ? 'VSync on' : 'VSync off',
    formatPrefixedValue('backend', getValue(graphics, 'renderBackendCode')),
  )
}

function formatCoreCount(value: unknown): string | null {
  const cores = formatValue(value)
  return cores ? `${cores} cores` : null
}

function formatUnit(value: unknown, unit: string, includeSpace = true): string | null {
  const normalized = formatValue(value)
  if (!normalized) {
    return null
  }

  return includeSpace ? `${normalized} ${unit}` : `${normalized}${unit}`
}

function formatPrefixedValue(prefix: string, value: unknown, suffix?: string): string | null {
  const normalized = formatValue(value)
  if (!normalized) {
    return null
  }

  return suffix ? `${prefix} ${normalized} ${suffix}` : `${prefix} ${normalized}`
}

function formatMegabytesValue(value: unknown, suffix: string): string | null {
  const megabytes = toFiniteNumber(value)
  return megabytes === null ? null : `${formatMegabytes(megabytes)} ${suffix}`
}

function formatMegabytes(valueMb: number): string {
  return valueMb >= 1024 ? `${(valueMb / 1024).toFixed(1).replace(/\.0$/, '')} GB` : `${valueMb} MB`
}

function formatKbps(value: unknown): string | null {
  const kbps = toFiniteNumber(value)
  return kbps === null ? null : `${new Intl.NumberFormat().format(kbps)} kbps down`
}

function formatMetricCount(sampleCount: number, channelCount: number): string {
  const sampleLabel = sampleCount === 1 ? 'sample' : 'samples'
  const channelLabel = channelCount === 1 ? 'channel' : 'channels'
  return `${sampleCount} ${sampleLabel} / ${channelCount} ${channelLabel}`
}

function formatCountAndBytes(count: number, bytes: number): string {
  const fileLabel = count === 1 ? 'file' : 'files'
  return `${count} ${fileLabel} / ${formatBytes(bytes)}`
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0)
    : []
}

function formatAppLifecycleState(value: unknown): string | null {
  const state = parseAppLifecycleState(value)
  if (state === 'foreground') {
    return 'Foreground'
  }
  if (state === 'background') {
    return 'Background'
  }

  return formatValue(value)
}

function sortFrames(frames: SessionImageFrame[]): SessionImageFrame[] {
  return frames
    .filter((frame) => !!frame.frameId)
    .slice()
    .sort((left, right) => compareTimestamp(left.capturedAtUtc, right.capturedAtUtc))
}

function sortLogs(logs: SessionLogEntry[]): SessionLogEntry[] {
  for (let index = 1; index < logs.length; index += 1) {
    if (compareTimestamp(logs[index - 1].timestampUtc, logs[index].timestampUtc) > 0) {
      return logs.slice().sort((left, right) => compareTimestamp(left.timestampUtc, right.timestampUtc))
    }
  }

  return logs
}

function sortNetworkRequests(requests: SessionNetworkRequest[]): SessionNetworkRequest[] {
  return [...requests].sort((left, right) => {
    const timestampComparison = (toTimestamp(left.startedAtUtc) ?? 0) - (toTimestamp(right.startedAtUtc) ?? 0)
    return timestampComparison || left.id.localeCompare(right.id)
  })
}

function sortTouches(touches: SessionTouchInputRecord[]): SessionTouchInputRecord[] {
  return touches
    .filter((touch) => !!touch.id && !!touch.capturedAtUtc)
    .slice()
    .sort((left, right) => compareTimestamp(left.capturedAtUtc, right.capturedAtUtc) || left.id.localeCompare(right.id))
}

function sortMetrics(metrics: SessionMetricSample[]): SessionMetricSample[] {
  return metrics.slice().sort((left, right) => compareTimestamp(left.capturedAtUtc, right.capturedAtUtc))
}

function sortMetricChannels(channels: SessionMetricChannel[]): SessionMetricChannel[] {
  return channels.slice().sort((left, right) => left.channelId - right.channelId)
}

function sortAnnotations(annotations: SessionAnnotation[]): SessionAnnotation[] {
  return annotations.slice().sort((left, right) => compareTimestamp(left.startUtc, right.startUtc))
}

function sortVisualTrees(visualTrees: SessionVisualTreeSnapshot[]): SessionVisualTreeSnapshot[] {
  return visualTrees.slice().sort((left, right) => compareTimestamp(left.capturedAtUtc, right.capturedAtUtc))
}

function sortArtifactSnapshots(artifactSnapshots: SessionArtifactSnapshot[]): SessionArtifactSnapshot[] {
  return artifactSnapshots.slice().sort((left, right) => compareTimestamp(left.capturedAtUtc, right.capturedAtUtc))
}

function compareTimestamp(left: string | null | undefined, right: string | null | undefined): number {
  return (toTimestamp(left) ?? 0) - (toTimestamp(right) ?? 0)
}

function buildTimestampedItems<T>(items: T[], timestampSelector: (item: T) => string | null | undefined): Array<TimestampedItem<T>> {
  const timestampedItems: Array<TimestampedItem<T>> = []
  for (const item of items) {
    const timestampMs = toTimestamp(timestampSelector(item))
    if (timestampMs !== null) {
      timestampedItems.push({ item, timestampMs })
    }
  }

  return timestampedItems
}

function buildTimelineReplayIndex(
  frames: SessionImageFrame[],
  logs: SessionLogEntry[],
  visualTrees: SessionVisualTreeSnapshot[],
  artifactSnapshots: SessionArtifactSnapshot[],
  touches: SessionTouchInputRecord[],
): TimelineReplayIndex {
  const timestampedVisualTrees = buildTimestampedItems(visualTrees, (snapshot) => snapshot.capturedAtUtc)
  const visualTreesByFrameId = new Map<string, SessionVisualTreeSnapshot>()
  for (const snapshot of visualTrees) {
    const frameId = snapshot.screenshotFrameId?.trim()
    if (frameId && !visualTreesByFrameId.has(frameId)) {
      visualTreesByFrameId.set(frameId, snapshot)
    }
  }

  return {
    artifactSnapshots: buildTimestampedItems(artifactSnapshots, (snapshot) => snapshot.capturedAtUtc),
    frames: buildTimestampedItems(frames, (frame) => frame.capturedAtUtc),
    logs: buildTimestampedItems(logs, (log) => log.timestampUtc),
    touches: buildTimestampedItems(touches, (touch) => touch.capturedAtUtc),
    visualTrees: timestampedVisualTrees,
    visualTreesByFrameId,
  }
}

function buildTimelineMetricIndex(channels: SessionMetricChannel[], metrics: SessionMetricSample[]): TimelineMetricIndex {
  const channelMap = new Map(channels.map((channel) => [channel.channelId, channel]))
  const channelMaxBlocksById = new Map<number, number[]>()
  const channelSamplesById = new Map<number, TimelineMetricSamplePoint[]>()
  const channelSegmentsById = new Map<number, TimelineMetricSamplePoint[][]>()
  const channelIdSet = new Set<number>()
  const fpsSamples: TimelineMetricSamplePoint[] = []
  let firstTimestampMs: number | null = null
  let lastTimestampMs: number | null = null

  for (const metric of metrics) {
    const timestampMs = toTimestamp(metric.capturedAtUtc)
    if (timestampMs === null) {
      continue
    }

    const channelId = metric.channelId
    const point: TimelineMetricSamplePoint = {
      channelId,
      segmentId: Number.isFinite(metric.segmentId) ? Math.max(0, metric.segmentId ?? 0) : 0,
      timestampMs,
      value: metric.value,
    }
    channelIdSet.add(channelId)
    const samples = channelSamplesById.get(channelId) ?? []
    samples.push(point)
    channelSamplesById.set(channelId, samples)
    if (isFpsChannel(channelMap, channelId)) {
      fpsSamples.push(point)
    }

    firstTimestampMs = firstTimestampMs === null ? timestampMs : Math.min(firstTimestampMs, timestampMs)
    lastTimestampMs = lastTimestampMs === null ? timestampMs : Math.max(lastTimestampMs, timestampMs)
  }

  for (const samples of channelSamplesById.values()) {
    samples.sort((left, right) => left.timestampMs - right.timestampMs)
  }
  for (const [channelId, samples] of channelSamplesById) {
    channelMaxBlocksById.set(channelId, buildMetricMaxBlocks(samples))
    channelSegmentsById.set(channelId, groupMetricsBySegment(samples))
  }
  fpsSamples.sort((left, right) => left.timestampMs - right.timestampMs)

  return {
    channelIds: [...channelIdSet]
      .sort((left, right) => Number(isFpsChannel(channelMap, left)) - Number(isFpsChannel(channelMap, right)) || left - right),
    channelMap,
    channelMaxBlocksById,
    channelSamplesById,
    channelSegmentsById,
    firstTimestampMs,
    fpsSamples,
    lastTimestampMs,
  }
}

function resolveTimelineRange(
  session: TeamSession | null,
  captureSession: SessionSnapshot | undefined,
  replayIndex: TimelineReplayIndex,
  metricIndex: TimelineMetricIndex,
  annotations: SessionAnnotation[],
): TimelineRange {
  const declaredStartMs = firstFiniteTimestamp(captureSession?.createdUtc, session?.captured_start_at)
  const declaredEndMs = firstFiniteTimestamp(captureSession?.lastUpdatedUtc, session?.captured_end_at)
  let contentStartMs: number | null = null
  let contentEndMs: number | null = null
  const includeTimestamp = (timestampMs: number | null) => {
    if (timestampMs === null || !Number.isFinite(timestampMs)) {
      return
    }

    contentStartMs = contentStartMs === null ? timestampMs : Math.min(contentStartMs, timestampMs)
    contentEndMs = contentEndMs === null ? timestampMs : Math.max(contentEndMs, timestampMs)
  }
  const includeTimestampedRange = <T,>(items: Array<TimestampedItem<T>>) => {
    if (items.length === 0) {
      return
    }

    includeTimestamp(items[0].timestampMs)
    includeTimestamp(items[items.length - 1].timestampMs)
  }

  includeTimestamp(declaredStartMs)
  includeTimestampedRange(replayIndex.frames)
  includeTimestampedRange(replayIndex.logs)
  includeTimestampedRange(replayIndex.touches)
  includeTimestampedRange(replayIndex.visualTrees)
  includeTimestampedRange(replayIndex.artifactSnapshots)
  includeTimestamp(metricIndex.firstTimestampMs)
  includeTimestamp(metricIndex.lastTimestampMs)
  for (const annotation of annotations) {
    includeTimestamp(toTimestamp(annotation.startUtc))
    includeTimestamp(toTimestamp(annotation.endUtc))
  }

  if (contentStartMs === null || contentEndMs === null) {
    includeTimestamp(declaredStartMs)
    includeTimestamp(declaredEndMs)
  } else if (declaredEndMs !== null) {
    const effectiveStartMs = declaredStartMs ?? contentStartMs
    includeTimestamp(resolveEffectiveTimelineEndMs(effectiveStartMs, declaredEndMs, contentEndMs))
  }

  if (contentStartMs === null || contentEndMs === null) {
    const now = Date.now()
    return { startMs: now, endMs: now + 60_000, initialMs: now }
  }

  if (contentEndMs - contentStartMs < 1_000) {
    return { startMs: contentStartMs - 30_000, endMs: contentEndMs + 30_000, initialMs: contentStartMs }
  }

  return {
    startMs: contentStartMs,
    endMs: contentEndMs,
    initialMs: contentStartMs,
  }
}

function resolveEffectiveTimelineEndMs(startMs: number, declaredEndMs: number, contentEndMs: number): number {
  const normalizedDeclaredEndMs = Math.max(startMs, declaredEndMs)
  if (contentEndMs > normalizedDeclaredEndMs) {
    return contentEndMs
  }

  const trailingGapMs = normalizedDeclaredEndMs - contentEndMs
  if (trailingGapMs <= trailingTimelineSilenceToleranceMs) {
    return normalizedDeclaredEndMs
  }

  const capturedDurationMs = Math.max(0, contentEndMs - startMs)
  return trailingGapMs > capturedDurationMs ? contentEndMs : normalizedDeclaredEndMs
}

function resolveEffectiveSessionDurationMs(declaredDurationMs: number | null, range: TimelineRange): number | null {
  const timelineDurationMs = Math.max(0, range.endMs - range.startMs)
  if (!declaredDurationMs || declaredDurationMs <= 0) {
    return timelineDurationMs > 0 ? timelineDurationMs : declaredDurationMs
  }

  if (timelineDurationMs > 0
      && declaredDurationMs > timelineDurationMs
      && declaredDurationMs - timelineDurationMs > trailingTimelineSilenceToleranceMs) {
    return timelineDurationMs
  }

  return declaredDurationMs
}

function firstFiniteTimestamp(...values: Array<string | null | undefined>): number | null {
  for (const value of values) {
    const timestamp = toTimestamp(value)
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      return timestamp
    }
  }

  return null
}

function resolveEffectiveScrubAt(
  scrubAtMs: number | null,
  range: TimelineRange,
  isLiveSession: boolean,
): number {
  if (scrubAtMs === null || !Number.isFinite(scrubAtMs)) {
    return isLiveSession
      ? range.endMs
      : clamp(range.initialMs, range.startMs, range.endMs)
  }

  return clamp(scrubAtMs, range.startMs, range.endMs)
}

function resolveScrubSelection(
  timestampMs: number,
  range: TimelineRange,
  isLiveSession: boolean,
): number | null {
  const normalizedTimestamp = clamp(timestampMs, range.startMs, range.endMs)
  if (!isLiveSession) {
    return normalizedTimestamp
  }

  const durationMs = Math.max(1, range.endMs - range.startMs)
  const liveEdgeToleranceMs = clamp(durationMs * 0.005, 500, 2_000)
  return range.endMs - normalizedTimestamp <= liveEdgeToleranceMs
    ? null
    : normalizedTimestamp
}

function createTimelineRangeKey(range: TimelineRange): string {
  return `${range.startMs}:${range.endMs}:${range.initialMs}`
}

function createInitialTimelineVisibleRange(range: TimelineRange, isLiveSession: boolean): TimelineRange {
  if (!isLiveSession) {
    return range
  }

  const fullDuration = Math.max(1, range.endMs - range.startMs)
  const visibleDuration = Math.min(defaultLiveTimelineWindowMs, fullDuration)
  return createTimelineWindow(range, range.endMs - visibleDuration / 2, visibleDuration)
}

function reconcileTimelineVisibleRange(
  current: TimelineVisibleRangeState,
  range: TimelineRange,
  isFollowingLive: boolean,
  isLiveSession: boolean,
): TimelineRange {
  const fullDuration = Math.max(1, range.endMs - range.startMs)
  const currentDuration = Math.max(1, current.visibleRange.endMs - current.visibleRange.startMs)
  const visibleDuration = isLiveSession && isFollowingLive && !current.isUserAdjusted
    ? Math.min(defaultLiveTimelineWindowMs, fullDuration)
    : Math.min(currentDuration, fullDuration)

  if (isLiveSession && isFollowingLive) {
    return createTimelineWindow(range, range.endMs - visibleDuration / 2, visibleDuration)
  }

  const currentCenterMs = current.visibleRange.startMs + currentDuration / 2
  return createTimelineWindow(range, currentCenterMs, visibleDuration)
}

function resolveTimelinePlot(width: number): TimelinePlot {
  return width <= 560 ? timelineCompactPlot : timelinePlot
}

function createTimelineWindow(fullRange: TimelineRange, centerMs: number, durationMs: number): TimelineRange {
  const fullDuration = Math.max(1, fullRange.endMs - fullRange.startMs)
  const nextDuration = clamp(durationMs, 1, fullDuration)
  const nextCenter = clamp(centerMs, fullRange.startMs + nextDuration / 2, fullRange.endMs - nextDuration / 2)
  const startMs = clamp(nextCenter - nextDuration / 2, fullRange.startMs, fullRange.endMs - nextDuration)
  const endMs = startMs + nextDuration

  return {
    startMs,
    endMs,
    initialMs: clamp(centerMs, startMs, endMs),
  }
}

function normalizeTimelineWheelDelta(delta: number, deltaMode: number, pageWidth: number): number {
  if (deltaMode === 1) {
    return delta * timelineWheelLineHeightPx
  }
  if (deltaMode === 2) {
    return delta * pageWidth
  }
  return delta
}

function lowerBoundTimestamp<T>(items: Array<TimestampedItem<T>>, timestampMs: number): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (items[mid].timestampMs < timestampMs) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

function upperBoundTimestamp<T>(items: Array<TimestampedItem<T>>, timestampMs: number): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (items[mid].timestampMs <= timestampMs) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

function selectNearestTimestamped<T>(items: Array<TimestampedItem<T>>, scrubAtMs: number): T | null {
  if (items.length === 0) {
    return null
  }

  const afterIndex = lowerBoundTimestamp(items, scrubAtMs)
  if (afterIndex <= 0) {
    return items[0].item
  }
  if (afterIndex >= items.length) {
    return items[items.length - 1].item
  }

  const before = items[afterIndex - 1]
  const after = items[afterIndex]
  return Math.abs(scrubAtMs - before.timestampMs) <= Math.abs(after.timestampMs - scrubAtMs)
    ? before.item
    : after.item
}

function selectFrameForTimestamp(frames: Array<TimestampedItem<SessionImageFrame>>, scrubAtMs: number, mode: 'nearest' | 'previous' = 'nearest'): SessionImageFrame | null {
  if (frames.length === 0) {
    return null
  }

  if (mode === 'previous') {
    const selectedIndex = upperBoundTimestamp(frames, scrubAtMs) - 1
    return selectedIndex >= 0 ? frames[selectedIndex].item : frames[0].item
  }

  return selectNearestTimestamped(frames, scrubAtMs)
}

function selectVisualTree(replayIndex: TimelineReplayIndex, selectedFrame: SessionImageFrame | null, scrubAtMs: number): SessionVisualTreeSnapshot | null {
  if (replayIndex.visualTrees.length === 0) {
    return null
  }

  if (selectedFrame?.frameId) {
    const exact = replayIndex.visualTreesByFrameId.get(selectedFrame.frameId)
    if (exact) {
      return exact
    }
  }

  // Screenshot deduplication means the displayed frame can precede the scrub
  // cursor even though visual trees continue to arrive. When the SDK has not
  // supplied screenshotFrameId, pair the tree to the frame actually on screen;
  // otherwise screenshot annotations can silently target a later tree.
  const selectedFrameTimestampMs = toTimestamp(selectedFrame?.capturedAtUtc)
  return selectNearestTimestamped(
    replayIndex.visualTrees,
    selectedFrameTimestampMs ?? scrubAtMs,
  )
}

function selectArtifactSnapshot(artifactSnapshots: Array<TimestampedItem<SessionArtifactSnapshot>>, scrubAtMs: number): SessionArtifactSnapshot | null {
  if (artifactSnapshots.length === 0) {
    return null
  }

  return selectNearestTimestamped(artifactSnapshots, scrubAtMs)
}

function selectTouchesForTimestamp(touches: Array<TimestampedItem<SessionTouchInputRecord>>, scrubAtMs: number): SessionTouchInputRecord[] {
  if (touches.length === 0 || !Number.isFinite(scrubAtMs)) {
    return []
  }

  const startIndex = lowerBoundTimestamp(touches, scrubAtMs - defaultTouchRenderDurationMs)
  const endIndex = upperBoundTimestamp(touches, scrubAtMs)
  if (endIndex <= startIndex) {
    return []
  }

  return touches
    .slice(startIndex, endIndex)
    .map((touch) => touch.item)
    .filter((touch) => touchIsActiveAt(touch, scrubAtMs))
}

function buildAvailableLogItems(logs: Array<TimestampedItem<SessionLogEntry>>): LogListItem[] {
  return logs.map((entry, index) => ({
    index,
    log: entry.item,
    timestampMs: entry.timestampMs,
  }))
}

function buildLogTagOptions(logs: SessionLogEntry[]): string[] {
  const tags = new Map<string, string>()
  for (const log of logs) {
    const tag = log.tag?.trim()
    if (!tag) {
      continue
    }

    tags.set(normalizeSearchText(tag), tag)
  }

  return [...tags.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}

function hasLogFilters(filters: LogFilterState): boolean {
  return Boolean(
    filters.keyword.trim()
    || filters.tag.trim()
    || filters.minimumLevel !== 'all'
    || filters.startSeconds.trim()
    || filters.endSeconds.trim(),
  )
}

function getAdvancedLogFilterCount(filters: LogFilterState): number {
  let count = 0
  if (filters.tag.trim()) {
    count++
  }

  if (filters.minimumLevel !== 'all') {
    count++
  }

  if (filters.startSeconds.trim() || filters.endSeconds.trim()) {
    count++
  }

  return count
}

function filterLogItems(items: LogListItem[], filters: LogFilterState, timelineRange: TimelineRange): LogListItem[] {
  const keyword = normalizeSearchText(filters.keyword)
  const tagTerms = parseLogFilterTerms(filters.tag)
  const minimumSeverity = filters.minimumLevel === 'all' ? null : logLevelSeverityByTone[filters.minimumLevel]
  const startMs = parseLogFilterBoundary(filters.startSeconds, timelineRange.startMs)
  const endMs = parseLogFilterBoundary(filters.endSeconds, timelineRange.startMs)
  const hasValidRange = startMs === null || endMs === null || startMs <= endMs

  return items.filter(({ log, timestampMs }) => {
    if (!hasValidRange) {
      return false
    }

    if (startMs !== null && timestampMs < startMs) {
      return false
    }

    if (endMs !== null && timestampMs > endMs) {
      return false
    }

    if (minimumSeverity !== null && resolveLogLevelSeverity(log) < minimumSeverity) {
      return false
    }

    if (tagTerms.length > 0) {
      const tag = normalizeSearchText(log.tag)
      if (!tagTerms.some((term) => tag.includes(term))) {
        return false
      }
    }

    if (keyword) {
      const searchableText = [
        log.message,
        log.tag,
        log.source,
        log.eventId,
        formatLogLevel(log),
        log.priority === undefined || log.priority === null ? null : String(log.priority),
      ].map(normalizeSearchText).join(' ')

      if (!searchableText.includes(keyword)) {
        return false
      }
    }

    return true
  })
}

function getLogFilterRangeMessage(filters: LogFilterState): string | null {
  const startSeconds = parseFiniteNumber(filters.startSeconds)
  const endSeconds = parseFiniteNumber(filters.endSeconds)
  if (startSeconds !== null && endSeconds !== null && startSeconds > endSeconds) {
    return 'range start is after end'
  }

  return null
}

function parseLogFilterTerms(value: string): string[] {
  return value
    .split(',')
    .map(normalizeSearchText)
    .filter(Boolean)
}

function parseLogFilterBoundary(value: string, baseMs: number): number | null {
  const seconds = parseFiniteNumber(value)
  return seconds === null ? null : baseMs + seconds * 1000
}

function parseFiniteNumber(value: string): number | null {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveLogLevelSeverity(log: { priority?: string | number; tag?: string }): number {
  const priorityLevel = normalizeLogLevel(log.priority)
  const tagLevel = normalizeLogLevel(log.tag)
  const level = [priorityLevel, tagLevel].find((candidate) => candidate && candidate.tone !== 'default')
  if (!level) {
    return 0
  }

  return logLevelSeverityByTone[level.tone as keyof typeof logLevelSeverityByTone] ?? 0
}

function normalizeSearchText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim().toLocaleLowerCase()
}

function buildTimelineChart(
  metricIndex: TimelineMetricIndex,
  range: TimelineRange,
  scaleRange: TimelineRange = range,
  chartWidth = timelineChartFallbackWidth,
  plot: TimelinePlot = timelinePlot,
  visibleChannelIds: readonly number[] = metricIndex.channelIds,
) {
  const palette = ['#fc8b70', '#38bdf8', '#22c55e', '#f59e0b', '#a78bfa']
  const channelMap = metricIndex.channelMap
  const channelIds = visibleChannelIds
  const width = chartWidth
  const height = timelineChartHeight
  const plotWidth = width - plot.left - plot.right
  const plotHeight = height - plot.top - plot.bottom
  const verticalPadding = timelineChartValuePadding
  const usablePlotHeight = plotHeight - verticalPadding * 2
  const targetRenderSamplesPerSeries = Math.max(64, Math.round(plotWidth * 2))
  const axesByKey = new Map<string, ReturnType<typeof metricPresentation> & { maximum: number }>()
  for (const channelId of channelIds) {
    const presentation = metricPresentation(channelMap.get(channelId), channelId)
    const rangeMaximum = resolveMetricRangeMaximum(
      metricIndex.channelSamplesById.get(channelId) ?? [],
      metricIndex.channelMaxBlocksById.get(channelId) ?? [],
      scaleRange)
    const axis = axesByKey.get(presentation.axisKey) ?? { ...presentation, maximum: 1 }
    axis.maximum = Math.max(axis.maximum, metricAxisMaximum(presentation, rangeMaximum))
    axesByKey.set(presentation.axisKey, axis)
  }
  const maxFpsDisplayValue = axesByKey.get('fps')?.maximum ?? 1

  function yForValue(value: number, maxDisplayValue: number): number {
    const ratio = maxDisplayValue <= 0 ? 0 : clamp(value / maxDisplayValue, 0, 1)
    return plot.top + plotHeight - verticalPadding - ratio * usablePlotHeight
  }

  const series = channelIds.flatMap((channelId, index) => {
    const channelSamples = metricIndex.channelSamplesById.get(channelId) ?? []
    if (channelSamples.length === 0) {
      return []
    }

    const channel = channelMap.get(channelId)
    const isFps = isFpsChannel(channelMap, channelId)
    const presentation = metricPresentation(channel, channelId)
    const fallbackColor = harmonizeTimelineColor(presentation.kind === 'cpu' ? '#f59e0b' : sanitizeColorHex(channel?.colorHex) ?? palette[index % palette.length])
    const maxDisplayValue = axesByKey.get(presentation.axisKey)?.maximum ?? 1
    const metricSegments = metricIndex.channelSegmentsById.get(channelId) ?? []
    const segments: TimelineMetricSegment[] = []
    const points: Array<{ color: string; x: number; y: number }> = []

    for (const sourceMetricSegment of metricSegments) {
      const metricSegment = reduceTimelineMetricPoints(
        clipMetricSegmentToRange(sourceMetricSegment, range),
        targetRenderSamplesPerSeries)
      if (metricSegment.length === 0) {
        continue
      }

      if (metricSegment.length === 1) {
        const sample = metricSegment[0]
        points.push({
          color: isFps ? resolveFpsColor(sample.value) : fallbackColor,
          x: xForTimestamp(sample.timestampMs, range, plot.left, plotWidth),
          y: yForValue(sample.value * presentation.scale, maxDisplayValue),
        })
        continue
      }

      const plotPoints = metricSegment.map((sample) => ({
        x: xForTimestamp(sample.timestampMs, range, plot.left, plotWidth),
        y: yForValue(sample.value * presentation.scale, maxDisplayValue),
      }))
      const cornerPaths = timelineCornerPaths(plotPoints)

      if (isFps) {
        for (let sampleIndex = 1; sampleIndex < metricSegment.length; sampleIndex += 1) {
          const start = metricSegment[sampleIndex - 1]
          const end = metricSegment[sampleIndex]
          const startX = xForTimestamp(start.timestampMs, range, plot.left, plotWidth)
          const endX = xForTimestamp(end.timestampMs, range, plot.left, plotWidth)
          const startY = yForValue(start.value, maxDisplayValue)
          const endY = yForValue(end.value, maxDisplayValue)
          const startColor = resolveFpsColor(start.value)
          const endColor = resolveFpsColor(end.value)
          segments.push({
            color: startColor,
            gradient: startColor === endColor
              ? undefined
              : {
                  endColor,
                  endX,
                  endY,
                  startColor,
                  startX,
                  startY,
                },
            path: cornerPaths[sampleIndex - 1],
          })
        }
        continue
      }

      const path = cornerPaths.join(' ')
      segments.push({ color: fallbackColor, path })
    }

    return [
      {
        channelId,
        color: isFps ? resolveFpsColor(maxFpsDisplayValue / 1.1) : fallbackColor,
        name: channel?.name || `Channel ${channelId}`,
        points,
        segments,
      },
    ]
  })

  return {
    leftAxisMax: maxFpsDisplayValue,
    axes: [...axesByKey.values()],
    series,
  }
}

function createTimelineGradientId(baseId: string, channelId: number, segmentIndex: number): string {
  return `${baseId}-timeline-gradient-${channelId}-${segmentIndex}`
}

function buildAxisTicks(maxValue: number): number[] {
  return timelineAxisFractions.map((fraction) => maxValue * fraction)
}

/** The FPS value under the scrub position, or null where the plotted line has no point to sit on:
 *  outside the sampled span or across a break between segments. */
function resolveFpsValueAtScrub(metricIndex: TimelineMetricIndex, range: TimelineRange, scrubAtMs: number): number | null {

  const fpsSamples = metricIndex.fpsSamples
  if (fpsSamples.length === 0) {
    return null
  }

  const rangeStartIndex = lowerBoundMetricTimestamp(fpsSamples, range.startMs)
  const rangeEndIndex = upperBoundMetricTimestamp(fpsSamples, range.endMs)
  if (rangeStartIndex >= rangeEndIndex) {
    return null
  }

  if (scrubAtMs < fpsSamples[rangeStartIndex].timestampMs || scrubAtMs > fpsSamples[rangeEndIndex - 1].timestampMs) {
    return null
  }

  const nextIndex = lowerBoundMetricTimestamp(fpsSamples, scrubAtMs)
  if (nextIndex <= rangeStartIndex) {
    return fpsSamples[rangeStartIndex].value
  }

  const previous = fpsSamples[nextIndex - 1]
  const next = fpsSamples[nextIndex]
  if (previous.segmentId !== next.segmentId) {
    return null
  }
  if (next.timestampMs <= previous.timestampMs) {
    return next.value
  }

  const ratio = (scrubAtMs - previous.timestampMs) / (next.timestampMs - previous.timestampMs)
  return previous.value + (next.value - previous.value) * clamp(ratio, 0, 1)
}

function buildTimelineProbeLines(
  metricIndex: TimelineMetricIndex,
  probeAtMs: number,
  series: Array<{ channelId: number; color: string }>,
): TimelineProbeLine[] {
  return series.flatMap(({ channelId, color }) => {
    const sample = getTimelineMetricAt(metricIndex.channelSegmentsById.get(channelId) ?? [], probeAtMs)
    if (!sample) {
      return []
    }

    const channel = metricIndex.channelMap.get(channelId)
    const isFps = isFpsChannel(metricIndex.channelMap, channelId)
    const channelName = channel?.name || `Channel ${channelId}`
    return [{
      channelId,
      color: isFps ? resolveFpsColor(sample.value) : color,
      label: `${channelName}: ${formatMetricValue(sample.value, metricPresentation(channel, channelId))}`,
      value: sample.value,
    }]
  })
}

/** The series value at the probe time, interpolated between the neighbouring samples of the
 *  segment that spans it, so a marker placed at that value sits on the drawn line. */
function getTimelineMetricAt(segments: TimelineMetricSamplePoint[][], probeAtMs: number): TimelineMetricSamplePoint | null {
  for (const segment of segments) {
    if (segment.length === 0 || probeAtMs < segment[0].timestampMs || probeAtMs > segment[segment.length - 1].timestampMs) {
      continue
    }

    const nextIndex = upperBoundMetricTimestamp(segment, probeAtMs)
    const previous = segment[Math.max(0, nextIndex - 1)]
    const next = segment[Math.min(segment.length - 1, nextIndex)]
    if (next.timestampMs <= previous.timestampMs) {
      return previous
    }

    const ratio = clamp((probeAtMs - previous.timestampMs) / (next.timestampMs - previous.timestampMs), 0, 1)
    return { ...previous, timestampMs: probeAtMs, value: previous.value + (next.value - previous.value) * ratio }
  }

  return null
}

function lowerBoundMetricTimestamp(samples: TimelineMetricSamplePoint[], timestampMs: number): number {
  let low = 0
  let high = samples.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (samples[mid].timestampMs < timestampMs) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

function upperBoundMetricTimestamp(samples: TimelineMetricSamplePoint[], timestampMs: number): number {
  let low = 0
  let high = samples.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (samples[mid].timestampMs <= timestampMs) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

function clipMetricSegmentToRange(samples: TimelineMetricSamplePoint[], range: TimelineRange): TimelineMetricPoint[] {
  if (samples.length === 0) {
    return []
  }

  if (samples.length === 1) {
    const point = samples[0]
    return point.timestampMs >= range.startMs && point.timestampMs <= range.endMs ? [point] : []
  }

  const clippedPoints: TimelineMetricPoint[] = []
  const addPoint = (point: TimelineMetricPoint) => {
    const previousPoint = clippedPoints[clippedPoints.length - 1]
    if (previousPoint && Math.abs(previousPoint.timestampMs - point.timestampMs) < 0.5) {
      previousPoint.value = point.value
      return
    }

    clippedPoints.push(point)
  }

  const firstPotentialIndex = Math.max(1, lowerBoundMetricTimestamp(samples, range.startMs))
  for (let index = firstPotentialIndex; index < samples.length; index += 1) {
    const startPoint = samples[index - 1]
    const endPoint = samples[index]
    if (startPoint.timestampMs > range.endMs) {
      break
    }

    if (endPoint.timestampMs < range.startMs || startPoint.timestampMs > range.endMs) {
      continue
    }

    const clippedStartMs = Math.max(startPoint.timestampMs, range.startMs)
    const clippedEndMs = Math.min(endPoint.timestampMs, range.endMs)
    if (clippedEndMs < clippedStartMs) {
      continue
    }

    addPoint(interpolateMetricPoint(startPoint, endPoint, clippedStartMs))
    addPoint(interpolateMetricPoint(startPoint, endPoint, clippedEndMs))
  }

  return clippedPoints
}

function reduceTimelineMetricPoints(points: TimelineMetricPoint[], targetRenderSamples: number): TimelineMetricPoint[] {
  if (points.length <= targetRenderSamples) {
    return points
  }

  const bucketCount = Math.max(1, Math.floor(targetRenderSamples / 2))
  const selectedIndices = new Set<number>([0, points.length - 1])
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const startIndex = Math.floor((bucketIndex * points.length) / bucketCount)
    const endExclusive = Math.floor(((bucketIndex + 1) * points.length) / bucketCount)
    if (endExclusive <= startIndex) {
      continue
    }

    let minIndex = startIndex
    let maxIndex = startIndex
    for (let sampleIndex = startIndex + 1; sampleIndex < endExclusive; sampleIndex += 1) {
      if (points[sampleIndex].value < points[minIndex].value) {
        minIndex = sampleIndex
      }
      if (points[sampleIndex].value > points[maxIndex].value) {
        maxIndex = sampleIndex
      }
    }

    selectedIndices.add(minIndex)
    selectedIndices.add(maxIndex)
  }

  return [...selectedIndices]
    .sort((left, right) => left - right)
    .map((index) => points[index])
}

function interpolateMetricPoint(startPoint: TimelineMetricPoint, endPoint: TimelineMetricPoint, timestampMs: number): TimelineMetricPoint {
  if (endPoint.timestampMs <= startPoint.timestampMs) {
    return { timestampMs, value: startPoint.value }
  }

  const ratio = clamp((timestampMs - startPoint.timestampMs) / (endPoint.timestampMs - startPoint.timestampMs), 0, 1)
  return {
    timestampMs,
    value: startPoint.value + (endPoint.value - startPoint.value) * ratio,
  }
}

function groupMetricsBySegment(samples: TimelineMetricSamplePoint[]): TimelineMetricSamplePoint[][] {
  const groups = new Map<number, TimelineMetricSamplePoint[]>()
  for (const sample of samples) {
    const group = groups.get(sample.segmentId) ?? []
    group.push(sample)
    groups.set(sample.segmentId, group)
  }

  return [...groups.values()]
    .sort((left, right) => (left[0]?.timestampMs ?? 0) - (right[0]?.timestampMs ?? 0))
}

const timelineMetricMaxBlockSize = 256

function buildMetricMaxBlocks(samples: TimelineMetricSamplePoint[]): number[] {
  const blockCount = Math.ceil(samples.length / timelineMetricMaxBlockSize)
  const maxima = new Array<number>(blockCount).fill(0)
  for (let index = 0; index < samples.length; index += 1) {
    const blockIndex = Math.floor(index / timelineMetricMaxBlockSize)
    maxima[blockIndex] = Math.max(maxima[blockIndex], samples[index].value)
  }

  return maxima
}

function resolveMetricRangeMaximum(
  samples: TimelineMetricSamplePoint[],
  blockMaxima: number[],
  range: TimelineRange,
): number {
  let index = lowerBoundMetricTimestamp(samples, range.startMs)
  const endIndex = upperBoundMetricTimestamp(samples, range.endMs)
  let maximum = 0

  while (index < endIndex && index % timelineMetricMaxBlockSize !== 0) {
    maximum = Math.max(maximum, samples[index].value)
    index += 1
  }

  while (index + timelineMetricMaxBlockSize <= endIndex) {
    maximum = Math.max(maximum, blockMaxima[Math.floor(index / timelineMetricMaxBlockSize)] ?? 0)
    index += timelineMetricMaxBlockSize
  }

  while (index < endIndex) {
    maximum = Math.max(maximum, samples[index].value)
    index += 1
  }

  return maximum
}

// Relative OKLCH keeps channel identity while the local replay theme gives every
// trace a coordinated palette. Yellow needs higher lightness to stay yellow.
// Unset tokens retain portal colors.
function harmonizeTimelineColor(color: string): string {
  // Keep the brand-orange channel exact, rather than shifting its hue.
  const normalized = color.toLowerCase()
  if (normalized === '#fa441f' || normalized === '#fa431f' || normalized === '#ff4d23' || normalized === '#fc8b70') {
    return `var(--timeline-series-orange, ${color})`
  }
  if (normalized === '#ffcc00' || normalized === '#eab308') {
    return `var(--timeline-series-yellow, ${color})`
  }
  return `oklch(from ${color} var(--timeline-series-lightness, l) var(--timeline-series-chroma, c) h)`
}

function resolveFpsColor(fps: number): string {
  const color = fps >= 50 ? '#22c55e'
    : fps >= 40 ? '#4ade80'
      : fps >= 30 ? '#eab308'
        : fps >= 20 ? '#fa441f'
          : '#ef4444'
  return harmonizeTimelineColor(color)
}

function buildLifecycleTransitions(logs: SessionLogEntry[], captureSession: SessionSnapshot | undefined): LifecycleTransition[] {
  const transitions = logs
    .map(tryParseLifecycleTransition)
    .filter((transition): transition is LifecycleTransition => transition !== null)

  for (const event of captureSession?.applicationEvents ?? []) {
    const timestampMs = toTimestamp(event.capturedAtUtc)
    if (timestampMs === null) continue
    const label = event.label.toLowerCase()
    if (label === 'lifecycle.foreground') transitions.push({ state: 'foreground', timestampMs })
    if (label === 'lifecycle.background') transitions.push({ state: 'background', timestampMs })
  }

  const snapshotState = parseAppLifecycleState(captureSession?.appState)
  const snapshotStateTimestampMs = toTimestamp(captureSession?.appStateChangedUtc)
  if (snapshotState && snapshotStateTimestampMs !== null) {
    transitions.push({ state: snapshotState, timestampMs: snapshotStateTimestampMs })
  }

  return dedupeLifecycleTransitions(transitions)
}

function tryParseLifecycleTransition(log: SessionLogEntry): LifecycleTransition | null {
  if (!stringEqualsIgnoreCase(log.tag, 'LIFECYCLE')) {
    return null
  }

  const timestampMs = toTimestamp(log.timestampUtc)
  if (timestampMs === null) {
    return null
  }

  const message = log.message?.trim().toLowerCase() ?? ''
  if (message.includes('lifecycle.foreground') || message.includes('app moved to foreground')) {
    return { state: 'foreground', timestampMs }
  }
  if (message.includes('lifecycle.background') || message.includes('app moved to background')) {
    return { state: 'background', timestampMs }
  }

  return null
}

function dedupeLifecycleTransitions(transitions: LifecycleTransition[]): LifecycleTransition[] {
  const transitionMap = new Map<string, LifecycleTransition>()
  for (const transition of transitions) {
    transitionMap.set(`${transition.timestampMs}:${transition.state}`, transition)
  }

  const orderedTransitions = [...transitionMap.values()].sort((left, right) => left.timestampMs - right.timestampMs)
  const result: LifecycleTransition[] = []
  for (const transition of orderedTransitions) {
    if (result.at(-1)?.state === transition.state) {
      continue
    }

    result.push(transition)
  }

  return result
}

function isTimestampInBackgroundState(transitions: LifecycleTransition[], timestampMs: number): boolean {
  let low = 0
  let high = transitions.length
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2)
    if (transitions[mid].timestampMs <= timestampMs) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low > 0 && transitions[low - 1].state === 'background'
}

function buildLifecycleBackgroundSections(transitions: LifecycleTransition[], range: TimelineRange): LifecycleBackgroundSection[] {
  if (transitions.length === 0 || range.endMs <= range.startMs) {
    return []
  }

  const sections: LifecycleBackgroundSection[] = []
  let backgroundStartMs: number | null = null

  for (const transition of transitions) {
    if (transition.timestampMs > range.startMs) {
      continue
    }

    backgroundStartMs = transition.state === 'background' ? range.startMs : null
  }

  for (const transition of transitions) {
    if (transition.timestampMs <= range.startMs || transition.timestampMs >= range.endMs) {
      continue
    }

    if (transition.state === 'background') {
      backgroundStartMs ??= transition.timestampMs
      continue
    }

    if (backgroundStartMs !== null) {
      sections.push({ startMs: backgroundStartMs, endMs: transition.timestampMs })
      backgroundStartMs = null
    }
  }

  if (backgroundStartMs !== null) {
    sections.push({ startMs: backgroundStartMs, endMs: range.endMs })
  }

  return sections
}

function parseAppLifecycleState(value: unknown): AppLifecycleState | null {
  if (typeof value === 'number') {
    if (value === 1) {
      return 'foreground'
    }
    if (value === 2) {
      return 'background'
    }
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'foreground' || normalized === '1') {
    return 'foreground'
  }
  if (normalized === 'background' || normalized === '2') {
    return 'background'
  }

  return null
}

function stringEqualsIgnoreCase(left: string | null | undefined, right: string): boolean {
  return left?.trim().toLowerCase() === right.toLowerCase()
}

function buildTimelineAnnotationMarker(
  annotation: SessionAnnotation,
  visibleRange: TimelineRange,
  plotLeft: number,
  plotWidth: number,
  laneTop: number,
): TimelineAnnotationMarker | null {
  const startMs = toTimestamp(annotation.startUtc)
  const endMs = resolveAnnotationEffectiveEndMs(annotation)
  if (startMs === null || endMs === null || endMs < visibleRange.startMs || startMs > visibleRange.endMs) {
    return null
  }

  const plotRight = plotLeft + plotWidth
  const clippedStartMs = Math.max(startMs, visibleRange.startMs)
  const clippedEndMs = Math.min(endMs, visibleRange.endMs)
  const left = xForTimestamp(clippedStartMs, visibleRange, plotLeft, plotWidth)
  const right = xForTimestamp(clippedEndMs, visibleRange, plotLeft, plotWidth)

  if (endMs <= startMs || Math.abs(right - left) < timelineAnnotationDraftThreshold) {
    const pointX = xForTimestamp(clamp(startMs, visibleRange.startMs, visibleRange.endMs), visibleRange, plotLeft, plotWidth)
    const markerX = clamp(pointX - timelineAnnotationMinimumWidth / 2, plotLeft, plotRight - timelineAnnotationMinimumWidth)
    return {
      badgeX: markerX + timelineAnnotationMinimumWidth / 2,
      badgeY: laneTop + timelineAnnotationLaneHeight / 2,
      height: timelineAnnotationLaneHeight,
      width: timelineAnnotationMinimumWidth,
      x: markerX,
      y: laneTop,
    }
  }

  const markerWidth = Math.max(timelineAnnotationMinimumWidth, Math.abs(right - left))
  const markerX = clamp(Math.min(left, right), plotLeft, plotRight - markerWidth)
  return {
    badgeX: markerX + markerWidth / 2,
    badgeY: laneTop + timelineAnnotationLaneHeight / 2,
    height: timelineAnnotationLaneHeight,
    width: markerWidth,
    x: markerX,
    y: laneTop,
  }
}

function xForTimestamp(timestampMs: number, range: TimelineRange, left: number, width: number): number {
  return left + timelineRatioForTimestamp(timestampMs, range) * width
}

function timelineRatioForTimestamp(timestampMs: number, range: TimelineRange): number {
  const duration = range.endMs - range.startMs
  if (duration <= 0) {
    return 0
  }

  return clamp((timestampMs - range.startMs) / duration, 0, 1)
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function sanitizeColorHex(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }

  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : null
}

function formatLogLevel(log: { priority?: string | number; tag?: string }): string {
  const level = normalizeLogLevel(log.tag) ?? normalizeLogLevel(log.priority)
  return level?.label ?? 'LOG'
}

function getLogLevelTone(log: { priority?: string | number; tag?: string }): string {
  const level = normalizeLogLevel(log.tag) ?? normalizeLogLevel(log.priority)
  return level?.tone ?? 'default'
}

function normalizeLogLevel(value: string | number | null | undefined): { label: string; tone: string } | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number') {
    if (value >= 6) {
      return { label: 'ERROR', tone: 'error' }
    }
    if (value >= 5) {
      return { label: 'WARN', tone: 'warn' }
    }
    if (value >= 4) {
      return { label: 'INFO', tone: 'info' }
    }
    if (value >= 3) {
      return { label: 'DEBUG', tone: 'debug' }
    }
    return { label: 'TRACE', tone: 'trace' }
  }

  const normalized = value.trim().toUpperCase()
  if (!normalized) {
    return null
  }

  if (['ERROR', 'ERR', 'FATAL', 'CRITICAL'].includes(normalized)) {
    return { label: 'ERROR', tone: 'error' }
  }
  if (['WARN', 'WARNING'].includes(normalized)) {
    return { label: 'WARN', tone: 'warn' }
  }
  if (['INFO', 'INFORMATION'].includes(normalized)) {
    return { label: 'INFO', tone: 'info' }
  }
  if (normalized === 'DEBUG') {
    return { label: 'DEBUG', tone: 'debug' }
  }
  if (['TRACE', 'VERBOSE'].includes(normalized)) {
    return { label: 'TRACE', tone: 'trace' }
  }

  return { label: normalized, tone: 'default' }
}

function formatSessionDeviceSummary(
  session: TeamSession,
  profile: JsonRecord | null,
  sessionMetadata: JsonRecord | null,
): string {
  const device = getRecord(profile, 'device')
  const metadataDevice = getRecord(sessionMetadata, 'device')
  return [
    firstNonEmpty(getString(device, 'model'), session.device_model),
    formatFormFactor(firstNonEmpty(getString(device, 'formFactor'), getString(metadataDevice, 'formFactor'))),
    firstNonEmpty(getString(device, 'osName'), session.device_os_name, session.operating_system, session.platform_key),
    formatVirtualDevice(
      getBoolean(device, 'isVirtual') ?? getBoolean(metadataDevice, 'isVirtual') ?? getBoolean(device, 'isEmulator') ?? session.is_emulator,
      firstNonEmpty(getString(device, 'osName'), session.device_os_name, session.operating_system),
    ),
  ]
    .filter((value): value is string => !!value?.trim())
    .join(' / ') || 'Device profile unavailable'
}

function formatSessionStorage(session: TeamSession, files: number): string {
  const bytes = session.stream_byte_size || session.archive_byte_size || session.artifact_byte_size
  const fileCount = session.stream_file_count || files
  const fileSummary = fileCount === 1 ? '1 file' : `${fileCount} files`
  return `${formatBytes(bytes)} (${fileSummary})`
}

function normalizeStorageBreakdown(breakdown: SessionStorageBreakdown): SessionStorageBreakdown {
  const items = (breakdown.items ?? [])
    .filter((item) => item && typeof item.label === 'string' && Number.isFinite(item.sizeBytes) && item.sizeBytes > 0)
    .map((item) => ({ label: item.label.trim() || 'Other files', sizeBytes: Math.max(0, item.sizeBytes) }))
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
  const itemTotal = items.reduce((total, item) => total + item.sizeBytes, 0)
  return {
    totalSizeBytes: Math.max(Number.isFinite(breakdown.totalSizeBytes) ? breakdown.totalSizeBytes : 0, itemTotal),
    fileCount: Math.max(0, Number.isFinite(breakdown.fileCount) ? Math.round(breakdown.fileCount) : 0),
    items,
  }
}

function buildManifestStorageBreakdown(files: SharedSessionStreamFile[]): SessionStorageBreakdown {
  const sizeByLabel = new Map<string, number>()
  for (const file of files) {
    const sizeBytes = Number.isFinite(file.byteSize) ? Math.max(0, file.byteSize) : 0
    if (sizeBytes <= 0) {
      continue
    }

    const label = resolveManifestStorageLabel(file)
    sizeByLabel.set(label, (sizeByLabel.get(label) ?? 0) + sizeBytes)
  }

  const items = [...sizeByLabel]
    .map(([label, sizeBytes]) => ({ label, sizeBytes }))
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
  return {
    totalSizeBytes: items.reduce((total, item) => total + item.sizeBytes, 0),
    fileCount: files.length,
    items,
  }
}

function resolveManifestStorageLabel(file: SharedSessionStreamFile): string {
  const path = file.entryPath.trim().replace(/^\/+/, '').toLocaleLowerCase()
  const kind = file.kind.trim().toLocaleLowerCase()
  if (kind === 'archive' || path === 'capture.zip') {
    return 'Session archive'
  }
  if (path === 'session.json') {
    return 'Session summary'
  }
  if (path === 'logs.json'
    || path === 'logs.jsonl'
    || path === 'log-streams.json'
    || path.startsWith('log-segments/')
    || path.startsWith('session-data/logs')
    || path.startsWith('session-data/log-streams/')) {
    return 'Logs'
  }
  if (path === 'device-profile.json' || path === 'session-data/device-profile.json') {
    return 'Device profile'
  }
  if (path === 'analyses.json' || path.startsWith('session-data/analyses')) {
    return 'Analyses'
  }
  if (path === 'annotations.json' || path.startsWith('session-data/annotations')) {
    return 'Annotations'
  }
  if (path === 'agent-tasks.json') {
    return 'Agent task links'
  }
  if (path === 'images.json' || path === 'images.jsonl') {
    return 'Image index'
  }
  if (path === 'touches.json' || path === 'touches.jsonl' || path.startsWith('session-data/touches')) {
    return 'Touch input'
  }
  if (path === 'application-events.json') {
    return 'Application events'
  }
  if (path.startsWith('network/')) {
    return 'Network requests'
  }
  if (path === 'trends-results.json') {
    return 'Trends results'
  }
  if (path === 'metric-channels.json') {
    return 'Metric channels'
  }
  if (path.startsWith('telemetry/') || path.startsWith('session-data/telemetry')) {
    return 'Telemetry'
  }
  if (kind === 'screenshot' || path.startsWith('images/') || path.startsWith('session-images/')) {
    return 'Screenshots'
  }
  if (path === 'visual-trees.json' || path.startsWith('visual-trees/') || path.startsWith('session-data/visual-trees')) {
    return 'Visual trees'
  }
  if (kind === 'artifact' || path.startsWith('artifacts/')) {
    return 'Artifacts'
  }
  if (kind === 'app_icon' || /^app-icon\./.test(path)) {
    return 'App assets'
  }
  return 'Other files'
}

function buildStorageBreakdownGradient(items: SessionStorageBreakdownItem[], totalSizeBytes: number): string {
  if (items.length === 0 || totalSizeBytes <= 0) {
    return 'conic-gradient(var(--border) 0% 100%)'
  }

  let offset = 0
  const stops = items.map((item) => {
    const start = offset
    offset += (item.sizeBytes / totalSizeBytes) * 100
    return `${resolveStorageBreakdownColor(item.label)} ${start.toFixed(3)}% ${Math.min(100, offset).toFixed(3)}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}

function resolveStorageBreakdownColor(label: string): string {
  return storageBreakdownColors[label] ?? '#A1A1AA'
}

function formatStoragePercentage(sizeBytes: number, totalSizeBytes: number): string {
  if (totalSizeBytes <= 0) {
    return '0%'
  }

  const percentage = (sizeBytes / totalSizeBytes) * 100
  return percentage < 0.1 && percentage > 0 ? '<0.1%' : `${percentage.toFixed(1).replace(/\.0$/, '')}%`
}

const storageBreakdownColors: Record<string, string> = {
  Logs: '#FA441F',
  Screenshots: '#22C55E',
  Telemetry: '#3B82F6',
  'Visual trees': '#A855F7',
  Artifacts: '#06B6D4',
  Analyses: '#EAB308',
  Annotations: '#EF4444',
  'Agent task links': '#D946EF',
  'Touch input': '#F97316',
  'Application events': '#0EA5E9',
  'Network requests': '#6366F1',
  'Trends results': '#10B981',
  'Metric channels': '#14B8A6',
  'Session summary': '#FC8B70',
  'Device profile': '#8B5CF6',
  'Image index': '#84CC16',
  'App assets': '#EC4899',
  'Session archive': '#64748B',
  'Other files': '#71717A',
}

function formatOperatingSystem(session: TeamSession, deviceProfile?: JsonRecord | null): string {
  const device = getRecord(deviceProfile, 'device')
  const deviceProfileOperatingSystem = joinDisplay(getString(device, 'osName'), getString(device, 'osVersion'))
  if (deviceProfileOperatingSystem) {
    return deviceProfileOperatingSystem
  }

  return [session.operating_system, session.device_os_name]
    .filter((value): value is string => !!value?.trim())
    .join(' / ') || 'Unknown'
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) {
    return 'Unknown'
  }

  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function formatDateTimeFromMs(value: number): string {
  if (!Number.isFinite(value)) {
    return 'Unknown'
  }

  return formatDateTime(new Date(value).toISOString())
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function formatTimeFromMs(value: number): string {
  if (!Number.isFinite(value)) {
    return 'Unknown'
  }

  const date = new Date(value)
  return [
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].map((part) => String(part).padStart(2, '0')).join(':') + `.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function formatTimelineElapsedDuration(value: number, range: TimelineRange): string {
  if (!Number.isFinite(value)) {
    return 'Unknown'
  }

  const durationMs = Math.max(0, range.endMs - range.startMs)
  const elapsedMs = clamp(value - range.startMs, 0, durationMs)
  const totalSeconds = Math.round(elapsedMs / 1_000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (durationMs >= 60 * 60 * 1_000) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatTime(value: string | null | undefined): string {
  const timestampMs = toTimestamp(value)
  return timestampMs === null ? 'Unknown' : formatTimeFromMs(timestampMs)
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function getAiExtractionErrorMessage(error: unknown, fallback: string): string {
  const message = getErrorMessage(error, fallback)
  if (/no AI billing allowance remaining|no active OpenAI billing period/i.test(message)) {
    return 'This organisation has no billable AI credit remaining. Ask an Ansight administrator to update its billing allowance.'
  }
  if (/does not have an active cloud and AI access grant/i.test(message)) {
    return 'This organisation does not currently have cloud and AI access. Ask an Ansight administrator to enable a trial, month, or year.'
  }

  const durationMatch = message.match(/AI extraction is limited to (\d+) seconds/i)
  if (durationMatch) {
    const maxSeconds = Number(durationMatch[1])
    if (Number.isFinite(maxSeconds) && maxSeconds > 0) {
      return `This organisation allows ${formatDuration(secondsToMs(maxSeconds))} per AI extraction. Enter a shorter slice.`
    }
  }

  return message
}

function readStoredSessionReplayPanelWidth(): number {
  if (typeof window === 'undefined') {
    return sessionReplayPanelDefaultWidth
  }

  const storedText = window.localStorage.getItem(sessionReplayPanelWidthStorageKey)
  const storedValue = storedText === null ? Number.NaN : Number(storedText)
  return clampSessionReplayPanelWidth(Number.isFinite(storedValue) ? storedValue : sessionReplayPanelDefaultWidth)
}

function writeStoredSessionReplayPanelWidth(width: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(sessionReplayPanelWidthStorageKey, String(Math.round(clampSessionReplayPanelWidth(width))))
}

function clampSessionReplayPanelWidth(width: number): number {
  return Math.round(clamp(width, sessionReplayPanelMinWidth, resolveSessionReplayPanelMaxWidth()))
}

function resolveSessionReplayPanelMaxWidth(): number {
  if (typeof window === 'undefined') {
    return sessionReplayPanelMaxWidth
  }

  const viewportMax = window.innerWidth - sessionReplayPanelReservedWidth
  return Math.max(sessionReplayPanelMinWidth, Math.min(sessionReplayPanelMaxWidth, viewportMax))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
