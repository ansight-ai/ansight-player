export type ConnectivitySnapshot = {
  availability: 'available' | 'unavailable' | 'unknown'
  transports: string[]
  vpn?: boolean | null
  internetValidated?: boolean | null
  captivePortal?: boolean | null
  metered?: boolean | null
  expensive?: boolean | null
  lowDataMode?: boolean | null
}

export type ConnectivityQuality = {
  measuredAtUtc: string
  originalMeasuredAtUtc?: string | null
  source: string
  linkQuality?: 'unknown' | 'minimal' | 'moderate' | 'good' | null
  signalStrength?: number | null
  signalStrengthUnit?: string | null
  estimatedDownstreamKbps?: number | null
  estimatedUpstreamKbps?: number | null
}

export type ConnectivityRecord = {
  schema: 'ansight.connectivity.v1'
  id: string
  observationId: string
  sequence: number
  capturedAtUtc: string
  originalCapturedAtUtc?: string | null
  elapsedMilliseconds: number
  kind: 'snapshot' | 'change' | 'quality' | 'gap'
  source: string
  snapshot: ConnectivitySnapshot
  previousSnapshot?: ConnectivitySnapshot | null
  quality?: ConnectivityQuality | null
  reason?: string | null
  supportedMeasurements: string[]
}

export type ConnectivitySegment = { path: string; fromUtc: string; toUtc: string; recordCount: number }
export type ConnectivityIndex = {
  schema: 'ansight.connectivity-index.v1'
  retainedRecordCount: number
  retentionTrimmed?: boolean
  supportedMeasurements: string[]
  segments: ConnectivitySegment[]
  stateChanges?: ConnectivityRecord[]
}
export type ConnectivityWindow = {
  records: ConnectivityRecord[]
  overview: ConnectivityRecord[]
  fromMs: number
  toMs: number
  malformedCount: number
  retentionTrimmed: boolean
  supportedMeasurements: string[]
}

const availability = new Set(['available', 'unavailable', 'unknown'])
const transports = new Set(['wifi', 'cellular', 'ethernet', 'bluetooth', 'other'])
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function timestamp(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function snapshot(value: unknown): value is ConnectivitySnapshot {
  return object(value) && availability.has(String(value.availability)) && Array.isArray(value.transports)
    && value.transports.length <= 8 && value.transports.every((item) => transports.has(item))
    && ['vpn', 'internetValidated', 'captivePortal', 'metered', 'expensive', 'lowDataMode'].every((key) => value[key] == null || typeof value[key] === 'boolean')
}
export function parseConnectivityRecord(value: unknown): ConnectivityRecord | null {
  try {
    if (typeof value === 'string') {
      if (value.length > 32768) return null
      value = JSON.parse(value)
    }
    if (!object(value)) return null
    const fields = value
    if (value.schema !== 'ansight.connectivity.v1' || !snapshot(value.snapshot)
      || !['id', 'observationId', 'source'].every((key) => typeof fields[key] === 'string' && fields[key].length > 0 && fields[key].length <= 128)
      || !timestamp(value.capturedAtUtc) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0
      || !Number.isFinite(value.elapsedMilliseconds) || Number(value.elapsedMilliseconds) < 0
      || !['snapshot', 'change', 'quality', 'gap'].includes(String(value.kind))
      || !Array.isArray(value.supportedMeasurements) || value.supportedMeasurements.length > 32
      || !value.supportedMeasurements.every((item) => typeof item === 'string' && item.length <= 128)
      || (value.previousSnapshot != null && !snapshot(value.previousSnapshot))
      || (value.kind === 'change' && !snapshot(value.previousSnapshot))
      || (value.kind === 'gap' && value.snapshot.availability !== 'unknown')
      || (value.kind === 'quality' && !value.quality)) return null
    const quality = value.quality
    if (quality != null) {
      if (!object(quality) || !timestamp(quality.measuredAtUtc) || typeof quality.source !== 'string' || !quality.source || quality.source.length > 128
        || (quality.linkQuality != null && !['unknown', 'minimal', 'moderate', 'good'].includes(String(quality.linkQuality)))
        || (quality.signalStrength != null && (!Number.isFinite(quality.signalStrength) || !['dBm', 'level', 'bearer-specific'].includes(String(quality.signalStrengthUnit))))
        || !['estimatedDownstreamKbps', 'estimatedUpstreamKbps'].every((key) => quality[key] == null || (Number.isFinite(quality[key]) && Number(quality[key]) >= 0))) return null
    }
    return value as ConnectivityRecord
  } catch { return null }
}

export function sortConnectivity(records: ConnectivityRecord[]): ConnectivityRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()]
    .sort((left, right) => Date.parse(left.capturedAtUtc) - Date.parse(right.capturedAtUtc) || left.sequence - right.sequence || left.id.localeCompare(right.id))
}

export function connectivityFromEvents(events: { label: string; details?: string }[], fromMs: number, toMs: number): ConnectivityWindow {
  let malformedCount = 0
  const records = sortConnectivity(events.filter((event) => event.label.startsWith('connectivity.')).flatMap((event) => {
    const record = parseConnectivityRecord(event.details)
    if (!record) malformedCount++
    return record ? [record] : []
  }))
  return { records, overview: records.filter((record, index) => record.kind !== 'quality' || index === 0 || records[index - 1].kind === 'gap'), fromMs, toMs, malformedCount, retentionTrimmed: false,
    supportedMeasurements: [...new Set(records.flatMap((record) => record.supportedMeasurements))] }
}

export function connectivityAt(records: ConnectivityRecord[], atMs: number, fromMs: number, toMs: number): ConnectivityRecord | null {
  if (atMs < fromMs || atMs > toMs) return null
  return records.findLast((record) => Date.parse(record.capturedAtUtc) <= atMs) ?? null
}

export type ConnectivityInterval = { fromMs: number; toMs: number; record: ConnectivityRecord | null }
export function connectivityIntervals(records: ConnectivityRecord[], fromMs: number, toMs: number): ConnectivityInterval[] {
  if (toMs <= fromMs) return []
  const result: ConnectivityInterval[] = []
  let current = connectivityAt(records, fromMs, fromMs, toMs)
  let start = fromMs
  for (const record of records) {
    const time = Date.parse(record.capturedAtUtc)
    if (time <= fromMs || time >= toMs) continue
    if (time > start) result.push({ fromMs: start, toMs: time, record: current })
    start = time
    current = record
  }
  result.push({ fromMs: start, toMs, record: current })
  return result
}

/** Reads only the relevant segments and a preceding segment when the window starts between segments. */
export async function loadConnectivityWindow(indexValue: unknown, readSegment: (path: string) => Promise<string>, fromMs: number, toMs: number): Promise<ConnectivityWindow> {
  if (!object(indexValue) || indexValue.schema !== 'ansight.connectivity-index.v1' || !Array.isArray(indexValue.segments)
    || indexValue.segments.length > 100000 || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) throw new Error('Invalid connectivity index or time range.')
  const index = indexValue as ConnectivityIndex
  const segments = index.segments.filter((segment) => /^segments\/[0-9]+\.jsonl$/.test(segment.path)
    && timestamp(segment.fromUtc) && timestamp(segment.toUtc) && Date.parse(segment.toUtc) >= Date.parse(segment.fromUtc))
  if (segments.length !== index.segments.length) throw new Error('Invalid connectivity segment descriptor.')
  segments.sort((a, b) => Date.parse(a.fromUtc) - Date.parse(b.fromUtc))
  const selected = segments.filter((segment) => Date.parse(segment.toUtc) >= fromMs && Date.parse(segment.fromUtc) <= toMs)
  const previous = segments.findLast((segment) => Date.parse(segment.toUtc) < fromMs)
  if (previous) selected.unshift(previous)
  let malformedCount = 0
  const records: ConnectivityRecord[] = []
  // Bounded concurrency; a failed download is surfaced, never rendered as an offline interval.
  for (let offset = 0; offset < selected.length; offset += 4) {
    const texts = await Promise.all(selected.slice(offset, offset + 4).map((segment) => readSegment(segment.path)))
    for (const text of texts) {
      if (text.length > 16 * 1024 * 1024) throw new Error('Connectivity segment exceeds the size limit.')
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        const record = parseConnectivityRecord(line)
        if (record) records.push(record)
        else malformedCount++
      }
    }
  }
  const overview = (index.stateChanges ?? []).flatMap((value) => {
    const record = parseConnectivityRecord(value)
    if (!record) malformedCount++
    return record ? [record] : []
  })
  return { records: sortConnectivity(records), overview: sortConnectivity(overview), fromMs, toMs, malformedCount,
    retentionTrimmed: index.retentionTrimmed === true, supportedMeasurements: (index.supportedMeasurements ?? []).filter((value) => typeof value === 'string') }
}
