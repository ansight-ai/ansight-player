import { useState } from 'react'
import { connectivityAt, type ConnectivityRecord, type ConnectivityWindow } from './connectivity'
import { connectivityQualitySeries, summarizeQualitySeries } from './connectivityQuality'

type Props = { data: ConnectivityWindow; atMs: number; startMs: number; endMs: number; onSeek: (time: number) => void; error?: string; loading?: boolean; }
const transportNames: Record<string, string> = { wifi: 'Wi-Fi', cellular: 'Cellular', ethernet: 'Ethernet', bluetooth: 'Bluetooth', other: 'Other' }
const flags = [
  { key: 'vpn', label: 'VPN', active: 'VPN active' },
  { key: 'internetValidated', label: 'Internet validated', active: 'Internet validated' },
  { key: 'captivePortal', label: 'Captive portal', active: 'Captive portal' },
  { key: 'metered', label: 'Metered', active: 'Metered' },
  { key: 'expensive', label: 'Expensive', active: 'Expensive connection' },
  { key: 'lowDataMode', label: 'Low Data Mode', active: 'Low Data Mode' },
] as const
function transportLabel(transports: string[]): string {
  return transports.map(transport => transportNames[transport] ?? transport).join(' + ')
}
function stateLabel(record: ConnectivityRecord | null): string {
  if (!record || record.kind === 'gap') return 'Connection unknown'
  const availability = { available: 'Available', unavailable: 'Unavailable', unknown: 'Unknown' }[record.snapshot.availability]
  return [transportLabel(record.snapshot.transports), availability].filter(Boolean).join(' · ')
}
function timeLabel(time: number, start: number, precision = 1): string {
  const seconds = Math.max(0, (time - start) / 1000)
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(precision).padStart(3 + precision, '0')}`
}
function ageLabel(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds / 1000)
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`
}
function qualityLabel(label: string): string {
  return ({ minimal: 'Minimal', moderate: 'Moderate', good: 'Good' } as Record<string, string>)[label] ?? label
}
function historyLabel(record: ConnectivityRecord): string | null {
  if (record.kind === 'gap') return 'Observation interrupted'
  if (record.kind !== 'change' || !record.previousSnapshot) return null
  const previous = record.previousSnapshot
  const next = record.snapshot
  const transport = transportLabel(next.transports)
  if (previous.availability !== next.availability) {
    if (next.availability === 'unavailable') return 'Connection lost'
    if (next.availability === 'unknown') return 'Connection state unknown'
    return previous.availability === 'unavailable'
      ? ['Connection restored', transport].filter(Boolean).join(' · ')
      : `${transport || 'Connection'} became available`
  }
  const changes: string[] = []
  if (JSON.stringify([...previous.transports].sort()) !== JSON.stringify([...next.transports].sort())) {
    changes.push(`${transportLabel(previous.transports) || 'No transport'} → ${transport || 'No transport'}`)
  }
  for (const flag of flags) {
    if ((previous[flag.key] ?? null) === (next[flag.key] ?? null)) continue
    const value = next[flag.key]
    changes.push(`${flag.label}: ${value == null ? 'no longer reported' : value ? 'yes' : 'no'}`)
  }
  return changes.length ? changes.join(' · ') : null
}

