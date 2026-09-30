import { getCloudPlayerAdapter } from '../adapters/cloudPlayerAdapter'
import type { TeamSession } from '../types'

export type SharedSessionStreamManifest = {
  schema: string
  createdAtUtc: string
  teamId: string
  teamName: string
  sessionRowId: string
  sessionName?: string | null
  sourceSessionId: string
  appId: string
  appName: string
  author?: {
    userId?: string
    email?: string
    name?: string
    company?: string
  } | null
  files: SharedSessionStreamFile[]
}

export type SharedSessionStreamFile = {
  entryPath: string
  storagePath: string
  contentType: string
  kind: string
  byteSize: number
  decodedByteSize?: number
  contentEncoding?: string | null
}

export type SessionStorageBreakdown = {
  totalSizeBytes: number
  fileCount: number
  items: SessionStorageBreakdownItem[]
}

export type SessionStorageBreakdownItem = {
  label: string
  sizeBytes: number
}

export type SessionCaptureDocument = {
  schema?: string
  savedAtUtc?: string
  author?: SessionAuthor | null
  session?: SessionSnapshot
  visualTreeSnapshotIndex?: SessionVisualTreeSnapshotIndexEntry[]
}

export type SessionVisualTreeSnapshotIndexEntry = {
  entryPath: string
  header: SessionVisualTreeSnapshot
}

export type SessionAuthor = {
  email?: string | null
  name?: string | null
  company?: string | null
}

export type SessionSnapshot = {
  sessionId?: string
  appId?: string
  clientName?: string
  remoteAddress?: string
  name?: string | null
  createdUtc?: string
  configId?: string | null
  processSessionId?: string | null
  lastUpdatedUtc?: string
  status?: string
  isHistorical?: boolean
  cacheSizeBytes?: number
  isPinned?: boolean
  author?: SessionAuthor | null
  tags?: string[] | null
  notes?: string | null
  customProperties?: Record<string, Record<string, unknown>> | null
  appState?: string | number | null
  appStateChangedUtc?: string | null
  applicationEvents?: SessionApplicationEvent[]
  captureSource?: string | null
  sdkVersion?: string | null
  deviceProfile?: unknown
  deviceProfileJson?: string | null
  logs?: SessionLogEntry[]
  logStreams?: SessionLogStream[]
  totalLogCount?: number
  retainedLogStartIndex?: number
  images?: SessionImageFrame[]
  analyses?: SessionAnalysisRecord[]
  annotations?: SessionAnnotation[]
  visualTreeSnapshots?: SessionVisualTreeSnapshot[]
  artifactSnapshots?: SessionArtifactSnapshot[]
  touches?: SessionTouchInputRecord[]
  networkRequests?: SessionNetworkRequest[]
  metricChannels?: SessionMetricChannel[]
  metrics?: SessionMetricSample[]
  totalImageCount?: number
  totalMetricChannelCount?: number
  totalMetricSampleCount?: number
  totalNetworkRequestCount?: number
}

export type SessionApplicationEvent = {
  eventId: string
  label: string
  eventType: string
  capturedAtUtc: string
  details?: string
  channelId?: number
}

export type SessionNetworkHeader = {
  name: string
  value: string
}

export type SessionNetworkBody = {
  contentType?: string | null
  encoding: 'utf8' | 'base64'
  data: string
  capturedBytes: number
  totalBytes?: number | null
  truncated: boolean
}

export type SessionNetworkRequest = {
  schema: 'ansight.network-request.v1' | string
  id: string
  source: string
  startedAtUtc: string
  completedAtUtc: string
  durationMilliseconds: number
  method: string
  url: string
  protocol?: string | null
  requestHeaders?: SessionNetworkHeader[]
  requestBodySizeBytes?: number | null
  requestBody?: SessionNetworkBody | null
  statusCode?: number | null
  reasonPhrase?: string | null
  responseHeaders?: SessionNetworkHeader[]
  responseBodySizeBytes?: number | null
  responseBody?: SessionNetworkBody | null
  errorType?: string | null
  errorMessage?: string | null
}

