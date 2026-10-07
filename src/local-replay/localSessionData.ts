import { artifactTimelineHref } from './artifactLinks'
import { readSessionOperationStream, type SessionOperationProgress } from './sessionOperationStream'
import type { ArtifactComparisonSource, ArtifactListResult, ArtifactDiffResult } from '../replay/components/artifactComparison'
import type {
  SessionImageFrame,
  SessionAnnotation,
  SessionLiveFileContent,
  SessionLiveFileDirectory,
  SessionLiveFileListOptions,
  SessionFileDatabaseQueryResult,
  SessionLogStream,
  SessionSnapshot,
  SessionStorageBreakdown,
  SessionViewerPayload,
  SharedSessionStreamFile,
} from '../replay/sessionViewerData'
import type {
  TeamSession,
} from '../types'
import type {
  SessionOptimizationResult,
  SessionOptimizationProgress,
  SessionTimelineExtractionResult,
  SessionTimelineTrimMode,
  SessionViewerSource,
} from '../replay/pages/SessionViewerPage'
import type { LiveVisualTreeSource } from '../replay/LiveVisualTreeCaptureToolbar'
import type { ArtifactApplication, ArtifactFileTarget } from '../replay/components/ArtifactFileActions'
import type { LiveVisualTreeCaptureResponse, LocalAppToolResponse, LocalSessionLiveUpdate, OperationResponse } from './types'

const maximumLiveReplayLogCount = 10_000
const maximumLiveReplayMetricCount = 50_000

const artifactComparison: ArtifactComparisonSource = {
  timelineHref: reference => artifactTimelineHref(window.location.href, reference),
  list: request => postLocalHostOperation<ArtifactListResult>('api/artifacts/list', request),
  compare: request => postLocalHostOperation<ArtifactDiffResult>('api/artifacts/diff', request),
  sessions: async () => {
    const response = await fetch('api/sessions', { cache: 'no-store' })
    if (!response.ok) throw new Error(`Unable to list sessions: HTTP ${response.status}`)
    return response.json()
  },
}

export const localReplaySource: SessionViewerSource = {
  mode: 'local',
  runLocalSummary: runLocalSummary,
  deleteLocalSummary: deleteLocalSummary,
  artifactComparison,
  artifactFileOperations: {
    listApplications: listLocalArtifactApplications,
    open: (target, applicationId) => performLocalArtifactAction(target, 'open', applicationId),
    reveal: (target) => performLocalArtifactAction(target, 'reveal'),
    exportDesktop: (target) => performLocalArtifactAction(target, 'export-desktop'),
  },
  loadPayload: loadLocalPayload,
  loadStorageBreakdown: loadLocalStorageBreakdown,
  optimizeSession: optimizeLocalSession,
  refreshPayload: refreshLocalPayload,
  captureLiveFile: captureLocalLiveFile,
  captureLiveVisualTree: captureLocalLiveVisualTree,
  loadLiveVisualTreeSources: loadLocalLiveVisualTreeSources,
  deleteAnnotation: deleteLocalAnnotation,
  extractTimelineRange: extractLocalTimelineRange,
  listLiveFiles: listLocalLiveFiles,
  queryArtifactDatabase: queryLocalArtifactDatabase,
  queryLiveDatabase: queryLocalLiveDatabase,
  readArtifactFile: readLocalArtifactFile,
  readLiveFile: readLocalLiveFile,
  trimTimelineRange: trimLocalTimelineRange,
  loadImageUrl: async (payload, frame) => new URL(
    `api/sessions/${encodeURIComponent(payload.session.session_id || payload.session.id)}/frames/${encodeURIComponent(frame.frameId)}`,
    window.location.href,
  ).toString(),
  upsertAnnotation: upsertLocalAnnotation,
}

async function runLocalSummary(sessionId: string, onProgress: (progress: SessionOperationProgress) => void): Promise<void> {
  const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/local-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: '{}',
  })
  const result = response.headers.get('Content-Type')?.includes('application/x-ndjson')
    ? await readSessionOperationStream<{ isSuccess: boolean; message?: string }>(response, onProgress)
    : await response.json().catch(() => null) as { isSuccess: boolean; message?: string } | null
  if (!response.ok || !result?.isSuccess) {
    throw new Error(result?.message || `Unable to run a local session summary: HTTP ${response.status}`)
  }
}