export function ConnectivityPanel({ data, atMs, startMs, endMs, onSeek, loading, error }: Props) {
  const [visibleCount, setVisibleCount] = useState(50)
  const current = connectivityAt(data.records, atMs, Math.max(startMs, data.fromMs), Math.min(endMs, data.toMs))
  const observedState = current?.kind === 'gap' ? null : current?.snapshot
  const quality = current?.kind === 'gap' ? null : current?.quality
  const age = quality ? Math.max(0, (atMs - Date.parse(quality.measuredAtUtc)) / 1000) : null
  const observations = data.overview.length ? data.overview : data.records
  const observationLog = observations.filter(record => record.kind !== 'quality')
  const changes = observations.flatMap(record => {
    const label = historyLabel(record)
    return label ? [{ record, label }] : []
  })
  const metrics = [
    { label: 'Link quality', value: quality?.linkQuality && quality.linkQuality !== 'unknown' ? { minimal: 'Minimal', moderate: 'Moderate', good: 'Good' }[quality.linkQuality] : null },
    { label: 'Signal', value: quality?.signalStrength != null ? `${quality.signalStrength} ${quality.signalStrengthUnit}` : null },
    { label: 'Download estimate', value: quality?.estimatedDownstreamKbps != null ? `${quality.estimatedDownstreamKbps} kbps` : null },
    { label: 'Upload estimate', value: quality?.estimatedUpstreamKbps != null ? `${quality.estimatedUpstreamKbps} kbps` : null },
  ].filter(metric => metric.value != null)
  const activeFlags = flags.filter(flag => flag.key !== 'internetValidated' && observedState?.[flag.key] === true)
  const hasObservations = data.records.length > 0 || data.overview.length > 0
  return <section className="connectivity-panel" aria-label="Connectivity inspection">
    {error ? <p role="alert">Connectivity could not be loaded: {error}</p> : null}
    {loading ? <p role="status">Loading connectivity…</p> : null}
    {!loading && !error && !hasObservations ? <p>No connectivity observations were captured.</p> : null}
    {hasObservations ? <>
      <div className="connectivity-status-row">
        <strong><span className={`connectivity-status-dot connectivity-status-dot--${observedState?.availability ?? 'unknown'}`} aria-hidden="true" />{stateLabel(current)}</strong>
        <span className="connectivity-note">At {timeLabel(atMs, startMs)}</span>
      </div>
      {!current || current.kind === 'gap' ? <p className="connectivity-note">{current?.kind === 'gap' ? 'Observation interrupted.' : 'No observation covers this time.'}</p> : null}
      {activeFlags.length || observedState?.internetValidated === false ? <div className="connectivity-badges">
        {activeFlags.map(flag => <span key={flag.key}>{flag.active}</span>)}
        {observedState?.internetValidated === false ? <span>Internet not validated</span> : null}
      </div> : null}
      {data.retentionTrimmed ? <p className="connectivity-note" role="status">Older observations were removed by capture retention.</p> : null}
      {data.malformedCount > 0 ? <p className="connectivity-note" role="status">{data.malformedCount} observations could not be read.</p> : null}
      <QualityCharts records={data.records} fromMs={Math.max(startMs, data.fromMs)} toMs={Math.min(endMs, data.toMs)} sessionStartMs={startMs} atMs={atMs} onSeek={onSeek} hasCurrentMetrics={metrics.length > 0} />
      <div className="connectivity-events-heading"><h3>History</h3></div>
      {changes.length ? <div className="connectivity-event-list">{changes.slice(0, visibleCount).map(({ record, label }) => <button type="button" key={record.id} onClick={() => onSeek(Math.max(startMs, Date.parse(record.capturedAtUtc)))}>
        <time>{timeLabel(Date.parse(record.capturedAtUtc), startMs)}</time><span>{label}</span>
      </button>)}</div> : <p className="connectivity-note">No connection changes recorded.</p>}
      {changes.length > visibleCount ? <button type="button" className="button button--secondary button--compact" onClick={() => setVisibleCount(value => value + 50)}>Show more</button> : null}
      <details className="connectivity-details"><summary>Technical details</summary>
        <dl className="connectivity-flags">{flags.map(flag => <div key={flag.key}><dt>{flag.label}</dt><dd>{observedState?.[flag.key] == null ? 'Unknown' : observedState[flag.key] ? 'Yes' : 'No'}</dd></div>)}</dl>
        {current ? <p className="connectivity-note">Observation: {current.source} · {current.capturedAtUtc}</p> : null}
        {quality ? <p className="connectivity-note">Quality: {quality.source} · measured {quality.measuredAtUtc} · {age?.toFixed(1)} s old</p> : null}
        <p className="connectivity-note">Reported measurements: {data.supportedMeasurements.join(', ') || 'not reported'}.</p>
        <p className="connectivity-note">Available describes the OS connection state; internet validation is separate. Quality and bandwidth are passive OS estimates, not measured throughput. Missing values remain unknown. Charts appear when recorded values vary. Lines hold each reported value until the next observation and break where measurements are missing. Select a sample or history entry to seek.</p>
        {current ? <><h4>Observation at playhead</h4><pre>{JSON.stringify(current, null, 2)}</pre></> : null}
        <h4>Observation log</h4>
        <div className="connectivity-event-list">{observationLog.slice(0, visibleCount).map(record => <button type="button" key={record.id} onClick={() => onSeek(Math.max(startMs, Date.parse(record.capturedAtUtc)))}>
          <time>{timeLabel(Date.parse(record.capturedAtUtc), startMs)}</time><span>{record.kind} · {stateLabel(record)}{record.reason ? ` · ${record.reason}` : ''}</span>
        </button>)}</div>
        {observationLog.length > visibleCount ? <button type="button" className="button button--secondary button--compact" onClick={() => setVisibleCount(value => value + 50)}>Show more observations</button> : null}
      </details>
    </> : null}
  </section>
}

