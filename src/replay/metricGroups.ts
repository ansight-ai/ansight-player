import type { SessionMetricChannel } from './sessionViewerData'
import { metricPresentation } from './metricPresentation.ts'

export type MetricGroup = {
  id: string
  label: string
  channelIds: number[]
  defaultChannelIds: number[]
}

const groupLabels = new Map([
  ['memory', 'Memory'], ['rendering', 'Rendering'], ['layout', 'Layout'],
  ['runtime', 'Runtime'], ['device', 'Device'], ['network', 'Network'], ['other', 'Other'],
])

function channelGroup(channel: SessionMetricChannel): { id: string; label: string } {
  const declaredId = channel.metricGroup?.id?.trim()
  const declaredName = channel.metricGroup?.name?.trim()
  if (declaredId && declaredName) {
    // SDK identity is opaque and case-sensitive. Keep it separate from player view IDs.
    const id = groupLabels.has(declaredId) && declaredId !== 'other' ? declaredId : `sdk:${declaredId}`
    return { id, label: declaredName }
  }

  const declared = channel.group?.trim() ?? ''
  const group = declared.toLowerCase()
  const name = channel.name.trim().toLowerCase()
  const source = channel.source?.trim().toLowerCase() ?? ''
  const type = channel.type?.toLowerCase() ?? ''
  const presentation = metricPresentation(channel, channel.channelId)
  const isAvalonia = source.startsWith('avalonia') || name.startsWith('avalonia ')
  const isFlutter = source === 'flutter' || name.startsWith('flutter ')
  const usesLegacyAvaloniaGroup = isAvalonia && (!group || group === 'avalonia rendering')
  const isRuntimeMetric = presentation.kind === 'cpu'
    || type === 'runtime'
    || /references|handles|threads|\bjni\b/.test(name)
  let id: string

  if (groupLabels.has(group)) {
    id = group
  } else if (usesLegacyAvaloniaGroup) {
    // Older captures used one group for every Avalonia diagnostic.
    id = /layout|measure|arrange/.test(name) ? 'layout'
      : /input|event handlers|rooted visuals|dispatcher timers/.test(name) ? 'runtime'
      : 'rendering'
  } else if (declared) {
    return { id: `custom:${group}`, label: declared }
  } else if (presentation.kind === 'memory') {
    id = 'memory'
  } else if (presentation.kind === 'fps' || isFlutter) {
    id = 'rendering'
  } else if (type === 'battery' || /battery|thermal|temperature|power/.test(name)) {
    id = 'device'
  } else if (isRuntimeMetric) {
    id = 'runtime'
  } else {
    id = 'other'
  }

  return { id, label: groupLabels.get(id)! }
}

function isDetailMetric(channel: SessionMetricChannel): boolean {
  const kind = channel.kind?.toLowerCase() ?? ''
  return kind === 'sample-count' || kind === 'duration-max'
    || /\b(max|maximum|samples|sample count)\b/i.test(channel.name)
}

/** Only channels with recorded samples belong in the picker. Metadata supplies identity, never IDs. */
export function buildMetricGroups(channels: readonly SessionMetricChannel[]): MetricGroup[] {
  const grouped = new Map<string, MetricGroup>()
  for (const channel of channels) {
    const identity = channelGroup(channel)
    const group = grouped.get(identity.id) ?? { ...identity, channelIds: [], defaultChannelIds: [] }
    if (channel.metricGroup?.id?.trim() && channel.metricGroup?.name?.trim()) group.label = identity.label
    group.channelIds.push(channel.channelId)
    if (!isDetailMetric(channel) && group.defaultChannelIds.length < 6) group.defaultChannelIds.push(channel.channelId)
    grouped.set(group.id, group)
  }
  const groups = [...grouped.values()]
  const order = [...groupLabels.keys()]
  groups.sort((a, b) => {
    const rank = (id: string) => {
      const key = id.startsWith('sdk:') ? id.slice(4) : id
      return order.includes(key) ? order.indexOf(key) : order.length
    }
    return rank(a.id) - rank(b.id) || a.label.localeCompare(b.label)
  })
  for (const group of groups) {
    if (!group.defaultChannelIds.length) group.defaultChannelIds = group.channelIds.slice(0, 3)
  }

  const memory = channels.filter(channel => metricPresentation(channel, channel.channelId).kind === 'memory')
  const totalMemory = memory.find(channel => /rss|footprint|resident|total/i.test(channel.name)) ?? memory[0]
  const fps = channels.filter(channel => metricPresentation(channel, channel.channelId).kind === 'fps')
  const nativeFps = fps.find(channel => channel.kind !== 'render-pass-rate' && !/^avalonia\b/i.test(channel.name)) ?? fps[0]
  const cpu = channels.find(channel => metricPresentation(channel, channel.channelId).kind === 'cpu')
  const overview = [nativeFps, totalMemory, cpu].filter((channel): channel is SessionMetricChannel => Boolean(channel))
    .map(channel => channel.channelId)
  const defaults = overview.length ? overview : groups.flatMap(group => group.defaultChannelIds).slice(0, 3)

  return [{ id: 'overview', label: 'Overview', channelIds: channels.map(channel => channel.channelId), defaultChannelIds: defaults }, ...groups]
}

export function metricLegendLabel(channel: SessionMetricChannel | undefined, fallback: string): string {
  if (!channel || !/^avalonia\b/i.test(channel.name)) return fallback
  return channel.name.replace(/^Avalonia compositor /i, '').replace(/^Avalonia layout /i, '')
    .replace(/^Avalonia render recording /i, 'Recording ').replace(/^Avalonia Render FPS \(all targets\)$/i, 'Avalonia render FPS')
    .replace(/^./, letter => letter.toUpperCase())
}
