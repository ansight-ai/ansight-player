import {
  Broom,
  CaretRight,
  Check,
  CircleNotch,
  Copy,
  FolderSimple,
  Gauge,
  Lightning,
  ListChecks,
  MagnifyingGlass,
  PlugsConnected,
  QrCode,
  ShieldCheck,
  SquaresFour,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AppMonitoringPanel } from './AppMonitoringPanel'
import type {
  LocalEnrollmentInvite,
  LocalEnrollmentInviteResult,
  LocalOperationResult,
  LocalRegisteredApp,
  LocalRepositoryTask,
  LocalRepositoryTrigger,
  LocalRepositoryWorkspaceCatalog,
  LocalWorkspaceTest,
  LocalWorkspaceTrends,
  LocalWorkspaceSanitizer,
} from './types'

type HostManagementPanelProps = {
  onClose: () => void
}

type WorkspaceCollection = 'tests' | 'tasks' | 'triggers' | 'trends' | 'sanitizers'

export function HostManagementPanel({ onClose }: HostManagementPanelProps) {
  const [activeView, setActiveView] = useState<'apps' | 'monitoring' | 'enrollments'>('apps')
  const [monitoringAppId, setMonitoringAppId] = useState('')
  const [apps, setApps] = useState<LocalRegisteredApp[]>([])
  const [invites, setInvites] = useState<LocalEnrollmentInvite[]>([])
  const [enrollmentAppId, setEnrollmentAppId] = useState('')
  const [duration, setDuration] = useState('1mo')
  const [hostAddress, setHostAddress] = useState('')
  const [issuedInvite, setIssuedInvite] = useState<LocalEnrollmentInviteResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isIssuing, setIsIssuing] = useState(false)
  const [didCopy, setDidCopy] = useState(false)
  const [isQrExpanded, setIsQrExpanded] = useState(false)
  const [selectedWorkspaceAppId, setSelectedWorkspaceAppId] = useState<string | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<WorkspaceCollection | null>(null)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [workspaceCatalogs, setWorkspaceCatalogs] = useState<Record<string, LocalRepositoryWorkspaceCatalog>>({})
  const [workspaceCatalogErrors, setWorkspaceCatalogErrors] = useState<Record<string, string>>({})
  const [loadingWorkspaceAppId, setLoadingWorkspaceAppId] = useState<string | null>(null)
  const [newAppId, setNewAppId] = useState('')
  const [newAppName, setNewAppName] = useState('')
  const [newWorkspacePath, setNewWorkspacePath] = useState('')
  const [selectedAppId, setSelectedAppId] = useState('')
  const [selectedAppName, setSelectedAppName] = useState('')
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState('')
  const [pendingAppOperation, setPendingAppOperation] = useState<string | null>(null)

  const loadHostData = useCallback(async () => {
    try {
      const [appsResponse, invitesResponse] = await Promise.all([
        fetch('api/apps', { cache: 'no-store' }),
        fetch('api/enrollment/invites', { cache: 'no-store' }),
      ])
      if (!appsResponse.ok || !invitesResponse.ok) {
        throw new Error(`The local host returned HTTP ${!appsResponse.ok ? appsResponse.status : invitesResponse.status}.`)
      }

      const [nextApps, nextInvites] = await Promise.all([
        appsResponse.json() as Promise<LocalRegisteredApp[]>,
        invitesResponse.json() as Promise<LocalEnrollmentInvite[]>,
      ])
      setApps(nextApps)
      setInvites(nextInvites)
      setSelectedWorkspaceAppId((current) => current && nextApps.some((app) => app.appId === current) ? current : null)
      setMessage(null)
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to load host registrations.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadHostData() }, [loadHostData])

  useEffect(() => {
    if (!isQrExpanded) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsQrExpanded(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isQrExpanded])

  async function loadWorkspaceCatalog(app: LocalRegisteredApp) {
    if (!app.codebasePath || workspaceCatalogs[app.appId]) {
      return
    }

    setLoadingWorkspaceAppId(app.appId)
    setWorkspaceCatalogErrors((current) => {
      const next = { ...current }
      delete next[app.appId]
      return next
    })
    try {
      const response = await fetch(`api/apps/workspace?appId=${encodeURIComponent(app.appId)}`, { cache: 'no-store' })
      const result = await response.json() as LocalRepositoryWorkspaceCatalog | { message?: string }
      if (!response.ok || !('tasks' in result)) {
        throw new Error('message' in result ? result.message : `The local host returned HTTP ${response.status}.`)
      }

      setWorkspaceCatalogs((current) => ({ ...current, [app.appId]: result }))
    } catch (error) {
      setWorkspaceCatalogErrors((current) => ({
        ...current,
        [app.appId]: resolveErrorMessage(error, 'Unable to inspect this workspace.'),
      }))
    } finally {
      setLoadingWorkspaceAppId((current) => current === app.appId ? null : current)
    }
  }

  function openApp(app: LocalRegisteredApp) {
    setSelectedWorkspaceAppId(app.appId)
    setSelectedCollection(null)
    setSelectedModuleId(null)
    void loadWorkspaceCatalog(app)
  }

  function showAppsRoot() {
    setSelectedWorkspaceAppId(null)
    setSelectedCollection(null)
    setSelectedModuleId(null)
  }

  const selectedWorkspaceApp = apps.find((app) => app.appId === selectedWorkspaceAppId) ?? null

  useEffect(() => {
    setSelectedAppId(selectedWorkspaceApp?.appId ?? '')
    setSelectedAppName(selectedWorkspaceApp?.name ?? '')
    setSelectedWorkspacePath(selectedWorkspaceApp?.codebasePath ?? '')
  }, [selectedWorkspaceApp?.appId, selectedWorkspaceApp?.codebasePath, selectedWorkspaceApp?.name])

  async function registerApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const appId = newAppId.trim()
    if (!appId) return
    const didSucceed = await runAppOperation('register', 'api/apps/register', {
      appId,
      name: newAppName.trim() || appId,
      codebasePath: newWorkspacePath.trim() || null,
    })
    if (didSucceed) {
      setNewAppId('')
      setNewAppName('')
      setNewWorkspacePath('')
      setSelectedWorkspaceAppId(appId)
    }
  }

  async function runAppOperation(operation: string, url: string, body: unknown): Promise<boolean> {
    setPendingAppOperation(operation)
    setMessage(null)
    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalOperationResult & { isConnected?: boolean }
      const isSuccess = result.isSuccess ?? result.isConnected ?? response.ok
      if (!response.ok || !isSuccess) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      setMessage(result.message)
      setWorkspaceCatalogs({})
      setWorkspaceCatalogErrors({})
      await loadHostData()
      return true
    } catch (error) {
      setMessage(resolveErrorMessage(error, `Unable to ${operation}.`))
      return false
    } finally {
      setPendingAppOperation(null)
    }
  }

  async function saveSelectedApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedWorkspaceApp) return
    const appId = selectedAppId.trim()
    if (!appId) return
    const didSucceed = await runAppOperation('update the app', 'api/apps/register', {
      appId,
      previousAppId: selectedWorkspaceApp.appId,
      name: selectedAppName.trim() || appId,
      codebasePath: null,
    })
    if (didSucceed) setSelectedWorkspaceAppId(appId)
  }

  async function updateWorkspace(operation: 'link' | 'unlink') {
    if (!selectedWorkspaceApp) return
    await runAppOperation(
      `${operation} the workspace`,
      `api/apps/${encodeURIComponent(selectedWorkspaceApp.appId)}/workspace/${operation}`,
      operation === 'link'
        ? { appId: selectedWorkspaceApp.appId, repositoryRootPath: selectedWorkspacePath.trim() }
        : {},
    )
  }

  async function updateAutomations(operation: 'connect' | 'disconnect') {
    if (!selectedWorkspaceApp) return
    await runAppOperation(
      `${operation} automations`,
      `api/apps/${encodeURIComponent(selectedWorkspaceApp.appId)}/automations/${operation}`,
      { appId: selectedWorkspaceApp.appId, repositoryRootPath: selectedWorkspacePath.trim() || null },
    )
  }

  async function removeSelectedApp() {
    if (!selectedWorkspaceApp || !window.confirm(`Remove registered app '${selectedWorkspaceApp.name}'? Existing sessions will not be deleted.`)) return
    const appId = selectedWorkspaceApp.appId
    if (await runAppOperation('remove the app', `api/apps/${encodeURIComponent(appId)}/remove`, {})) showAppsRoot()
  }

  async function updateInvite(invite: LocalEnrollmentInvite, operation: 'revoke' | 'renew') {
    if (operation === 'revoke') {
      await runAppOperation('revoke the invite', `api/enrollment/invites/${encodeURIComponent(invite.inviteId)}/revoke`, {})
      return
    }

    if (!invite.isReadOnly && invite.status.toLowerCase() !== 'revoked') {
      const wasRevoked = await runAppOperation(
        'revoke the previous invite',
        `api/enrollment/invites/${encodeURIComponent(invite.inviteId)}/revoke`,
        {},
      )
      if (!wasRevoked) return
    }

    setIsIssuing(true)
    try {
      const response = await fetch('api/enrollment/invites', {
        body: JSON.stringify({ appId: invite.appId, appName: invite.appName, duration: '1mo', hostAddress: null }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalEnrollmentInviteResult
      if (!response.ok || !result.isSuccess) throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      setIssuedInvite(result)
      setMessage(result.message)
      await loadHostData()
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to renew the invite.'))
    } finally {
      setIsIssuing(false)
    }
  }

  async function issueInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsIssuing(true)
    setDidCopy(false)
    try {
      const selectedApp = apps.find((app) => app.appId === enrollmentAppId)
      const response = await fetch('api/enrollment/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: selectedApp?.appId || null,
          appName: selectedApp?.name || null,
          duration,
          hostAddress: hostAddress.trim() || null,
        }),
      })
      const result = await response.json() as LocalEnrollmentInviteResult
      if (!response.ok || !result.isSuccess) {
        throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      }

      setIssuedInvite(result)
      const issued = result.invite
      if (issued) {
        setInvites((current) => [issued, ...current.filter((invite) => invite.inviteId !== issued.inviteId)])
      }
      setMessage(null)
    } catch (error) {
      setIssuedInvite(null)
      setMessage(resolveErrorMessage(error, 'Unable to issue an enrollment invite.'))
    } finally {
      setIsIssuing(false)
    }
  }

  async function copyPairingCode() {
    if (!issuedInvite?.pairingCode) {
      return
    }

    try {
      await navigator.clipboard.writeText(issuedInvite.pairingCode)
      setDidCopy(true)
      window.setTimeout(() => setDidCopy(false), 1800)
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to copy the pairing code.'))
    }
  }

  return (
    <div className="local-management-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) {
        onClose()
      }
    }}>
      <section aria-label="Apps, monitoring and enrollments" className="local-management-panel">
        <header>
          <div>
            <p className="eyebrow">Apps, monitoring &amp; enrollments</p>
          </div>
          <button aria-label="Close app management" className="local-icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>

        {message ? <p className="inline-message local-management-message">{message}</p> : null}

        <div aria-label="Host management views" className="local-management-tabs" role="tablist">
          <button
            aria-selected={activeView === 'apps'}
            className={activeView === 'apps' ? 'local-management-tab local-management-tab--active' : 'local-management-tab'}
            onClick={() => setActiveView('apps')}
            role="tab"
            type="button"
          >
            Apps
            <span>{apps.length}</span>
          </button>
          <button
            aria-selected={activeView === 'monitoring'}
            className={activeView === 'monitoring' ? 'local-management-tab local-management-tab--active' : 'local-management-tab'}
            onClick={() => { setMonitoringAppId(''); setActiveView('monitoring') }}
            role="tab"
            type="button"
          >Monitoring</button>
          <button
            aria-selected={activeView === 'enrollments'}
            className={activeView === 'enrollments' ? 'local-management-tab local-management-tab--active' : 'local-management-tab'}
            onClick={() => setActiveView('enrollments')}
            role="tab"
            type="button"
          >
            Enrollments
            <span>{invites.length}</span>
          </button>
        </div>

        <div className="local-management-view">
          {activeView === 'apps' ? (
            <div className="local-app-management-stack">
              {selectedWorkspaceApp ? (
                <section className="local-management-section local-app-management-editor">
                  <div className="local-management-section-heading">
                    <div><FolderSimple aria-hidden="true" /><div><strong>App registration</strong><span>Edit the package registration, workspace and automations</span></div></div>
                    <code>{selectedWorkspaceApp.appId}</code>
                  </div>
                  <form className="local-app-management-form" onSubmit={saveSelectedApp}>
                    <label className="local-control-field">Package identifier<input onChange={(event) => setSelectedAppId(event.target.value)} value={selectedAppId} /></label>
                    <label className="local-control-field">Display name<input onChange={(event) => setSelectedAppName(event.target.value)} value={selectedAppName} /></label>
                    <label className="local-control-field local-app-management-form--wide">Workspace path<input onChange={(event) => setSelectedWorkspacePath(event.target.value)} placeholder="/path/to/repository" value={selectedWorkspacePath} /></label>
                    <div className="local-app-management-actions local-app-management-form--wide">
                      <button className="button button--primary" disabled={!selectedAppId.trim() || !!pendingAppOperation} type="submit">Save app</button>
                      <button className="button button--secondary" onClick={() => { setMonitoringAppId(selectedWorkspaceApp.appId); setActiveView('monitoring') }} type="button">Monitor app</button>
                      <button className="button button--secondary" disabled={!selectedWorkspacePath.trim() || !!pendingAppOperation} onClick={() => void updateWorkspace('link')} type="button">Link workspace</button>
                      <button className="button button--secondary" disabled={!selectedWorkspaceApp.codebasePath || !!pendingAppOperation} onClick={() => void updateWorkspace('unlink')} type="button">Unlink workspace</button>
                      {selectedWorkspaceApp.repositoryAutomationsEnabled ? (
                        <button disabled={!!pendingAppOperation} onClick={() => void updateAutomations('disconnect')} type="button">Disconnect automations</button>
                      ) : (
                        <button disabled={!selectedWorkspacePath.trim() || !!pendingAppOperation} onClick={() => void updateAutomations('connect')} type="button">Connect automations</button>
                      )}
                      <button className="button button--danger" disabled={!!pendingAppOperation} onClick={() => void removeSelectedApp()} type="button"><Trash />Remove app</button>
                    </div>
                  </form>
                </section>
              ) : (
                <section className="local-management-section local-app-management-editor">
                  <div className="local-management-section-heading">
                    <div><SquaresFour aria-hidden="true" /><div><strong>Register app</strong><span>Add a package identifier and optionally link its repository</span></div></div>
                  </div>
                  <form className="local-app-management-form" onSubmit={registerApp}>
                    <label className="local-control-field">Package identifier<input onChange={(event) => setNewAppId(event.target.value)} placeholder="com.example.app" value={newAppId} /></label>
                    <label className="local-control-field">Display name<input onChange={(event) => setNewAppName(event.target.value)} placeholder="Example app" value={newAppName} /></label>
                    <label className="local-control-field local-app-management-form--wide">Workspace path <small className="local-field-optional">optional</small><input onChange={(event) => setNewWorkspacePath(event.target.value)} placeholder="/path/to/repository" value={newWorkspacePath} /></label>
                    <button className="button button--primary local-app-management-form--wide" disabled={!newAppId.trim() || !!pendingAppOperation} type="submit">Register app</button>
                  </form>
                </section>
              )}
              <AppExplorer
                apps={apps}
                catalog={selectedWorkspaceApp ? workspaceCatalogs[selectedWorkspaceApp.appId] : undefined}
                error={selectedWorkspaceApp ? workspaceCatalogErrors[selectedWorkspaceApp.appId] : undefined}
                isLoading={isLoading}
                isLoadingCatalog={selectedWorkspaceApp?.appId === loadingWorkspaceAppId}
                onOpenApp={openApp}
                onSelectCollection={(collection) => {
                  setSelectedCollection(collection)
                  setSelectedModuleId(null)
                }}
                onSelectModule={setSelectedModuleId}
                onShowAppsRoot={showAppsRoot}
                selectedApp={selectedWorkspaceApp}
                selectedCollection={selectedCollection}
                selectedModuleId={selectedModuleId}
              />
            </div>
          ) : activeView === 'monitoring' ? (
            <AppMonitoringPanel apps={apps} initialAppId={monitoringAppId} />
          ) : (
          <section className="local-management-section">
            <div className="local-management-section-heading">
              <div>
                <QrCode aria-hidden="true" />
                <div><strong>Issue enrollment invite</strong><span>Create a one-time QR for an app</span></div>
              </div>
            </div>

            <form className="local-enrollment-form" onSubmit={issueInvite}>
              <label className="local-control-field">
                App
                <select onChange={(event) => setEnrollmentAppId(event.target.value)} value={enrollmentAppId}>
                  <option value="">Any app</option>
                  {apps.map((app) => <option key={app.appId} value={app.appId}>{app.name} · {app.appId}</option>)}
                </select>
              </label>
              <div className="local-enrollment-form-row">
                <label className="local-control-field">
                  Valid for
                  <select onChange={(event) => setDuration(event.target.value)} value={duration}>
                    <option value="15m">15 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="1d">1 day</option>
                    <option value="1w">1 week</option>
                    <option value="1mo">1 month</option>
                  </select>
                </label>
                <label className="local-control-field">
                  <span>Host address <small className="local-field-optional">optional</small></span>
                  <input onChange={(event) => setHostAddress(event.target.value)} placeholder="Auto-detect" value={hostAddress} />
                </label>
              </div>
              <button className="button button--primary local-enrollment-submit" disabled={isIssuing} type="submit">
                {isIssuing ? <CircleNotch className="spin" aria-hidden="true" /> : <QrCode aria-hidden="true" />}
                {isIssuing ? 'Issuing invite…' : 'Issue enrollment QR'}
              </button>
            </form>

            {issuedInvite?.qrImageDataUrl ? (
              <div className="local-enrollment-result">
                <button
                  aria-label="Expand enrollment QR code"
                  className="local-enrollment-qr-button"
                  onClick={() => setIsQrExpanded(true)}
                  type="button"
                >
                  <img alt="One-time Ansight enrollment QR code" src={issuedInvite.qrImageDataUrl} />
                  <span>Click to enlarge</span>
                </button>
                <div>
                  <span className="local-enrollment-ready"><Check aria-hidden="true" />Ready to scan</span>
                  <strong>{issuedInvite.invite?.appName ?? 'Any app'}</strong>
                  <span>Expires {issuedInvite.invite ? new Date(issuedInvite.invite.expiresAtUtc).toLocaleString() : 'soon'}</span>
                  <span>{issuedInvite.hostAddresses.join(' · ')}</span>
                  <button className="button button--secondary button--compact" onClick={copyPairingCode} type="button">
                    {didCopy ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {didCopy ? 'Copied' : 'Copy pairing code'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="local-management-invites">
              <div className="local-management-subheading"><strong>Recent invites</strong><span>{invites.length}</span></div>
              {invites.length === 0 && !isLoading ? (
                <div className="local-management-empty local-management-empty--compact"><PlugsConnected aria-hidden="true" /><span>No enrollment invites yet.</span></div>
              ) : invites.slice(0, 8).map((invite) => (
                <article className="local-management-invite" key={invite.inviteId}>
                  <div><strong>{invite.appName}</strong><span>{invite.appId}</span></div>
                  <div><strong>{invite.status}</strong><span>{new Date(invite.expiresAtUtc).toLocaleString()}</span></div>
                  <div className="local-management-invite-actions">
                    <button disabled={isIssuing || !!pendingAppOperation} onClick={() => void updateInvite(invite, 'renew')} type="button">Renew</button>
                    <button className="button--danger" disabled={invite.isReadOnly || invite.status.toLowerCase() === 'revoked' || isIssuing || !!pendingAppOperation} onClick={() => void updateInvite(invite, 'revoke')} type="button">Revoke</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
          )}
        </div>

        {isQrExpanded && issuedInvite?.qrImageDataUrl ? (
          <div className="local-enrollment-qr-modal" role="presentation" onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setIsQrExpanded(false)
            }
          }}>
            <section aria-label="Expanded enrollment QR code" aria-modal="true" role="dialog">
              <button aria-label="Close expanded QR code" className="local-icon-button" onClick={() => setIsQrExpanded(false)} type="button">
                <X aria-hidden="true" />
              </button>
              <img alt="Expanded one-time Ansight enrollment QR code" src={issuedInvite.qrImageDataUrl} />
              <strong>{issuedInvite.invite?.appName ?? 'Any app'}</strong>
              <span>Scan with the Ansight-enabled app</span>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function AppExplorer({
  apps,
  catalog,
  error,
  isLoading,
  isLoadingCatalog,
  onOpenApp,
  onSelectCollection,
  onSelectModule,
  onShowAppsRoot,
  selectedApp,
  selectedCollection,
  selectedModuleId,
}: {
  apps: LocalRegisteredApp[]
  catalog?: LocalRepositoryWorkspaceCatalog
  error?: string
  isLoading: boolean
  isLoadingCatalog: boolean
  onOpenApp: (app: LocalRegisteredApp) => void
  onSelectCollection: (collection: WorkspaceCollection | null) => void
  onSelectModule: (moduleId: string | null) => void
  onShowAppsRoot: () => void
  selectedApp: LocalRegisteredApp | null
  selectedCollection: WorkspaceCollection | null
  selectedModuleId: string | null
}) {
  const [search, setSearch] = useState('')
  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const filteredApps = apps.filter((app) => {
    const text = `${app.name} ${app.appId} ${app.codebasePath ?? ''}`.toLowerCase()
    return searchTerms.every((term) => text.includes(term))
  })
  if (!selectedApp) {
    return (
      <section className="local-management-section">
        <div className="local-management-section-heading">
          <div>
            <SquaresFour aria-hidden="true" />
            <div><strong>Apps</strong><span>Registered apps and their linked workspaces</span></div>
          </div>
          <span aria-live="polite">{searchTerms.length ? `${filteredApps.length} of ${apps.length}` : apps.length}</span>
        </div>

        <div className="local-app-search">
          <MagnifyingGlass aria-hidden="true" />
          <input aria-label="Search apps" disabled={isLoading} onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setSearch('') } }}
            placeholder="Search by name, package ID or workspace" type="search" value={search} />
          {search ? <button aria-label="Clear app search" className="local-icon-button" onClick={() => setSearch('')} type="button"><X aria-hidden="true" /></button> : null}
        </div>

        {isLoading ? (
          <div className="local-management-empty"><CircleNotch className="spin" aria-hidden="true" /><span>Loading registrations</span></div>
        ) : apps.length === 0 ? (
          <div className="local-management-empty"><SquaresFour aria-hidden="true" /><strong>No registered apps</strong><span>Register a package identifier above or enroll an app.</span></div>
        ) : filteredApps.length === 0 ? (
          <div className="local-management-empty" role="status"><MagnifyingGlass aria-hidden="true" /><strong>No matching apps</strong><span>Try a different name, package identifier or workspace path.</span></div>
        ) : (
          <div className="local-management-app-list">
            {filteredApps.map((app) => (
              <button className="local-management-app" key={app.appId} onClick={() => onOpenApp(app)} type="button">
                <span className="local-management-app-heading">
                  <span><strong>{app.name}</strong><span>{app.appId}</span></span>
                  <span className={app.liveSessionCount > 0 ? 'local-live-badge' : 'local-management-app-offline'}>
                    {app.liveSessionCount > 0 ? <><i />{app.liveSessionCount} live</> : 'Offline'}
                  </span>
                </span>
                <span className="local-management-app-stats">
                  <span>{app.sessionCount} sessions</span>
                  <span>{app.analysisCount} analyses</span>
                  <span>{app.enrollmentInviteCount} invites</span>
                </span>
                <span className={app.automaticTrendsMonitoringEnabled ? 'local-management-workspace local-management-workspace--active' : 'local-management-workspace'}>
                  <FolderSimple aria-hidden="true" />
                  <span>
                    <strong>{app.codebasePath ? 'Workspace linked' : 'No workspace linked'}</strong>
                    <span>{app.codebasePath ?? 'Open this app to link a repository workspace.'}</span>
                  </span>
                  <CaretRight aria-hidden="true" className="local-management-app-chevron" />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    )
  }

  const collectionItems = catalog && selectedCollection ? buildCollectionItems(catalog, selectedCollection) : []
  const selectedItem = selectedModuleId ? collectionItems.find((item) => item.id === selectedModuleId) ?? null : null

  return (
    <section className="local-management-section local-app-explorer">
      <nav aria-label="App explorer breadcrumb" className="local-app-explorer-breadcrumb">
        <button onClick={onShowAppsRoot} type="button">Apps</button>
        <CaretRight aria-hidden="true" />
        {selectedCollection ? (
          <button onClick={() => onSelectCollection(null)} type="button">{selectedApp.name}</button>
        ) : <strong>{selectedApp.name}</strong>}
        {selectedCollection ? <><CaretRight aria-hidden="true" />{selectedModuleId ? (
          <button onClick={() => onSelectModule(null)} type="button">{formatCollectionLabel(selectedCollection)}</button>
        ) : <strong>{formatCollectionLabel(selectedCollection)}</strong>}</> : null}
        {selectedItem ? <><CaretRight aria-hidden="true" /><strong>{selectedItem.title}</strong></> : null}
      </nav>

      <div className="local-app-explorer-app-heading">
        <div>
          <strong>{selectedApp.name}</strong>
          <code>{selectedApp.appId}</code>
        </div>
        <span className={selectedApp.liveSessionCount > 0 ? 'local-live-badge' : 'local-management-app-offline'}>
          {selectedApp.liveSessionCount > 0 ? <><i />{selectedApp.liveSessionCount} live</> : 'Offline'}
        </span>
      </div>

      {!selectedCollection ? (
        <AppOverview
          app={selectedApp}
          catalog={catalog}
          error={error}
          isLoadingCatalog={isLoadingCatalog}
          onSelectCollection={onSelectCollection}
        />
      ) : selectedItem ? (
        <WorkspaceModuleDetail
          catalog={catalog}
          collection={selectedCollection}
          itemId={selectedItem.id}
        />
      ) : (
        <WorkspaceCollectionView
          collection={selectedCollection}
          isLoading={isLoadingCatalog}
          items={collectionItems}
          onSelectModule={onSelectModule}
        />
      )}
    </section>
  )
}

function AppOverview({
  app,
  catalog,
  error,
  isLoadingCatalog,
  onSelectCollection,
}: {
  app: LocalRegisteredApp
  catalog?: LocalRepositoryWorkspaceCatalog
  error?: string
  isLoadingCatalog: boolean
  onSelectCollection: (collection: WorkspaceCollection) => void
}) {
  return (
    <div className="local-app-explorer-overview">
      <div className={app.automaticTrendsMonitoringEnabled ? 'local-management-workspace local-management-workspace--active' : 'local-management-workspace'}>
        <FolderSimple aria-hidden="true" />
        <div>
          <strong>{app.codebasePath ? 'Workspace linked' : 'No workspace linked'}</strong>
          <span>{app.codebasePath ?? 'Use the app registration controls above to link a repository workspace.'}</span>
        </div>
        {app.automaticTrendsMonitoringEnabled ? <ShieldCheck aria-label="Workspace available" /> : null}
      </div>

      {isLoadingCatalog ? (
        <div className="local-workspace-catalog-state"><CircleNotch className="spin" aria-hidden="true" />Inspecting workspace…</div>
      ) : error ? (
        <div className="local-workspace-catalog-state local-workspace-catalog-state--error"><WarningCircle aria-hidden="true" />{error}</div>
      ) : catalog ? (
        <>
          <div className="local-app-explorer-links">
            <ExplorerLink count={catalog.tests.length} icon={<ListChecks aria-hidden="true" />} label="Tests" onClick={() => onSelectCollection('tests')} />
            <ExplorerLink count={catalog.tasks.length} icon={<SquaresFour aria-hidden="true" />} label="Tasks" onClick={() => onSelectCollection('tasks')} />
            <ExplorerLink count={catalog.triggers.length} icon={<Lightning aria-hidden="true" />} label="Triggers" onClick={() => onSelectCollection('triggers')} />
            <ExplorerLink count={catalog.trends.length} icon={<Gauge aria-hidden="true" />} label="Trends" onClick={() => onSelectCollection('trends')} />
            <ExplorerLink count={catalog.sanitizers.length} icon={<Broom aria-hidden="true" />} label="Sanitizers" onClick={() => onSelectCollection('sanitizers')} />
          </div>
          {catalog.warnings.length > 0 ? (
            <details className="local-app-explorer-issues">
              <summary><WarningCircle aria-hidden="true" />{catalog.warnings.length} workspace issue{catalog.warnings.length === 1 ? '' : 's'}</summary>
              <div>{catalog.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
            </details>
          ) : null}
        </>
      ) : app.codebasePath ? null : (
        <div className="local-app-explorer-empty">
          <FolderSimple aria-hidden="true" />
          <strong>No linked workspace</strong>
          <span>Link a repository workspace above before exploring its definitions.</span>
        </div>
      )}
    </div>
  )
}

function ExplorerLink({ count, icon, label, onClick }: { count: number; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="local-app-explorer-link" onClick={onClick} type="button">
      <span>{icon}<strong>{label}</strong></span>
      <span><small>{count}</small><CaretRight aria-hidden="true" /></span>
    </button>
  )
}

type WorkspaceCollectionItem = {
  description: string
  id: string
  meta: string
  title: string
}

function WorkspaceCollectionView({
  collection,
  isLoading,
  items,
  onSelectModule,
}: {
  collection: WorkspaceCollection
  isLoading: boolean
  items: WorkspaceCollectionItem[]
  onSelectModule: (moduleId: string) => void
}) {
  if (isLoading) {
    return <div className="local-workspace-catalog-state"><CircleNotch className="spin" aria-hidden="true" />Loading {formatCollectionLabel(collection).toLowerCase()}…</div>
  }

  if (items.length === 0) {
    return (
      <div className="local-app-explorer-empty">
        <WorkspaceCollectionIcon collection={collection} />
        <strong>No {formatCollectionLabel(collection).toLowerCase()} detected</strong>
        <span>The linked workspace does not currently expose any definitions in this category.</span>
      </div>
    )
  }

  return (
    <div className="local-app-explorer-collection">
      <header><div><strong>{formatCollectionLabel(collection)}</strong><span>{items.length} detected</span></div></header>
      <div className="local-app-explorer-item-list">
        {items.map((item) => (
          <button className="local-app-explorer-item" key={item.id} onClick={() => onSelectModule(item.id)} type="button">
            <span><strong>{item.title}</strong>{item.id !== item.title ? <code>{item.id}</code> : null}</span>
            <p>{item.description}</p>
            <small>{item.meta}</small>
            <CaretRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}

function WorkspaceModuleDetail({
  catalog,
  collection,
  itemId,
}: {
  catalog?: LocalRepositoryWorkspaceCatalog
  collection: WorkspaceCollection
  itemId: string
}) {
  if (!catalog) {
    return null
  }

  if (collection === 'tests') {
    const test = catalog.tests.find((candidate) => candidate.testId === itemId)
    return test ? <TestDetail test={test} /> : null
  }
  if (collection === 'tasks') {
    const task = catalog.tasks.find((candidate) => candidate.taskId === itemId)
    return task ? <TaskDetail task={task} /> : null
  }
  if (collection === 'triggers') {
    const trigger = catalog.triggers.find((candidate) => candidate.triggerId === itemId)
    return trigger ? <TriggerDetail trigger={trigger} /> : null
  }
  if (collection === 'trends') {
    const trends = catalog.trends.find((candidate) => candidate.trendsId === itemId)
    return trends ? <TrendsDetail trends={trends} /> : null
  }

  const sanitizer = catalog.sanitizers.find((candidate) => candidate.sanitizerId === itemId)
  return sanitizer ? <SanitizerDetail sanitizer={sanitizer} /> : null
}

function TestDetail({ test }: { test: LocalWorkspaceTest }) {
  return (
    <div className="local-app-explorer-detail">
      <header><p className="eyebrow">Test</p><h3>{test.name}</h3><code>{test.testId}</code></header>
      <DefinitionRows rows={[
        ['Enabled', test.enabled ? 'Yes' : 'No'],
        ['App ID', test.appId],
        ['Required secrets', test.requiredSecrets.join(', ') || 'None'],
        ['Source', test.filePath],
      ]} />
      <section><strong>Instructions</strong><p>{test.prompt}</p></section>
    </div>
  )
}

function TaskDetail({ task }: { task: LocalRepositoryTask }) {
  return (
    <div className="local-app-explorer-detail">
      <header><p className="eyebrow">Task</p><h3>{task.title}</h3><code>{task.taskId}</code></header>
      <DefinitionRows rows={[
        ['Enabled', task.enabled ? 'Yes' : 'No'],
        ['Feature', task.feature || 'Uncategorised'],
        ['Keywords', task.keywords.join(', ') || 'None'],
        ['Host tools', task.declaredHostTools.join(', ') || 'None'],
        ['Limits', `${task.timeoutSeconds}s · ${task.maximumActions} actions`],
        ['Source', task.modulePath],
      ]} />
      <section><strong>Description</strong><p>{task.description || 'No description.'}</p></section>
    </div>
  )
}

function TriggerDetail({ trigger }: { trigger: LocalRepositoryTrigger }) {
  return (
    <div className="local-app-explorer-detail">
      <header><p className="eyebrow">Trigger</p><h3>{trigger.triggerId}</h3><code>{trigger.eventKind}</code></header>
      <DefinitionRows rows={[
        ['Enabled', trigger.enabled ? 'Yes' : 'No'],
        ['Automation', trigger.automationId],
        ['Action', trigger.actionKind],
        ['Target', trigger.actionTarget],
        ['Maximum attempts', String(trigger.maximumAttempts)],
        ['Source', trigger.modulePath],
      ]} />
    </div>
  )
}

function TrendsDetail({ trends }: { trends: LocalWorkspaceTrends }) {
  return (
    <div className="local-app-explorer-detail">
      <header><p className="eyebrow">Trends</p><h3>{trends.trendsId}</h3><code>{trends.appId}</code></header>
      <DefinitionRows rows={[
        ['Enabled', trends.enabled ? 'Yes' : 'No'],
        ['Required', trends.required ? 'Yes' : 'No'],
        ['Missing data', trends.missingDataOutcome],
        ['Metrics', String(trends.metrics.length)],
        ['Maximum duration', trends.span.maximumDuration],
        ['Source', trends.filePath],
      ]} />
      <section><strong>Observation span</strong><p>{formatEventAnchor(trends.span.start)} → {formatEventAnchor(trends.span.end)} · {formatSpanSelection(trends.span.selection)}</p></section>
      <section>
        <strong>Metrics</strong>
        <div className="local-app-explorer-measurements">
          {trends.metrics.map((metric) => (
            <article key={metric.metricId}>
              <div><strong>{metric.metricId}</strong><code>{metric.statistic}</code></div>
              <p>{formatMetricChannel(metric.channel)} · {formatBudget(metric.budget)}</p>
              <small>{metric.minimumSamples} minimum sample{metric.minimumSamples === 1 ? '' : 's'} · maximum gap {metric.maximumSampleGap}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function SanitizerDetail({ sanitizer }: { sanitizer: LocalWorkspaceSanitizer }) {
  return (
    <div className="local-app-explorer-detail">
      <header><p className="eyebrow">Sanitizer</p><h3>{sanitizer.sanitizerId}</h3><code>TypeScript module</code></header>
      <DefinitionRows rows={[
        ['Module ID', sanitizer.sanitizerId],
        ['Source', sanitizer.modulePath],
      ]} />
      <section><strong>Purpose</strong><p>Transforms captured session evidence into a sanitized export while preserving the raw local capture.</p></section>
    </div>
  )
}

function DefinitionRows({ rows }: { rows: Array<[string, string]> }) {
  return <div className="local-app-explorer-definition-rows">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
}

function buildCollectionItems(catalog: LocalRepositoryWorkspaceCatalog, collection: WorkspaceCollection): WorkspaceCollectionItem[] {
  if (collection === 'tests') {
    return catalog.tests.map((test) => ({
      description: test.prompt,
      id: test.testId,
      meta: `${test.enabled ? 'Enabled' : 'Disabled'} · ${test.requiredSecrets.length} required secret${test.requiredSecrets.length === 1 ? '' : 's'}`,
      title: test.name,
    }))
  }
  if (collection === 'tasks') {
    return catalog.tasks.map((task) => ({
      description: task.description || 'No description.',
      id: task.taskId,
      meta: [task.enabled ? 'Enabled' : 'Disabled', task.feature, ...task.keywords].filter(Boolean).join(' · '),
      title: task.title,
    }))
  }
  if (collection === 'triggers') {
    return catalog.triggers.map((trigger) => ({
      description: `${trigger.actionKind} · ${trigger.actionTarget}`,
      id: trigger.triggerId,
      meta: `${trigger.enabled ? 'Enabled' : 'Disabled'} · ${trigger.eventKind}`,
      title: trigger.triggerId,
    }))
  }
  if (collection === 'trends') {
    return catalog.trends.map((trends) => ({
      description: `Measures ${trends.metrics.map((metric) => metric.metricId).join(', ')} from ${formatEventAnchor(trends.span.start)} to ${formatEventAnchor(trends.span.end)}.`,
      id: trends.trendsId,
      meta: `${trends.enabled ? 'Enabled' : 'Disabled'} · ${trends.required ? 'Required' : 'Optional'} · ${trends.metrics.length} metric${trends.metrics.length === 1 ? '' : 's'}`,
      title: trends.trendsId,
    }))
  }

  return catalog.sanitizers.map((sanitizer) => ({
    description: 'Transforms captured evidence for sanitized session exports.',
    id: sanitizer.sanitizerId,
    meta: sanitizer.modulePath,
    title: sanitizer.sanitizerId,
  }))
}

function formatCollectionLabel(collection: WorkspaceCollection): string {
  switch (collection) {
    case 'tests': return 'Tests'
    case 'tasks': return 'Tasks'
    case 'triggers': return 'Triggers'
    case 'trends': return 'Trends'
    case 'sanitizers': return 'Sanitizers'
  }
}

function WorkspaceCollectionIcon({ collection }: { collection: WorkspaceCollection }) {
  switch (collection) {
    case 'tests': return <ListChecks aria-hidden="true" />
    case 'tasks': return <SquaresFour aria-hidden="true" />
    case 'triggers': return <Lightning aria-hidden="true" />
    case 'trends': return <Gauge aria-hidden="true" />
    case 'sanitizers': return <Broom aria-hidden="true" />
  }
}

function formatEventAnchor(anchor: LocalWorkspaceTrends['span']['start']): string {
  const qualifier = anchor.eventType ?? (anchor.channelId == null ? null : `channel ${anchor.channelId}`)
  return qualifier ? `${anchor.label} (${qualifier})` : anchor.label
}

function formatSpanSelection(selection: LocalWorkspaceTrends['span']['selection']): string {
  if (typeof selection === 'string') {
    return selection.replace(/([a-z])([A-Z])/g, '$1 $2')
  }

  return ['First completed', 'Last completed', 'Exactly one', 'All'][selection] ?? String(selection)
}

function formatMetricChannel(channel: LocalWorkspaceTrends['metrics'][number]['channel']): string {
  return channel.name ?? channel.type ?? channel.source ?? channel.kind ?? 'Telemetry channel'
}

function formatBudget(budget: LocalWorkspaceTrends['metrics'][number]['budget']): string {
  const bounds = [
    budget.greaterThanOrEqual == null ? null : `≥ ${budget.greaterThanOrEqual}`,
    budget.lessThanOrEqual == null ? null : `≤ ${budget.lessThanOrEqual}`,
    budget.absoluteLessThanOrEqual == null ? null : `absolute ≤ ${budget.absoluteLessThanOrEqual}`,
  ].filter((value): value is string => Boolean(value))
  return bounds.join(' and ') || 'No threshold'
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
