import { CircleNotch, WifiHigh, X } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { networkPorts, networkPresets, networkProfilePreset, networkRateFromSlider, networkRateSliderPosition, networkRequest, type NetworkCapabilities, type NetworkLease, type NetworkProfile } from './networkConditioning'

export function DeviceNetworkPanel({ sessionId, appName, isOpen, onClose, onOpen }: { sessionId: string; appName: string; isOpen: boolean; onClose: (keepActive: boolean) => void; onOpen: () => void }) {
  const [capabilities, setCapabilities] = useState<NetworkCapabilities | null>(null)
  const [lease, setLease] = useState<NetworkLease | null>(null)
  const [preset, setPreset] = useState('slow')
  const [profile, setProfile] = useState<NetworkProfile>({ ...networkPresets[1].profile })
  const [advanced, setAdvanced] = useState(false)
  const advancedId = useId()
  const [duration, setDuration] = useState(120)
  const [ports, setPorts] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const [retry, setRetry] = useState(0)
  const [restoring, setRestoring] = useState(true)
  const [statusUnknown, setStatusUnknown] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const retainedLeaseId = useRef<string | null>(null)
  const storageKey = `ansight.network:${sessionId}`
  const leaseId = lease?.leaseId

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!restoring && isOpen) closeRef.current?.focus()
  }, [restoring, isOpen])

  useEffect(() => {
    let active = true
    void networkRequest<NetworkCapabilities>('capabilities', { sessionId }).then(value => {
      if (active) setCapabilities(value)
    }).catch(cause => {
      if (active) setCapabilities({ available: false, reason: cause instanceof Error ? cause.message : String(cause), scope: '', limitations: [] })
    })
    // Recover controls after a refresh. The host owns the hard expiry even if this browser closes.
    let leaseId: string | null = null
    try { leaseId = window.sessionStorage.getItem(storageKey) } catch { /* Storage is optional. */ }
    retainedLeaseId.current = leaseId
    if (leaseId) void networkRequest<NetworkLease>('get', { leaseId }).then(value => {
      if (!active) return
      setLease(value)
      setStatusUnknown(false)
      if (value.profile) {
        const restoredPreset = networkProfilePreset(value.profile)
        setProfile(value.profile); setPreset(restoredPreset)
        setAdvanced(restoredPreset === 'custom')
      }
    }).catch(cause => {
      if (!active) return
      if (cause instanceof Error && cause.message.includes('absent or expired')) {
        retainedLeaseId.current = null
        try { window.sessionStorage.removeItem(storageKey) } catch { /* Optional. */ }
        setStatusUnknown(false)
      } else setStatusUnknown(true)
    })
      .finally(() => { if (active) setRestoring(false) })
    else void Promise.resolve().then(() => { if (active) setRestoring(false) })
    return () => { active = false }
  }, [sessionId, storageKey, retry])

  useEffect(() => {
    if (!leaseId) return
    let active = true
    let polling = false
    const timer = window.setInterval(async () => {
      setNow(Date.now())
      if (polling) return
      polling = true
      try {
        const value = await networkRequest<NetworkLease>('get', { leaseId })
        if (active) { setLease(value); setStatusUnknown(false) }
      } catch (cause) {
        if (!active) return
        const text = cause instanceof Error ? cause.message : String(cause)
        if (text.includes('absent or expired')) {
          setLease(null)
          setStatusUnknown(false)
          retainedLeaseId.current = null
          setMessage('Conditioning ended. Normal networking is restored.')
          try { window.sessionStorage.removeItem(storageKey) } catch { /* Optional. */ }
          if (!isOpen) onClose(false)
        } else { setStatusUnknown(true); setError(`Unable to refresh conditioning status: ${text}`) }
      } finally { polling = false }
    }, 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [leaseId, storageKey, isOpen, onClose])

  useEffect(() => {
    if (!isOpen && !restoring && !lease && !statusUnknown) onClose(false)
  }, [isOpen, restoring, lease, statusUnknown, onClose])

  function changeNumber(key: 'downloadKbps' | 'uploadKbps' | 'latencyMs' | 'jitterMs', value: number) {
    setPreset('custom')
    setProfile(current => ({ ...current, [key]: value }))
  }

  async function apply(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(null); setMessage(null)
    try {
      const validRates = [profile.downloadKbps, profile.uploadKbps].every(value => Number.isInteger(value) && value >= 0 && value <= 1_000_000)
      const validDelays = [profile.latencyMs, profile.jitterMs].every(value => Number.isInteger(value) && value >= 0 && value <= 10_000)
      if (!validRates || !validDelays || !Number.isInteger(duration) || duration < 1 || duration > 300) {
        setAdvanced(true)
        throw new Error('Enter valid rates (0–1,000,000 kbps), delays (0–10,000 ms), and an auto-reset time (1–300 seconds).')
      }
      const next = await networkRequest<NetworkLease>('set', {
        sessionId, profile, ...(lease ? { leaseId: lease.leaseId } : { durationMs: duration * 1000, destinationPorts: networkPorts(ports) }),
      })
      setLease(next); setNow(Date.now())
      setStatusUnknown(false)
      retainedLeaseId.current = next.leaseId
      try { window.sessionStorage.setItem(storageKey, next.leaseId) } catch { /* Expiry still applies. */ }
      setMessage(lease ? 'Conditions updated. The original expiry is unchanged.' : 'Conditions applied. Use the app to verify traffic below.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  async function reset() {
    if (busy || restoring) return
    setBusy(true); setError(null)
    try {
      const resetId = lease?.leaseId ?? retainedLeaseId.current
      if (resetId) await networkRequest('reset', { leaseId: resetId })
      setLease(null)
      setStatusUnknown(false)
      retainedLeaseId.current = null
      try { window.sessionStorage.removeItem(storageKey) } catch { /* Optional. */ }
      setMessage('Normal networking restored.')
      if (!isOpen) onClose(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  const remaining = lease ? Math.max(0, Math.ceil((Date.parse(lease.expiresAtUtc) - now) / 1000)) : 0
  const counters = lease?.counters
  const appliedPreset = lease?.profile ? networkProfilePreset(lease.profile) : 'custom'
  const appliedLabel = networkPresets.find(value => value.id === appliedPreset)?.label ?? 'Custom'
  const hasPendingChanges = lease?.profile && (Object.keys(profile) as (keyof NetworkProfile)[]).some(key => profile[key] !== lease.profile![key])
  const status = restoring ? 'Checking status…' : statusUnknown ? 'Status unavailable' : lease ? remaining > 0 ? `Active: ${appliedLabel}` : 'Resetting…' : 'Not applied'
  if (!isOpen) return <aside className="local-network-active-control" aria-label="Active network conditions">
    <button type="button" onClick={onOpen} aria-label="Open active network conditions"><WifiHigh aria-hidden="true" /><span>{appName} · {status}{lease && remaining > 0 ? ` · ${remaining}s` : ''}</span></button>
    <button type="button" disabled={busy || restoring} onClick={() => void reset()}>Reset</button>
    {error ? <span role="alert">{error}</span> : null}
  </aside>

  function close() {
    if (!busy && !restoring) onClose(Boolean(lease || retainedLeaseId.current))
  }

  return <div className="local-location-backdrop" role="presentation">
    <section aria-label="Network controls" className="local-location-panel local-network-panel" role="dialog" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
    }}>
      <header><div><h2>Network</h2><p className="local-network-subtitle">{appName}{capabilities?.scope === 'emulator' ? ' · Entire emulator' : ''}<span role="status"> · {status}</span></p></div>
        <div className="local-network-header-actions">
          <button type="button" className="button button--secondary button--compact" aria-expanded={advanced} aria-controls={advancedId} onClick={() => setAdvanced(value => !value)}>Advanced</button>
          <button ref={closeRef} aria-label="Close network controls" className="local-icon-button" disabled={busy || restoring} onClick={close} type="button"><X aria-hidden="true" /></button>
        </div>
      </header>
      {!capabilities ? <p role="status">Checking network controls…</p> : !capabilities.available ? <div role="status"><p>{capabilities.reason || 'Network conditioning is unavailable on this host.'}</p><button className="button button--secondary button--compact" type="button" onClick={() => { setError(null); setRetry(value => value + 1) }}>Check again</button></div> : null}
      <form className="local-location-section" onSubmit={event => void apply(event)}>
        <fieldset className="local-network-profiles" disabled={busy || restoring}>
          <legend className="visually-hidden">Connection profile</legend>
          {[...networkPresets, { id: 'custom', label: 'Custom', description: 'Choose your own limits' }].map(value => <label key={value.id} className={`local-network-profile${preset === value.id ? ' local-network-profile--selected' : ''}`}>
            <input type="radio" name={`network-profile-${advancedId}`} value={value.id} checked={preset === value.id} onChange={() => {
              setPreset(value.id)
              if ('profile' in value) setProfile({ ...value.profile })
              else setAdvanced(true)
            }} />
            <span><strong>{value.label}</strong><small>{value.description}</small></span>
          </label>)}
        </fieldset>
        {advanced ? <div id={advancedId} className="local-network-advanced">
          <div className="local-network-sliders">
            {([
              ['downloadKbps', 'Download', 'kbps', 1_000_000], ['uploadKbps', 'Upload', 'kbps', 1_000_000],
              ['latencyMs', 'Initial delay', 'ms', 10_000], ['jitterMs', 'Delay variation', 'ms', 10_000],
            ] as const).map(([key, label, unit, max]) => {
              const isRate = unit === 'kbps'
              const value = profile[key]
              const disabled = busy || profile.blocked || profile.stall
              const valueLabel = isRate && value === 0 ? 'Unlimited' : `${Number.isFinite(value) ? value : '—'} ${unit}`
              return <div className="local-network-slider" key={key}>
                <div className="local-network-slider-heading"><label htmlFor={`${advancedId}-${key}-slider`}>{label}</label><span className="local-network-exact"><input aria-label={`${label} (${unit})`} type="number" min="0" max={max} step="1" required disabled={disabled} value={Number.isFinite(value) ? value : ''} onChange={event => changeNumber(key, event.target.valueAsNumber)} /><span>{unit}</span></span></div>
                <input id={`${advancedId}-${key}-slider`} type="range" min="0" max="100" step="0.1" aria-valuetext={valueLabel} disabled={disabled} value={isRate ? networkRateSliderPosition(value) : Number.isFinite(value) ? Math.sqrt(value) : 0} onChange={event => changeNumber(key, isRate ? networkRateFromSlider(event.target.valueAsNumber) : Math.round(event.target.valueAsNumber ** 2))} />
                <div className="local-network-slider-scale"><span>{isRate ? '1 kbps' : '0 ms'}</span><span>{isRate ? 'Unlimited' : '10,000 ms'}</span></div>
              </div>
            })}
          </div>
          <p className="local-network-note">A rate of 0 means unlimited. Delay applies to the first payload in each direction of a connection.</p>
          <label className="local-control-field"><span>Transfer behavior</span><select disabled={busy} value={profile.blocked ? 'blocked' : profile.stall ? 'stall' : 'normal'} onChange={event => {
            setPreset('custom'); setProfile(current => ({ ...current, blocked: event.target.value === 'blocked', stall: event.target.value === 'stall' }))
          }}><option value="normal">Transfer with the limits above</option><option value="blocked">Block TCP connections</option><option value="stall">Stall transfers</option></select></label>
          <div className="local-coordinate-grid">
            <label className="local-control-field"><span>Auto-reset after (seconds)</span><input type="number" min="1" max="300" step="1" required disabled={busy || !!lease} value={Number.isFinite(duration) ? duration : ''} onChange={event => setDuration(event.target.valueAsNumber)} /></label>
            <label className="local-control-field"><span>TCP ports (optional)</span><input placeholder="All ports, or 443, 8765" disabled={busy || !!lease} value={ports} onChange={event => setPorts(event.target.value)} /></label>
          </div>
        </div> : <label className="local-control-field local-network-duration"><span>Auto-reset after</span><select disabled={busy || !!lease} value={duration} onChange={event => setDuration(Number(event.target.value))}>
          {[30, 60, 120, 300].includes(duration) ? null : <option value={duration}>{duration} seconds</option>}
          <option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option>
        </select></label>}
        {!advanced && ports ? <p className="local-network-note">Only TCP ports {ports}. Change ports in Advanced.</p> : null}
        {hasPendingChanges ? <p className="local-network-note" role="status">Changes not applied.</p> : null}
        <div className="local-location-actions">
          <button className="button button--primary button--compact" type="submit" disabled={busy || restoring || !capabilities?.available}>{busy ? <CircleNotch aria-hidden="true" className="spin" /> : <WifiHigh aria-hidden="true" />}{lease ? 'Update' : 'Apply'}</button>
          <button className="button button--secondary button--compact" type="button" disabled={busy || restoring || (!lease && !statusUnknown)} onClick={() => void reset()}>Reset</button>
        </div>
      </form>
      {lease ? <div className="local-playback-status local-playback-status--live" role="status">
        <strong>{remaining > 0 ? `Active · resets in ${remaining}s` : 'Restoring network…'}</strong>
        {counters ? <><span>{counters.connections} connections · {counters.blockedConnections} blocked</span><small>↓ {(counters.downloadBytes / 1024).toFixed(1)} KB · ↑ {(counters.uploadBytes / 1024).toFixed(1)} KB observed by conditioner</small></> : null}
      </div> : null}
      <p className="local-network-note">Stays active when this panel closes. Use Reset or wait for the timer.</p>
      <details className="local-network-details"><summary>How it works</summary><p className="local-network-note">Conditions affect TCP traffic from this iOS Simulator app, or all apps in the selected Android emulator. Wi-Fi signal, OS connectivity, UDP and QUIC are unchanged. Ansight control traffic stays connected. Reset closes conditioned connections. If you close the browser, the automatic reset still applies.</p><p className="local-network-note">For local test servers, use the Mac’s LAN address; loopback traffic bypasses conditioning.</p></details>
      {message ? <p role="status" className="inline-message">{message}</p> : null}
      {error ? <p role="alert" className="inline-message">{error}</p> : null}
    </section>
  </div>
}