export type SessionLogEntry = {
  streamId?: string
  timestampUtc?: string
  message?: string
  priority?: string | number
  source?: string
  tag?: string
  eventId?: string | null
  processId?: number | null
  threadId?: number | null
}

export type SessionLogStream = {
  streamId: string
  kind: string
  displayName: string
  status: string
  startedUtc?: string | null
  endedUtc?: string | null
  statusMessage?: string | null
  metadata?: Record<string, string>
  entries?: SessionLogEntry[]
  totalEntryCount?: number
  retainedEntryStartIndex?: number
}

export type SessionImageFrame = {
  frameId: string
  capturedAtUtc?: string
  format?: string
  width?: number
  height?: number
  quality?: number
  byteCount?: number
}

export type SessionVideoFrameIndexEntry = {
  frameId: string
  capturedAtUtc?: string
  presentationTimeUs: number
  durationUs: number
  sourceWidth?: number
  sourceHeight?: number
}

export type SessionVideoFrameIndex = {
  schema: string
  container: string
  codec: string
  encoder?: string
  timeBaseUnitsPerSecond: number
  videoStartOffsetUs: number
  durationUs: number
  width: number
  height: number
  frames: SessionVideoFrameIndexEntry[]
}

export type SessionTouchInputRecord = {
  id: string
  action: string
  capturedAtUtc?: string
  pointerId: number
  pointerIndex: number
  pointerCount: number
  x: number
  y: number
  normalizedX?: number | null
  normalizedY?: number | null
  surfaceWidth?: number | null
  surfaceHeight?: number | null
  coordinateSpace?: string
  coordinateUnit: string
  surfaceScale?: number | null
}

export type SessionAnalysisRecord = {
  analysisId?: string
  agentId?: string
  analysisKind?: string
  startedUtc?: string
  completedUtc?: string | null
  success?: boolean
  statusMessage?: string | null
  prompt?: string | null
  transcript?: string | null
  finalResponse?: string | null
  mermaidDefinition?: string | null
}

export type SessionAnnotation = {
  annotationId?: string
  startUtc?: string
  endUtc?: string | null
  label?: string
  source?: string
  notes?: string | null
  captureGroupId?: string | null
  customData?: Record<string, unknown> | null
  geometry?: SessionAnnotationGeometry[]
  target?: SessionAnnotationTarget | null
}

export type SessionAnnotationGeometry = {
  geometryId?: string
  frameId?: string
  capturedAtUtc?: string
  kind?: string | number
  x?: number
  y?: number
  width?: number | null
  height?: number | null
  points?: SessionAnnotationGeometryPoint[]
  text?: string | null
  strokeColor?: string | null
  strokeWidth?: number | null
}

export type SessionAnnotationGeometryPoint = {
  x: number
  y: number
}

export type SessionAnnotationTarget = {
  kind?: string
  source?: string
  targetId?: string
  visualTreeSnapshotId?: string
  type?: string
  elementKind?: string
  label?: string
  automationId?: string
  depth?: number
  childCount?: number
  absoluteBounds?: SessionAnnotationTargetBounds | null
  normalizedBounds?: SessionAnnotationTargetBounds | null
}

export type SessionAnnotationTargetBounds = {
  x?: number
  y?: number
  width?: number
  height?: number
}

export type SessionVisualTreeSnapshot = {
  snapshotId?: string
  capturedAtUtc?: string
  visualTreeKind?: string
  visualTreeFormat?: string
  runtimePlatform?: string
  source?: string
  nodeCount?: number
  truncated?: boolean
  screenshotFrameId?: string | null
  payload?: unknown
}

export type SessionArtifactSnapshot = {
  snapshotId?: string
  capturedAtUtc?: string
  source?: string
  rootAlias?: string
  rootPath?: string
  relativePath?: string
  name?: string
  kind?: string
  artifactDirectoryName?: string
  directoryCount?: number
  fileCount?: number
  byteCount?: number
  truncated?: boolean
  entries?: SessionArtifactEntry[]
  payload?: unknown
}