async function deleteLocalSummary(sessionId: string, analysisId: string): Promise<string> {
  return postLocalAnnotationOperation(
    `api/sessions/${encodeURIComponent(sessionId)}/analyses/${encodeURIComponent(analysisId)}/delete`,
    {},
  )
}

export type LocalSessionOptimizationOptions = {
  encodeVideo: boolean
  optimizeScreenshots: boolean
  visualTreeTypes: Array<{ visualTreeKind: string; visualTreeFormat: string; runtimePlatform: string; source: string }> | null
}

export async function optimizeLocalSession(
  sessionId: string,
  optionsOrEncodeVideo: boolean | LocalSessionOptimizationOptions,
  onProgress: (progress: SessionOptimizationProgress) => void,
): Promise<SessionOptimizationResult> {
  const options = typeof optionsOrEncodeVideo === 'boolean'
    ? { encodeVideo: optionsOrEncodeVideo, optimizeScreenshots: true, visualTreeTypes: null }
    : optionsOrEncodeVideo
  const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/optimize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options),
  })
  if (!response.ok || !response.body) throw new Error(`Unable to optimise session: HTTP ${response.status}`)
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let result: SessionOptimizationResult | null = null
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += value ?? ''
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      if (done && buffer.trim()) lines.push(buffer)
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as { status: string; message?: string; progress?: SessionOptimizationProgress; result?: SessionOptimizationResult }
        if (event.status === 'error') throw new Error(event.message || 'Session optimisation failed.')
        if (event.progress) onProgress(event.progress)
        if (event.status === 'success' && event.result) result = event.result
      }
      if (done) break
    }
  } finally { reader.releaseLock() }
  if (!result) throw new Error('The host connection ended before optimisation completed. Reopen session info to check the session before retrying.')
  return result
}

async function extractLocalTimelineRange(
  sessionId: string,
  startUtc: string,
  endUtc: string,
  name?: string,
): Promise<SessionTimelineExtractionResult> {
  const result = await postLocalHostOperation<{
    isSuccess: boolean
    message: string
    extractedSessionId?: string | null
  }>(
    `api/sessions/${encodeURIComponent(sessionId)}/extract`,
    { startUtc, endUtc, name },
  )
  if (!result.extractedSessionId) {
    throw new Error(result.message || 'The local host did not return the extracted session ID.')
  }

  return {
    message: result.message,
    extractedSessionId: result.extractedSessionId,
  }
}

async function trimLocalTimelineRange(
  sessionId: string,
  startUtc: string,
  endUtc: string,
  mode: SessionTimelineTrimMode,
  onProgress: (progress: SessionOperationProgress) => void = () => {},
): Promise<string> {
  const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/trim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ startUtc, endUtc, mode }),
  })
  const result = response.headers.get('Content-Type')?.includes('application/x-ndjson')
    ? await readSessionOperationStream<OperationResponse>(response, onProgress)
    : await response.json() as OperationResponse
  if (!response.ok || !result.isSuccess) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
  return result.message
}

async function loadLocalStorageBreakdown(sessionId: string): Promise<SessionStorageBreakdown> {
  const response = await fetch(
    `api/sessions/${encodeURIComponent(sessionId)}/storage`,
    { cache: 'no-store' },
  )
  if (!response.ok) {
    throw new Error(`The local session server could not load storage details (HTTP ${response.status}).`)
  }

  return response.json() as Promise<SessionStorageBreakdown>
}

async function upsertLocalAnnotation(sessionId: string, annotation: SessionAnnotation): Promise<string> {
  return postLocalAnnotationOperation(
    `api/sessions/${encodeURIComponent(sessionId)}/annotations`,
    annotation,
  )
}

async function deleteLocalAnnotation(sessionId: string, annotationId: string): Promise<string> {
  return postLocalAnnotationOperation(
    `api/sessions/${encodeURIComponent(sessionId)}/annotations/${encodeURIComponent(annotationId)}/delete`,
    {},
  )
}

async function postLocalAnnotationOperation(path: string, body: unknown): Promise<string> {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const result = await response.json() as OperationResponse
  if (!response.ok || !result.isSuccess) {
    throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
  }

  return result.message
}

