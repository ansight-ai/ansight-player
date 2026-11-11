import { AndroidLogo, AppleLogo, AppWindow, ArrowClockwise, CircleNotch, DeviceMobile, DownloadSimple, MagnifyingGlass, Play, Power, Stop, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { LocalDevice, LocalDeviceInventory, LocalInstalledApplication, LocalOperationResult } from './types'
import './DeviceManagementPanel.css'

export function DeviceManagementPanel({ onClose }: { onClose: () => void }) {
  const [inventory, setInventory] = useState<LocalDeviceInventory | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [applications, setApplications] = useState<LocalInstalledApplication[]>([])
  const [applicationPath, setApplicationPath] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingOperation, setPendingOperation] = useState<string | null>(null)
  const [deviceQuery, setDeviceQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [formFactorFilter, setFormFactorFilter] = useState('')
  const [applicationQuery, setApplicationQuery] = useState('')

  const visibleDevices = useMemo(() => {
    const terms = searchTerms(deviceQuery)

    return inventory?.devices.filter((device) => {
      const matchesPlatform = !platformFilter || device.platform.toLowerCase() === platformFilter
      const matchesState = !stateFilter || device.isBooted === (stateFilter === 'running')
      const matchesType = !typeFilter || (typeFilter === 'physical' ? device.isPhysical : device.isVirtual)
      const matchesFormFactor = !formFactorFilter || deviceFormFactor(device) === formFactorFilter
      const matchesQuery = matchesSearch(terms, [device.name, device.identifier, device.platform, device.runtime, device.kind, device.state, device.formFactor, deviceFormFactorLabel(device)])
      const matchesFilters = matchesPlatform
        && matchesState
        && matchesType
        && matchesFormFactor
        && matchesQuery

      return matchesFilters
    }) ?? []
  }, [inventory, deviceQuery, platformFilter, stateFilter, typeFilter, formFactorFilter])

  const visibleApplications = useMemo(() => {
    const terms = searchTerms(applicationQuery)

    return applications.filter((application) => matchesSearch(terms, [application.name, application.identifier, application.version]))
  }, [applications, applicationQuery])

  const hasDeviceFilters = Boolean(deviceQuery.trim()
    || platformFilter
    || stateFilter
    || typeFilter
    || formFactorFilter)

  const selectedDevice = useMemo(
    () => inventory?.devices.find((device) => device.identifier === selectedDeviceId) ?? null,
    [inventory?.devices, selectedDeviceId],
  )
  const isSelectedDeviceHidden = selectedDevice !== null && !visibleDevices.includes(selectedDevice)
  const cannotInstall = !selectedDevice?.isBooted
    || !applicationPath.trim()
    || !!pendingOperation
  const cannotShutdown = !selectedDevice?.isBooted
    || selectedDevice.isPhysical
    || !!pendingOperation

  function clearDeviceFilters() {
    setDeviceQuery('')
    setPlatformFilter('')
    setStateFilter('')
    setTypeFilter('')
    setFormFactorFilter('')
  }

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
      <section aria-label="Devices and applications" className="local-admin-panel local-admin-panel--wide local-device-panel">
        <header className="local-admin-header">
          <div><p className="eyebrow">Devices &amp; applications</p><span>Find and manage local devices and applications</span></div>
          <div>
            <button aria-label="Refresh devices" className="local-icon-button" disabled={isLoading} onClick={() => void loadDevices()} type="button"><ArrowClockwise className={isLoading ? 'spin' : undefined} /></button>
            <button aria-label="Close device management" className="local-icon-button" onClick={onClose} type="button"><X /></button>
          </div>
        </header>
        {message ? <p className="inline-message local-admin-message">{message}</p> : null}
        <div className="local-device-layout">
          <aside aria-label="Devices" className="local-device-sidebar">
            <div className="local-device-controls">
              <div className="local-app-search">
                <MagnifyingGlass aria-hidden="true" />
                <input aria-label="Search devices" onChange={(event) => setDeviceQuery(event.target.value)} placeholder="Search devices" type="search" value={deviceQuery} />
                {deviceQuery ? <button aria-label="Clear device search" className="local-icon-button" onClick={() => setDeviceQuery('')} type="button"><X aria-hidden="true" /></button> : null}
              </div>
              <div aria-label="Filter by platform" className="local-device-platform-filters" role="group">
                <button aria-pressed={!platformFilter} onClick={() => setPlatformFilter('')} type="button">All platforms</button>
                <button aria-pressed={platformFilter === 'ios'} onClick={() => setPlatformFilter('ios')} type="button"><AppleLogo aria-hidden="true" weight="fill" />iOS</button>
                <button aria-pressed={platformFilter === 'android'} onClick={() => setPlatformFilter('android')} type="button"><AndroidLogo aria-hidden="true" weight="fill" />Android</button>
              </div>
              <div className="local-device-filter-fields">
                <label>Status
                  <select onChange={(event) => setStateFilter(event.target.value)} value={stateFilter}>
                    <option value="">All states</option>
                    <option value="running">Running</option>
                    <option value="stopped">Not running</option>
                  </select>
                </label>
                <label>Type
                  <select onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
                    <option value="">All types</option>
                    <option value="virtual">Virtual</option>
                    <option value="physical">Physical</option>
                  </select>
                </label>
                <label className="local-device-form-factor-filter">Form factor
                  <select onChange={(event) => setFormFactorFilter(event.target.value)} value={formFactorFilter}>
                    <option value="">All form factors</option>
                    <option value="phone">Phones</option>
                    <option value="tablet">Tablets</option>
                    <option value="other">Other / unknown</option>
                  </select>
                </label>
              </div>
              <div className="local-device-filter-summary">
                <span aria-live="polite">{inventory ? `${visibleDevices.length} of ${inventory.devices.length} devices` : 'Devices'}</span>
                {hasDeviceFilters ? <button className="local-text-button" onClick={clearDeviceFilters} type="button">Clear filters</button> : null}
              </div>
            </div>
            <div className="local-admin-list local-device-list">
              {isLoading && !inventory ? <div className="local-admin-empty"><CircleNotch className="spin" /><span>Discovering devices</span></div> : null}
              {visibleDevices.map((device) => (
                <button aria-pressed={device.identifier === selectedDeviceId} className={device.identifier === selectedDeviceId ? 'local-admin-list-card local-admin-list-card--active' : 'local-admin-list-card'} key={`${device.platform}:${device.identifier}`} onClick={() => setSelectedDeviceId(device.identifier)} type="button">
                  <DevicePlatformIcon platform={device.platform} />
                  <span><strong>{device.name}</strong><small>{platformLabel(device.platform)} · {deviceKindLabel(device)} · {deviceFormFactorLabel(device)}</small></span>
                  <i aria-label={device.isBooted ? 'Running' : 'Not running'} className={device.isBooted ? 'local-status-dot local-status-dot--success' : 'local-status-dot'} role="img" title={device.state} />
                </button>
              ))}
              {inventory && visibleDevices.length === 0 ? <div className="local-admin-empty">
                <MagnifyingGlass aria-hidden="true" />
                <strong>{inventory.devices.length ? 'No matching devices' : 'No devices found'}</strong>
                <span>{inventory.devices.length ? 'Try another search or clear the filters.' : 'Refresh to discover available devices.'}</span>
              </div> : null}
              {inventory?.warnings.map((warning) => <p className="local-admin-warning" key={warning}>{warning}</p>)}
            </div>
          </aside>
          <main className="local-admin-content">
            {selectedDevice ? <>
              {isSelectedDeviceHidden ? <div className="local-device-selection-notice" role="status">
                <span>The selected device is hidden by your filters.</span>
                <button className="local-text-button" onClick={clearDeviceFilters} type="button">Show selected device</button>
              </div> : null}
              <section className="local-admin-section">
                <div className="local-admin-section-heading"><div><DevicePlatformIcon platform={selectedDevice.platform} /><span><strong>{selectedDevice.name}</strong><small>{platformLabel(selectedDevice.platform)} · {deviceKindLabel(selectedDevice)} · {deviceFormFactorLabel(selectedDevice)}</small><small>{selectedDevice.identifier}</small></span></div><span>{selectedDevice.isBooted ? 'Running' : selectedDevice.state}</span></div>
                <div className="local-admin-actions">
                  <button className="button button--primary" disabled={selectedDevice.isBooted || !!pendingOperation} onClick={() => void runDeviceOperation('start')} type="button"><Power />Start</button>
                  <button className="button button--secondary" disabled={cannotShutdown} onClick={() => void runDeviceOperation('shutdown')} type="button"><Stop />Shutdown</button>
                </div>
              </section>
              <section className="local-admin-section">
                <div className="local-admin-section-heading"><div><DownloadSimple /><span><strong>Install application</strong><small>Use a host-local .apk, .ipa or .app path</small></span></div></div>
                <form className="local-admin-inline-form" onSubmit={installApplication}>
                  <input aria-label="Application path" onChange={(event) => setApplicationPath(event.target.value)} placeholder="/path/to/application" value={applicationPath} />
                  <button className="button button--primary" disabled={cannotInstall} type="submit">Install</button>
                </form>
              </section>
              <section className="local-admin-section local-admin-section--grow">
                <div className="local-admin-section-heading"><div><AppWindow /><span><strong>Installed applications</strong><small aria-live="polite">{applicationQuery.trim() ? `${visibleApplications.length} of ${applications.length}` : applications.length} user application{applications.length === 1 ? '' : 's'}</small></span></div><button className="local-text-button" onClick={() => void loadApplications(selectedDevice)} type="button">Refresh</button></div>
                <div className="local-app-search local-device-application-search">
                  <MagnifyingGlass aria-hidden="true" />
                  <input aria-label="Search installed applications" onChange={(event) => setApplicationQuery(event.target.value)} placeholder="Search by app name or identifier" type="search" value={applicationQuery} />
                  {applicationQuery ? <button aria-label="Clear application search" className="local-icon-button" onClick={() => setApplicationQuery('')} type="button"><X aria-hidden="true" /></button> : null}
                </div>
                <div className="local-admin-table-list">
                  {visibleApplications.map((application) => <article key={application.identifier}>
                    <span><strong>{application.name}</strong><small>{application.identifier}{application.version ? ` · ${application.version}` : ''}</small></span>
                    <div>
                      <button aria-label={`Launch ${application.name}`} disabled={!selectedDevice.isBooted || !!pendingOperation} onClick={() => void runDeviceOperation('launch', application.identifier)} type="button"><Play />Launch</button>
                      <button aria-label={`Terminate ${application.name}`} disabled={!selectedDevice.isBooted || !!pendingOperation} onClick={() => void runDeviceOperation('terminate', application.identifier)} type="button"><Stop />Stop</button>
                    </div>
                  </article>)}
                  {visibleApplications.length === 0 ? <div className="local-admin-empty"><AppWindow /><span>{applications.length ? 'No applications match your search.' : 'No installed user applications found.'}</span></div> : null}
                </div>
              </section>
            </> : <div className="local-admin-empty"><DeviceMobile /><strong>No device selected</strong></div>}
          </main>
        </div>
      </section>
    </div>
  )
}

function DevicePlatformIcon({ platform }: { platform: string }) {
  const Icon = platform.toLowerCase() === 'android' ? AndroidLogo : platform.toLowerCase() === 'ios' ? AppleLogo : DeviceMobile

  return <Icon aria-hidden="true" className={`local-device-platform-icon local-device-platform-icon--${platform.toLowerCase()}`} weight="fill" />
}

function platformLabel(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'ios':
      return 'iOS'
    case 'android':
      return 'Android'
    default:
      return platform
  }
}

function deviceKindLabel(device: LocalDevice): string {
  if (device.isPhysical) {
    return 'Physical device'
  }

  switch (device.kind) {
    case 'avd':
    case 'emulator':
      return 'Emulator'
    case 'simulator':
      return 'Simulator'
    default:
      return device.kind
  }
}

function deviceFormFactor(device: LocalDevice): 'phone' | 'tablet' | 'other' {
  const formFactor = device.formFactor?.trim().toLowerCase()

  if (formFactor === 'phone' || formFactor === 'tablet') {
    return formFactor
  }

  return 'other'
}

function deviceFormFactorLabel(device: LocalDevice): string {
  switch (deviceFormFactor(device)) {
    case 'phone':
      return 'Phone'
    case 'tablet':
      return 'Tablet'
    default:
      return 'Other / unknown'
  }
}

function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function matchesSearch(terms: string[], values: (string | null | undefined)[]): boolean {
  const text = values.filter(Boolean).join(' ').toLowerCase()

  return terms.every((term) => text.includes(term))
}

async function readError(response: Response): Promise<string> {
  try { return ((await response.json()) as { message?: string }).message || `The local host returned HTTP ${response.status}.` } catch { return `The local host returned HTTP ${response.status}.` }
}

function resolveError(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback }
