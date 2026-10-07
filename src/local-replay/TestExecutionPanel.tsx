import { ArrowClockwise, ArrowSquareOut, CheckCircle, CircleNotch, DeviceMobile, ListChecks, Play, Stop, TestTube, WarningCircle, X, XCircle } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { agentReasoningModes, defaultAgentReasoning, type AgentReasoning } from '../agentReasoning'
import type { LocalDeviceInventory, LocalOperationResult, LocalRegisteredApp, LocalRepositoryWorkspaceCatalog, LocalTestExecution, LocalWorkspaceTest } from './types'

export function TestExecutionPanel({ initialAppId, initialTestId, onClose, onOpenHistory }: { initialAppId?: string; initialTestId?: string; onClose: () => void; onOpenHistory: () => void }) {
  const [apps, setApps] = useState<LocalRegisteredApp[]>([])
  const [selectedAppId, setSelectedAppId] = useState(initialAppId ?? '')
  const [catalog, setCatalog] = useState<LocalRepositoryWorkspaceCatalog | null>(null)
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set())
  const [inventory, setInventory] = useState<LocalDeviceInventory | null>(null)
  const [selectedDeviceKey, setSelectedDeviceKey] = useState('')
  const [applicationPath, setApplicationPath] = useState('')
  const [reasoning, setReasoning] = useState<AgentReasoning>(defaultAgentReasoning)
  const [captureTrace, setCaptureTrace] = useState(true)
  const [continueAfterFailure, setContinueAfterFailure] = useState(true)
  const [executions, setExecutions] = useState<LocalTestExecution[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)

  const selectedApp = apps.find((app) => app.appId === selectedAppId) ?? null
  const selectedDevice = useMemo(() => inventory?.devices.find((device) => `${device.platform}:${device.identifier}` === selectedDeviceKey) ?? null, [inventory?.devices, selectedDeviceKey])
  const enabledTestCount = catalog?.tests.filter((test) => test.enabled).length ?? 0

  const loadBaseData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [appsResponse, devicesResponse] = await Promise.all([
        fetch('api/apps', { cache: 'no-store' }),
        fetch('api/devices', { cache: 'no-store' }),
      ])
      if (!appsResponse.ok || !devicesResponse.ok) throw new Error('Unable to load test targets.')
      const nextApps = (await appsResponse.json() as LocalRegisteredApp[]).filter((app) => !!app.codebasePath)
      const nextInventory = await devicesResponse.json() as LocalDeviceInventory
      setApps(nextApps)
      setInventory(nextInventory)
      setSelectedAppId((current) => current && nextApps.some((app) => app.appId === current) ? current : nextApps[0]?.appId ?? '')
      setSelectedDeviceKey((current) => current || (nextInventory.devices.find((device) => device.isBooted) ? `${nextInventory.devices.find((device) => device.isBooted)!.platform}:${nextInventory.devices.find((device) => device.isBooted)!.identifier}` : ''))
    } catch (error) {
      setMessage(resolveError(error, 'Unable to load test targets.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadExecutions = useCallback(async () => {
    try {
      const response = await fetch('api/tests/executions', { cache: 'no-store' })
      if (response.ok) setExecutions(await response.json() as LocalTestExecution[])
    } catch {
      // A transient polling failure should not clear the last known progress.
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadBaseData(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadBaseData])
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadExecutions(), 0)
    const interval = window.setInterval(() => void loadExecutions(), 900)
    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [loadExecutions])

  useEffect(() => {
    if (!selectedApp?.codebasePath) {
      const timeout = window.setTimeout(() => setCatalog(null), 0)
      return () => window.clearTimeout(timeout)
    }
    let isMounted = true
    const timeout = window.setTimeout(() => {
      setCatalog(null)
      setSelectedTestIds(new Set())
      fetch(`api/apps/workspace?appId=${encodeURIComponent(selectedApp.appId)}`, { cache: 'no-store' })
        .then(async (response) => {
          const body = await response.json() as LocalRepositoryWorkspaceCatalog | LocalOperationResult
          if (!response.ok || !('tests' in body)) throw new Error('message' in body ? body.message : `HTTP ${response.status}`)
          return body
        })
        .then((next) => {
          if (!isMounted) return
          setCatalog(next)
          if (initialAppId === selectedApp.appId && initialTestId) {
            const requestedTest = next.tests.find((test) => test.testId === initialTestId)
            if (requestedTest?.enabled) setSelectedTestIds(new Set([initialTestId]))
            else setMessage(requestedTest
              ? `The saved test '${initialTestId}' is disabled. Resolve its REVIEW items before running it.`
              : `The saved test '${initialTestId}' was not found in this workspace. Refresh the test list after saving.`)
          }
        })
        .catch((error: unknown) => { if (isMounted) setMessage(resolveError(error, 'Unable to load workspace tests.')) })
    }, 0)
    return () => {
      isMounted = false
      window.clearTimeout(timeout)
    }
  }, [initialAppId, initialTestId, selectedApp?.appId, selectedApp?.codebasePath])

  function buildRequest(testIds: string[]) {
    return {
      workspacePath: selectedApp?.codebasePath,
      testIds,
      platform: selectedDevice?.platform ?? null,
      deviceIdentifier: selectedDevice?.identifier ?? null,
      applicationPath: applicationPath.trim() || null,
      deviceKind: selectedDevice?.kind ?? null,
      reasoning,
      continueAfterFailure,
      captureTrace,
      enableWorkspaceTools: true,
    }
  }

  async function validateWorkspace() {
    if (!selectedApp?.codebasePath) return
    setMessage(null)
    try {
      const response = await fetch('api/tests/validate', {
        body: JSON.stringify(buildRequest([])),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as { tests?: LocalWorkspaceTest[], warnings?: string[], message?: string }
      if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`)
      setMessage(result.warnings?.length ? `Validated with ${result.warnings.length} warning(s): ${result.warnings.join(' ')}` : `Validated ${result.tests?.length ?? 0} workspace test(s).`)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to validate the workspace tests.'))
    }
  }

  async function startTests(runAll: boolean) {
    if (!selectedApp?.codebasePath || isStarting) return
    const testIds = runAll ? [] : [...selectedTestIds]
    if (!runAll && testIds.length === 0) {
      setMessage('Select at least one test, or choose Run all.')
      return
    }
    setIsStarting(true)
    setMessage(null)
    try {
      const response = await fetch('api/tests/run', {
        body: JSON.stringify(buildRequest(testIds)),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalTestExecution | LocalOperationResult
      if (!response.ok || !('executionId' in result)) throw new Error(result.message || `HTTP ${response.status}`)
      setExecutions((current) => [result, ...current.filter((execution) => execution.executionId !== result.executionId)])
      setMessage(result.message)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to start workspace tests.'))
    } finally {
      setIsStarting(false)
    }
  }

  async function cancelExecution(executionId: string) {
    const response = await fetch(`api/tests/executions/${encodeURIComponent(executionId)}/cancel`, { body: '{}', headers: { 'Content-Type': 'application/json' }, method: 'POST' })
    const result = await response.json() as LocalTestExecution | LocalOperationResult
    setMessage(result.message)
    await loadExecutions()
  }

  return (
    <div className="local-admin-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !isStarting) onClose() }}>
      <section aria-label="Workspace test execution" className="local-admin-panel local-admin-panel--wide">
        <header className="local-admin-header">
          <div><p className="eyebrow">Workspace tests</p><span>Validate, run, monitor and cancel local test execution</span></div>
          <div><a className="button button--secondary" href="https://www.ansight.ai/docs/workspace/tests" rel="noopener noreferrer" target="_blank">Tests help <ArrowSquareOut aria-hidden="true" /></a><button className="local-text-button" onClick={onOpenHistory} type="button">History</button><button aria-label="Refresh test data" className="local-icon-button" disabled={isLoading} onClick={() => void loadBaseData()} type="button"><ArrowClockwise className={isLoading ? 'spin' : undefined} /></button><button aria-label="Close workspace tests" className="local-icon-button" onClick={onClose} type="button"><X /></button></div>
        </header>
        {message ? <p className="inline-message local-admin-message">{message}</p> : null}
        <div className="local-test-execution-grid">
          <main className="local-admin-content">
            <section className="local-admin-section">
              <div className="local-admin-form">
                <label className="local-admin-form--wide">App &amp; workspace<select onChange={(event) => setSelectedAppId(event.target.value)} value={selectedAppId}><option value="">Choose an app</option>{apps.map((app) => <option key={app.appId} value={app.appId}>{app.name} · {app.codebasePath}</option>)}</select></label>
                <label>Target<select onChange={(event) => setSelectedDeviceKey(event.target.value)} value={selectedDeviceKey}><option value="">Automatic target</option>{inventory?.devices.map((device) => <option key={`${device.platform}:${device.identifier}`} value={`${device.platform}:${device.identifier}`}>{device.name} · {device.platform} · {device.state}</option>)}</select></label>
                <label>Application artifact<input onChange={(event) => setApplicationPath(event.target.value)} placeholder="Optional host path" value={applicationPath} /></label>
                <label>Reasoning mode<select onChange={(event) => setReasoning(event.target.value as AgentReasoning)} value={reasoning}>{agentReasoningModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
                <div className="local-admin-checkbox-stack"><label><input checked={captureTrace} onChange={(event) => setCaptureTrace(event.target.checked)} type="checkbox" />Capture evaluation trace</label><label><input checked={continueAfterFailure} onChange={(event) => setContinueAfterFailure(event.target.checked)} type="checkbox" />Continue after failure</label></div>
              </div>
            </section>
            <section className="local-admin-section local-admin-section--grow">
              <div className="local-admin-section-heading"><div><ListChecks /><span><strong>Tests</strong><small>{catalog?.tests.length ?? 0} discovered</small></span></div><button className="local-text-button" disabled={!selectedApp} onClick={() => void validateWorkspace()} type="button">Validate</button></div>
              <div className="local-test-selection-list">
                {catalog?.tests.map((test) => <label key={test.testId}><input checked={selectedTestIds.has(test.testId)} disabled={!test.enabled} onChange={(event) => setSelectedTestIds((current) => { const next = new Set(current); if (event.target.checked) next.add(test.testId); else next.delete(test.testId); return next })} type="checkbox" /><span><strong>{test.name}</strong><small>{test.testId} · {test.appId}{test.enabled ? '' : ' · disabled'}{test.requiredSecrets.length ? ` · secrets: ${test.requiredSecrets.join(', ')}` : ''}</small></span></label>)}
                {selectedApp && catalog?.tests.length === 0 ? <div className="local-admin-empty"><TestTube /><span>No tests found in this workspace.</span></div> : null}
              </div>
              <div className="local-admin-actions"><button className="button button--primary" disabled={isStarting || selectedTestIds.size === 0} onClick={() => void startTests(false)} type="button">{isStarting ? <CircleNotch className="spin" /> : <Play />}Run selected</button><button className="button button--secondary" disabled={isStarting || enabledTestCount === 0} onClick={() => void startTests(true)} type="button"><Play />Run all</button></div>
            </section>
          </main>
          <aside className="local-admin-content">
            <section className="local-admin-section local-admin-section--grow">
              <div className="local-admin-section-heading"><div><DeviceMobile /><span><strong>Executions</strong><small>Live progress is retained for this host process</small></span></div><span>{executions.length}</span></div>
              <div className="local-test-execution-list">
                {executions.map((execution) => <article key={execution.executionId}>{execution.status === 'running' || execution.status === 'queued' ? <CircleNotch className="spin" /> : execution.status === 'succeeded' ? <CheckCircle /> : execution.status === 'failed' ? <XCircle /> : <WarningCircle />}<span><strong>{execution.kind === 'single' ? execution.testIds[0] : execution.testIds.length ? `${execution.testIds.length} selected tests` : 'Run all'}</strong><small>{execution.message}</small><code>{execution.executionId}</code>{execution.progress.at(-1) ? <em>{execution.progress.at(-1)!.stage} · {execution.progress.at(-1)!.message}</em> : null}</span>{execution.status === 'running' || execution.status === 'queued' ? <button aria-label="Cancel test execution" onClick={() => void cancelExecution(execution.executionId)} type="button"><Stop />Cancel</button> : null}</article>)}
                {executions.length === 0 ? <div className="local-admin-empty"><TestTube /><span>No tests have run in this host process.</span></div> : null}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}

function resolveError(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback }
