import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  FlowArrow,
  FloppyDisk,
  Play,
  Record,
  Stop,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppGraphCanvas } from '../replay/components/AppGraphCanvas'
import type { AppGraphDestinationKind } from '../types'
import type {
  LocalAppGraphQueryResult,
  LocalAppGraphNavigationController,
  LocalAppGraphNavigationDiscoveryResult,
  LocalAppGraphRecording,
  LocalAppGraphRecordingOperationResult,
  LocalAppGraphSummary,
  LocalSessionSummary,
} from './types'

type DestinationDraft = {
  kind: AppGraphDestinationKind
  name: string
  purpose: string
  parentDestinationId: string
  synonyms: string
}

const emptyDestination: DestinationDraft = {
  kind: 'screen',
  name: '',
  purpose: '',
  parentDestinationId: '',
  synonyms: '',
}

const genericNavigationController: LocalAppGraphNavigationController = {
  framework: 'native-unknown',
  guidance: 'Use only when the connected app exposes no framework navigation-state controller.',
  kinds: [
    { kind: 'generic_host', label: 'Generic navigation host', normalizedRole: 'other', supportsNavigationHost: true, supportsTabGroup: false },
    { kind: 'generic_tabs', label: 'Generic tab group', normalizedRole: 'top_tabs', supportsNavigationHost: false, supportsTabGroup: true },
  ],
  label: 'Unknown framework (fallback)',
  navigationToolId: '',
  structureFingerprint: '',
}

