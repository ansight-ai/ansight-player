import { sortConnectivity, type ConnectivityRecord } from './connectivity'

export type ConnectivityQualitySeries = {
  key: string; metric: string; unit: string; source: string; transports: string[]
  points: { time: number; value: number; label: string; id: string; capturedAtMs: number }[]
  intervals: { fromMs: number; toMs: number; value: number }[]
}

export function summarizeQualitySeries(group: ConnectivityQualitySeries, fromMs: number, toMs: number) {
  const gaps: { fromMs: number; toMs: number }[] = []
  let coveredToMs = fromMs
  for (const interval of group.intervals) {
    if (interval.fromMs > coveredToMs) gaps.push({ fromMs: coveredToMs, toMs: interval.fromMs })
    coveredToMs = Math.max(coveredToMs, interval.toMs)
  }
  if (coveredToMs < toMs) gaps.push({ fromMs: coveredToMs, toMs })
  const readings = group.points.filter(point => point.time >= fromMs && point.time <= toMs)
  const values = new Set([...group.intervals.map(interval => interval.value), ...readings.map(point => point.value)])
  return { readings, gaps, hasVariation: values.size > 1 }
}

/** Keep sources, transports and units separate: RSSI, bearer-specific values and levels are not interchangeable. */
export function connectivityQualitySeries(records: ConnectivityRecord[], fromMs: number, toMs: number): ConnectivityQualitySeries[] {
  const groups = new Map<string, ConnectivityQualitySeries>()
  const seen = new Map<string, Set<string>>()
  const ordered = sortConnectivity(records)
  for (const [index, record] of ordered.entries()) {
    const quality = record.quality
    if (!quality || record.kind === 'gap') continue
    const time = Date.parse(quality.measuredAtUtc)
    const capturedAtMs = Date.parse(record.capturedAtUtc)
    if (!Number.isFinite(time) || time > toMs || capturedAtMs > toMs) continue
    // A reported value remains current until the next observation, including when
    // its original measurement precedes the visible window. Gaps and absent values
    // end the interval instead of joining unrelated samples across missing evidence.
    const intervalFromMs = Math.max(fromMs, capturedAtMs, time)
    const intervalToMs = Math.min(toMs, ordered[index + 1] ? Date.parse(ordered[index + 1].capturedAtUtc) : toMs)
    const hasInterval = intervalFromMs < intervalToMs
    if (time < fromMs && !hasInterval) continue
    const transports = [...record.snapshot.transports].sort()
    for (const metric of [
      { metric: 'Signal strength', unit: quality.signalStrengthUnit ?? 'unknown unit', value: quality.signalStrength, label: undefined },
      { metric: 'OS link quality', unit: 'minimal · moderate · good', value: quality.linkQuality ? ({ minimal: 1, moderate: 2, good: 3, unknown: undefined })[quality.linkQuality] : undefined, label: quality.linkQuality },
      { metric: 'Downstream estimate', unit: 'kbps', value: quality.estimatedDownstreamKbps, label: undefined },
      { metric: 'Upstream estimate', unit: 'kbps', value: quality.estimatedUpstreamKbps, label: undefined },
    ]) {
      if (metric.value == null || !Number.isFinite(metric.value)) continue
      const key = JSON.stringify([metric.metric, metric.unit, quality.source, transports])
      const group = groups.get(key) ?? { key, metric: metric.metric, unit: metric.unit, source: quality.source, transports, points: [], intervals: [] }
      const samples = seen.get(key) ?? new Set<string>()
      const sampleKey = `${time}:${metric.value}`
      if (!samples.has(sampleKey)) group.points.push({ time, value: metric.value, label: metric.label ?? `${metric.value} ${metric.unit}`, id: record.id, capturedAtMs })
      if (hasInterval) group.intervals.push({ fromMs: intervalFromMs, toMs: intervalToMs, value: metric.value })
      samples.add(sampleKey)
      seen.set(key, samples)
      groups.set(key, group)
    }
  }
  return [...groups.values()].map(group => ({ ...group, points: group.points.sort((a, b) => a.time - b.time) }))
}