export type SessionArtifactEntry = {
  name?: string
  rootAlias?: string
  relativePath?: string
  snapshotRelativePath?: string
  kind?: string
  sizeBytes?: number
  fileExtension?: string
  mimeType?: string
  lastModifiedUtc?: string
  archiveRelativePath?: string
}

export type SessionMetricChannel = {
  channelId: number
  name: string
  colorHex?: string
  type?: string | null
  unit?: string | null
  source?: string | null
  group?: string | null
  kind?: string | null
}

export type SessionMetricSample = {
  channelId: number
  value: number
  capturedAtUtc?: string
  segmentId?: number
}

export type SessionViewerPayload = {
  session: TeamSession
  manifest: SharedSessionStreamManifest
  capture: SessionCaptureDocument
  video?: {
    file: SharedSessionStreamFile
    index: SessionVideoFrameIndex
  } | null
}

export type SessionLiveFileRoot = {
  alias: string
  path?: string
}

export type SessionLiveFileEntry = {
  name: string
  relativePath: string
  rootAlias: string
  kind: string
  sizeBytes?: number
  fileExtension?: string
  mimeType?: string
  lastModifiedUtc?: string
}

export type SessionLiveFileDirectory = {
  provider?: 'adb' | 'simulator-filesystem' | 'sdk'
  availableRoots?: SessionLiveFileRoot[]
  rootAlias?: string
  relativePath?: string
  entries?: SessionLiveFileEntry[]
  truncated?: boolean
  capturedAtUtc?: string
}

export type SessionLiveFileListOptions = {
  recursive?: boolean
  maxDepth?: number
  maxEntries?: number
}

export type SessionLiveFileContent = {
  isSuccess?: boolean
  message?: string
  viewerKind?: string
  fileName?: string
  fileExtension?: string
  mimeType?: string
  language?: string
  formatLabel?: string
  contentType?: string
  sizeBytes?: number
  bytesRead?: number
  isTruncated?: boolean
  truncated?: boolean
  encoding?: string
  text?: string
  rawText?: string
  contentUrl?: string
  base64?: string
  databaseSchema?: SessionFileDatabaseSchema
  structuredData?: SessionFileStructuredData
  artifactDetails?: SessionFileArtifactDetails
}

export type SessionFileArtifactDetails = {
  downloadedAtUtc?: string
  sha256?: string
  sha1?: string
  md5?: string
}

export type SessionFileStructuredData = {
  root: SessionFileStructuredNode
  isTruncated: boolean
}

export type SessionFileStructuredNode = {
  name: string
  kind: string
  value?: string | null
  children: SessionFileStructuredNode[]
}

export type SessionFileDatabaseSchema = {
  databasePath: string
  objects: SessionFileDatabaseObject[]
}

export type SessionFileDatabaseObject = {
  name: string
  type: string
  sql: string
  columns: SessionFileDatabaseColumn[]
}

export type SessionFileDatabaseColumn = {
  name: string
  key: string
  declaredType: string
  isNullable: boolean
  isPrimaryKey: boolean
  defaultValue: string
}

export type SessionFileDatabaseQueryResult = {
  isSuccess: boolean
  message: string
  sql: string
  columns: SessionFileDatabaseColumn[]
  rows: string[][]
  isTruncated: boolean
}

export type LoadSessionViewerPayloadOptions = {
  superAdminMode?: boolean
}

export type LoadSessionViewerExternalPayloadOptions = {
  includeVisualTrees?: boolean
}

export async function loadSessionViewerPayload(
  sessionId: string,
  options: LoadSessionViewerPayloadOptions = {},
): Promise<SessionViewerPayload> {
  return getCloudPlayerAdapter().sessions.loadSessionViewerPayload(sessionId, options)
}

export async function createRawSessionArchiveSignedUrl(session: TeamSession): Promise<string> {
  return getCloudPlayerAdapter().sessions.createRawSessionArchiveSignedUrl(session)
}

export async function loadSessionViewerExternalPayload(
  payload: SessionViewerPayload,
  options: LoadSessionViewerExternalPayloadOptions = {},
): Promise<SessionViewerPayload> {
  return getCloudPlayerAdapter().sessions.loadSessionViewerExternalPayload(payload, options)
}