function QualityCharts({ records, fromMs, toMs, onSeek, sessionStartMs = fromMs, atMs, hasCurrentMetrics }: {
  records: ConnectivityRecord[]; fromMs: number; toMs: number; onSeek: (time: number) => void
  sessionStartMs?: number; atMs?: number; hasCurrentMetrics: boolean
}) {
  const series = connectivityQualitySeries(records, fromMs, toMs)
  if (!series.length) return hasCurrentMetrics ? null : <p className="connectivity-note">No quality measurements in this time window.</p>
  const current = atMs == null ? null : connectivityAt(records, atMs, fromMs, toMs)
  return <div className="connectivity-quality">
    {series.map(group => {
      const categorical = group.metric === 'OS link quality'
      const summary = summarizeQualitySeries(group, fromMs, toMs)
      const values = group.points.map(point => point.value)
      const min = categorical ? 1 : values.reduce((a, b) => Math.min(a, b), Infinity)
      const max = categorical ? 3 : values.reduce((a, b) => Math.max(a, b), -Infinity)
      const currentQuality = current?.kind === 'gap' ? null : current?.quality
      const currentGroup = currentQuality && currentQuality.source === group.source
        && JSON.stringify([...current!.snapshot.transports].sort()) === JSON.stringify(group.transports)
      const sample = currentGroup ? group.points.findLast(point => point.time === Date.parse(currentQuality.measuredAtUtc)) : null
      const xAt = (time: number) => 1000 * (time - fromMs) / Math.max(1, toMs - fromMs)
      const yAt = (value: number) => max === min ? 36 : 60 - 48 * (value - min) / (max - min)
      const line = group.intervals.map((interval, index) => {
        const y = yAt(interval.value)
        const start = index > 0 && group.intervals[index - 1].toMs === interval.fromMs
          ? `V ${y}` : `M ${xAt(interval.fromMs)} ${y}`
        return `${start} H ${xAt(interval.toMs)}`
      }).join(' ')
      return <figure key={group.key}>
        <figcaption><strong>{group.metric}</strong><span className={`connectivity-quality-value${sample && categorical ? ` connectivity-quality-value--${sample.label}` : ''}`}>{sample ? qualityLabel(sample.label) : 'Unknown at playhead'}</span></figcaption>
        <div className="connectivity-quality-provenance">{transportLabel(group.transports) || 'Transport not reported'} · {group.source === 'apple.nwpath' ? 'Apple network status' : group.source}</div>
        <div className="connectivity-quality-window">Window {timeLabel(fromMs, sessionStartMs)}–{timeLabel(toMs, sessionStartMs)}</div>
        {sample && atMs != null ? <p className="connectivity-quality-reading">
          Last measured <strong>{ageLabel(atMs - sample.time)}</strong> before the playhead
          <button type="button" onClick={() => onSeek(Math.max(sessionStartMs, sample.time))}>Go to reading · {timeLabel(sample.time, sessionStartMs)}</button>
        </p> : null}
        <p className="connectivity-quality-summary">{summary.readings.length === 0
          ? `No new readings in this window.${sample ? ' The last reported value is carried forward.' : ''}`
          : `${summary.readings.length} ${summary.readings.length === 1 ? 'reading' : 'readings'} in this window.${summary.hasVariation ? '' : summary.readings.length === 1 ? ' One reading cannot show a trend.' : ' All reported the same value.'}`}</p>
        {summary.hasVariation ? <>
        <div className="connectivity-quality-plot">
        <div className="connectivity-quality-axis" aria-hidden="true">{(categorical ? ['Good', 'Moderate', 'Minimal'] : [max, (min + max) / 2, min].map(value => `${Number(value.toFixed(1))} ${group.unit}`)).map(label => <span key={label}>{label}</span>)}</div>
        <div className="connectivity-quality-graph">
        <svg viewBox="0 0 1000 72" preserveAspectRatio="none" role="group" aria-label={`${group.metric} (${group.unit}) · ${group.source}`}>
          {[12, 36, 60].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="connectivity-quality-grid" />)}
          <path d={line} className="connectivity-quality-line" vectorEffect="non-scaling-stroke" />
          {group.points.filter(point => point.time >= fromMs && point.time <= toMs).map(point => {
            const x = xAt(point.time)
            const y = yAt(point.value)
            const title = `${point.label} · ${timeLabel(point.time, sessionStartMs)} · ${new Date(point.time).toISOString()} · ${group.source} · age at observation ${Math.max(0, (point.capturedAtMs - point.time) / 1000).toFixed(1)} s`
            return <circle key={`${point.id}-${point.time}`} cx={x} cy={y} r="4" className={categorical ? `connectivity-quality-point--${point.label}` : undefined} tabIndex={0} role="button" aria-label={title}
              onClick={() => onSeek(point.time)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSeek(point.time) } }}><title>{title}</title></circle>
          })}
          {atMs != null && atMs >= fromMs && atMs <= toMs ? <line x1={xAt(atMs)} x2={xAt(atMs)} y1="0" y2="70" className="connectivity-quality-cursor" /> : null}
        </svg>
        <div className="connectivity-quality-times"><span>{timeLabel(fromMs, sessionStartMs)}</span><span>{timeLabel(toMs, sessionStartMs)}</span></div>
        </div>
        </div>
        <p className="connectivity-quality-summary">Dots mark readings; the line carries the last value forward between them.</p>
        </> : null}
        {summary.gaps.length ? <div className="connectivity-quality-gaps"><span>No reading from this source:</span> {summary.gaps.slice(0, 3).map(gap => <button key={gap.fromMs} type="button" onClick={() => onSeek(gap.fromMs)}>{timeLabel(gap.fromMs, sessionStartMs, gap.toMs - gap.fromMs < 1000 ? 3 : 1)}–{timeLabel(gap.toMs, sessionStartMs, gap.toMs - gap.fromMs < 1000 ? 3 : 1)}</button>)}{summary.gaps.length > 3 ? <span>and {summary.gaps.length - 3} more gaps</span> : null}</div> : null}
        {categorical ? <p className="connectivity-quality-explanation">A broad OS assessment of the connection. It does not measure signal strength, request latency, or transfer speed.</p> : null}
      </figure>
    })}
  </div>
}
