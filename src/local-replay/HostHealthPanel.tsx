import { ArrowClockwise, CheckCircle, CircleNotch, FileText, Pulse, WarningCircle, X, XCircle } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import type { LocalHostHealth, LocalHostLogFile } from './types'

export function HostHealthPanel({ onClose }: { onClose: () => void }) {
  const [health, setHealth] = useState<LocalHostHealth | null>(null)
  const [logs, setLogs] = useState<LocalHostLogFile[]>([])
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [logContent, setLogContent] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [healthResponse, logsResponse] = await Promise.all([
        fetch('api/health', { cache: 'no-store' }),
        fetch('api/health/logs', { cache: 'no-store' }),
      ])
      if (!healthResponse.ok || !logsResponse.ok) throw new Error('Unable to inspect the local host.')
      const nextLogs = await logsResponse.json() as LocalHostLogFile[]
      setHealth(await healthResponse.json() as LocalHostHealth)
      setLogs(nextLogs)
      setSelectedLog((current) => current && nextLogs.some((log) => log.fileName === current) ? current : nextLogs[0]?.fileName ?? null)
      setMessage(null)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to inspect host health.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])
  useEffect(() => {
    if (!selectedLog) {
      return
    }
    let isMounted = true
    fetch(`api/health/logs/content?file=${encodeURIComponent(selectedLog)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The local host returned HTTP ${response.status}.`)
        return response.text()
      })
      .then((content) => { if (isMounted) setLogContent(content) })
      .catch((error: unknown) => { if (isMounted) setMessage(resolveError(error, 'Unable to read the host log.')) })
    return () => { isMounted = false }
  }, [selectedLog])

  return (
    <div className="local-admin-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <section aria-label="Host health" className="local-admin-panel local-admin-panel--wide">
        <header className="local-admin-header">
          <div><p className="eyebrow">Host health</p><span>Runtime, native tools, permissions and logs</span></div>
          <div><button aria-label="Run diagnostics again" className="local-icon-button" disabled={isLoading} onClick={() => void load()} type="button"><ArrowClockwise className={isLoading ? 'spin' : undefined} /></button><button aria-label="Close host health" className="local-icon-button" onClick={onClose} type="button"><X /></button></div>
        </header>
        {message ? <p className="inline-message local-admin-message">{message}</p> : null}
        {isLoading && !health ? <div className="local-admin-empty"><CircleNotch className="spin" /><strong>Running host diagnostics</strong></div> : health ? <div className="local-health-layout">
          <main className="local-admin-content">
            <section className="local-admin-section">
              <div className="local-health-summary"><Pulse /><span><strong>{health.signal.toUpperCase()}</strong><small>{health.operatingSystem} · {health.architecture} · Host {health.hostVersion} · .NET {health.dotNetVersion}</small></span></div>
              <dl className="local-admin-definition-list"><div><dt>Data</dt><dd>{health.dataDirectory}</dd></div><div><dt>Logs</dt><dd>{health.logDirectory}</dd></div><div><dt>Checked</dt><dd>{new Date(health.generatedAtUtc).toLocaleString()}</dd></div></dl>
            </section>
            <section className="local-admin-section local-admin-section--grow">
              <div className="local-admin-section-heading"><div><Pulse /><span><strong>Checks</strong><small>{health.checks.filter((check) => check.isSuccess).length} of {health.checks.length} available</small></span></div></div>
              <div className="local-health-checks">
                {health.checks.map((check) => <article key={check.name}>{check.signal === 'green' ? <CheckCircle /> : check.signal === 'red' ? <XCircle /> : <WarningCircle />}<span><strong>{check.name}</strong><small>{check.message}</small>{check.path ? <code>{check.path}</code> : null}</span><i>{check.status}</i></article>)}
              </div>
            </section>
          </main>
          <aside className="local-admin-content">
            <section className="local-admin-section local-admin-section--grow">
              <div className="local-admin-section-heading"><div><FileText /><span><strong>Host logs</strong><small>Latest 2 MB of the selected file</small></span></div></div>
              <select aria-label="Host log file" onChange={(event) => setSelectedLog(event.target.value)} value={selectedLog ?? ''}><option value="">No log selected</option>{logs.map((log) => <option key={log.fileName} value={log.fileName}>{log.fileName} · {formatBytes(log.byteCount)}</option>)}</select>
              <pre className="local-host-log">{selectedLog && logContent ? logContent : 'No host log content available.'}</pre>
            </section>
          </aside>
        </div> : null}
      </section>
    </div>
  )
}

function formatBytes(bytes: number): string { return bytes < 1024 ** 2 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB` }
function resolveError(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback }
