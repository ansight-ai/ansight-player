import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessionLiveFileContent } from '../sessionViewerData'
import type { ArchiveMember, ArchivePreview } from './artifactArchives'
import { readArtifactBytes } from './artifactBytes'
import type { ConfigDocument } from './artifactConfig'
import { displayArtifactValue, type ArtifactRecord, type ArtifactRecords } from './artifactRecords'
import { HarArtifactPreview } from './HarArtifactPreview'
import { ProfileArtifactPreview } from './ProfileArtifactPreview'
import { GeoArtifactPreview } from './GeoArtifactPreview'
import { HtmlArtifactPreview } from './HtmlArtifactPreview'
import type { ProfilePreview } from './artifactProfiles'
import { PerfettoArtifactPreview } from './PerfettoArtifactPreview'
import './ArtifactDataPreview.css'

export function ArtifactDataPreview({ format, content, fileName, renderMember }: {
  format: string; content: SessionLiveFileContent; fileName: string; renderMember: (member: ArchiveMember) => ReactNode
}) {
  const text = content.rawText ?? content.text ?? ''
  if (format === 'html') return <HtmlArtifactPreview text={text} />
  if (format === 'har') return <HarArtifactPreview text={text} />
  if (format === 'geo') return <GeoArtifactPreview text={text} />
  if (format === 'perfetto') return <PerfettoArtifactPreview content={content} fileName={fileName} />
  if (format === 'nettrace') return <div className="artifact-rich"><p>Open this .nettrace in the local Ansight player to convert it with dotnet-trace, or convert it to Speedscope and capture the resulting JSON.</p><code>dotnet-trace convert capture.nettrace --format Speedscope</code></div>
  return <ParsedArtifactPreview content={content} fileName={fileName} format={format} key={`${fileName}:${format}`} renderMember={renderMember} />
}

function ParsedArtifactPreview({ format, content, fileName, renderMember }: {
  format: string; content: SessionLiveFileContent; fileName: string; renderMember: (member: ArchiveMember) => ReactNode
}) {
  const text = content.rawText ?? content.text ?? ''
  const base64 = content.base64, contentUrl = content.contentUrl
  const input = useMemo(() => ({ format, text, base64, contentUrl, fileName }), [format, text, base64, contentUrl, fileName])
  const [result, setResult] = useState<{ input: typeof input; value?: unknown; error?: string }>()
  useEffect(() => {
    const controller = new AbortController()
    const worker = new Worker(new URL('./artifactPreview.worker.ts', import.meta.url), { type: 'module' })
    const timeout = window.setTimeout(() => {
      controller.abort(); worker.terminate()
      setResult({ input, error: 'Preview parsing exceeded 30 seconds. Download the file to inspect it locally.' })
    }, 30_000)
    worker.onmessage = event => { window.clearTimeout(timeout); setResult({ input, ...event.data }); worker.terminate() }
    worker.onerror = event => { window.clearTimeout(timeout); setResult({ input, error: event.message || 'Unable to parse this file.' }); worker.terminate() }
    async function parse() {
      try {
        if (input.format === 'archive') {
          if (content.isTruncated || content.truncated) throw new Error('Archive preview requires the complete file. Choose Open full file.')
          const bytes = await readArtifactBytes(input, controller.signal)
          if (!controller.signal.aborted) worker.postMessage({ format: input.format, fileName: input.fileName, bytes }, [bytes.buffer])
        } else worker.postMessage({ format: input.format, fileName: input.fileName, text: input.text })
      } catch (error) {
        if (!controller.signal.aborted) { window.clearTimeout(timeout); worker.terminate(); setResult({ input, error: error instanceof Error ? error.message : String(error) }) }
      }
    }
    void parse()
    return () => { controller.abort(); window.clearTimeout(timeout); worker.terminate() }
  }, [input, content.isTruncated, content.truncated])
  if (!result || result.input !== input) return <p className="artifact-rich" role="status">Preparing {format === 'archive' ? 'archive contents' : 'preview'}…</p>
  if (result.error) return <div className="artifact-rich"><p role="alert">{result.error}</p>{text ? <details><summary>View source</summary><pre>{text}</pre></details> : null}</div>
  if (format === 'archive') return <ArchiveContents value={result.value as ArchivePreview} renderMember={renderMember} />
  if (format === 'profile') return <ProfileArtifactPreview value={result.value as ProfilePreview} />
  if (format === 'yaml' || format === 'toml') {
    const document = result.value as ConfigDocument
    return <div className="artifact-rich"><p>{format.toUpperCase()} syntax validated.</p>{document.warnings.map((warning, index) => <p role="status" key={index}>{warning}</p>)}<ArtifactValueTree value={document.value} /></div>
  }
  return <ArtifactRecordTable value={result.value as ArtifactRecords} />
}

