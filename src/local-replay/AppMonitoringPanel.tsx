import { CircleNotch, MagnifyingGlass, Pulse, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { LocalRegisteredApp } from './types'

type AppWatch = {
  watch: { id: string; appId: string; platform: string | null; deviceId: string | null; enabled: boolean; captureFiles: string[]; screenshotIntervalMilliseconds?: number }
  state: string
  message?: string | null
  devices: { platform: string; deviceId: string; deviceName: string; state: string; sessionId?: string | null; lastSessionId?: string | null; message?: string | null }[]
}

type AppWatchResponse = { hostRunning: boolean; watches: AppWatch[]; isSuccess?: boolean; message?: string }

export function AppMonitoringPanel({ apps, initialAppId }: { apps: LocalRegisteredApp[]; initialAppId: string }) {
  const [appId, setAppId] = useState(initialAppId)
  const [platform, setPlatform] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [captureFiles, setCaptureFiles] = useState('')
  const [screenshotIntervalSeconds, setScreenshotIntervalSeconds] = useState('2')
  const [search, setSearch] = useState('')
  const [watches, setWatches] = useState<AppWatch[]>([])
  const [hostRunning, setHostRunning] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestGeneration = useRef(0)
  const isMutating = useRef(false)

  const load = useCallback(async (signal: AbortSignal) => {
    if (isMutating.current) return
    const generation = ++requestGeneration.current
    try {
      const response = await fetch('api/app-watches', { cache: 'no-store', signal })
      const result = await response.json() as AppWatchResponse
      if (!response.ok) throw new Error(result.message || 'Unable to load app monitors.')
      if (generation !== requestGeneration.current || signal.aborted) return
      setWatches(result.watches)
      setHostRunning(result.hostRunning)
      setError(null)
    } catch (cause) {
      if (!signal.aborted && generation === requestGeneration.current)
        setError(cause instanceof Error ? cause.message : 'Unable to load app monitors.')
    } finally {
      if (!signal.aborted && generation === requestGeneration.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof window.setTimeout>
    async function refresh() {
      await load(controller.signal)
      if (!controller.signal.aborted) timer = window.setTimeout(() => { void refresh() }, 4000)
    }
    void refresh()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [load])

  async function changeMonitor(operation: string, url: string, body: unknown = {}): Promise<boolean> {
    if (isMutating.current) return false
    isMutating.current = true
    ++requestGeneration.current
    setPending(operation)
    setMessage(null)
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json() as AppWatchResponse
      if (!response.ok || !result.isSuccess) throw new Error(result.message || 'Unable to update app monitoring.')
      setWatches(result.watches)
      setHostRunning(result.hostRunning)
      setMessage(result.message ?? 'App monitoring updated.')
      return true
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to update app monitoring.')
      return false
    } finally {
      isMutating.current = false
      setPending(null)
    }
  }

  const existing = watches.some(({ watch }) => watch.appId === appId.trim() && (watch.platform ?? '') === platform && (watch.deviceId ?? '') === deviceId.trim())
  async function addMonitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (existing || !appId.trim() || isLoading || error) return
    if (await changeMonitor('add', 'api/app-watches/add', {
      appId: appId.trim(), platform: platform || null, deviceId: deviceId.trim() || null,
      captureFiles: captureFiles.split('\n').map((path) => path.trim()).filter(Boolean),
      screenshotIntervalMilliseconds: Math.round(Number(screenshotIntervalSeconds) * 1000),
    })) { setAppId(''); setDeviceId(''); setCaptureFiles(''); setScreenshotIntervalSeconds('2'); setSearch('') }
  }

  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = watches.filter(({ watch }) => {
    const app = apps.find((item) => item.appId === watch.appId)
    const text = `${watch.appId} ${app?.name ?? ''} ${app?.codebasePath ?? ''}`.toLowerCase()
    return searchTerms.every((term) => text.includes(term))
  })

  return (
    <div className="local-app-management-stack">
      <section className="local-management-section">
        <div className="local-management-section-heading">
          <div><Pulse aria-hidden="true" /><div><strong>Monitor an app</strong><span>Capture app launches on virtual devices or one physical iPhone</span></div></div>
        </div>
        <p className="local-app-monitor-help">Ansight discovers running virtual devices automatically. To monitor a physical iPhone, select iOS and enter its exact device ID. Physical iOS capture requires Appium/XCUITest and records screenshots and accessible UI without an app SDK.</p>
        <form className="local-app-management-form" onSubmit={(event) => { void addMonitor(event) }}>
          <label className="local-control-field">App ID
            <input autoComplete="off" list="monitor-registered-apps" onChange={(event) => setAppId(event.target.value)} placeholder="com.example.app" required value={appId} />
            <datalist id="monitor-registered-apps">{apps.map((app) => <option key={app.appId} value={app.appId}>{app.name}</option>)}</datalist>
          </label>
          <label className="local-control-field">Platform
            <select onChange={(event) => setPlatform(event.target.value)} value={platform}>
              <option value="">iOS and Android virtual devices</option><option value="ios">iOS</option><option value="android">Android emulators</option>
            </select>
          </label>
          <label className="local-control-field">Device ID (optional)
            <input autoComplete="off" onChange={(event) => setDeviceId(event.target.value)} placeholder="iPhone CoreDevice ID or simulator UDID" value={deviceId} />
          </label>
          <label className="local-control-field">Screenshot interval (seconds)
            <input max="60" min="0.1" onChange={(event) => setScreenshotIntervalSeconds(event.target.value)} required step="0.001" type="number" value={screenshotIntervalSeconds} />
          </label>
          <p className="local-app-management-form--wide local-app-monitor-help">Set 1 for a target of one screenshot per second. Slower devices may take longer to capture each screenshot.</p>
          <details className="local-app-management-form--wide local-app-monitor-options">
            <summary>Save sandbox files when capture ends (optional)</summary>
            <label className="local-control-field">File paths
              <textarea onChange={(event) => setCaptureFiles(event.target.value)} placeholder={'Documents/notes.sqlite\nfiles/notes.sqlite'} rows={3} value={captureFiles} />
            </label>
            <p>One path per line, relative to the app’s data sandbox. Up to 16 files, 16 MiB each. Physical iPhone apps do not expose private sandbox files through external monitoring.</p>
          </details>
          {existing ? <p className="local-app-management-form--wide" role="status">This app and platform already have a monitor. Use Enable below if it is disabled.</p> : null}
          <button className="button button--primary local-app-management-form--wide" disabled={!appId.trim() || existing || (deviceId.trim().length > 0 && !platform) || isLoading || !!error || !!pending} type="submit">{pending === 'add' ? 'Adding monitor…' : 'Monitor app'}</button>
        </form>
      </section>

      <section className="local-management-section" aria-label="App monitors">
        <div className="local-management-section-heading">
          <div><Pulse aria-hidden="true" /><div><strong>Monitored apps</strong><span>Saved across host restarts; monitoring runs while the local host is running</span></div></div>
          <span aria-live="polite">{searchTerms.length ? `${filtered.length} of ${watches.length}` : watches.length}</span>
        </div>
        {!hostRunning ? <p className="local-app-monitor-help" role="status">Monitoring is saved but the watcher is stopped. Restart the resident host to resume capture.</p> : null}
        {error ? <p className="inline-message" role="alert">{error}</p> : null}
        {message ? <p className="inline-message" role="status">{message}</p> : null}
        <div className="local-app-search">
          <MagnifyingGlass aria-hidden="true" /><input aria-label="Search monitored apps" onChange={(event) => setSearch(event.target.value)} placeholder="Search monitored apps" type="search" value={search} />
          {search ? <button aria-label="Clear monitor search" className="local-icon-button" onClick={() => setSearch('')} type="button"><X aria-hidden="true" /></button> : null}
        </div>
        {isLoading ? <div className="local-management-empty"><CircleNotch className="spin" /><span>Loading app monitors</span></div>
          : !watches.length ? <div className="local-management-empty"><strong>No app monitors</strong><span>Add an app ID above to capture its next launch.</span></div>
          : !filtered.length ? <div className="local-management-empty" role="status"><strong>No matching monitors</strong><span>Try a different app name or package identifier.</span></div>
          : <div className="local-app-monitor-list">{filtered.map(({ watch, state, message: watchMessage, devices }) => (
            <article className="local-app-monitor" key={watch.id}>
              <header><div><strong>{apps.find((app) => app.appId === watch.appId)?.name ?? watch.appId}</strong><code>{watch.appId}</code></div><span className={state === 'capturing' ? 'local-live-badge' : ''}>{watch.enabled ? formatWatchState(state) : 'Disabled'}</span></header>
              <p>{watch.platform === 'ios' ? 'iOS' : watch.platform === 'android' ? 'Android emulators' : 'iOS and Android virtual devices'} · {watch.deviceId ? `Device: ${watch.deviceId}` : 'All matching virtual devices, discovered automatically'}</p>
              {watchMessage ? <p className="inline-message">{watchMessage}</p> : null}
              {watch.captureFiles.length ? <p>Save on exit: <code>{watch.captureFiles.join(', ')}</code></p> : null}
              <MonitorScreenshotInterval
                key={`${watch.id}:${watch.screenshotIntervalMilliseconds ?? 2000}`}
                intervalMilliseconds={watch.screenshotIntervalMilliseconds ?? 2000}
                pending={!!pending}
                onSave={(interval) => changeMonitor(watch.id, `api/app-watches/${encodeURIComponent(watch.id)}/configure`, { screenshotIntervalMilliseconds: interval })}
              />
              {devices.length ? <ul>{devices.map((device) => <li key={`${device.platform}:${device.deviceId}`}>
                <strong>{device.deviceName}</strong><span>{formatWatchState(device.state)}</span>
                {device.sessionId || device.lastSessionId ? <code>{device.sessionId ? 'Capturing: ' : 'Last capture: '}{device.sessionId ?? device.lastSessionId}</code> : null}
                {device.message ? <span>{device.message}</span> : null}
              </li>)}</ul> : null}
              <div className="local-app-management-actions">
                <button className="button button--secondary" disabled={!!pending} onClick={() => { void changeMonitor(watch.id, `api/app-watches/${encodeURIComponent(watch.id)}/${watch.enabled ? 'disable' : 'enable'}`) }} type="button">{watch.enabled ? 'Disable' : 'Enable'}</button>
                <button className="button button--danger" disabled={!!pending} onClick={() => { void changeMonitor(watch.id, `api/app-watches/${encodeURIComponent(watch.id)}/remove`) }} type="button">Remove monitor</button>
              </div>
              <small>Disabling or removing a monitor ends its active captures and keeps saved sessions.</small>
            </article>
          ))}</div>}
      </section>
    </div>
  )
}

function MonitorScreenshotInterval({ intervalMilliseconds, pending, onSave }: {
  intervalMilliseconds: number
  pending: boolean
  onSave: (intervalMilliseconds: number) => Promise<boolean>
}) {
  const [seconds, setSeconds] = useState(String(intervalMilliseconds / 1000))
  const interval = Math.round(Number(seconds) * 1000)
  const valid = seconds.trim() !== '' && Number.isFinite(interval) && interval >= 100 && interval <= 60000
  return (
    <form className="local-app-management-form" onSubmit={(event) => {
      event.preventDefault()
      if (valid && !pending) void onSave(interval)
    }}>
      <label className="local-control-field">Screenshot interval (seconds)
        <input disabled={pending} max="60" min="0.1" onChange={(event) => setSeconds(event.target.value)} required step="0.001" type="number" value={seconds} />
      </label>
      <button className="button button--secondary" disabled={pending || !valid || interval === intervalMilliseconds} type="submit">Save interval</button>
      <small className="local-app-management-form--wide">Applies to this monitor and its active recordings. Device speed may limit capture frequency.</small>
    </form>
  )
}

function formatWatchState(state: string): string {
  const labels: Record<string, string> = {
    capturing: 'Capturing', 'capturing-probe-error': 'Capturing · check device', 'waiting-for-app': 'Waiting for app',
    'waiting-for-device': 'Waiting for device', 'waiting-for-device-owner': 'Device busy', 'host-stopped': 'Host stopped',
    disabled: 'Disabled', stopping: 'Finishing capture', error: 'Needs attention',
  }
  return labels[state] ?? state
}
