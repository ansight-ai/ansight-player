import { useMemo } from 'react'
import type { SessionNetworkPerformance, SessionNetworkRequest } from './sessionViewerData'
import { measuredValue, summarizeNetworkPerformance, transferMbps } from './networkPerformance'

const milliseconds = (value: number | null) => value == null ? 'Not measured' : `${Number(value.toFixed(1))} ms`
const rate = (value: number | null) => value == null ? 'Not measured' : `${Number(value.toPrecision(3))} Mbps`
const timeLabel = (time: number, startMs: number) => {
  const seconds = Math.max(0, (time - startMs) / 1000)
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

export function NetworkPerformancePanel({ requests, atMs, startMs, onSeek, loading, error }: {
  requests: SessionNetworkRequest[]; atMs: number; startMs: number; onSeek: (time: number) => void
  loading?: boolean; error?: string
}) {
  const fromMs = Math.max(startMs, atMs - 60_000)
  const summary = useMemo(() => summarizeNetworkPerformance(requests, fromMs, atMs), [requests, fromMs, atMs])
  const measuredCount = summary.samples.filter(sample => sample.latency != null).length
  return <section className="network-performance" aria-label="Measured network performance">
    <div className="network-performance-heading"><h3>App network performance</h3><span>{timeLabel(fromMs, startMs)}–{timeLabel(atMs, startMs)}</span></div>
    {loading ? <p role="status">Loading recorded requests…</p> : error ? <p role="alert">Network measurements could not be loaded: {error}</p> : <>
      <p className="connectivity-note">{summary.samples.length} completed requests · {summary.samples.filter(sample => sample.failed).length} failed · {measuredCount} latency measurements in the last {Math.max(0, (atMs - fromMs) / 1000).toFixed(0)} s.</p>
      {summary.samples.length ? <>
        <div className="network-performance-table"><table>
          <thead><tr><th>Server</th><th>Latency p50 / p95</th><th>Download</th><th>Upload</th><th>Failed</th></tr></thead>
          <tbody>{summary.hosts.map(host => <tr key={host.host}>
            <th scope="row">{host.host}<small>{host.count} requests</small></th>
            <td>{milliseconds(host.medianLatency)}{host.p95Latency != null ? ` / ${milliseconds(host.p95Latency)}` : ''}<small>{host.latencyCount} measurements</small></td>
            <td>{rate(host.medianDownload)}<small>{host.downloadCount} transfers</small></td>
            <td>{rate(host.medianUpload)}<small>{host.uploadCount} transfers</small></td>
            <td>{host.failed}</td>
          </tr>)}</tbody>
        </table></div>
        <details className="network-performance-requests"><summary>Recent requests</summary>
          <div className="network-performance-table"><table><thead><tr><th>Completed</th><th>Request</th><th>Duration</th><th>Latency</th><th>Download / upload</th></tr></thead>
            <tbody>{summary.samples.slice(-20).reverse().map(sample => <tr key={sample.request.id}>
              <td><button type="button" onClick={() => onSeek(sample.time)} aria-label={`Seek to request ${sample.request.method} ${sample.host} at ${timeLabel(sample.time, startMs)}`}>{timeLabel(sample.time, startMs)}</button></td>
              <td className="network-performance-request-url" title={sample.request.url}>{sample.request.method} {sample.request.url}<small>{sample.failed ? 'Failed' : sample.request.statusCode}</small></td>
              <td>{milliseconds(sample.duration)}</td><td>{milliseconds(sample.latency)}</td><td>{rate(sample.download)} / {rate(sample.upload)}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
        {!measuredCount ? <p className="connectivity-note">These requests contain no response latency measurements. New captures using Apple native network capture provide detailed timings and transfer rates.</p> : null}
      </> : <p className="connectivity-note">No completed requests in this window. Network performance is unknown while no traffic is recorded.</p>}
    </>}
    <p className="connectivity-note">Latency is request send to first response byte, including server processing. Rates are the median of measured per-transfer body averages. Measurements cover each request’s final transaction after redirects or retries. They do not measure connection capacity.</p>
  </section>
}

export function NetworkPerformanceDetails({ performance }: { performance?: SessionNetworkPerformance | null }) {
  if (!performance) return <p className="network-empty-section">Detailed network timings were not captured.</p>
  const durations = [
    { label: 'Response latency', value: performance.timeToFirstByteMilliseconds },
    { label: 'DNS lookup', value: performance.dnsMilliseconds },
    { label: 'Connection (including TLS)', value: performance.connectMilliseconds },
    { label: 'TLS', value: performance.tlsMilliseconds },
    { label: 'Upload interval', value: performance.uploadDurationMilliseconds },
    { label: 'Download interval', value: performance.downloadDurationMilliseconds },
  ]
  return <>
    <dl className="network-general network-general--timing">
      {durations.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{milliseconds(measuredValue(item.value))}</dd></div>)}
      <div><dt>Downloaded body bytes</dt><dd>{measuredValue(performance.downloadedBytes)?.toLocaleString() ?? 'Not measured'}</dd></div>
      <div><dt>Uploaded body bytes</dt><dd>{measuredValue(performance.uploadedBytes)?.toLocaleString() ?? 'Not measured'}</dd></div>
      <div><dt>Average download</dt><dd>{rate(transferMbps(performance.downloadedBytes, performance.downloadDurationMilliseconds))}</dd></div>
      <div><dt>Average upload</dt><dd>{rate(transferMbps(performance.uploadedBytes, performance.uploadDurationMilliseconds))}</dd></div>
      <div><dt>Reused connection</dt><dd>{performance.reusedConnection == null ? 'Unknown' : performance.reusedConnection ? 'Yes' : 'No'}</dd></div>
    </dl>
    <p className="network-empty-section">Final transaction only. Latency includes server processing; body rates use transferred bytes and exclude connection setup. Missing phases were not measured.</p>
  </>
}