async function refreshLocalPayload(
  sessionId: string,
  current: SessionViewerPayload,
): Promise<SessionViewerPayload> {
  const capture = current.capture.session
  if (!capture) {
    return loadLocalPayload(sessionId)
  }

  const query = new URLSearchParams({
    logIndex: String(capture.totalLogCount ?? capture.logs?.length ?? 0),
    imageIndex: String(capture.totalImageCount ?? capture.images?.length ?? 0),
    touchIndex: String(capture.touches?.length ?? 0),
    networkRequestIndex: String(capture.networkRequests?.length ?? 0),
    visualTreeIndex: String(capture.visualTreeSnapshots?.length ?? 0),
    artifactIndex: String(capture.artifactSnapshots?.length ?? 0),
    metricIndex: String(capture.totalMetricSampleCount ?? capture.metrics?.length ?? 0),
    metricChannelCount: String(capture.totalMetricChannelCount ?? capture.metricChannels?.length ?? 0),
    annotationCount: String(capture.annotations?.length ?? 0),
    analysisCount: String(capture.analyses?.length ?? 0),
  })
  const response = await fetch(
    `api/sessions/${encodeURIComponent(sessionId)}/updates?${query.toString()}`,
    { cache: 'no-store' },
  )
  if (!response.ok) {
    throw new Error(`The local session server returned HTTP ${response.status}.`)
  }

  const update = await response.json() as LocalSessionLiveUpdate
  if (update.requiresReset) {
    return loadLocalPayload(sessionId)
  }

  const hasChanges = update.lastUpdatedUtc !== capture.lastUpdatedUtc
    || update.status !== capture.status
    || update.appState !== capture.appState
    || update.appStateChangedUtc !== capture.appStateChangedUtc
    || update.logs.length > 0
    || update.images.length > 0
    || update.touches.length > 0
    || update.networkRequests.length > 0
    || update.visualTreeSnapshots.length > 0
    || update.artifactSnapshots.length > 0
    || update.metricChannels.length > 0
    || update.metrics.length > 0
    || update.totalAnnotationCount !== (capture.annotations?.length ?? 0)
    || update.totalAnalysisCount !== (capture.analyses?.length ?? 0)
  if (!hasChanges) {
    return current
  }

  const logs = appendAndTrim(capture.logs ?? [], update.logs, maximumLiveReplayLogCount)
  const images = mergeByKey(capture.images ?? [], update.images, (frame) => frame.frameId)
  const touches = mergeByKey(capture.touches ?? [], update.touches, (touch) => touch.id)
  const networkRequests = mergeByKey(capture.networkRequests ?? [], update.networkRequests, (request) => request.id)
  const visualTreeSnapshots = mergeByKey(
    capture.visualTreeSnapshots ?? [],
    update.visualTreeSnapshots,
    (snapshot) => snapshot.snapshotId || snapshot.capturedAtUtc || JSON.stringify(snapshot.payload),
  )
  const artifactSnapshots = mergeByKey(
    capture.artifactSnapshots ?? [],
    update.artifactSnapshots,
    (snapshot) => snapshot.snapshotId || snapshot.capturedAtUtc || snapshot.name || '',
  )
  if ((capture.metrics?.length ?? 0) + update.metrics.length > maximumLiveReplayMetricCount) {
    return loadLocalPayload(sessionId)
  }
  const metrics = appendAndTrim(capture.metrics ?? [], update.metrics, maximumLiveReplayMetricCount)
  const metricChannels = update.totalMetricChannelCount === (capture.metricChannels?.length ?? 0)
    ? (capture.metricChannels ?? [])
    : update.metricChannels
  const annotations = update.totalAnnotationCount === (capture.annotations?.length ?? 0)
    ? (capture.annotations ?? [])
    : update.annotations
  const analyses = update.totalAnalysisCount === (capture.analyses?.length ?? 0)
    ? (capture.analyses ?? [])
    : update.analyses
  const logStreams = mergeLogStreams(capture.logStreams ?? [], update.logStreams)
  const nextCapture: SessionSnapshot = {
    ...capture,
    status: update.status,
    lastUpdatedUtc: update.lastUpdatedUtc,
    appState: update.appState,
    appStateChangedUtc: update.appStateChangedUtc,
    customProperties: update.customProperties === undefined ? capture.customProperties : update.customProperties,
    applicationEvents: update.lifecycleEvents === undefined ? capture.applicationEvents : [
      ...(capture.applicationEvents ?? []).filter(event =>
        event.label !== 'lifecycle.foreground' && event.label !== 'lifecycle.background'),
      ...update.lifecycleEvents,
    ],
    logs,
    logStreams,
    totalLogCount: update.totalLogCount,
    images,
    totalImageCount: update.totalImageCount,
    touches,
    networkRequests,
    totalNetworkRequestCount: update.totalNetworkRequestCount,
    visualTreeSnapshots,
    artifactSnapshots,
    metricChannels,
    totalMetricChannelCount: update.totalMetricChannelCount,
    metrics,
    totalMetricSampleCount: update.totalMetricSampleCount,
    annotations,
    analyses,
  }
  const files = mergeByKey(current.manifest.files, update.images.map(createFrameFile), (file) => file.entryPath)
  const createdUtc = nextCapture.createdUtc || current.session.captured_start_at || update.lastUpdatedUtc
  const session = createLocalTeamSession(nextCapture, sessionId, createdUtc, update.lastUpdatedUtc, files)
  return {
    session,
    manifest: {
      ...current.manifest,
      files,
    },
    capture: {
      ...current.capture,
      savedAtUtc: update.lastUpdatedUtc,
      session: nextCapture,
    },
  }
}

