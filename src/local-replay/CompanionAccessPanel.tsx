import { CircleNotch, PlugsConnected, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { LocalAccountStatus, LocalCloudTeam, LocalCloudTeamQueryResult, LocalCompanionAccess, LocalCompanionAccessMode, LocalCompanionOverview, LocalCoreSettings, LocalOperationResult } from './types'

export function CompanionAccessPanel({ onClose, onOpenAccount, onChanged }: {
  onClose: () => void
  onOpenAccount: () => void
  onChanged: () => void
}) {
  const [access, setAccess] = useState<LocalCompanionAccess | null>(null)
  const [account, setAccount] = useState<LocalAccountStatus | null>(null)
  const [machineName, setMachineName] = useState('')
  const [teamId, setTeamId] = useState('')
  const [teams, setTeams] = useState<LocalCloudTeam[]>([])
  const [remember, setRemember] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function read(path: string) {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`Unable to load companion access (HTTP ${response.status}).`)
      return response.json()
    }
    void Promise.all([read('api/companion'), read('api/settings'), read('api/account')])
      .then(([overview, settings, identity]: [LocalCompanionOverview, LocalCoreSettings, LocalAccountStatus]) => {
        if (controller.signal.aborted) return
        setAccess(overview.access)
        setMachineName(settings.companionMachineName)
        setTeamId(settings.companionTeamId)
        setRemember(settings.companionAccessMode === 'always')
        setAccount(identity)
      })
      .catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Unable to load companion access.') })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!account?.isAuthenticated) return
    const controller = new AbortController()
    void fetch('api/cloud/teams', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return
        const result = await response.json() as LocalCloudTeamQueryResult
        if (!controller.signal.aborted && result.isSuccess) setTeams(result.teams)
      })
      .catch(() => { /* Preserve the saved organisation if its name cannot load. */ })
    return () => controller.abort()
  }, [account?.isAuthenticated])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setInterval(() => {
      if (isSaving) return
      void fetch('api/companion', { cache: 'no-store', signal: controller.signal })
        .then(async response => {
          if (!response.ok) return
          const overview = await response.json() as LocalCompanionOverview
          if (!controller.signal.aborted) setAccess(overview.access)
        })
        .catch(() => { /* Keep the last known status while reconnecting. */ })
    }, 3000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [isSaving])

  async function changeAccess(mode: LocalCompanionAccessMode) {
    setIsSaving(true)
    setMessage(null)
    try {
      const response = await fetch('api/companion/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, machineName: machineName.trim(), teamId: teamId.trim() }),
      })
      if (response.status === 404) throw new Error('Update and restart the Ansight host to enable companion access here.')
      const result = await response.json() as LocalOperationResult & { access: LocalCompanionAccess }
      if (!response.ok || !result.isSuccess) throw new Error(result.message || 'Unable to change companion access.')
      setAccess(result.access)
      onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to change companion access.')
    } finally {
      setIsSaving(false)
    }
  }

  return <div className="local-admin-backdrop" role="presentation" onMouseDown={event => {
    if (event.currentTarget === event.target) onClose()
  }}>
    <section aria-label="Companion access" className="local-admin-panel local-companion-panel">
      <header className="local-admin-header">
        <div><p className="eyebrow">Companion access</p><span>Connect from Ansight Tester</span></div>
        <button aria-label="Close companion access" className="local-icon-button" onClick={onClose} type="button"><X /></button>
      </header>
      <div className="local-admin-content">
        {message ? <p className="inline-message" role="alert">{message}</p> : null}
        {isLoading ? <div className="local-admin-empty"><CircleNotch className="spin" />Loading companion access…</div> : access ? <>
          <div className="local-admin-section-heading"><div><PlugsConnected /><span>
            <strong>{access.isEnabled ? 'Companion access is on' : 'Companion access is off'}</strong>
            <small>{access.status}</small>
          </span></div></div>
          {access.isEnabled ? <>
            <p>{access.connectionCount} connected {access.connectionCount === 1 ? 'device' : 'devices'}</p>
            <button className="button button--secondary" disabled={isSaving} onClick={() => void changeAccess('disabled')} type="button">
              {isSaving ? <CircleNotch className="spin" /> : null}Turn off companion access
            </button>
          </> : !account?.isAuthenticated ? <>
            <p>Sign in to make this computer available in Ansight Tester.</p>
            <button className="button" onClick={onOpenAccount} type="button">Open account</button>
          </> : <form className="local-companion-form" onSubmit={event => { event.preventDefault(); void changeAccess(remember ? 'always' : 'session') }}>
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
            <button className="button" disabled={isSaving || !machineName.trim() || !access.isAvailable} type="submit">
              {isSaving ? <CircleNotch className="spin" /> : <PlugsConnected />}Turn on companion access
            </button>
          </form>}
        </> : null}
      </div>
    </section>
  </div>
}
