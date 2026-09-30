import type { SessionMetricChannel } from './sessionViewerData'

export type MetricPresentation = {
  axisKey: string
  axisLabel: string
  kind: 'fps' | 'memory' | 'cpu' | 'other'
  scale: number
  unit: string
}

export function metricPresentation(channel: SessionMetricChannel | undefined, channelId: number): MetricPresentation {
  const type = channel?.type?.trim().toLowerCase() ?? ''
  const unit = channel?.unit?.trim().toLowerCase() ?? ''
  const name = channel?.name?.trim().toLowerCase() ?? ''
  const kind = channel?.kind?.trim().toLowerCase() ?? ''
  const legacy = (!type || type === 'custom') && !unit
  // Channel 3 was FPS in the original SDK. External collectors assign IDs dynamically.
  // Only infer that legacy unit when no channel identity contradicts it.
  if (type === 'fps' || type === 'frames' || unit === 'fps'
    || (legacy && (name === 'fps' || name === 'rendered frames per second' || kind === 'rendered-fps'
      || (!name && !kind && channelId === 3)))) {
    return { axisKey: 'fps', axisLabel: 'FPS', kind: 'fps', scale: 1, unit: 'FPS' }
  }
  const isMillicores = unit === 'millicores' || (!unit && kind === 'cpu-millicores')
  if (isMillicores || (type === 'cpu' && ['percent', '%'].includes(unit))) {
    return { axisKey: 'cpu', axisLabel: 'CPU %', kind: 'cpu', scale: isMillicores ? 0.1 : 1, unit: '%' }
  }
  if (type === 'memory' || ['bytes', 'byte', 'b'].includes(unit)
    || (legacy && (channelId <= 2 || /memory|heap|footprint|rss|resident set/.test(name)))) {
    return { axisKey: 'memory', axisLabel: 'Memory', kind: 'memory', scale: 1, unit: 'bytes' }
  }
  const label = channel?.unit?.trim() || channel?.name?.trim() || 'Value'
  return { axisKey: `unit:${unit || channelId}`, axisLabel: label, kind: 'other', scale: 1, unit: channel?.unit?.trim() ?? '' }
}

export function isFpsChannel(channels: Map<number, SessionMetricChannel>, channelId: number): boolean {
  return metricPresentation(channels.get(channelId), channelId).kind === 'fps'
}

/** Keep framework diagnostics opt-in, while retaining the overview's resource and FPS metrics. */
export function isFlutterDiagnosticChannel(channel: SessionMetricChannel | undefined): boolean {
  if (!channel || metricPresentation(channel, channel.channelId).kind !== 'other') return false
  return channel.source?.trim().toLowerCase() === 'flutter'
    || /^flutter\b/i.test(channel.name.trim())
}

export function formatMetricValue(value: number, presentation: MetricPresentation): string {
  const displayValue = value * presentation.scale
  if (presentation.kind === 'fps') return `${Math.max(0, Math.round(displayValue))} FPS`
  const number = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)
  if (presentation.kind === 'cpu') return `${number(displayValue)}%`
  if (presentation.kind !== 'memory') return `${number(displayValue)}${presentation.unit ? ` ${presentation.unit}` : ''}`
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let scaled = Math.max(0, displayValue)
  let index = 0
  while (scaled >= 1024 && index < units.length - 1) { scaled /= 1024; index += 1 }
  return `${number(scaled)} ${units[index]}`
}

/** A round axis top whose quarters are round as well, so tick labels read cleanly. */
export function metricAxisMaximum(presentation: MetricPresentation, rawMaximum: number): number {
  const floor = presentation.kind === 'cpu' || presentation.kind === 'fps' ? 100 : 1
  const value = Math.max(floor, rawMaximum * presentation.scale * 1.1)
  if (presentation.kind === 'memory') {
    // Bytes are shown in 1024-based units, where only powers of two (and their quarters) are round.
    return 2 ** Math.ceil(Math.log2(value))
  }
  const scale = 10 ** Math.floor(Math.log10(value))
  const normalized = value / scale
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 4 ? 4 : normalized <= 8 ? 8 : 10) * scale
}
