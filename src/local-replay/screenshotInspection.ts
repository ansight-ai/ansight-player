export type ImageArtifact = { snapshotId: string; path: string }
export type ImageIgnoreRegion = { x: number; y: number; width: number; height: number }
export type SystemUiMaskResolution = {
  kind: 'statusBar' | 'navigationBar' | 'displayCutout'
  state: 'present' | 'absent'
  frameId: string
  regions: ImageIgnoreRegion[]
  reason?: string | null
}
export type ImageRegion = {
  id: string
  label: string
  geometry: { frameId: string; kind: 'rectangle'; text?: string; x: number; y: number; width: number; height: number }
  crop: ImageArtifact
}
export type ImageFinding = { id: string; verdict: 'pass' | 'fail' | 'inconclusive'; explanation: string; regionIds: string[] }
export type ScreenshotInspection = {
  capability: 'screenshot.compare' | 'screenshot.evaluate'
  sessionId: string
  passed: boolean
  message: string
  image: { artifact: ImageArtifact; frameId: string; capturedAtUtc: string }
  reference?: { artifact: ImageArtifact }
  overlay?: ImageArtifact
  ignoreRegions?: ImageIgnoreRegion[]
  systemUiMaskResolutions?: SystemUiMaskResolution[]
  ignoredPixelCount?: number
  totalPixelCount?: number
  evidence: ImageArtifact
  regions: ImageRegion[]
  regionsTruncated?: boolean
  criteria?: ImageFinding[]
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function artifact(value: unknown): value is ImageArtifact {
  return record(value) && typeof value.snapshotId === 'string' && value.snapshotId.length > 0
    && typeof value.path === 'string' && value.path.length > 0
}
function region(value: unknown, frameId: string): value is ImageRegion {
  if (!record(value) || typeof value.id !== 'string' || typeof value.label !== 'string' || !artifact(value.crop) || !record(value.geometry)) return false
  const bounds = value.geometry
  return bounds.frameId === frameId && bounds.kind === 'rectangle' && rectangle(bounds)
}
function rectangle(bounds: unknown): bounds is ImageIgnoreRegion {
  return record(bounds) && [bounds.x, bounds.y, bounds.width, bounds.height].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
    && (bounds.width as number) > 0 && (bounds.height as number) > 0
    && (bounds.x as number) + (bounds.width as number) <= 1 && (bounds.y as number) + (bounds.height as number) <= 1
}

export function readScreenshotInspection(content?: string | null): ScreenshotInspection | null {
  if (!content) return null
  try {
    const value: unknown = JSON.parse(content)
    if (!record(value) || !['screenshot.compare', 'screenshot.evaluate'].includes(String(value.capability))
      || typeof value.sessionId !== 'string' || typeof value.passed !== 'boolean' || typeof value.message !== 'string'
      || !record(value.image) || !artifact(value.image.artifact) || typeof value.image.frameId !== 'string'
      || typeof value.image.capturedAtUtc !== 'string' || !Number.isFinite(Date.parse(value.image.capturedAtUtc))
      || !artifact(value.evidence) || !Array.isArray(value.regions) || value.regions.length > 64) return null
    const image = value.image
    if (!value.regions.every(item => region(item, image.frameId as string))) return null
    if (value.reference !== undefined && (!record(value.reference) || !artifact(value.reference.artifact))) return null
    if (value.overlay !== undefined && !artifact(value.overlay)) return null
    if (value.ignoreRegions !== undefined && (!Array.isArray(value.ignoreRegions) || value.ignoreRegions.length > 64
      || !value.ignoreRegions.every(rectangle))) return null
    if (value.systemUiMaskResolutions !== undefined && (!Array.isArray(value.systemUiMaskResolutions)
      || value.systemUiMaskResolutions.length > 3 || !value.systemUiMaskResolutions.every(item => record(item)
        && ['statusBar', 'navigationBar', 'displayCutout'].includes(String(item.kind))
        && ['present', 'absent'].includes(String(item.state)) && item.frameId === image.frameId
        && Array.isArray(item.regions) && item.regions.length <= 64 && item.regions.every(rectangle)
        && (item.state === 'present' ? item.regions.length > 0 : item.regions.length === 0)
        && (item.reason == null || typeof item.reason === 'string')))) return null
    if ([value.ignoredPixelCount, value.totalPixelCount].some(count => count !== undefined
      && (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0))) return null
    const ids = new Set(value.regions.map(item => item.id))
    if (value.criteria !== undefined && (!Array.isArray(value.criteria) || value.criteria.length > 16
      || !value.criteria.every(item => record(item) && typeof item.id === 'string' && typeof item.explanation === 'string'
        && ['pass', 'fail', 'inconclusive'].includes(String(item.verdict)) && Array.isArray(item.regionIds)
        && item.regionIds.every(id => typeof id === 'string' && ids.has(id))))) return null
    return value as ScreenshotInspection
  } catch { return null }
}

/** Always use this host's retained artifact route; never accept a URL from model output. */
export function screenshotArtifactUrl(sessionId: string, file: ImageArtifact): string {
  const query = new URLSearchParams({ snapshotId: file.snapshotId, path: file.path })
  return `api/sessions/${encodeURIComponent(sessionId)}/artifacts/content?${query}`
}
