import { useMemo, useState } from 'react'
import { parseArtifactHar, type HarField } from './artifactHar'

export function HarArtifactPreview({ text }: { text: string }) {
  const parsed = useMemo(() => { try { return { value: parseArtifactHar(text) } } catch (error) { return { error: String(error) } } }, [text])
  const [query, setQuery] = useState(''), [page, setPage] = useState(0), [selected, setSelected] = useState<number>()
  if (!parsed.value) return <div className="artifact-rich"><p role="alert">{parsed.error}</p><details><summary>View source</summary><pre>{text}</pre></details></div>
  const value = parsed.value
  const requests = value.requests.filter(request => `${request.method} ${request.url} ${request.status}`.toLowerCase().includes(query.toLowerCase()))
  const pageCount = Math.max(1, Math.ceil(requests.length / 100)), activePage = Math.min(page, pageCount - 1)
  const current = value.requests.find(request => request.index === selected)
  const duration = Math.max(1, value.end - value.start)
  return <div className="artifact-rich">
    <div className="artifact-rich-toolbar"><input aria-label="Filter HAR requests" placeholder="Filter URL, method, or status…" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /><span>{requests.length} requests · {(duration / 1000).toFixed(2)} s</span></div>
    <div className="artifact-table-scroll"><table><thead><tr><th>Method</th><th>Request</th><th>Status</th><th>Duration</th><th>Waterfall</th></tr></thead><tbody>
      {requests.slice(activePage * 100, (activePage + 1) * 100).map(request => <tr key={request.index} data-selected={request.index === selected}>
        <td>{request.method}</td><td><button type="button" className="artifact-url" onClick={() => setSelected(request.index)}>{request.url}</button></td><td>{request.status || 'Failed'}</td><td>{request.duration.toFixed(1)} ms</td>
        <td><div className="artifact-har-waterfall" title={`${(request.started - value.start).toFixed(1)} ms → ${(request.started - value.start + request.duration).toFixed(1)} ms`}><span style={{ left: `${(request.started - value.start) / duration * 100}%`, width: `${Math.max(0.5, request.duration / duration * 100)}%` }} /></div></td>
      </tr>)}</tbody></table></div>
    <div className="artifact-rich-toolbar"><button type="button" disabled={!activePage} onClick={() => setPage(activePage - 1)}>Previous</button><span>Page {activePage + 1} of {pageCount}</span><button type="button" disabled={activePage + 1 >= pageCount} onClick={() => setPage(activePage + 1)}>Next</button></div>
    {current ? <section className="artifact-har-detail"><h4>{current.method} {current.url}</h4><p>{current.status} · {current.mimeType || 'Unknown content type'} · {current.size.toLocaleString()} bytes</p>
      <div className="artifact-rich-columns"><FieldList name="Request headers" fields={current.requestHeaders} /><FieldList name="Response headers" fields={current.responseHeaders} /><FieldList name="Query parameters" fields={current.query} /><FieldList name="Timing breakdown" fields={current.timings} /></div>
      <details open><summary>Request body</summary><pre>{current.requestBody.slice(0, 1_000_000) || 'No request body captured.'}</pre></details>
      <details open><summary>Response body</summary><pre>{current.responseBody.slice(0, 1_000_000) || 'No response body captured.'}</pre>{current.responseBody.length > 1_000_000 ? <p>Body display limited to the first 1,000,000 characters.</p> : null}</details>
    </section> : <p>Select a request to inspect its headers, timings, and captured bodies.</p>}
  </div>
}

function FieldList({ name, fields }: { name: string; fields: HarField[] }) {
  return <section><h4>{name}</h4>{fields.length ? <dl>{fields.map((field, index) => <div key={index}><dt>{field.name}</dt><dd>{field.value}</dd></div>)}</dl> : <p>None captured.</p>}</section>
}
