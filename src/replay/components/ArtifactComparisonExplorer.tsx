import { ArtifactDatabaseDiff } from './ArtifactDatabaseDiff'
import { useEffect, useState, type ReactNode } from 'react'
import type { ArtifactSessionOption, ArtifactComparisonSource, ArtifactDiffRequest, ArtifactDiffResult, ArtifactListItem, ArtifactListRequest, ArtifactListResult } from './artifactComparison'
import { artifactCommand, reorderArtifacts, changedWordSpan, groupArtifacts, latestArtifactPair, artifactSessionOptions, removeArtifactSession, listComparisonSessions } from './artifactComparison'
import './ArtifactComparisonExplorer.css'

export function ArtifactComparisonExplorer({ source, sessionId, refreshKey, onInspect, activeArtifactId, children }: {
  source: ArtifactComparisonSource; sessionId: string; refreshKey: string
  onInspect: (artifactId: string) => void; activeArtifactId?: string; children?: ReactNode
}) {
  const [browseSession, setBrowseSession] = useState(sessionId)
  const [comparisonSessions, setComparisonSessions] = useState([sessionId])
  const [sessions, setSessions] = useState<ArtifactSessionOption[]>([])
  const [filters, setFilters] = useState({ search: '', provider: '', format: '', from: '', to: '', minBytes: '', maxBytes: '', sort: 'captured-at' })
  const [offset, setOffset] = useState(0)
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({})
  const [listing, setListing] = useState<ArtifactListResult | null>(null)
  const [selected, setSelected] = useState<ArtifactListItem[]>([])
  const [showSessions, setShowSessions] = useState(false)
  const [showAllApps, setShowAllApps] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showOrder, setShowOrder] = useState(false)
  const [message, setMessage] = useState('')
  const [listingMessage, setListingMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [result, setResult] = useState<ArtifactDiffResult | null>(null)
  const [hopIndex, setHopIndex] = useState(0)
  const [options, setOptions] = useState({ path: '', mode: 'auto', arrayKey: '', ignoreWhitespace: false })
  const [resultRequest, setResultRequest] = useState<ArtifactDiffRequest | null>(null)
  const [changeOffset, setChangeOffset] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey) }
  }, [expanded])

  useEffect(() => {
    let current = true
    void source.sessions().then(value => { if (current) setSessions(value) }).catch(error => { if (current) setMessage(String(error)) })
    return () => { current = false }
  }, [source])

  function request(start: number, limit = 100): ArtifactListRequest {
    return {
      sessionId, search: filters.search || undefined, provider: filters.provider || undefined,
      format: filters.format || undefined, from: filters.from ? new Date(filters.from).toISOString() : undefined,
      to: filters.to ? new Date(filters.to).toISOString() : undefined,
      minBytes: filters.minBytes ? Number(filters.minBytes) : undefined, maxBytes: filters.maxBytes ? Number(filters.maxBytes) : undefined,
      sort: filters.sort, offset: start, limit,
    }
  }

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setListingMessage('')
      const query: ArtifactListRequest = {
        sessionId, search: filters.search || undefined, provider: filters.provider || undefined, format: filters.format || undefined,
        from: filters.from ? new Date(filters.from).toISOString() : undefined, to: filters.to ? new Date(filters.to).toISOString() : undefined,
        minBytes: filters.minBytes ? Number(filters.minBytes) : undefined, maxBytes: filters.maxBytes ? Number(filters.maxBytes) : undefined,
        sort: filters.sort, offset, limit: 100,
      }
      void listComparisonSessions(source, comparisonSessions, query).then(value => { if (current) { setListing(value); setSessionCounts(value.counts); setListingMessage(value.errors.join("; ")) } })
        .catch(error => { if (current) { setListing(null); setListingMessage(String(error)) } })
        .finally(() => { if (current) setLoading(false) })
    }, 180)
    return () => { current = false; window.clearTimeout(timer) }
  }, [source, sessionId, comparisonSessions, filters, offset, refreshKey])

  const visible = new Set(listing?.items.map(item => item.reference))
  const hidden = selected.filter(item => !visible.has(item.reference)).length
  const filterCount = Object.entries(filters).filter(([key, value]) => key !== 'sort' && value !== '').length
  const items = listing?.items ?? []
  const groups = comparisonSessions.flatMap(owner => groupArtifacts(items.filter(item => item.sessionId === owner)).map(group => ({ ...group, key: `${owner}:${group.key}`, sessionId: owner })))
  const sessionOptions = artifactSessionOptions(sessions, sessionId, showAllApps).filter(item => !comparisonSessions.includes(item.sessionId))
  const hop = result?.hops[hopIndex]

  function updateSelection(next: ArtifactListItem[]) { setSelected(next); setResult(null); setResultRequest(null); setMessage(''); setCopied(null) }
  function toggle(item: ArtifactListItem) {
    if (selected.some(candidate => candidate.reference === item.reference)) updateSelection(selected.filter(candidate => candidate.reference !== item.reference))
    else if (selected.length < 32) updateSelection([...selected, item])
    else setMessage('A journey supports up to 32 captures.')
  }
  async function selectMatching() {
    try {
      const matches = await listComparisonSessions(source, comparisonSessions, request(0, 33))
      if (matches.errors.length) { setMessage(matches.errors.join("; ")); return }
      const next = [...selected]
      for (const item of matches.items) if (!next.some(candidate => candidate.reference === item.reference)) next.push(item)
      if (matches.total > 32 || next.length > 32) { setMessage('Narrow the filters: selection supports up to 32 captures.'); return }
      updateSelection(next)
    } catch (error) { setMessage(String(error)) }
  }
  async function compare(page = 0, captures = selected) {
    const query: ArtifactDiffRequest = page > 0 && resultRequest ? { ...resultRequest, offset: page } : {
      artifacts: captures.map(({ sessionId: owner, artifactId }) => ({ sessionId: owner, artifactId })),
      path: options.path || undefined, mode: options.mode, arrayKey: options.arrayKey || undefined, ignoreWhitespace: options.ignoreWhitespace, offset: page, limit: 100,
    }
    setComparing(true); setMessage('')
    try {
      const value = await source.compare(query)
      setResult(value); setResultRequest(query); setChangeOffset(page)
      if (page === 0) setHopIndex(0)
    } catch (error) { setMessage(String(error)) }
    finally { setComparing(false) }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(text) }
    catch { setMessage(`Copy this command/reference: ${text}`) }
  }

  return <section className={`artifact-comparison-explorer${expanded ? ' artifact-workspace--expanded' : ''}`} aria-label="Find and compare captured artifacts">
    <header className="artifact-toolbar">
      <input aria-label="Search artifacts" placeholder="Search artifacts…" value={filters.search} onChange={event => { setFilters({ ...filters, search: event.target.value }); setOffset(0) }} />
      <details className="artifact-filter-menu"><summary>Filters{filterCount ? ` (${filterCount})` : ''}</summary>
        <div className="artifact-filters">
          <label>Provider<input value={filters.provider} placeholder="Any provider" onChange={event => { setFilters({ ...filters, provider: event.target.value }); setOffset(0) }} /></label>
          <label>Format<input value={filters.format} placeholder="json, sqlite, md…" onChange={event => { setFilters({ ...filters, format: event.target.value }); setOffset(0) }} /></label>
          <label>From<input type="datetime-local" value={filters.from} onChange={event => { setFilters({ ...filters, from: event.target.value }); setOffset(0) }} /></label>
          <label>To<input type="datetime-local" value={filters.to} onChange={event => { setFilters({ ...filters, to: event.target.value }); setOffset(0) }} /></label>
          <label>Min bytes<input type="number" min="0" value={filters.minBytes} onChange={event => { setFilters({ ...filters, minBytes: event.target.value }); setOffset(0) }} /></label>
          <label>Max bytes<input type="number" min="0" value={filters.maxBytes} onChange={event => { setFilters({ ...filters, maxBytes: event.target.value }); setOffset(0) }} /></label>
          <label>Sort<select value={filters.sort} onChange={event => { setFilters({ ...filters, sort: event.target.value }); setOffset(0) }}><option value="captured-at">Capture time</option><option value="newest">Newest first</option><option value="name">Name</option><option value="size">Size</option></select></label>
          <button onClick={() => { setFilters({ search: '', provider: '', format: '', from: '', to: '', minBytes: '', maxBytes: '', sort: 'captured-at' }); setOffset(0) }}>Reset filters</button>
        </div>
      </details>
      <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Exit expanded view' : 'Expand'}</button>
    </header>
    {listingMessage && <p role="alert">{listingMessage}</p>}
    {message && <p role="alert">{message}</p>}
    {selected.length > 0 && <div className="artifact-selection-bar">
      <strong>{selected.length} selected</strong>
      <span>{selected.length === 1 ? 'Select another capture to compare.' : `${selected.length - 1} comparison${selected.length > 2 ? 's' : ''}`}{hidden ? ` · ${hidden} outside this view` : ''}</span>
      <button disabled={comparing} aria-expanded={showOrder} onClick={() => setShowOrder(!showOrder)}>Review order</button>
      <button disabled={comparing} onClick={() => updateSelection([])}>Clear</button>
      <button className="artifact-compare-primary" disabled={selected.length < 2 || comparing} onClick={() => void compare()}>{comparing ? 'Comparing…' : selected.length > 2 ? 'Compare journey' : 'Compare'}</button>
    </div>}
    {showOrder && selected.length > 0 && <ol className="artifact-selection-order">{selected.map((item, index) => <li key={item.reference}>
      <span><strong>{index === 0 ? 'Baseline' : `Step ${index}`} · {item.name}</strong><small>{captureTime(item)} · {item.sessionId}</small></span>
      <button disabled={comparing || index === 0} aria-label={`Move ${item.reference} earlier`} onClick={() => updateSelection(reorderArtifacts(selected, index, -1))}>↑</button>
      <button disabled={comparing || index === selected.length - 1} aria-label={`Move ${item.reference} later`} onClick={() => updateSelection(reorderArtifacts(selected, index, 1))}>↓</button>
      <button disabled={comparing} aria-label={`Remove ${item.reference}`} onClick={() => toggle(item)}>×</button>
    </li>)}<li><button disabled={comparing} onClick={() => updateSelection([...selected].sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc) || a.reference.localeCompare(b.reference)))}>Order by capture time</button></li></ol>}
    <div className="artifact-workspace">
      <aside className="artifact-capture-browser" aria-label="Artifact captures">
        <div className="artifact-browser-heading"><strong>Sessions</strong><button aria-expanded={showSessions} onClick={() => setShowSessions(!showSessions)}>Add a session</button></div>
    <div className="artifact-session-set" aria-label="Comparison sessions">
      {comparisonSessions.map(owner => {
        const session = sessions.find(item => item.sessionId === owner)
        const count = selected.filter(item => item.sessionId === owner).length
        return <div className="artifact-session-list-row" key={owner} data-active={owner === sessionId}>
          <div className="artifact-session-list-label">
            <strong>{session?.name || session?.clientName || owner}{owner === sessionId ? ' (current)' : ''}</strong><small>{owner}</small><small>{sessionCounts[owner] === 0 ? (filterCount ? 'No matching captures' : 'No captures in this session') : sessionCounts[owner] != null ? `${sessionCounts[owner]} captures` : 'Loading captures…'}{count ? ` · ${count} selected` : ''}</small>
          </div>
          {owner !== sessionId && <button disabled={comparing} aria-label={`Remove session ${owner}`} title="Remove session and its selected captures" onClick={() => {
            const next = removeArtifactSession(comparisonSessions, browseSession, selected, owner)
            setComparisonSessions(next.sessionIds); setBrowseSession(next.browseSession); updateSelection(next.selected)
            setOffset(0)
          }}>×</button>}
        </div>
      })}
    </div>
    {showSessions && <div className="artifact-session-picker">Add a session<select aria-label="Add a session" value="" disabled={comparing} onChange={event => {
      const owner = event.target.value
      if (!owner || comparisonSessions.includes(owner)) return
      setComparisonSessions([...comparisonSessions, owner]); setOffset(0); setShowSessions(false)
    }}>
      <option value="">Choose a session…</option>
      {sessionOptions.map(item => <option key={item.sessionId} value={item.sessionId}>{item.name || item.clientName || item.sessionId} · {item.sessionId}</option>)}
    </select><label><input type="checkbox" checked={showAllApps} disabled={comparing} onChange={event => setShowAllApps(event.target.checked)} /> Show all apps</label>
    <span>{sessionOptions.length ? 'Add a session, then select its captures. Use × to remove a session and its selections.' : 'No more sessions for this app. Enable Show all apps to include other apps.'}</span></div>}
        <div className="artifact-browser-heading"><span>{listing?.total ?? 0} captures{filterCount ? ' matching filters' : ''}</span><button disabled={loading || comparing || !listing?.total || listing.total > 32} onClick={() => void selectMatching()}>Select all</button></div>
        <div className="artifact-capture-results" aria-busy={loading}>
          {groups.map(group => <section className="artifact-capture-group" key={group.key}>
            <header>{comparisonSessions.length > 1 && <small title={group.sessionId}>{group.sessionId}{group.sessionId === sessionId ? ' (current)' : ''}</small>}<strong>{group.name}</strong><small>{group.items.length} capture{group.items.length === 1 ? '' : 's'} · {group.items[0].formats.join(', ')}</small>
              {group.items.length >= 2 && <button disabled={loading || comparing} onClick={() => { const pair = latestArtifactPair(group.items); updateSelection(pair); void compare(0, pair) }}>{listing?.nextOffset != null || offset > 0 ? 'Compare latest two on page' : 'Compare latest two'}</button>}
            </header>
            {group.items.map(item => <div className="artifact-capture-row" data-active={item.sessionId === sessionId && item.artifactId === activeArtifactId && !result} key={item.reference}>
              <input type="checkbox" disabled={loading || comparing} aria-label={`Select ${item.name} ${item.reference}`} checked={selected.some(candidate => candidate.reference === item.reference)} onChange={() => toggle(item)} />
              <button className="artifact-capture-open" title={`${item.name} · ${item.sessionId}`} onClick={() => { if (item.sessionId === sessionId) { setResult(null); onInspect(item.artifactId) } else toggle(item) }} disabled={comparing}>
                <strong>{captureTime(item)}</strong><small>{formatSize(item.sizeBytes)}{item.fileCount > 1 ? ` · ${item.fileCount} files` : ''}{item.truncated ? ' · Incomplete' : ''}</small>
              </button>
              {item.sessionId !== sessionId && source.timelineHref && <a href={source.timelineHref(item)} target="_blank" rel="noreferrer" aria-label={`Open ${item.name} capture timeline`}>↗</a>}
            </div>)}
          </section>)}
          {loading && <p>Loading captures…</p>}
          {!loading && listing?.total === 0 && <p>No captures{filterCount ? ' match these filters' : ' in this session'}.</p>}
        </div>
        {(offset > 0 || listing?.nextOffset != null) && <div className="artifact-comparison-actions"><button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous</button><span>Page {Math.floor(offset / 100) + 1} per session</span><button disabled={loading || listing?.nextOffset == null} onClick={() => setOffset(listing!.nextOffset!)}>Next</button></div>}
      </aside>
      <div className="artifact-workspace-content">
        {selected.length >= 2 && <div className="artifact-comparison-tools">
          <details><summary>Comparison options</summary><fieldset disabled={comparing} className="artifact-filters">
            <label>File path<input value={options.path} placeholder="All captured files" onChange={event => { setOptions({ ...options, path: event.target.value }); setResult(null) }} /></label>
            <label>Compare as<select value={options.mode} onChange={event => { setOptions({ ...options, mode: event.target.value }); setResult(null) }}><option value="auto">Auto-detect format</option><option value="text">Raw text</option></select></label>
            <label>Match array / CSV rows by<input value={options.arrayKey} placeholder="Optional: id" onChange={event => { setOptions({ ...options, arrayKey: event.target.value }); setResult(null) }} /></label>
            <label><input type="checkbox" checked={options.ignoreWhitespace} onChange={event => { setOptions({ ...options, ignoreWhitespace: event.target.checked }); setResult(null) }} /> Ignore text whitespace</label>
          </fieldset></details>
          <button onClick={() => void copy(artifactCommand(selected, options))}>{copied === artifactCommand(selected, options) ? 'Copied' : 'Copy CLI command'}</button>
          {result && <button onClick={() => setResult(null)}>Back to inspection</button>}
        </div>}
        {!result && children}
    {result && <section className="artifact-journey" aria-label="Artifact comparison results">
      <h3>{result.artifacts.length === 2 ? 'What changed' : 'Capture journey'}{!result.isComplete ? ' · Incomplete comparison' : ''}</h3>
      <p>{result.hops.length === 1 ? `${result.hops[0].files.reduce((count, file) => count + file.totalChanges, 0)} changes across ${result.hops[0].files.length} file${result.hops[0].files.length === 1 ? '' : 's'}.${!result.isComplete ? ' Some contents could not be fully compared.' : ''}` : result.summary}</p>
      <div className="artifact-hop-strip">{result.hops.map((item, index) => <button key={item.index} aria-pressed={index === hopIndex} onClick={() => setHopIndex(index)}>{result.hops.length > 1 ? `Step ${index + 1}: ` : ''}{captureTime(item.before)} → {captureTime(item.after)}<small>{item.status} · {item.files.reduce((count, file) => count + file.totalChanges, 0)} changes</small></button>)}</div>
      {hop && <>{hop.before.capturedAtUtc > hop.after.capturedAtUtc && <p className="artifact-direction-notice">Comparing newer → older: rows added over time appear as removals here. <button disabled={comparing} onClick={() => { const next = [...selected].sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc)); updateSelection(next); void compare(0, next) }}>Compare oldest → newest</button></p>}<div className="artifact-hop-context">{[hop.before, hop.after].map((item, index) => <div key={index}><strong>{index === 0 ? 'Before' : 'After'} · {item.name}</strong><small>{captureTime(item)} · {item.sessionId}</small>{source.timelineHref && <a href={source.timelineHref(item)} target="_blank" rel="noreferrer">View in timeline ↗</a>}<button onClick={() => void copy(item.reference)}>{copied === item.reference ? 'Copied' : 'Copy reference'}</button></div>)}</div>
        {hop.files.map((file, index) => <details className="artifact-file-diff" open key={`${hop.index}:${file.path}:${index}`}><summary>{file.path} · {file.format} · {file.status} · {file.totalChanges} changes{!file.isComplete ? ' · INCOMPLETE' : ''}</summary>
          {file.message && <p>{file.message}</p>}
          {file.format === 'sqlite' ? <ArtifactDatabaseDiff key={`${hop.index}:${file.path}:${changeOffset}`} file={file} /> : file.changes.length > 0 && <table><thead><tr><th>Change / location</th><th>Before</th><th>After</th></tr></thead><tbody>{file.changes.map((change, changeIndex) => <tr key={changeIndex}><td>{change.kind}<code>{change.path}</code></td><td className="artifact-diff-before"><ChangedValue value={change.before} other={change.after} /></td><td className="artifact-diff-after"><ChangedValue value={change.after} other={change.before} /></td></tr>)}</tbody></table>}
          {file.nextOffset != null && <p>More changes available on the next page.</p>}
        </details>)}
        {(changeOffset > 0 || result.hops.some(item => item.files.some(file => file.nextOffset != null))) && <div className="artifact-comparison-actions"><button disabled={comparing || changeOffset === 0} onClick={() => void compare(Math.max(0, changeOffset - 100))}>Previous changes</button><span>Page {Math.floor(changeOffset / 100) + 1}</span><button disabled={comparing || !result.hops.some(item => item.files.some(file => file.nextOffset != null))} onClick={() => void compare(changeOffset + 100)}>Next changes</button></div>}
      </>}
    </section>}
      </div>
    </div>
  </section>
}

function ChangedValue({ value, other }: { value?: string | null; other?: string | null }) {
  if (value == null) return <pre>—</pre>
  if (other == null) return <pre>{value}</pre>
  const span = changedWordSpan(value, other)
  return <pre>{span.prefix}<mark>{span.changed}</mark>{span.suffix}</pre>
}

function captureTime(item: ArtifactListItem) { return new Date(item.capturedAtUtc).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) }
function formatSize(bytes: number) { return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B` }
