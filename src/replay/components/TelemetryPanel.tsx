import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionApplicationEvent, SessionMetricChannel } from '../sessionViewerData'
import { formatMetricValue, metricPresentation } from '../metricPresentation'
import { layoutSpans, spansFromEvents } from '../telemetrySpans'
import './TelemetryPanel.css'

type Sample = { timestampMs: number; value: number; segmentId: number }
type View = 'spans' | 'metrics' | 'events'
type Selection = { title: string; detail: string; time: number }
type Props = {
  events: SessionApplicationEvent[]
  channels: Map<number, SessionMetricChannel>
  samples: Map<number, Sample[]>
  startMs: number
  endMs: number
  scrubAtMs: number
  onScrub: (time: number) => void
}

const elapsed = (time: number, start: number) => {
  const seconds = Math.max(0, (time - start) / 1000)
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`
}

export function TelemetryPanel({ events, channels, samples, startMs, endMs, scrubAtMs, onScrub }: Props) {
  const spans = useMemo(() => spansFromEvents(events), [events])
  const [viewChoice, setViewChoice] = useState<View | null>(null)
  const view = viewChoice ?? (spans.length ? 'spans' : samples.size ? 'metrics' : 'events')
  const [channelId, setChannelId] = useState('all')
  const [window, setWindow] = useState<{ start: number; end: number } | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(540, entry.contentRect.width - 2)))
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  const from = Math.max(startMs, window?.start ?? startMs)
  const to = Math.max(from + 1, Math.min(endMs, window?.end ?? endMs))
  const duration = to - from
  const left = 90, right = 20
  const plotWidth = Math.max(1, width - left - right)
  const x = (time: number) => left + Math.max(0, Math.min(1, (time - from) / duration)) * plotWidth
  const name = (id: number) => channels.get(id)?.name ?? (id === 255 ? 'Unspecified' : `Channel ${id}`)
  const matchesChannel = (id: number) => channelId === 'all' || String(id) === channelId
  const select = (item: Selection) => { setSelection(item); onScrub(Math.max(startMs, Math.min(endMs, item.time))) }
  const zoom = (factor: number) => {
    const size = Math.min(Math.max(1, endMs - startMs), Math.max(10, duration * factor))
    const anchor = scrubAtMs >= from && scrubAtMs <= to ? scrubAtMs : (from + to) / 2
    const start = Math.max(startMs, Math.min(endMs - size, anchor - size / 2))
    setWindow({ start, end: start + size })
  }
  const ordinaryEvents = useMemo(() => {
    const ids = new Set(spans.map(span => span.id))
    return events.filter(event => {
      if (event.eventType.toLowerCase() !== 'span') return true
      try { return !ids.has(JSON.parse(event.details ?? '').spanId) } catch { return true }
    })
  }, [events, spans])
  const availableChannels = useMemo(() => {
    const ids = view === 'spans' ? spans.map(span => span.channelId)
      : view === 'metrics' ? [...samples.keys()] : ordinaryEvents.map(event => event.channelId ?? 255)
    return [...new Set(ids)].sort((a, b) => a - b)
  }, [view, spans, samples, ordinaryEvents])
  const spanLanes = useMemo(() => {
    const grouped = new Map<number, typeof spans>()
    for (const span of spans) {
      if (channelId !== 'all' && String(span.channelId) !== channelId) continue
      const lane = grouped.get(span.channelId) ?? []
      lane.push(span); grouped.set(span.channelId, lane)
    }
    return [...grouped].map(([id, values]) => ({ id, spans: layoutSpans(values, from, to) })).filter(lane => lane.spans.length)
  }, [spans, channelId, from, to])
  const metricLanes = useMemo(() => {
    const grouped = new Map<string, { label: string; series: Array<{ channel: SessionMetricChannel; samples: Sample[] }> }>()
    for (const [id, values] of samples) {
      if (channelId !== 'all' && String(id) !== channelId) continue
      const channel = channels.get(id) ?? { channelId: id, name: `Channel ${id}`, colorHex: '#0ea5e9' }
      const presentation = metricPresentation(channel, id)
      const key = `${channel.group ?? ''}:${presentation.axisKey}`
      const lane = grouped.get(key) ?? { label: channel.group || presentation.axisLabel, series: [] }
      lane.series.push({ channel, samples: values.filter(sample => sample.timestampMs >= from && sample.timestampMs <= to && Number.isFinite(sample.value)) })
      grouped.set(key, lane)
    }
    return [...grouped].filter(([, lane]) => lane.series.some(series => series.samples.length))
  }, [samples, channels, channelId, from, to])
  const visibleEvents = ordinaryEvents.filter(event => matchesChannel(event.channelId ?? 255)
    && Date.parse(event.capturedAtUtc) >= from && Date.parse(event.capturedAtUtc) <= to)
  const ticks = Array.from({ length: 5 }, (_, index) => from + duration * index / 4)
  const playhead = (height: number) => scrubAtMs >= from && scrubAtMs <= to
    ? <line x1={x(scrubAtMs)} x2={x(scrubAtMs)} y1={0} y2={height} className="telemetry-detail-playhead" /> : null
  const grid = (height: number) => ticks.map(time => <line key={time} x1={x(time)} x2={x(time)} y1={0} y2={height} className="telemetry-detail-grid" />)
  const empty = view === 'spans' ? !spanLanes.length : view === 'metrics' ? !metricLanes.length : !visibleEvents.length

  return <section className="telemetry-detail" aria-label="Telemetry details">
    <div className="telemetry-detail-toolbar">
      <div className="telemetry-detail-views" role="group" aria-label="Telemetry view">
        {(['spans', 'metrics', 'events'] as const).map(value => <button key={value} type="button" aria-pressed={view === value}
          onClick={() => { setViewChoice(value); setChannelId('all'); setSelection(null) }}>
          {value === 'spans' ? 'Spans' : value === 'metrics' ? 'Metrics' : 'Events'}
          <span>{value === 'spans' ? spans.length : value === 'metrics' ? samples.size : ordinaryEvents.length}</span>
        </button>)}
      </div>
      <select aria-label="Telemetry channel" value={channelId} onChange={event => { setChannelId(event.target.value); setSelection(null) }}>
        <option value="all">All channels</option>
        {availableChannels.map(id => <option key={id} value={id}>{name(id)}</option>)}
      </select>
      <div className="telemetry-detail-zoom" role="group" aria-label="Telemetry zoom">
        <button type="button" aria-label="Zoom telemetry in" disabled={duration <= 10} onClick={() => zoom(.5)}>+</button>
        <button type="button" aria-label="Zoom telemetry out" disabled={!window} onClick={() => zoom(2)}>−</button>
        <button type="button" disabled={!window} onClick={() => setWindow(null)}>Full session</button>
      </div>
    </div>
    <div className="telemetry-detail-caption">
      <span>{view === 'spans' ? 'Timed operations, grouped by channel. Select a span to inspect it and seek replay.'
        : view === 'metrics' ? 'Channels with matching units share a scale. Select a sample to inspect its value.'
          : 'Recorded events, grouped by channel. Select an event to seek replay.'}</span>
      <span>Replay {elapsed(scrubAtMs, startMs)}</span>
    </div>
    <div className="telemetry-detail-body" ref={bodyRef}>
      <div className="telemetry-detail-axis" style={{ width }}>
        <svg width={width} height={30} aria-label="Telemetry time axis">
          {ticks.map((time, index) => <text key={time} x={x(time)} y={20} textAnchor={index === 4 ? 'end' : index === 0 ? 'start' : 'middle'}>{elapsed(time, startMs)}</text>)}
        </svg>
      </div>
      {empty ? <p className="telemetry-detail-empty">No {view} recorded in this time range{channelId === 'all' ? '.' : ' for this channel.'}</p> : null}
      {view === 'spans' && spanLanes.map(lane => {
        const height = Math.max(1, ...lane.spans.map(span => span.row + 1)) * 30 + 10
        return <div className="telemetry-detail-lane" key={lane.id} style={{ width }}>
          <div className="telemetry-detail-lane-heading"><strong>{name(lane.id)}</strong><span>{lane.spans.length} spans</span></div>
          <svg width={width} height={height} role="group" aria-label={`Spans in ${name(lane.id)}`}>
            {grid(height)}
            {lane.spans.map(span => {
              const detail = `${span.status === 'incomplete' ? 'Incomplete · no end recorded' : `${span.durationMs!.toFixed(3)} ms · ${span.status}`} · ID ${span.id}${span.parentSpanId ? ` · Parent ${span.parentSpanId}` : ''}`
              const barWidth = Math.max(5, x(span.endMs) - x(span.startMs))
              return <g key={span.id} role="button" tabIndex={0} aria-label={`${span.name}: ${span.status === 'incomplete' ? 'incomplete' : `${span.durationMs!.toFixed(3)} ms, ${span.status}`}`}
                onClick={() => select({ title: span.name, detail, time: span.startMs })}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select({ title: span.name, detail, time: span.startMs }) } }}>
                <title>{`${span.name} · ${detail}`}</title>
                <rect x={x(span.startMs)} y={span.row * 30 + 5} width={barWidth} height={22} rx={3}
                  fill={span.status === 'error' ? '#d4483c' : span.status === 'cancelled' ? '#b87912' : channels.get(lane.id)?.colorHex ?? '#0ea5e9'}
                  className={span.status === 'incomplete' ? 'telemetry-detail-incomplete' : ''} />
                {barWidth > 60 ? <text className="telemetry-detail-span-label" x={x(span.startMs) + 6} y={span.row * 30 + 20}>{span.name.slice(0, Math.floor((barWidth - 12) / 7))}</text> : null}
              </g>
            })}{playhead(height)}
          </svg>
        </div>
      })}
      {view === 'metrics' && metricLanes.map(([key, lane]) => {
        let min = 0, max = 0
        for (const series of lane.series) for (const sample of series.samples) {
          const value = sample.value * metricPresentation(series.channel, series.channel.channelId).scale
          min = Math.min(min, value); max = Math.max(max, value)
        }
        if (min === max) max = min + 1
        const presentation = { ...metricPresentation(lane.series[0].channel, lane.series[0].channel.channelId), scale: 1 }
        const y = (value: number) => 93 - (value - min) / (max - min) * 72
        return <div className="telemetry-detail-lane" key={key} style={{ width }}>
          <div className="telemetry-detail-lane-heading"><strong>{lane.label}</strong><span>{lane.series.map(series => series.channel.name).join(', ')}</span></div>
          <svg width={width} height={116} role="group" aria-label={`${lane.label} metrics`}>
            {grid(106)}
            <text x={left - 10} y={25} textAnchor="end">{formatMetricValue(max, presentation)}</text>
            <text x={left - 10} y={97} textAnchor="end">{formatMetricValue(min, presentation)}</text>
            {lane.series.map(series => {
              const format = metricPresentation(series.channel, series.channel.channelId)
              const inspectSample = (sample: Sample) => select({ title: `${series.channel.name}: ${formatMetricValue(sample.value, format)}`,
                detail: `Channel ${series.channel.channelId} · ${elapsed(sample.timestampMs, startMs)}`, time: sample.timestampMs })
              const nearest = (time: number) => series.samples.reduce<Sample | undefined>((best, sample) => !best
                || Math.abs(sample.timestampMs - time) < Math.abs(best.timestampMs - time) ? sample : best, undefined)
              const paths: string[] = []; let previousSegment = -1
              for (const sample of series.samples) {
                paths.push(`${sample.segmentId === previousSegment ? 'L' : 'M'}${x(sample.timestampMs)},${y(sample.value * format.scale)}`)
                previousSegment = sample.segmentId
              }
              const highlighted = nearest(scrubAtMs)
              const points = series.samples.length > 200 ? (highlighted ? [highlighted] : []) : series.samples
              return <g key={series.channel.channelId}>
                <path d={paths.join(' ')} fill="none" stroke={series.channel.colorHex || '#0ea5e9'} strokeWidth={1.5}
                  role="button" tabIndex={0} aria-label={`Inspect ${series.channel.name} samples`}
                  onClick={event => {
                    const bounds = event.currentTarget.ownerSVGElement!.getBoundingClientRect()
                    const sample = nearest(from + ((event.clientX - bounds.left) * width / bounds.width - left) / plotWidth * duration)
                    if (sample) inspectSample(sample)
                  }} onKeyDown={event => {
                    if ((event.key === 'Enter' || event.key === ' ') && highlighted) { event.preventDefault(); inspectSample(highlighted) }
                  }}><title>{series.channel.name}</title></path>
                {points.map((sample, index) => {
                  const label = `${series.channel.name}: ${formatMetricValue(sample.value, format)}`
                  return <circle key={index} cx={x(sample.timestampMs)} cy={y(sample.value * format.scale)} r={series.samples.length > 100 ? 2 : 3.5}
                    fill={series.channel.colorHex || '#0ea5e9'} role="button" tabIndex={0} aria-label={`${label} at ${elapsed(sample.timestampMs, startMs)}`}
                    onClick={() => inspectSample(sample)}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspectSample(sample) } }}><title>{label}</title></circle>
                })}
              </g>
            })}{playhead(106)}
          </svg>
        </div>
      })}
      {view === 'events' && availableChannels.filter(matchesChannel).map(id => {
        const lane = visibleEvents.filter(event => (event.channelId ?? 255) === id)
        if (!lane.length) return null
        return <div className="telemetry-detail-lane" key={id} style={{ width }}>
          <div className="telemetry-detail-lane-heading"><strong>{name(id)}</strong><span>{lane.length} events</span></div>
          <svg width={width} height={44} role="group" aria-label={`Events in ${name(id)}`}>
            {grid(44)}{lane.map((event, index) => <circle key={`${event.eventId}-${index}`} cx={x(Date.parse(event.capturedAtUtc))} cy={22} r={5}
              fill={channels.get(id)?.colorHex ?? '#a78bfa'} role="button" tabIndex={0} aria-label={`${event.label}, ${event.eventType}`}
              onClick={() => select({ title: event.label, detail: `${event.eventType} · ${event.details ?? ''}`, time: Date.parse(event.capturedAtUtc) })}
              onKeyDown={key => { if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); select({ title: event.label, detail: `${event.eventType} · ${event.details ?? ''}`, time: Date.parse(event.capturedAtUtc) }) } }}>
              <title>{`${event.label} · ${event.eventType}\n${event.capturedAtUtc}`}</title>
            </circle>)}{playhead(44)}
          </svg>
        </div>
      })}
    </div>
    <div className="telemetry-detail-selection" role="status">
      {selection ? <><strong>{selection.title}</strong><span>{selection.detail}</span><button type="button" onClick={() => setSelection(null)} aria-label="Clear telemetry selection">×</button></>
        : <span>Select a {view === 'metrics' ? 'sample' : view === 'spans' ? 'span' : 'event'} to see details here.</span>}
    </div>
  </section>
}
