import { CheckCircle, CircleNotch, PlugsConnected, WarningCircle, WifiSlash, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import type { LocalAccountStatus, LocalCloudTeam, LocalCloudTeamQueryResult, LocalCompanionAccess, LocalCompanionAccessMode, LocalCompanionConnection, LocalCompanionOverview, LocalCoreSettings, LocalOperationResult } from './types'

export function CompanionAccessPanel({ onClose, onOpenAccount, onChanged }: {
  onClose: () => void
  onOpenAccount: () => void
  onChanged: () => void
}) {
  const [access, setAccess] = useState<LocalCompanionAccess | null>(null)
  const [connections, setConnections] = useState<LocalCompanionConnection[]>([])
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [account, setAccount] = useState<LocalAccountStatus | null>(null)
  const [machineName, setMachineName] = useState('')
  const [teamId, setTeamId] = useState('')
  const [teams, setTeams] = useState<LocalCloudTeam[]>([])
  const [remember, setRemember] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [savingMode, setSavingMode] = useState<LocalCompanionAccessMode | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const isSaving = savingMode !== null

  useEffect(() => {
    const controller = new AbortController()
    async function read(path: string) {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) {
        throw new Error(`Unable to load companion access (HTTP ${response.status}).`)
      }

      return response.json()
    }
    void Promise.all([read('api/companion'), read('api/settings'), read('api/account')])
      .then(([overview, settings, identity]: [LocalCompanionOverview, LocalCoreSettings, LocalAccountStatus]) => {
        if (controller.signal.aborted) {
          return
        }

        setAccess(overview.access)
        setConnections(overview.connections)
        setMachineName(settings.companionMachineName)
        setTeamId(settings.companionTeamId)
        setRemember(settings.companionAccessMode === 'always')
        setAccount(identity)
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : 'Unable to load companion access.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!account?.isAuthenticated) {
      return
    }

    const controller = new AbortController()
    void fetch('api/cloud/teams', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          return
        }

        const result = await response.json() as LocalCloudTeamQueryResult
        if (!controller.signal.aborted && result.isSuccess) {
          setTeams(result.teams)
        }
      })
      .catch(() => { /* Preserve the saved organisation if its name cannot load. */ })
    return () => controller.abort()
  }, [account?.isAuthenticated])

  useEffect(() => {
    if (isSaving || isLoading || disconnecting !== null) {
      return
    }

    const controller = new AbortController()
    const timer = window.setInterval(() => {
      void fetch('api/companion', { cache: 'no-store', signal: controller.signal })
        .then(async response => {
          if (!response.ok) {
            return
          }

          const overview = await response.json() as LocalCompanionOverview
          if (!controller.signal.aborted) {
            setAccess(overview.access)
            setConnections(overview.connections)
          }
        })
        .catch(() => { /* Keep the last known status while reconnecting. */ })
    }, 3000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [isSaving, isLoading, disconnecting])

  async function disconnect(sessionId?: string) {
    if (disconnecting !== null || isSaving) {
      return
    }

    setDisconnecting(sessionId ?? 'all')
    setMessage(null)
    try {
      const response = await fetch(sessionId ? 'api/companion/connections/disconnect' : 'api/companion/disconnect-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionId ? { sessionId } : {}),
      })
      const result = await response.json() as LocalOperationResult
      if (!response.ok || !result.isSuccess) {
        throw new Error(result.message || 'Unable to disconnect the companion device.')
      }

      const remaining = sessionId ? connections.filter(connection => connection.sessionId !== sessionId) : []
      setConnections(remaining)
      setAccess(current => current ? { ...current, connectionCount: remaining.length } : current)
      onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to disconnect the companion device.')
    } finally {
      setDisconnecting(null)
    }
  }

  async function changeAccess(mode: LocalCompanionAccessMode) {
    if (isSaving) {
      return
    }

    if (mode !== 'disabled' && !machineName.trim()) {
      setMessage('Enter a computer name.')
      return
    }

    setSavingMode(mode)
    setMessage(null)
    try {
      const response = await fetch('api/companion/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, machineName: machineName.trim(), teamId: teamId.trim() }),
      })
      if (response.status === 404) {
        throw new Error('Update and restart the Ansight host to enable companion access here.')
      }

      const result = await response.json() as LocalOperationResult & { access: LocalCompanionAccess }
      if (!response.ok || !result.isSuccess) {
        throw new Error(result.message || 'Unable to change companion access.')
      }

      setAccess(result.access)
      if (!result.access.isEnabled) {
        setConnections([])
      }
      onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to change companion access.')
    } finally {
      setSavingMode(null)
    }
  }

  function toggleAccess() {
    if (access?.isEnabled) {
      void changeAccess('disabled')
    } else if (!account?.isAuthenticated) {
      onOpenAccount()
    } else {
      formRef.current?.requestSubmit()
    }
  }

  const isEnabled = savingMode === null ? access?.isEnabled === true : savingMode !== 'disabled'
  const cannotEnable = !access?.isEnabled && !access?.isAvailable
  const isToggleDisabled = isLoading
    || isSaving
    || disconnecting !== null
    || !access
    || cannotEnable
  const hostStatus = access?.status ?? ''
  const isReady = hostStatus.startsWith('Available ')
  const isReconnecting = hostStatus.includes('Reconnecting')
  const isConnecting = hostStatus.startsWith('Connecting ')
    || hostStatus.includes('Refreshing this computer')
  const isWaiting = access?.isEnabled === true
    && isReady
    && access.connectionCount === 0
  const isBusy = isSaving
    || isConnecting
    || isReconnecting
    || isWaiting
  let connectionStatus = hostStatus

  if (isSaving) {
    connectionStatus = savingMode === 'disabled' ? 'Turning off…' : 'Connecting…'
  } else if (isReconnecting) {
    connectionStatus = 'Reconnecting…'
  } else if (isConnecting) {
    connectionStatus = 'Connecting…'
  } else if (isReady && access) {
    connectionStatus = isWaiting
      ? 'Waiting for connection…'
      : `${access.connectionCount} ${access.connectionCount === 1 ? 'device' : 'devices'} connected`
  }

  return <div className="local-admin-backdrop" role="presentation" onMouseDown={event => {
    if (event.currentTarget === event.target) {
      onClose()
    }
  }}>
    <section aria-label="Companion access" aria-modal="true" role="dialog" className="local-admin-panel local-companion-panel">
      <header className="local-admin-header">
        <p className="eyebrow">Companion access</p>
        <div>
          <label className="local-settings-toggle local-companion-toggle">
            <input aria-label="Companion access" role="switch" type="checkbox" checked={isEnabled} disabled={isToggleDisabled} onChange={toggleAccess} />
            <i aria-hidden="true" />
          </label>
          <button aria-label="Close companion access" className="local-icon-button" onClick={onClose} type="button"><X aria-hidden="true" /></button>
        </div>
      </header>
      <div className="local-admin-content">
        {message ? <p className="inline-message" role="alert">{message}</p> : null}
        {isLoading ? <div className="local-companion-status" role="status"><CircleNotch aria-hidden="true" className="spin" />Loading…</div> : access ? <>
          {access.isEnabled || isSaving ? <>
            <div className="local-companion-status" role="status">
              {isBusy ? <CircleNotch aria-hidden="true" className="spin" /> : isReady
                ? <CheckCircle aria-hidden="true" className="local-companion-connected" />
                : <WarningCircle aria-hidden="true" className="local-companion-warning" />}
              <div><strong>{machineName || 'This computer'}</strong><span>{connectionStatus}</span></div>
            </div>
            {isWaiting && !isSaving ? <p className="local-companion-hint">Open Ansight on your phone and select this computer.</p> : null}
            <section className="local-companion-connections" aria-label="Connected companion devices">
              <div className="local-admin-section-heading">
                <div><PlugsConnected aria-hidden="true" /><strong>Connected devices</strong></div>
                <span>{connections.length}</span>
              </div>
              {connections.length === 0 ? <p className="local-companion-hint">No companion devices are connected.</p> : <ul>
                {connections.map(connection => <li key={connection.sessionId}>
                  <div>
                    <strong>{connection.deviceName || 'Companion device'}</strong>
                    <span>{[connection.platform, connection.model].filter(Boolean).join(' · ') || 'Companion app'}</span>
                    <span>Connected <time dateTime={connection.connectedAtUtc}>{new Date(connection.connectedAtUtc).toLocaleString()}</time></span>
                  </div>
                  <button className="button" type="button" disabled={isSaving || disconnecting !== null}
                    aria-label={`Disconnect ${connection.deviceName || 'companion device'}`} onClick={() => void disconnect(connection.sessionId)}>
                    {disconnecting === connection.sessionId ? <CircleNotch aria-hidden="true" className="spin" /> : <WifiSlash aria-hidden="true" />}
                    Disconnect
                  </button>
                </li>)}
              </ul>}
              {connections.length > 1 ? <button className="button" type="button" disabled={isSaving || disconnecting !== null} onClick={() => void disconnect()}>
                {disconnecting === 'all' ? 'Disconnecting…' : 'Disconnect all'}
              </button> : null}
            </section>
          </> : !access.isAvailable ? <p className="local-companion-hint">{access.status}</p>
          : !account?.isAuthenticated ? <>
            <p className="local-companion-hint">Sign in to connect from the Ansight app on your phone.</p>
            <button className="button local-companion-sign-in" onClick={onOpenAccount} type="button">Sign in</button>
          </> : <form ref={formRef} className="local-companion-form" onSubmit={event => {
            event.preventDefault()
            void changeAccess(remember ? 'always' : 'session')
          }}>
            <p className="local-companion-hint">Connect from the Ansight app on your phone.</p>
            <label className="local-control-field">Computer name
              <input required maxLength={160} value={machineName} onChange={event => setMachineName(event.target.value)} disabled={isSaving} />
            </label>
            <label className="local-control-field">Organisation
              <select value={teamId} onChange={event => setTeamId(event.target.value)} disabled={isSaving}>
                <option value="">Choose automatically</option>
                {teamId && !teams.some(team => team.teamId === teamId) ? <option value={teamId}>Saved organisation</option> : null}
                {teams.map(team => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
              </select>
            </label>
            <label className="local-companion-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={isSaving} />Keep enabled after restarting Ansight</label>
          </form>}
        </> : null}
      </div>
    </section>
  </div>
}
