import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ArtifactChange, ArtifactFileDiff, DatabaseCell } from './artifactComparison'

export function ArtifactDatabaseDiff({ file }: { file: ArtifactFileDiff }) {
  const [table, setTable] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!fullscreen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); setFullscreen(false) } }
    window.addEventListener('keydown', escape, true)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape, true) }
  }, [fullscreen])
  const tables = [...new Set(file.changes.flatMap(change => change.database ? [change.database.table] : []))].sort()
  const content = <div className={`artifact-database-diff${fullscreen ? ' artifact-file-diff artifact-database-fullscreen' : ''}`} aria-label="Database comparison">
    <header className="artifact-database-toolbar"><strong>{file.path}</strong><button onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button></header>
    <label>Table <select aria-label="Database table" value={table} onChange={event => setTable(event.target.value)}><option value="">All tables on this page</option>{tables.map(name => <option key={name}>{name}</option>)}</select></label>
    {tables.length === 0 && <p>No row changes on this page.</p>}
    {tables.filter(name => !table || name === table).map(name => <DatabaseTable key={name} name={name} changes={file.changes.filter(change => change.database?.table === name)} />)}
    {!table && file.changes.filter(change => !change.database).map((change, index) => <details key={`${change.path}:${index}`}><summary>Schema {change.kind}: {change.path}</summary><pre>{change.before ?? '—'} → {change.after ?? '—'}</pre></details>)}
  </div>
  return fullscreen ? createPortal(content, document.body) : content
}

function DatabaseTable({ name, changes }: { name: string; changes: ArtifactChange[] }) {
  const columns = [...new Set(changes.flatMap(change => [...Object.keys(change.database?.beforeRow ?? {}), ...Object.keys(change.database?.afterRow ?? {})]))]
  // Put common identity columns first so wide tables remain recognisable.
  columns.sort((a, b) => columnPriority(a) - columnPriority(b) || a.localeCompare(b))
  const added = changes.reduce((count, change) => count + Math.max(0, change.database!.afterCount - change.database!.beforeCount), 0)
  const removed = changes.reduce((count, change) => count + Math.max(0, change.database!.beforeCount - change.database!.afterCount), 0)
  const updated = changes.filter(change => change.kind === 'modified').length
  return <section className="artifact-database-table" aria-label={`${name} changes`}>
    <h4>{name}<span>{[added ? `${added} added` : '', removed ? `${removed} removed` : '', updated ? `${updated} updated` : ''].filter(Boolean).join(' · ')}</span></h4>
    <div className="artifact-database-scroll" role="region" aria-label={`${name} row changes`} tabIndex={0}>
      <table><thead><tr><th scope="col">Change</th>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{changes.map((change, index) => {
          const row = change.database!
          const wholeRow = change.kind === 'added' || change.kind === 'removed'
          const values = change.kind === 'removed' ? row.beforeRow : row.afterRow
          const count = Math.abs(row.afterCount - row.beforeCount)
          return <tr key={`${change.path}:${index}`} className={wholeRow ? `artifact-db-${change.kind}` : ''}>
            <th scope="row" title={row.key}><span aria-label={change.kind === 'added' ? 'Row added' : change.kind === 'removed' ? 'Row removed' : 'Row updated'}>{change.kind === 'added' ? '+' : change.kind === 'removed' ? '−' : '~'}</span>{count > 1 && <small>×{count}</small>}</th>
            {columns.map(column => <td key={column}>{!wholeRow && row.changedColumns.includes(column) ? <>
              <div className="artifact-db-removed" aria-label={`${column} before`}><b aria-hidden="true">− </b>{displayCell(row.beforeRow, column)}</div>
              <div className="artifact-db-added" aria-label={`${column} after`}><b aria-hidden="true">+ </b>{displayCell(row.afterRow, column)}</div>
            </> : displayCell(values, column)}</td>)}
          </tr>
        })}</tbody>
      </table>
    </div>
  </section>
}
function columnPriority(column: string) { return column.toLowerCase() === 'id' ? 0 : column.toLowerCase() === 'name' ? 1 : 2 }
function displayCell(row: Record<string, DatabaseCell | null> | undefined, column: string) {
  if (!row || !(column in row)) return '—'
  const cell = row[column]
  if (cell == null) return 'NULL'
  if (cell.type === 'blob') return `BLOB · ${cell.length} bytes · SHA256 ${cell.sha256}`
  return cell.type === 'text' ? JSON.stringify(cell.value) : cell.value
}