async function listLocalLiveFiles(
  sessionId: string,
  root: string | null,
  path: string,
  includeHidden: boolean,
  options?: SessionLiveFileListOptions,
): Promise<SessionLiveFileDirectory> {
  return postLocalAppTool<SessionLiveFileDirectory>(
    `api/sessions/${encodeURIComponent(sessionId)}/files/list`,
    { root, path, includeHidden, ...options },
  )
}

async function readLocalLiveFile(
  sessionId: string,
  root: string,
  path: string,
  forceText = false,
  allowLargeFile = false,
): Promise<SessionLiveFileContent> {
  const content = await postLocalHostOperation<SessionLiveFileContent>(
    `api/sessions/${encodeURIComponent(sessionId)}/files/preview`,
    { root, path, forceText, allowLargeFile },
  )
  if (!['model3d', 'audio', 'video'].includes(content.viewerKind ?? '')) {
    return content
  }

  const parameters = new URLSearchParams({ root, path })
  return {
    ...content,
    contentUrl: new URL(
      `api/sessions/${encodeURIComponent(sessionId)}/files/content?${parameters}`,
      window.location.href,
    ).toString(),
    isTruncated: false,
    truncated: false,
  }
}

async function captureLocalLiveFile(
  sessionId: string,
  root: string,
  path: string,
): Promise<string> {
  const response = await fetch(
    `api/sessions/${encodeURIComponent(sessionId)}/files/capture`,
    {
      body: JSON.stringify({ root, path }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  )
  const result = await response.json() as LocalAppToolResponse
  if (!response.ok || !result.success) {
    throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
  }
  if (!result.artifactSnapshotId) {
    throw new Error('The file transfer completed without creating a timeline artifact.')
  }

  return result.artifactSnapshotId
}

async function queryLocalLiveDatabase(
  sessionId: string,
  path: string,
  sql: string,
  maxRows: number,
  root?: string,
): Promise<SessionFileDatabaseQueryResult> {
  return postLocalHostOperation<SessionFileDatabaseQueryResult>(
    `api/sessions/${encodeURIComponent(sessionId)}/files/query`,
    { path, sql, maxRows, root },
  )
}

async function listLocalArtifactApplications({ sessionId, snapshotId, path }: ArtifactFileTarget) {
  const parameters = new URLSearchParams({ path })
  if (snapshotId) parameters.set('snapshotId', snapshotId)
  const response = await fetch(
    `api/sessions/${encodeURIComponent(sessionId)}/artifacts/applications?${parameters}`,
    { cache: 'no-store' },
  )
  const result = await response.json() as { applications: ArtifactApplication[], isSuccess?: boolean, message?: string }
  if (!response.ok || result.isSuccess === false) {
    throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
  }
  return result
}

async function performLocalArtifactAction(
  { sessionId, snapshotId, path }: ArtifactFileTarget,
  action: 'open' | 'reveal' | 'export-desktop',
  applicationId?: string,
): Promise<string> {
  const result = await postLocalHostOperation<{ message: string }>(
    `api/sessions/${encodeURIComponent(sessionId)}/artifacts/${action}`,
    { snapshotId, path, applicationId },
  )
  return result.message
}

async function readLocalArtifactFile(
  sessionId: string,
  snapshotId: string | null,
  path: string,
  forceText = false,
  allowLargeFile = false,
): Promise<SessionLiveFileContent> {
  const content = await postLocalHostOperation<SessionLiveFileContent>(
    `api/sessions/${encodeURIComponent(sessionId)}/artifacts/preview`,
    { snapshotId, path, forceText, allowLargeFile },
  )
  if (!['model3d', 'audio', 'video'].includes(content.viewerKind ?? '')) {
    return content
  }

  const parameters = new URLSearchParams({ path })
  if (snapshotId) {
    parameters.set('snapshotId', snapshotId)
  }
  return {
    ...content,
    contentUrl: new URL(
      `api/sessions/${encodeURIComponent(sessionId)}/artifacts/content?${parameters}`,
      window.location.href,
    ).toString(),
    isTruncated: false,
    truncated: false,
  }
}

async function queryLocalArtifactDatabase(
  sessionId: string,
  snapshotId: string | null,
  path: string,
  sql: string,
  maxRows: number,
): Promise<SessionFileDatabaseQueryResult> {
  return postLocalHostOperation<SessionFileDatabaseQueryResult>(
    `api/sessions/${encodeURIComponent(sessionId)}/artifacts/query`,
    { snapshotId, path, sql, maxRows },
  )
}

async function postLocalHostOperation<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const result = await response.json() as T & { isSuccess?: boolean, message?: string }
  if (!response.ok || result.isSuccess === false) {
    throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
  }
  return result
}

async function postLocalAppTool<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const result = await response.json() as LocalAppToolResponse
  const payload = result.envelope?.payload
  if (!response.ok || !result.success || payload?.result === undefined) {
    throw new Error(payload?.message || result.message || `The local host returned HTTP ${response.status}.`)
  }

  return payload.result as T
}