export async function loadSessionVisualTreeSnapshot(
  payload: SessionViewerPayload,
  snapshot: SessionVisualTreeSnapshot,
): Promise<SessionVisualTreeSnapshot | null> {
  return getCloudPlayerAdapter().sessions.loadSessionVisualTreeSnapshot(payload, snapshot)
}

export async function createSessionFileSignedUrl(session: TeamSession, file: SharedSessionStreamFile): Promise<string> {
  return getCloudPlayerAdapter().sessions.createSessionFileSignedUrl(session, file)
}

export async function createSessionFileSignedUrls(
  session: TeamSession,
  files: SharedSessionStreamFile[],
): Promise<Map<string, string>> {
  return getCloudPlayerAdapter().sessions.createSessionFileSignedUrls(session, files)
}

export async function readCloudSessionArtifactFile(
  payload: SessionViewerPayload,
  snapshotId: string | null,
  path: string,
  forceText = false,
  allowLargeFile = false,
): Promise<SessionLiveFileContent> {
  return getCloudPlayerAdapter().sessions.readCloudSessionArtifactFile(payload, snapshotId, path, forceText, allowLargeFile)
}

export function findManifestFile(manifest: SharedSessionStreamManifest, entryPath: string): SharedSessionStreamFile | null {
  const normalizedEntryPath = normalizeEntryPath(entryPath)
  return manifest.files.find((file) => normalizeEntryPath(file.entryPath) === normalizedEntryPath) ?? null
}

export function findImageFile(manifest: SharedSessionStreamManifest, frame: SessionImageFrame): SharedSessionStreamFile | null {
  const frameId = frame.frameId?.trim()
  if (!frameId) {
    return null
  }

  const preferredEntryPath = `session-images/${frameId}.${resolveImageExtension(frame.format)}`
  return (
    findManifestFile(manifest, preferredEntryPath) ??
    manifest.files.find((file) => file.kind === 'screenshot' && normalizeEntryPath(file.entryPath).startsWith(`session-images/${frameId}.`)) ??
    null
  )
}

export function findSessionVideoFile(manifest: SharedSessionStreamManifest): SharedSessionStreamFile | null {
  return (
    findManifestFile(manifest, 'session-video/session.mp4')
    ?? manifest.files.find((file) => file.kind === 'session_video' || file.contentType === 'video/mp4')
    ?? null
  )
}

export function findSessionVideoIndexFile(manifest: SharedSessionStreamManifest): SharedSessionStreamFile | null {
  return (
    findManifestFile(manifest, 'session-video/frame-index.json')
    ?? manifest.files.find((file) => file.kind === 'session_video_index')
    ?? null
  )
}

function normalizeEntryPath(entryPath: string): string {
  return entryPath.trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function resolveImageExtension(format: string | undefined): string {
  const normalizedFormat = format?.trim().replace(/^\./, '').toLowerCase()
  if (!normalizedFormat) {
    return 'bin'
  }

  return normalizedFormat === 'jpeg' ? 'jpg' : normalizedFormat
}

export type SessionViewerDataServices = {
  loadSessionViewerPayload: (sessionId: string, options?: LoadSessionViewerPayloadOptions) => Promise<SessionViewerPayload>
  createRawSessionArchiveSignedUrl: (session: TeamSession) => Promise<string>
  loadSessionViewerExternalPayload: (payload: SessionViewerPayload, options?: LoadSessionViewerExternalPayloadOptions) => Promise<SessionViewerPayload>
  loadSessionVisualTreeSnapshot: (payload: SessionViewerPayload, snapshot: SessionVisualTreeSnapshot) => Promise<SessionVisualTreeSnapshot | null>
  createSessionFileSignedUrl: (session: TeamSession, file: SharedSessionStreamFile) => Promise<string>
  createSessionFileSignedUrls: (session: TeamSession, files: SharedSessionStreamFile[]) => Promise<Map<string, string>>
  readCloudSessionArtifactFile: (payload: SessionViewerPayload, snapshotId: string | null, path: string, forceText?: boolean, allowLargeFile?: boolean) => Promise<SessionLiveFileContent>
}