export function ArtifactValueTree({ value, name = 'root', depth = 0 }: { value: unknown; name?: string; depth?: number }) {
  const [limit, setLimit] = useState(100)
  const [expanded, setExpanded] = useState(depth < 2)
  if (!value || typeof value !== 'object') return <div className="artifact-value"><strong>{name}</strong><code>{displayArtifactValue(value)}</code></div>
  if (depth > 64) return <p>Further nesting omitted after 64 levels.</p>
  const entries = Object.entries(value)
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="artifact-value-tree">
    <summary>{name} <small>{Array.isArray(value) ? 'Array' : 'Object'} · {entries.length.toLocaleString()}</small></summary>
    {expanded ? <div>{entries.slice(0, limit).map(([key, child]) => <ArtifactValueTree value={child} name={key} depth={depth + 1} key={key} />)}
      {entries.length > limit ? <button type="button" onClick={() => setLimit(limit + 100)}>Show next 100</button> : null}</div> : null}
  </details>
}

function ArtifactRecordTable({ value }: { value: ArtifactRecords }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(0), [selected, setSelected] = useState<ArtifactRecord>()
  const records = useMemo(() => value.records.filter(record => !query || displayArtifactValue(record.value).toLowerCase().includes(query.toLowerCase())), [query, value.records])
  const pageCount = Math.max(1, Math.ceil(records.length / 100)), activePage = Math.min(page, pageCount - 1)
  const invalid = value.records.filter(record => record.error).length
  return <div className="artifact-rich">
    <div className="artifact-rich-toolbar"><input aria-label="Filter records" placeholder="Filter records…" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} />
      <span>{records.length.toLocaleString()} records{invalid ? ` · ${invalid} invalid lines` : ''}</span></div>
    {value.warnings.map(warning => <p role="status" key={warning}>{warning}</p>)}
    <div className="artifact-table-scroll"><table><thead><tr><th>Record / line</th>{value.columns.map(column => <th key={column}>{column}</th>)}<th>Validation</th></tr></thead>
      <tbody>{records.slice(activePage * 100, (activePage + 1) * 100).map(record => <tr key={record.line} data-selected={record === selected}>
        <td><button type="button" onClick={() => setSelected(record)}>{record.line}</button></td>
        {value.columns.map(column => <td key={column} title={displayArtifactValue(record.value && typeof record.value === 'object' && !Array.isArray(record.value) ? (record.value as Record<string, unknown>)[column] : record.value)}>{displayArtifactValue(record.value && typeof record.value === 'object' && !Array.isArray(record.value) ? (record.value as Record<string, unknown>)[column] : column === 'value' ? record.value : '').slice(0, 500)}</td>)}
        <td>{record.error || 'Valid'}</td></tr>)}</tbody></table></div>
    <div className="artifact-rich-toolbar"><button type="button" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous</button><span>Page {activePage + 1} of {pageCount}</span><button type="button" disabled={activePage + 1 >= pageCount} onClick={() => setPage(activePage + 1)}>Next</button></div>
    {selected ? <section><h4>Record {selected.line}</h4>{selected.error ? <p role="alert">{selected.error}</p> : null}<ArtifactValueTree value={selected.value} /></section> : null}
  </div>
}

function ArchiveContents({ value, renderMember }: { value: ArchivePreview; renderMember: (member: ArchiveMember) => ReactNode }) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<ArchiveMember>()
  const members = value.members.filter(member => member.path.toLowerCase().includes(query.toLowerCase()))
  return <div className="artifact-rich">
    <div className="artifact-rich-toolbar"><input aria-label="Filter archive members" placeholder="Filter archive paths…" value={query} onChange={event => setQuery(event.target.value)} /><span>{value.members.length} files · {(value.expandedBytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB expanded</span></div>
    <div className="artifact-archive-layout"><div className="artifact-archive-members">{members.map(member => <button type="button" key={member.path} aria-pressed={selected === member} onClick={() => setSelected(member)}><span>{member.path}</span><small>{member.size.toLocaleString()} bytes</small></button>)}</div>
      <div className="artifact-archive-content">{selected ? <><h4>{selected.path}</h4>{selected.note ? <p>{selected.note}</p> : renderMember(selected)}</> : <p>Select a file to preview its contents.</p>}</div></div>
  </div>
}