async function loadLocalLiveVisualTreeSources(sessionId: string): Promise<LiveVisualTreeSource[]> {
  const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/visual-tree/sources`, { cache: 'no-store' })
  const result = await response.json() as OperationResponse & { sources: LiveVisualTreeSource[] }
  if (!response.ok || !result.isSuccess) {
    throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
  }
  return result.sources
}

async function captureLocalLiveVisualTree(sessionId: string, toolId: string): Promise<string> {
  const response = await fetch(
    `api/sessions/${encodeURIComponent(sessionId)}/visual-tree/capture`,
    {
      body: JSON.stringify({ toolId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  )
  const result = await response.json() as LiveVisualTreeCaptureResponse
  if (!response.ok || !result.isSuccess) {
    throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
  }

  return result.message
}

async function loadLocalPayload(sessionId: string): Promise<SessionViewerPayload> {
  const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`The local session server could not load session '${sessionId}' (HTTP ${response.status}).`)
  }

  const captureSession = await response.json() as SessionSnapshot
  const sourceSessionId = captureSession.sessionId || sessionId
  const createdUtc = captureSession.createdUtc || new Date().toISOString()
  const lastUpdatedUtc = captureSession.lastUpdatedUtc || createdUtc
  const files = (captureSession.images ?? []).map(createFrameFile)
  const session = createLocalTeamSession(captureSession, sourceSessionId, createdUtc, lastUpdatedUtc, files)
  return {
    session,
    manifest: {
      schema: 'ansight.local-session-replay.v1',
      createdAtUtc: createdUtc,
      teamId: 'local',
      teamName: 'Local',
      sessionRowId: sourceSessionId,
      sessionName: session.title,
      sourceSessionId,
      appId: captureSession.appId || '',
      appName: captureSession.clientName || captureSession.appId || '',
      files,
    },
    capture: {
      schema: 'ansight.session-capture.v1',
      savedAtUtc: lastUpdatedUtc,
      author: captureSession.author,
      session: captureSession,
    },
  }
}

function createLocalTeamSession(
  capture: SessionSnapshot,
  sessionId: string,
  createdUtc: string,
  lastUpdatedUtc: string,
  files: SharedSessionStreamFile[],
): TeamSession {
  const durationMs = Math.max(0, Date.parse(lastUpdatedUtc) - Date.parse(createdUtc))
  const artifactSnapshots = capture.artifactSnapshots ?? []
  return {
    id: sessionId,
    team_id: 'local',
    uploaded_by_user_id: null,
    app_id: capture.appId || null,
    app_name: capture.clientName || capture.appId || null,
    session_id: sessionId,
    title: capture.name || capture.clientName || sessionId,
    description: capture.notes || '',
    storage_bucket: 'local',
    storage_path: '',
    storage_layout: 'stream_manifest_v1',
    manifest_storage_path: null,
    stream_byte_size: files.reduce((total, file) => total + file.byteSize, 0),
    stream_file_count: files.length,
    archive_byte_size: 0,
    archive_content_type: 'application/zip',
    captured_start_at: createdUtc,
    captured_end_at: lastUpdatedUtc,
    uploaded_at: createdUtc,
    updated_at: lastUpdatedUtc,
    duration_ms: Number.isFinite(durationMs) ? durationMs : null,
    log_count: capture.totalLogCount ?? capture.logs?.length ?? 0,
    screenshot_count: capture.totalImageCount ?? capture.images?.length ?? 0,
    visual_tree_snapshot_count: capture.visualTreeSnapshots?.length ?? 0,
    artifact_snapshot_count: artifactSnapshots.length,
    artifact_file_count: artifactSnapshots.reduce((total, snapshot) => total + (snapshot.fileCount ?? 0), 0),
    artifact_byte_size: artifactSnapshots.reduce((total, snapshot) => total + (snapshot.byteCount ?? 0), 0),
    annotation_count: capture.annotations?.length ?? 0,
    analysis_count: capture.analyses?.length ?? 0,
    metric_sample_count: capture.totalMetricSampleCount ?? capture.metrics?.length ?? 0,
    metric_channel_count: capture.totalMetricChannelCount ?? capture.metricChannels?.length ?? 0,
    author_user_id: null,
    author_email: capture.author?.email || null,
    author_name: capture.author?.name || null,
    author_company: capture.author?.company || null,
    platform_key: null,
    operating_system: null,
    app_version: null,
    sdk_name: null,
    sdk_version: capture.sdkVersion || null,
    sdk_language: null,
    device_model: null,
    device_os_name: null,
    is_emulator: null,
    tags: capture.tags ?? [],
    metadata: { source: 'ansight-cli-local-replay' },
    access_status: 'team',
    archived_at: null,
    archived_by_user_id: null,
    capture_upload_id: null,
    upload_source: 'ansight',
  }
}

function createFrameFile(frame: SessionImageFrame): SharedSessionStreamFile {
  const extension = resolveImageExtension(frame.format)
  return {
    entryPath: `session-images/${frame.frameId}.${extension}`,
    storagePath: `frames/${encodeURIComponent(frame.frameId)}`,
    contentType: resolveImageContentType(extension),
    kind: 'screenshot',
    byteSize: frame.byteCount ?? 0,
  }
}

function resolveImageExtension(format: string | undefined): string {
  const normalized = format?.trim().replace(/^\./, '').toLowerCase()
  return normalized === 'jpeg' ? 'jpg' : normalized || 'bin'
}

function resolveImageContentType(extension: string): string {
  if (extension === 'jpg') {
    return 'image/jpeg'
  }
  if (extension === 'png' || extension === 'webp' || extension === 'gif') {
    return `image/${extension}`
  }
  return 'application/octet-stream'
}

function mergeLogStreams(
  current: SessionLogStream[],
  updates: SessionLogStream[],
): SessionLogStream[] {
  const currentById = new Map(current.map((stream) => [stream.streamId, stream]))
  return updates.map((update) => {
    const existing = currentById.get(update.streamId)
    return {
      ...existing,
      ...update,
      entries: appendAndTrim(existing?.entries ?? [], update.entries ?? [], maximumLiveReplayLogCount),
    }
  })
}

function appendAndTrim<T>(current: T[], additions: T[], maximumCount: number): T[] {
  if (additions.length === 0) {
    return current
  }

  const next = [...current, ...additions]
  return next.length <= maximumCount ? next : next.slice(next.length - maximumCount)
}

function mergeByKey<T>(current: T[], additions: T[], createKey: (value: T) => string): T[] {
  if (additions.length === 0) {
    return current
  }

  const keys = new Set(current.map(createKey))
  const next = [...current]
  for (const addition of additions) {
    const key = createKey(addition)
    if (!keys.has(key)) {
      keys.add(key)
      next.push(addition)
    }
  }
  return next
}