export function AppGraphRecordingPanel({
  onClose,
  onShowRuns,
  session,
}: {
  onClose: () => void
  onShowRuns: () => void
  session: LocalSessionSummary
}) {
  const [recording, setRecording] = useState<LocalAppGraphRecording | null>(null)
  const [graphs, setGraphs] = useState<LocalAppGraphSummary[]>([])
  const [selectedGraphId, setSelectedGraphId] = useState('')
  const [graphName, setGraphName] = useState('Default')
  const [intent, setIntent] = useState('Navigate the app through recorded destinations')
  const [destination, setDestination] = useState<DestinationDraft>(emptyDestination)
  const [existingCurrentId, setExistingCurrentId] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [transitionMeaning, setTransitionMeaning] = useState('')
  const [automationId, setAutomationId] = useState('')
  const [existingResultId, setExistingResultId] = useState('')
  const [navigationControllers, setNavigationControllers] = useState<LocalAppGraphNavigationController[]>([])
  const [navigationFramework, setNavigationFramework] = useState('')
  const [navigationTechnologyKind, setNavigationTechnologyKind] = useState('')
  const [navigationName, setNavigationName] = useState('')
  const [navigationDestinationId, setNavigationDestinationId] = useState('')
  const [navigationActiveChildId, setNavigationActiveChildId] = useState('')
  const [navigationChildIds, setNavigationChildIds] = useState<string[]>([])
  const [tabParentId, setTabParentId] = useState('')
  const [tabFramework, setTabFramework] = useState('')
  const [tabTechnologyKind, setTabTechnologyKind] = useState('')
  const [selectedTabId, setSelectedTabId] = useState('')
  const [tabIds, setTabIds] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const refresh = useCallback(async () => {
    const query = new URLSearchParams({ sessionId: session.sessionId })
    const graphQuery = new URLSearchParams({ appId: session.appId })
    const [recordingResponse, graphResponse, controllerResponse] = await Promise.all([
      fetch(`api/app-graph-recordings?${query}`, { cache: 'no-store' }),
      fetch(`api/app-graphs?${graphQuery}`, { cache: 'no-store' }),
      fetch(`api/app-graph-navigation-controllers?${query}`, { cache: 'no-store' }),
    ])
    if (!recordingResponse.ok || !graphResponse.ok) {
      throw new Error('Unable to read local App Graph recording state.')
    }
    const recordings = await recordingResponse.json() as LocalAppGraphRecording[]
    const graphResult = await graphResponse.json() as LocalAppGraphQueryResult
    const controllerResult = controllerResponse.ok
      ? await controllerResponse.json() as LocalAppGraphNavigationDiscoveryResult
      : null
    setRecording(recordings.find((candidate) => candidate.status === 'recording' || candidate.status === 'review') ?? null)
    setGraphs(graphResult.graphs ?? [])
    setNavigationControllers(controllerResult?.controllers?.length
      ? controllerResult.controllers
      : [genericNavigationController])
  }, [session.appId, session.sessionId])

  useEffect(() => {
    let mounted = true
    const timeoutId = window.setTimeout(() => {
      void refresh().catch((reason) => {
        if (mounted) setError(readError(reason))
      })
    }, 0)
    return () => {
      mounted = false
      window.clearTimeout(timeoutId)
    }
  }, [refresh])

  const nodes = recording?.definition.nodes ?? []
  const screens = nodes.filter((node) => node.kind === 'screen')
  const states = nodes.filter((node) => node.kind === 'state')
  const selectedGraph = graphs.find((graph) => graph.id === selectedGraphId) ?? null
  const selectedNavigationController = navigationControllers.find((controller) => controller.framework === navigationFramework) ?? navigationControllers[0] ?? null
  const tabControllers = navigationControllers.filter((controller) => controller.kinds.some((kind) => kind.supportsTabGroup))
  const selectedTabController = tabControllers.find((controller) => controller.framework === tabFramework) ?? tabControllers[0] ?? null
  const navigationKinds = selectedNavigationController?.kinds.filter((kind) => kind.supportsNavigationHost) ?? []
  const tabKinds = selectedTabController?.kinds.filter((kind) => kind.supportsTabGroup) ?? []
  const effectiveNavigationTechnologyKind = navigationKinds.some((kind) => kind.kind === navigationTechnologyKind)
    ? navigationTechnologyKind
    : navigationKinds[0]?.kind ?? ''
  const effectiveTabTechnologyKind = tabKinds.some((kind) => kind.kind === tabTechnologyKind)
    ? tabTechnologyKind
    : tabKinds[0]?.kind ?? ''
  const isTransitionArmed = recording?.pendingTransition != null
  const currentDestination = nodes.find((node) => node.id === recording?.currentDestinationId) ?? null
  const metrics = useMemo(() => ({
    destinations: nodes.length,
    transitions: recording?.definition.edges.length ?? 0,
    navigationHosts: recording?.definition.navigationHosts?.length ?? 0,
    tabGroups: recording?.definition.tabGroups?.length ?? 0,
  }), [nodes.length, recording])

  async function runOperation(path: string, body: unknown = {}) {
    setIsBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(path, {
        body: JSON.stringify(body),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalAppGraphRecordingOperationResult
      if (!response.ok || !result.isSuccess) {
        throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      }
      setRecording(result.recording ?? null)
      setMessage(result.message)
      return result
    } catch (reason) {
      setError(readError(reason))
      return null
    } finally {
      setIsBusy(false)
    }
  }

  async function startRecording() {
    const result = await runOperation('api/app-graph-recordings/start', {
      appGraphId: selectedGraphId || null,
      appId: session.appId,
      appName: session.name || session.clientName,
      graphName: selectedGraph?.name || graphName,
      intent: selectedGraph?.intent || intent,
      sessionId: session.sessionId,
    })
    if (result?.recording) {
      setSelectedNodeId(result.recording.currentDestinationId ?? null)
    }
  }

  async function captureDestination() {
    if (!recording) return
    const result = await runOperation(
      `api/app-graph-recordings/${encodeURIComponent(recording.id)}/capture-destination`,
      destinationPayload(destination, existingCurrentId || undefined),
    )
    if (result?.recording) {
      setSelectedNodeId(result.recording.currentDestinationId ?? null)
      setExistingCurrentId('')
      setDestination(emptyDestination)
    }
  }

  async function armTransition() {
    if (!recording) return
    await runOperation(
      `api/app-graph-recordings/${encodeURIComponent(recording.id)}/arm-transition`,
      { fromDestinationId: recording.currentDestinationId },
    )
  }

  async function completeTransition() {
    if (!recording) return
    const result = await runOperation(
      `api/app-graph-recordings/${encodeURIComponent(recording.id)}/complete-transition`,
      {
        automationId: automationId.trim() || null,
        destination: existingResultId ? null : destinationPayload(destination),
        existingDestinationId: existingResultId || null,
        semanticMeaning: transitionMeaning,
      },
    )
    if (result?.recording) {
      setSelectedNodeId(result.recording.currentDestinationId ?? null)
      setTransitionMeaning('')
      setAutomationId('')
      setExistingResultId('')
      setDestination(emptyDestination)
    }
  }

  async function saveNavigationHost() {
    if (!recording || !selectedNavigationController) return
    const technologyKind = navigationKinds.find((kind) => kind.kind === effectiveNavigationTechnologyKind)
    if (!technologyKind) return
    await runOperation(
      `api/app-graph-recordings/${encodeURIComponent(recording.id)}/navigation-host`,
      {
        activeChildDestinationId: navigationActiveChildId,
        childDestinationIds: navigationChildIds,
        destinationId: navigationDestinationId,
        framework: selectedNavigationController.framework,
        kind: technologyKind.normalizedRole,
        name: navigationName,
        technology: technologyPayload(selectedNavigationController, technologyKind.kind),
      },
    )
  }

  async function saveTabGroup() {
    if (!recording || !selectedTabController || !effectiveTabTechnologyKind) return
    await runOperation(
      `api/app-graph-recordings/${encodeURIComponent(recording.id)}/tab-group`,
      {
        parentDestinationId: tabParentId,
        selectedDestinationId: selectedTabId,
        tabDestinationIds: tabIds,
        technology: technologyPayload(selectedTabController, effectiveTabTechnologyKind),
      },
    )
  }

  async function lifecycle(operation: 'cancel' | 'commit' | 'resume' | 'stop') {
    if (!recording) return
    const result = await runOperation(
      `api/app-graph-recordings/${encodeURIComponent(recording.id)}/${operation}`,
    )
    if (result?.recording?.status === 'committed' || result?.recording?.status === 'cancelled') {
      await refresh()
      if (operation === 'commit') setMessage(result.message)
    }
  }

  return (
    <div className="local-app-graph-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <section aria-label="Record App Graph walkthrough" className="local-app-graph-panel local-app-graph-recording-panel">
        <header>
          <div>
            <p className="eyebrow">Local App Graph</p>
            <strong>Walkthrough recorder</strong>
          </div>
          <div className="local-app-graph-header-actions">
            <button className="local-banner-button" onClick={onShowRuns} type="button">
              <FlowArrow aria-hidden="true" /> Agent runs
            </button>
            <button aria-label="Refresh recording" className="local-icon-button" disabled={isBusy} onClick={() => void refresh()} type="button">
              <ArrowClockwise className={isBusy ? 'spin' : undefined} aria-hidden="true" />
            </button>
            <button aria-label="Close recorder" className="local-icon-button" onClick={onClose} type="button">
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="local-app-graph-recording-notices">
          {error ? <div className="local-app-graph-recording-message local-app-graph-recording-message--error"><WarningCircle aria-hidden="true" />{error}</div> : null}
          {message ? <div className="local-app-graph-recording-message"><CheckCircle aria-hidden="true" />{message}</div> : null}
        </div>

        {!recording ? (
          <div className="local-app-graph-recording-start">
            <Record aria-hidden="true" />
            <div>
              <p className="eyebrow">Connected session</p>
              <h2>{session.name || session.clientName}</h2>
              <p>Start a Host-owned draft, then mark destinations and transitions while you operate the app normally.</p>
            </div>
            <label>
              <span>App Graph</span>
              <select value={selectedGraphId} onChange={(event) => setSelectedGraphId(event.target.value)}>
                <option value="">Create a new graph</option>
                {graphs.map((graph) => <option key={graph.id} value={graph.id}>{graph.name} · v{graph.version}</option>)}
              </select>
            </label>
            {!selectedGraph ? (
              <>
                <label><span>Name</span><input value={graphName} onChange={(event) => setGraphName(event.target.value)} /></label>
                <label><span>Intent</span><textarea value={intent} onChange={(event) => setIntent(event.target.value)} /></label>
              </>
            ) : (
              <p className="local-app-graph-recording-selected-graph">Continue <strong>{selectedGraph.name}</strong>: {selectedGraph.intent}</p>
            )}
            <button className="button-primary" disabled={isBusy || (!selectedGraph && !graphName.trim())} onClick={() => void startRecording()} type="button">
              {isBusy ? <CircleNotch className="spin" aria-hidden="true" /> : <Record aria-hidden="true" />} Start recording
            </button>
          </div>
        ) : (
          <>
            <div className="local-app-graph-toolbar local-app-graph-recording-toolbar">
              <span className={`local-app-graph-status local-app-graph-status--${recording.status}`}>
                {recording.status === 'recording' ? <Record aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}
                {recording.status}
              </span>
              <strong>{recording.graphName}</strong>
              <span>{session.name || session.clientName}</span>
              <span className="local-session-context-spacer" />
              {recording.status === 'recording' ? (
                <button disabled={isBusy || isTransitionArmed} onClick={() => void lifecycle('stop')} type="button"><Stop aria-hidden="true" /> Stop &amp; review</button>
              ) : (
                <>
                  <button disabled={isBusy} onClick={() => void lifecycle('resume')} type="button"><Play aria-hidden="true" /> Continue</button>
                  <button className="button-primary" disabled={isBusy || recording.gaps.length > 0} onClick={() => void lifecycle('commit')} type="button"><FloppyDisk aria-hidden="true" /> Commit version</button>
                </>
              )}
            </div>

            <div className="local-app-graph-body local-app-graph-recording-body">
              <aside className="local-app-graph-inspector local-app-graph-recording-inspector">
                <div className="local-app-graph-counts">
                  <Metric label="Destinations" value={metrics.destinations} />
                  <Metric label="Transitions" value={metrics.transitions} />
                  <Metric label="Navigation hosts" value={metrics.navigationHosts} />
                  <Metric label="Tab groups" value={metrics.tabGroups} />
                </div>

                {currentDestination ? <p className="local-app-graph-recording-current"><small>Current destination</small><strong>{currentDestination.name}</strong><span>{currentDestination.kind}</span></p> : null}

                {recording.status === 'recording' && !isTransitionArmed ? (
                  <section className="local-app-graph-recording-card">
                    <header><strong>Record current destination</strong><span>Capture the app exactly as it is now.</span></header>
                    {nodes.length > 0 ? (
                      <label>
                        <span>Destination</span>
                        <select value={existingCurrentId} onChange={(event) => {
                          const id = event.target.value
                          setExistingCurrentId(id)
                          const node = nodes.find((candidate) => candidate.id === id)
                          setDestination(node ? {
                            kind: node.kind,
                            name: node.name,
                            parentDestinationId: node.kind === 'state'
                              ? screens.find((screen) => screen.name === node.parentScreen)?.id ?? ''
                              : '',
                            purpose: node.purpose,
                            synonyms: node.synonyms.join(', '),
                          } : emptyDestination)
                        }}>
                          <option value="">Create a new destination</option>
                          {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                        </select>
                      </label>
                    ) : null}
                    <DestinationFields destination={destination} onChange={setDestination} screens={screens} />
                    <button className="button-primary" disabled={isBusy || !destination.name.trim() || !destination.purpose.trim()} onClick={() => void captureDestination()} type="button">
                      <Record aria-hidden="true" /> Record {destination.kind}
                    </button>
                  </section>
                ) : null}

                {recording.status === 'recording' && nodes.length > 0 && !isTransitionArmed ? (
                  <section className="local-app-graph-recording-card">
                    <header><strong>Next transition</strong><span>Capture one app gesture and its result.</span></header>
                    <label><span>From</span><select value={recording.currentDestinationId ?? ''} disabled>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                    <button disabled={isBusy || !recording.currentDestinationId} onClick={() => void armTransition()} type="button"><Play aria-hidden="true" /> Arm next transition</button>
                  </section>
                ) : null}

                {recording.status === 'recording' && isTransitionArmed ? (
                  <section className="local-app-graph-recording-card local-app-graph-recording-card--armed">
                    <header><strong>Transition armed</strong><span>Perform one action in the app, then describe the result.</span></header>
                    <label><span>Element meaning</span><input placeholder="Open settings" value={transitionMeaning} onChange={(event) => setTransitionMeaning(event.target.value)} /></label>
                    <label><span>Known automation ID (optional)</span><input placeholder="Resolved from the pre-action tree when empty" value={automationId} onChange={(event) => setAutomationId(event.target.value)} /></label>
                    <label><span>Result</span><select value={existingResultId} onChange={(event) => setExistingResultId(event.target.value)}><option value="">Record a new destination</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                    {!existingResultId ? <DestinationFields destination={destination} onChange={setDestination} screens={screens} /> : null}
                    <button className="button-primary" disabled={isBusy || !transitionMeaning.trim() || (!existingResultId && (!destination.name.trim() || !destination.purpose.trim()))} onClick={() => void completeTransition()} type="button">
                      <Record aria-hidden="true" /> Capture transition result
                    </button>
                  </section>
                ) : null}

                {recording.status === 'recording' && screens.length > 1 ? (
                  <details className="local-app-graph-recording-card">
                    <summary>Framework navigation host</summary>
                    <label><span>Name</span><input value={navigationName} onChange={(event) => setNavigationName(event.target.value)} /></label>
                    <label><span>Framework controller</span><select value={selectedNavigationController?.framework ?? ''} onChange={(event) => {
                      const framework = event.target.value
                      const controller = navigationControllers.find((candidate) => candidate.framework === framework)
                      setNavigationFramework(framework)
                      setNavigationTechnologyKind(controller?.kinds.find((kind) => kind.supportsNavigationHost)?.kind ?? '')
                    }}>{navigationControllers.map((controller) => <option key={controller.framework} value={controller.framework}>{controller.label}</option>)}</select></label>
                    <label><span>Technology structure</span><select value={effectiveNavigationTechnologyKind} onChange={(event) => setNavigationTechnologyKind(event.target.value)}>{navigationKinds.map((kind) => <option key={kind.kind} value={kind.kind}>{kind.label}</option>)}</select></label>
                    {selectedNavigationController ? <small className="local-app-graph-technology-evidence">{selectedNavigationController.navigationToolId || 'Visual-tree fallback'} · {selectedNavigationController.structureFingerprint ? `structure ${selectedNavigationController.structureFingerprint.slice(0, 10)}` : 'unfingerprinted fallback'}</small> : null}
                    <label><span>Host destination</span><select value={navigationDestinationId} onChange={(event) => setNavigationDestinationId(event.target.value)}><option value="">Choose…</option>{screens.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                    <label><span>Child screens</span><select multiple value={navigationChildIds} onChange={(event) => setNavigationChildIds(selectedValues(event.currentTarget))}>{screens.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                    <label><span>Initially active child</span><select value={navigationActiveChildId} onChange={(event) => setNavigationActiveChildId(event.target.value)}><option value="">Choose…</option>{navigationChildIds.map((id) => <option key={id} value={id}>{nodes.find((node) => node.id === id)?.name ?? id}</option>)}</select></label>
                    <button disabled={isBusy || !navigationName.trim() || !effectiveNavigationTechnologyKind || !navigationDestinationId || !navigationActiveChildId || navigationChildIds.length === 0} onClick={() => void saveNavigationHost()} type="button">Save {navigationKinds.find((kind) => kind.kind === effectiveNavigationTechnologyKind)?.label ?? 'navigation host'}</button>
                  </details>
                ) : null}

                {recording.status === 'recording' && states.length > 1 ? (
                  <details className="local-app-graph-recording-card">
                    <summary>Framework internal tabs</summary>
                    <label><span>Framework controller</span><select value={selectedTabController?.framework ?? ''} onChange={(event) => {
                      const framework = event.target.value
                      const controller = tabControllers.find((candidate) => candidate.framework === framework)
                      setTabFramework(framework)
                      setTabTechnologyKind(controller?.kinds.find((kind) => kind.supportsTabGroup)?.kind ?? '')
                    }}>{tabControllers.map((controller) => <option key={controller.framework} value={controller.framework}>{controller.label}</option>)}</select></label>
                    <label><span>Technology structure</span><select value={effectiveTabTechnologyKind} onChange={(event) => setTabTechnologyKind(event.target.value)}>{tabKinds.map((kind) => <option key={kind.kind} value={kind.kind}>{kind.label}</option>)}</select></label>
                    <label><span>Containing screen</span><select value={tabParentId} onChange={(event) => setTabParentId(event.target.value)}><option value="">Choose…</option>{screens.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                    <label><span>Tab states</span><select multiple value={tabIds} onChange={(event) => setTabIds(selectedValues(event.currentTarget))}>{states.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                    <label><span>Initially selected</span><select value={selectedTabId} onChange={(event) => setSelectedTabId(event.target.value)}><option value="">Choose…</option>{tabIds.map((id) => <option key={id} value={id}>{nodes.find((node) => node.id === id)?.name ?? id}</option>)}</select></label>
                    <button disabled={isBusy || !effectiveTabTechnologyKind || !tabParentId || !selectedTabId || tabIds.length === 0} onClick={() => void saveTabGroup()} type="button">Save {tabKinds.find((kind) => kind.kind === effectiveTabTechnologyKind)?.label ?? 'tab group'}</button>
                  </details>
                ) : null}

                {recording.gaps.length > 0 ? <div className="local-app-graph-gaps"><small>Before commit</small>{recording.gaps.map((gap) => <span key={gap}><WarningCircle aria-hidden="true" />{gap}</span>)}</div> : null}
                {recording.status === 'review' ? <button className="local-app-graph-recording-cancel" disabled={isBusy} onClick={() => void lifecycle('cancel')} type="button">Cancel this draft</button> : null}
              </aside>

              <main className="local-app-graph-canvas">
                {nodes.length > 0 ? (
                  <AppGraphCanvas
                    definition={recording.definition}
                    onChange={() => {}}
                    onSelectNode={setSelectedNodeId}
                    readOnly
                    selectedNodeId={selectedNodeId ?? recording.currentDestinationId ?? null}
                  />
                ) : (
                  <div className="local-app-graph-empty"><Record aria-hidden="true" /><strong>Record the current screen</strong><span>The local Host will anchor it to the latest screenshot and visual tree.</span></div>
                )}
              </main>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function DestinationFields({
  destination,
  onChange,
  screens,
}: {
  destination: DestinationDraft
  onChange: (value: DestinationDraft) => void
  screens: LocalAppGraphRecording['definition']['nodes']
}) {
  return (
    <>
      <label><span>Kind</span><select value={destination.kind} onChange={(event) => onChange({ ...destination, kind: event.target.value as AppGraphDestinationKind, parentDestinationId: event.target.value === 'state' ? destination.parentDestinationId : '' })}><option value="screen">Screen</option><option value="dialog">Dialog</option><option value="state">Internal state</option></select></label>
      <label><span>Name</span><input placeholder={destination.kind === 'state' ? 'Overview tab' : 'Settings'} value={destination.name} onChange={(event) => onChange({ ...destination, name: event.target.value })} /></label>
      <label><span>Purpose</span><textarea placeholder="What can the user accomplish here?" value={destination.purpose} onChange={(event) => onChange({ ...destination, purpose: event.target.value })} /></label>
      {destination.kind === 'state' ? <label><span>Containing screen</span><select value={destination.parentDestinationId} onChange={(event) => onChange({ ...destination, parentDestinationId: event.target.value })}><option value="">Choose…</option>{screens.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label> : null}
      <label><span>Synonyms</span><input placeholder="Comma separated" value={destination.synonyms} onChange={(event) => onChange({ ...destination, synonyms: event.target.value })} /></label>
    </>
  )
}

function destinationPayload(destination: DestinationDraft, destinationId?: string) {
  return {
    destinationId: destinationId || null,
    kind: destination.kind,
    name: destination.name,
    parentDestinationId: destination.parentDestinationId || null,
    purpose: destination.purpose,
    synonyms: destination.synonyms.split(',').map((value) => value.trim()).filter(Boolean),
  }
}

function technologyPayload(controller: LocalAppGraphNavigationController, kind: string) {
  return {
    framework: controller.framework,
    kind,
    navigationToolId: controller.navigationToolId,
    structureFingerprint: controller.structureFingerprint,
  }
}

function selectedValues(select: HTMLSelectElement): string[] {
  return Array.from(select.selectedOptions, (option) => option.value)
}

function readError(value: unknown): string {
  return value instanceof Error && value.message ? value.message : 'The local Host operation failed.'
}

function Metric({ label, value }: { label: string; value: number }) {
  return <span><strong>{value}</strong><small>{label}</small></span>
}
