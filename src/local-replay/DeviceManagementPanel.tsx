import { AppWindow, ArrowClockwise, CircleNotch, DeviceMobile, DownloadSimple, Play, Power, Stop, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { LocalDevice, LocalDeviceInventory, LocalInstalledApplication, LocalOperationResult } from './types'

export function DeviceManagementPanel({ onClose }: { onClose: () => void }) {
  const [inventory, setInventory] = useState<LocalDeviceInventory | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [applications, setApplications] = useState<LocalInstalledApplication[]>([])
  const [applicationPath, setApplicationPath] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingOperation, setPendingOperation] = useState<string | null>(null)

  const selectedDevice = useMemo(
    () => inventory?.devices.find((device) => device.identifier === selectedDeviceId) ?? null,
    [inventory?.devices, selectedDeviceId],
  )

  const loadDevices = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('api/devices', { cache: 'no-store' })
      if (!response.ok) throw new Error(await readError(response))
      const next = await response.json() as LocalDeviceInventory
      setInventory(next)
      setSelectedDeviceId((current) => current && next.devices.some((device) => device.identifier === current)
        ? current
        : next.devices.find((device) => device.isBooted)?.identifier ?? next.devices[0]?.identifier ?? null)
      setMessage(null)
    } catch (error) {
      setMessage(resolveError(error, 'Unable to discover devices.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadApplications = useCallback(async (device: LocalDevice | null) => {
    if (!device) {
      setApplications([])
      return
    }
    try {
      const response = await fetch(
        `api/devices/${encodeURIComponent(device.platform)}/${encodeURIComponent(device.identifier)}/apps`,
        { cache: 'no-store' },
      )
      if (!response.ok) throw new Error(await readError(response))
      setApplications(await response.json() as LocalInstalledApplication[])
    } catch (error) {
      setApplications([])
      setMessage(resolveError(error, 'Unable to list installed applications.'))
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadDevices(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadDevices])
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadApplications(selectedDevice), 0)
    return () => window.clearTimeout(timeout)
  }, [loadApplications, selectedDevice])

  async function runDeviceOperation(operation: 'start' | 'shutdown' | 'install' | 'launch' | 'terminate', applicationIdentifier?: string) {
    if (!selectedDevice || pendingOperation) return
    setPendingOperation(`${operation}:${applicationIdentifier ?? ''}`)
    setMessage(null)
    try {
      const response = await fetch(`api/devices/${operation}`, {
        body: JSON.stringify({
          platform: selectedDevice.platform,
          deviceIdentifier: selectedDevice.identifier,
          applicationIdentifier: applicationIdentifier ?? null,
          applicationPath: operation === 'install' ? applicationPath.trim() : null,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalOperationResult
      if (!response.ok || !result.isSuccess) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      setMessage(result.message)
      await loadDevices()
      await loadApplications(selectedDevice)
      if (operation === 'install') setApplicationPath('')
    } catch (error) {
      setMessage(resolveError(error, `Unable to ${operation} the selected target.`))
    } finally {
      setPendingOperation(null)
    }
  }

  function installApplication(event: FormEvent) {
    event.preventDefault()
    if (applicationPath.trim()) void runDeviceOperation('install')
  }

  return (
    <div className="local-admin-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !pendingOperation) onClose()
    }}>
      <section aria-label="Devices and applications" className="local-admin-panel local-admin-panel--wide">
        <header className="local-admin-header">
          <div><p className="eyebrow">Devices &amp; applications</p><span>Prepare and control local simulator targets</span></div>
          <div>
            <button aria-label="Refresh devices" className="local-icon-button" disabled={isLoading} onClick={() => void loadDevices()} type="button"><ArrowClockwise className={isLoading ? 'spin' : undefined} /></button>
            <button aria-label="Close device management" className="local-icon-button" onClick={onClose} type="button"><X /></button>
          </div>
        </header>
        {message ? <p className="inline-message local-admin-message">{message}</p> : null}
        <div className="local-device-layout">
          <aside className="local-admin-list">
            {isLoading && !inventory ? <div className="local-admin-empty"><CircleNotch className="spin" /><span>Discovering devices</span></div> : null}
            {inventory?.devices.map((device) => (
              <button className={device.identifier === selectedDeviceId ? 'local-admin-list-card local-admin-list-card--active' : 'local-admin-list-card'} key={`${device.platform}:${device.identifier}`} onClick={() => setSelectedDeviceId(device.identifier)} type="button">
                <DeviceMobile />
                <span><strong>{device.name}</strong><small>{device.platform} · {device.kind}</small></span>
                <i className={device.isBooted ? 'local-status-dot local-status-dot--success' : 'local-status-dot'} title={device.state} />
              </button>
            ))}
            {inventory?.warnings.map((warning) => <p className="local-admin-warning" key={warning}>{warning}</p>)}
          </aside>
          <main className="local-admin-content">
            {selectedDevice ? <>
              <section className="local-admin-section">
                <div className="local-admin-section-heading"><div><DeviceMobile /><span><strong>{selectedDevice.name}</strong><small>{selectedDevice.identifier}</small></span></div><span>{selectedDevice.state}</span></div>
                <div className="local-admin-actions">
                  <button className="button button--primary" disabled={selectedDevice.isBooted || !!pendingOperation} onClick={() => void runDeviceOperation('start')} type="button"><Power />Start</button>
                  <button className="button button--secondary" disabled={!selectedDevice.isBooted || selectedDevice.isPhysical || !!pendingOperation} onClick={() => void runDeviceOperation('shutdown')} type="button"><Stop />Shutdown</button>
                </div>
              </section>
              <section className="local-admin-section">
                <div className="local-admin-section-heading"><div><DownloadSimple /><span><strong>Install application</strong><small>Use a host-local .apk, .ipa or .app path</small></span></div></div>
                <form className="local-admin-inline-form" onSubmit={installApplication}>
                  <input aria-label="Application path" onChange={(event) => setApplicationPath(event.target.value)} placeholder="/path/to/application" value={applicationPath} />
                  <button className="button button--primary" disabled={!selectedDevice.isBooted || !applicationPath.trim() || !!pendingOperation} type="submit">Install</button>
                </form>
              </section>
              <section className="local-admin-section local-admin-section--grow">
                <div className="local-admin-section-heading"><div><AppWindow /><span><strong>Installed applications</strong><small>{applications.length} user application{applications.length === 1 ? '' : 's'}</small></span></div><button className="local-text-button" onClick={() => void loadApplications(selectedDevice)} type="button">Refresh</button></div>
                <div className="local-admin-table-list">
                  {applications.map((application) => <article key={application.identifier}>
                    <span><strong>{application.name}</strong><small>{application.identifier}{application.version ? ` · ${application.version}` : ''}</small></span>
                    <div>
                      <button aria-label={`Launch ${application.name}`} disabled={!selectedDevice.isBooted || !!pendingOperation} onClick={() => void runDeviceOperation('launch', application.identifier)} type="button"><Play />Launch</button>
                      <button aria-label={`Terminate ${application.name}`} disabled={!selectedDevice.isBooted || !!pendingOperation} onClick={() => void runDeviceOperation('terminate', application.identifier)} type="button"><Stop />Stop</button>
                    </div>
                  </article>)}
                  {applications.length === 0 ? <div className="local-admin-empty"><AppWindow /><span>No installed user applications found.</span></div> : null}
                </div>
              </section>
            </> : <div className="local-admin-empty"><DeviceMobile /><strong>No device selected</strong></div>}
          </main>
        </div>
      </section>
    </div>
  )
}

async function readError(response: Response): Promise<string> {
  try { return ((await response.json()) as { message?: string }).message || `The local host returned HTTP ${response.status}.` } catch { return `The local host returned HTTP ${response.status}.` }
}

function resolveError(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback }
