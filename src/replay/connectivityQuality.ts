import type { ConnectivityRecord } from './connectivity'

export type ConnectivityQualitySeries = {
  key: string; metric: string; unit: string; source: string; transports: string[]
  points: { time: number; value: number; label: string; id: string; capturedAtMs: number }[]
}

/** Keep sources, transports and units separate: RSSI, bearer-specific values and levels are not interchangeable. */
export function connectivityQualitySeries(records: ConnectivityRecord[], fromMs: number, toMs: number): ConnectivityQualitySeries[] {
  const groups = new Map<string, ConnectivityQualitySeries>()
  const seen = new Map<string, Set<string>>()
  for (const record of records) {
    const quality = record.quality
    if (!quality || record.kind === 'gap') continue
    const time = Date.parse(quality.measuredAtUtc)
    if (!Number.isFinite(time) || time < fromMs || time > toMs) continue
    const transports = [...record.snapshot.transports].sort()
    for (const metric of [
      { metric: 'Signal strength', unit: quality.signalStrengthUnit ?? 'unknown unit', value: quality.signalStrength, label: undefined },
      { metric: 'OS link quality', unit: 'minimal · moderate · good', value: quality.linkQuality ? ({ minimal: 1, moderate: 2, good: 3, unknown: undefined })[quality.linkQuality] : undefined, label: quality.linkQuality },
      { metric: 'Downstream estimate', unit: 'kbps', value: quality.estimatedDownstreamKbps, label: undefined },
      { metric: 'Upstream estimate', unit: 'kbps', value: quality.estimatedUpstreamKbps, label: undefined },
    ]) {
      if (metric.value == null || !Number.isFinite(metric.value)) continue
      const key = JSON.stringify([metric.metric, metric.unit, quality.source, transports])
      const group = groups.get(key) ?? { key, metric: metric.metric, unit: metric.unit, source: quality.source, transports, points: [] }
      const samples = seen.get(key) ?? new Set<string>()
      const sampleKey = `${time}:${metric.value}`
      if (!samples.has(sampleKey)) group.points.push({ time, value: metric.value, label: metric.label ?? `${metric.value} ${metric.unit}`, id: record.id, capturedAtMs: Date.parse(record.capturedAtUtc) })
      samples.add(sampleKey)
      seen.set(key, samples)
      groups.set(key, group)
    }
  }
  return [...groups.values()].map(group => ({ ...group, points: group.points.sort((a, b) => a.time - b.time) }))
}
