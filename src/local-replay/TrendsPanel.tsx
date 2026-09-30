import { AppWindow, ArrowClockwise, ArrowSquareOut, CaretRight, ChartLineUp, CircleNotch, MagnifyingGlass, MonitorPlay, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type {
  LocalTrendsHistory,
  LocalTrendsMetricHistoryEntry,
  LocalTrendsChart,
  LocalTrendsHistoryEntry,
  LocalTrendsRebuildResult,
  LocalTrendsSeries,
  LocalRegisteredApp,
  LocalSessionSummary,
} from './types'

type TrendsPanelProps = {
  onClose: () => void
  onOpenSession: (sessionId: string) => void
  sessions: LocalSessionSummary[]
}

const trendsStatusNames = ['Warmup', 'Healthy', 'Regressed', 'Recovered', 'Error', 'Suspect']
const trendsStatusPriority: Record<string, number> = {
  Error: 0,
  Regressed: 1,
  Suspect: 2,
  Warmup: 3,
  Recovered: 4,
  Healthy: 5,
}

type TrendsGroup = {
  id: string
  title: string
  decisionId: string
  series: LocalTrendsSeries[]
}

export function TrendsPanel({
  onClose,
  onOpenSession,
  sessions,
}: TrendsPanelProps) {
  const [apps, setApps] = useState<LocalRegisteredApp[]>([])
  const [selectedAppId, setSelectedAppId] = useState('')
  const [selectedDecisionId, setSelectedDecisionId] = useState('')
  const [trendsQuery, setTrendsQuery] = useState('')
  const [history, setHistory] = useState<LocalTrendsHistory | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null)
  const [isLoadingApps, setIsLoadingApps] = useState(true)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [historyRefreshVersion, setHistoryRefreshVersion] = useState(0)

  useEffect(() => {
    let isMounted = true
    async function loadApps() {
      try {
        const [appsResponse, trendsResponse] = await Promise.all([
          fetch('api/apps', { cache: 'no-store' }),
          fetch('api/trends/history?limit=1', { cache: 'no-store' }),
        ])
        if (!appsResponse.ok || !trendsResponse.ok) {
          throw new Error(`The local host returned HTTP ${!appsResponse.ok ? appsResponse.status : trendsResponse.status}.`)
        }
        const next = await appsResponse.json() as LocalRegisteredApp[]
        const trendsHistory = await trendsResponse.json() as LocalTrendsHistory
        const appIdsWithTrends = new Set((trendsHistory.series ?? []).map((candidate) => candidate.appId))
        if (!isMounted) {
          return
        }
        setApps(next.filter((app) => appIdsWithTrends.has(app.appId)))
      } catch (error) {
        if (isMounted) {
          setMessage(resolveErrorMessage(error, 'Unable to load registered apps.'))
        }
      } finally {
        if (isMounted) {
          setIsLoadingApps(false)
        }
      }
    }
    void loadApps()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedAppId) {
      return
    }

    let isMounted = true
    async function loadHistory() {
      setIsLoadingHistory(true)
      try {
        const query = new URLSearchParams({ appId: selectedAppId, limit: '200' })
        const response = await fetch(`api/trends/history?${query}`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`The local host returned HTTP ${response.status}.`)
        }
        const next = await response.json() as LocalTrendsHistory
        if (!isMounted) {
          return
        }
        setHistory(next)
        setMessage(null)
      } catch (error) {
        if (isMounted) {
          setMessage(resolveErrorMessage(error, 'Unable to load trends history.'))
          setHistory(null)
        }
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false)
        }
      }
    }
    void loadHistory()
    return () => {
      isMounted = false
    }
  }, [selectedAppId, historyRefreshVersion])

  const series = useMemo(() => sortTrendsSeries(history?.series ?? []), [history?.series])
  const trendsGroups = useMemo(() => groupTrendsSeries(series), [series])
  const selectedApp = apps.find((app) => app.appId === selectedAppId)
  const selectedTrendsGroup = trendsGroups.find((group) => group.id === selectedDecisionId)
  const selectedTrends = selectedTrendsGroup ? mergeTrendsGroupEntries(selectedTrendsGroup) : []
  const latestTrends = selectedTrends.at(-1)
  const trendsDisplay = resolveTrendsDisplay(
    selectedTrendsGroup?.decisionId ?? '',
    selectedTrends,
    history?.metrics ?? [],
    selectedTrendsGroup?.series.find((candidate) => candidate.chart)?.chart ?? undefined,
  )
  const summary = summarizeTrendsGroups(trendsGroups)
  const visibleTrendsGroups = useMemo(
    () => filterAndSortTrendsGroups(trendsGroups, trendsQuery),
    [trendsGroups, trendsQuery],
  )
  const sessionsById = useMemo(() => indexSessionsById(sessions), [sessions])

  function showAppsRoot() {
    setSelectedAppId('')
    setSelectedDecisionId('')
    setTrendsQuery('')
    setHistory(null)
    setMessage(null)
    setRebuildMessage(null)
  }

  function openApp(appId: string) {
    setSelectedAppId(appId)
    setSelectedDecisionId('')
    setTrendsQuery('')
    setHistory(null)
    setMessage(null)
    setRebuildMessage(null)
  }

  function openTrends(group: TrendsGroup) {
    setSelectedDecisionId(group.id)
  }

  async function rebuildTrends() {
    if (!selectedApp || isRebuilding) {
      return
    }

    const confirmed = window.confirm(
      `Rebuild ${selectedApp.name} trends history from stored metrics? Existing decisions for this app will be replaced using the current workspace rules.`,
    )
    if (!confirmed) {
      return
    }

    setIsRebuilding(true)
    setMessage(null)
    setRebuildMessage(null)
    try {
      const response = await fetch('api/trends/rebuild', {
        body: JSON.stringify({ appId: selectedApp.appId }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = await response.json() as LocalTrendsRebuildResult | { message?: string }
      if (!response.ok || !('rebuiltHistoryResultCount' in result)) {
        const failureMessage = 'skippedApps' in result
          ? result.skippedApps.find((candidate) => candidate.appId === selectedApp.appId)?.reason
          : result.message
        throw new Error(failureMessage || `The local host returned HTTP ${response.status}.`)
      }

      setRebuildMessage(
        `Rebuilt ${result.rebuiltHistoryResultCount} trends comparison${result.rebuiltHistoryResultCount === 1 ? '' : 's'} from stored metrics and replaced ${result.removedHistoryResultCount}.`,
      )
      setHistoryRefreshVersion((current) => current + 1)
    } catch (error) {
      setMessage(resolveErrorMessage(error, `Unable to rebuild ${selectedApp.name} trends history.`))
    } finally {
      setIsRebuilding(false)
    }
  }

  return (
    <div className="local-trends-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) {
        onClose()
      }
    }}>
      <section aria-label="Trends" className="local-trends-panel">
        <header>
          <div>
            <p className="eyebrow">Trends</p>
          </div>
          <div className="local-trends-header-actions">
            <a className="button button--secondary" href="https://www.ansight.ai/docs/workspace/trends" rel="noopener noreferrer" target="_blank">Trends help <ArrowSquareOut aria-hidden="true" /></a>
            {selectedApp ? (
              <button
                className="local-trends-rebuild-button"
                disabled={isRebuilding}
                onClick={() => void rebuildTrends()}
                title="Recompute this app's trends decisions from stored metrics using its current workspace rules"
                type="button"
              >
                <ArrowClockwise className={isRebuilding ? 'spin' : undefined} aria-hidden="true" />
                {isRebuilding ? 'Rebuilding…' : 'Rebuild trends'}
              </button>
            ) : null}
            <button aria-label="Close Trends" className="local-icon-button" disabled={isRebuilding} onClick={onClose} type="button">
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        <nav aria-label="Trends explorer breadcrumb" className="local-trends-breadcrumb">
          {selectedApp ? <button onClick={showAppsRoot} type="button">Home</button> : <strong>Home</strong>}
          {selectedApp ? <><CaretRight aria-hidden="true" />{selectedTrendsGroup ? (
            <button onClick={() => {
              setSelectedDecisionId('')
            }} type="button">{selectedApp.name}</button>
          ) : <strong>{selectedApp.name}</strong>}</> : null}
          {selectedTrendsGroup ? <><CaretRight aria-hidden="true" /><strong>{selectedTrendsGroup.title}</strong></> : null}
        </nav>

        {selectedApp && !selectedTrendsGroup && !isLoadingHistory && trendsGroups.length > 0 ? (
          <div className="local-trends-toolbar">
            <div>
              <strong>{selectedApp.name}</strong>
              <span>
                {trendsQuery.trim()
                  ? `${visibleTrendsGroups.length} of ${trendsGroups.length} monitors`
                  : `${trendsGroups.length} monitor${trendsGroups.length === 1 ? '' : 's'}`}
              </span>
            </div>
            <label className="local-trends-monitor-search">
              <MagnifyingGlass aria-hidden="true" />
              <input
                aria-label="Search trends by name"
                onChange={(event) => setTrendsQuery(event.target.value)}
                placeholder="Search trends"
                type="search"
                value={trendsQuery}
              />
            </label>
            {summary.errors + summary.regressed + summary.suspect + summary.healthy > 0 ? (
              <div className="local-trends-overview" aria-label="Trends status summary">
                {summary.errors > 0 ? <span><strong>{summary.errors}</strong> errors</span> : null}
                {summary.regressed > 0 ? <span><strong>{summary.regressed}</strong> regressed</span> : null}
                {summary.suspect > 0 ? <span><strong>{summary.suspect}</strong> suspect</span> : null}
                {summary.healthy > 0 ? <span><strong>{summary.healthy}</strong> healthy</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {message ? <p className="inline-message local-trends-message">{message}</p> : null}
        {rebuildMessage ? <p aria-live="polite" className="inline-message local-trends-message local-trends-message--success">{rebuildMessage}</p> : null}
        {!selectedApp ? isLoadingApps ? (
          <div className="local-trends-empty">
            <CircleNotch className="spin" aria-hidden="true" />
            <strong>Loading registered apps</strong>
          </div>
        ) : apps.length > 0 ? (
          <div className="local-trends-app-grid" aria-label="Registered apps">
            {apps.map((app) => (
              <button className="local-trends-app" key={app.appId} onClick={() => openApp(app.appId)} type="button">
                <span className="local-trends-app-icon" aria-hidden="true">
                  <AppWindow />
                  <img
                    alt=""
                    onError={(event) => { event.currentTarget.hidden = true }}
                    src={`api/apps/${encodeURIComponent(app.appId)}/icon`}
                  />
                </span>
                <span className="local-trends-app-copy">
                  <strong>{app.name}</strong>
                  <small>{app.appId}</small>
                  <span>{app.automaticTrendsMonitoringEnabled ? 'Trends monitoring enabled' : 'View trends history'}</span>
                </span>
                <CaretRight aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <div className="local-trends-empty">
            <AppWindow aria-hidden="true" />
            <strong>No apps with trends history</strong>
            <span>An app appears here after its first trends result has been evaluated.</span>
          </div>
        ) : isLoadingHistory ? (
          <div className="local-trends-empty">
            <CircleNotch className="spin" aria-hidden="true" />
            <strong>Loading {selectedApp.name} trends</strong>
          </div>
        ) : selectedTrendsGroup && latestTrends ? (
          <div className="local-trends-layout">
            <main className="local-trends-detail">
              <div className="local-trends-decision">
                <div>
                  <p className="eyebrow">{selectedTrendsGroup.series.some((candidate) => candidate.blocking) ? 'Blocking signal' : 'Monitoring signal'}</p>
                  <h3>{trendsDisplay.title}</h3>
                  <span>{latestTrends.metricKey}</span>
                </div>
                <TrendsStatus status={resolveTrendsGroupStatus(selectedTrendsGroup)} />
              </div>
              <div className="local-trends-decision-values">
                <div><span>Current</span><strong>{formatTrendsValue(latestTrends.currentValue, trendsDisplay)}</strong></div>
                {latestTrends.baselineValue != null ? (
                  <>
                    <div><span>Baseline</span><strong>{formatTrendsValue(latestTrends.baselineValue, trendsDisplay)}</strong></div>
                    <div><span>Change</span><strong>{formatTrendsDelta(latestTrends, trendsDisplay)}</strong></div>
                  </>
                ) : null}
              </div>
              <div className="local-trends-context">
                {combinedTrendsContextLabels(selectedTrends).map((label) => <span key={label}>{label}</span>)}
              </div>
              {resolveTrendsStatus(latestTrends.status) !== 'Warmup' && latestTrends.message ? <p className="local-trends-decision-message">{latestTrends.message}</p> : null}
              <TrendsChart
                entries={selectedTrends}
                display={trendsDisplay}
              />
              <div className="local-trends-history-list">
                {selectedTrends.slice().reverse().slice(0, 20).map((trends) => {
                  const status = resolveTrendsStatus(trends.status)
                  const linkedSession = sessionsById.get(trends.sessionId)
                  return (
                    <article className="local-trends-history-row" key={trendsRunKey(trends)}>
                      <div className="local-trends-history-metric">
                        <strong>{formatTrendsValue(trends.currentValue, trendsDisplay)}</strong>
                        <span>
                          {new Date(trends.evaluatedAtUtc).toLocaleString()}
                          {trends.baselineValue != null ? ` · ${formatTrendsDelta(trends, trendsDisplay)}` : ''}
                        </span>
                      </div>
                      <div className="local-trends-history-provenance">
                        <strong>{formatAppVersion(trends)}</strong>
                        <span>{formatTrendsEnvironment(trends)}</span>
                      </div>
                      <div className="local-trends-history-actions">
                        <button
                          onClick={() => onOpenSession(trends.sessionId)}
                          title={linkedSession
                            ? `Open ${linkedSession.name || linkedSession.clientName} · ${trends.sessionId}`
                            : `Open session ${trends.sessionId}`}
                          type="button"
                        >
                          <MonitorPlay aria-hidden="true" />
                          <span>Session · {linkedSession?.name || linkedSession?.clientName || trends.sessionId.slice(0, 8)}</span>
                        </button>
                      </div>
                      <TrendsStatus status={status} />
                    </article>
                  )
                })}
              </div>
            </main>
          </div>
        ) : trendsGroups.length > 0 ? visibleTrendsGroups.length > 0 ? (
          <div className="local-trends-monitor-list" aria-label={`${selectedApp.name} trends monitors`}>
            {visibleTrendsGroups.map((group) => {
              const combinedTrends = mergeTrendsGroupEntries(group)
              const latest = combinedTrends.at(-1)!
              const display = resolveTrendsDisplay(
                group.decisionId,
                combinedTrends,
                history?.metrics ?? [],
                group.series.find((candidate) => candidate.chart)?.chart ?? undefined,
              )
              return (
                <button className="local-trends-monitor-row" key={group.id} onClick={() => openTrends(group)} type="button">
                  <span className="local-trends-monitor-copy">
                    <strong>{group.title}</strong>
                    <small>{group.decisionId}</small>
                    {/* The metric key only earns a mention when it differs from the decision above it. */}
                    <span>{combinedTrends.length} run{combinedTrends.length === 1 ? '' : 's'}{latest.metricKey !== group.decisionId ? ` · ${latest.metricKey}` : ''}</span>
                  </span>
                  <TrendsSparkline display={display} entries={combinedTrends} />
                  <span className="local-trends-monitor-updated">
                    <strong>{formatTrendsValue(latest.currentValue, display)}</strong>
                    <small>Updated {new Date(latest.evaluatedAtUtc).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                  </span>
                  <TrendsStatus status={resolveTrendsGroupStatus(group)} />
                  <CaretRight aria-hidden="true" />
                </button>
              )
            })}
          </div>
        ) : (
          <div className="local-trends-empty local-trends-empty--filtered">
            <MagnifyingGlass aria-hidden="true" />
            <strong>No matching trends monitors</strong>
            <span>Try a different trends name or decision ID.</span>
          </div>
        ) : (
          <div className="local-trends-empty">
            <ChartLineUp aria-hidden="true" />
            <strong>No trends history yet</strong>
            <span>Results appear after a matching observation span is completed and its metric is evaluated.</span>
          </div>
        )}
      </section>
    </div>
  )
}

function TrendsStatus({ status }: { status: string }) {
  return status === 'Warmup' ? null : (
    <span className={`local-trends-status local-trends-status--${status.toLowerCase()}`}>
      {status}
    </span>
  )
}

function TrendsSparkline({
  display,
  entries,
}: {
  display: TrendsDisplay
  entries: LocalTrendsHistoryEntry[]
}) {
  const width = 180
  const height = 54
  const padding = 5
  const values = entries.map((entry) => entry.currentValue * display.scale)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = Math.max(maximum - minimum, Math.abs(maximum) * 0.02, 1e-9)
  const isFlat = maximum === minimum
  const points = values.map((value, index) => ({
    x: entries.length === 1
      ? width / 2
      : padding + (index / (entries.length - 1)) * (width - padding * 2),
    y: isFlat
      ? height / 2
      : padding + ((maximum - value) / range) * (height - padding * 2),
  }))
  const polylinePoints = points.length === 1
    ? `${padding},${points[0].y} ${width - padding},${points[0].y}`
    : points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPath = points.length > 1
    ? `M ${points[0].x},${height - padding} ${points.map((point) => `L ${point.x},${point.y}`).join(' ')} L ${points.at(-1)!.x},${height - padding} Z`
    : null
  const latestPoint = points.at(-1)!

  return (
    <span className="local-trends-monitor-sparkline">
      <svg
        aria-label={`${display.title} across ${entries.length} run${entries.length === 1 ? '' : 's'}`}
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line className="local-trends-monitor-sparkline-guide" x1={padding} x2={width - padding} y1={height / 2} y2={height / 2} />
        {areaPath ? <path className="local-trends-monitor-sparkline-area" d={areaPath} /> : null}
        <polyline points={polylinePoints} />
        {/* A zero-length round-capped stroke stays a circle when the canvas is stretched to fit. */}
        <path className="local-trends-monitor-sparkline-dot" d={`M ${latestPoint.x} ${latestPoint.y} h 0`} />
      </svg>
    </span>
  )
}

function filterAndSortTrendsGroups(groups: TrendsGroup[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return groups
    .filter((group) => !normalizedQuery || [
      group.title,
      group.decisionId,
      ...group.series.map((candidate) => candidate.metricKey),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
    .sort((left, right) => latestTrendsGroupTimestamp(right) - latestTrendsGroupTimestamp(left)
      || left.title.localeCompare(right.title))
}

function latestTrendsGroupTimestamp(group: TrendsGroup) {
  let latest = 0
  group.series.forEach((series) => {
    series.points.forEach((point) => {
      const timestamp = Date.parse(point.evaluatedAtUtc)
      if (Number.isFinite(timestamp)) {
        latest = Math.max(latest, timestamp)
      }
    })
  })
  return latest
}

function indexSessionsById(sessions: LocalSessionSummary[]) {
  const result = new Map<string, LocalSessionSummary>()
  sessions.forEach((session) => result.set(session.sessionId, session))
  return result
}

function formatAppVersion(trends: LocalTrendsHistoryEntry) {
  const version = trends.appVersion?.trim()
  const build = trends.buildNumber?.trim()
  if (version && build) {
    return `Version ${version} · Build ${build}`
  }
  if (version) {
    return `Version ${version}`
  }
  if (build) {
    return `Build ${build}`
  }
  return 'Version unavailable'
}

function formatTrendsEnvironment(trends: LocalTrendsHistoryEntry) {
  return [
    trends.platform,
    trends.deviceModel,
    trends.operatingSystemMajor ? `OS ${trends.operatingSystemMajor}` : null,
    trends.buildConfiguration,
  ].filter((value): value is string => Boolean(value?.trim())).join(' · ') || 'Environment unavailable'
}

type TrendsChartPoint = {
  x: number
  y: number
  value: number
  entry: LocalTrendsHistoryEntry
  series: 'run' | 'baseline'
}

type TrendsDisplay = {
  title: string
  unit: string
  scale: number
  fractionDigits: number
  minimum?: number
  maximum?: number
  includeZero: boolean
}

type TrendsAxis = {
  minimum: number
  maximum: number
  ticks: number[]
}

function TrendsChart({
  entries,
  display,
}: {
  entries: LocalTrendsHistoryEntry[],
  display: TrendsDisplay,
}) {
  const [activePoint, setActivePoint] = useState<TrendsChartPoint | null>(null)
  const rawValues = entries.flatMap((entry) => entry.baselineValue == null
    ? [entry.currentValue]
    : [entry.currentValue, entry.baselineValue])
  const axis = resolveTrendsAxis(rawValues, display)
  const span = axis.maximum - axis.minimum
  // Runs are discrete events, so they sit at even intervals: spacing them by wall-clock
  // time squashed a cluster of runs into a single slope whenever one landed days later.
  const point = (
    value: number,
    index: number,
    entry: LocalTrendsHistoryEntry,
    series: TrendsChartPoint['series'],
  ) => {
    const x = entries.length === 1 ? 50 : 4 + (index / (entries.length - 1)) * 92
    const scaledValue = value * display.scale
    const position = Math.max(0, Math.min(1, (scaledValue - axis.minimum) / span))
    const y = 88 - position * 76
    return { x, y, value, entry, series }
  }
  const currentPoints = entries.map((entry, index) => point(entry.currentValue, index, entry, 'run'))
  const baselinePoints = entries.flatMap((entry, index) => entry.baselineValue == null
    ? []
    : [point(entry.baselineValue, index, entry, 'baseline')])
  const hasBaseline = baselinePoints.length > 0
  const firstTimestamp = entries[0]?.evaluatedAtUtc
  const lastTimestamp = entries.at(-1)?.evaluatedAtUtc
  const hasTimeRange = firstTimestamp !== lastTimestamp
  const includeDate = hasTimeRange && !timestampsShareDate(firstTimestamp, lastTimestamp)

  return (
    <div className="local-trends-chart">
      <div className="local-trends-chart-heading">
        <div>
          <strong>{display.title}</strong>
          <small>{entries.at(-1)?.metricKey} · {entries.length} run{entries.length === 1 ? '' : 's'}</small>
        </div>
        <span><i />Runs {hasBaseline ? <><i className="local-trends-chart-baseline" />Baseline</> : null}</span>
      </div>
      <div className="local-trends-chart-plot">
        <div aria-hidden="true" className="local-trends-chart-y-axis">
          {axis.ticks.map((tick) => <span key={tick}>{formatDisplayValue(tick, display)}</span>)}
        </div>
        <div className="local-trends-chart-canvas">
          <svg aria-label={`${display.title} across all runs, from ${formatTrendsValue(entries[0].currentValue, display)} to ${formatTrendsValue(entries.at(-1)!.currentValue, display)}`} preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
            <line x1="4" x2="96" y1="12" y2="12" />
            <line x1="4" x2="96" y1="50" y2="50" />
            <line x1="4" x2="96" y1="88" y2="88" />
            {renderChartSeries(baselinePoints, 'local-trends-chart-line local-trends-chart-line--baseline')}
            {renderChartSeries(currentPoints, 'local-trends-chart-line')}
            {renderChartPoints(baselinePoints, 'local-trends-chart-point local-trends-chart-point--baseline', display, setActivePoint)}
            {renderChartPoints(currentPoints, 'local-trends-chart-point', display, setActivePoint)}
          </svg>
          {activePoint ? <ChartTooltip display={display} point={activePoint} /> : null}
        </div>
        <div className={hasTimeRange ? 'local-trends-chart-axis' : 'local-trends-chart-axis local-trends-chart-axis--single'}>
          <span>{formatChartTimestamp(firstTimestamp, includeDate)}</span>
          {hasTimeRange ? <span>{formatChartTimestamp(lastTimestamp, includeDate)}</span> : null}
        </div>
      </div>
    </div>
  )
}

function renderChartSeries(points: TrendsChartPoint[], className: string) {
  if (points.length === 0) {
    return null
  }
  if (points.length === 1) {
    const [{ x, y }] = points
    return <path className={className} d={`M ${x - 0.7} ${y} L ${x + 0.7} ${y}`} />
  }
  return <polyline className={className} points={points.map(({ x, y }) => `${x},${y}`).join(' ')} />
}

function renderChartPoints(
  points: TrendsChartPoint[],
  className: string,
  display: TrendsDisplay,
  onActivePointChange: (point: TrendsChartPoint | null) => void,
) {
  return points.map((point) => (
    <g
      aria-label={`${point.series === 'baseline' ? 'Baseline' : 'Run'}: ${formatTrendsValue(point.value, display)}, ${new Date(point.entry.evaluatedAtUtc).toLocaleString()}`}
      className="local-trends-chart-point-target"
      key={`${point.series}:${point.entry.evaluationId}:${point.entry.evaluatedAtUtc}`}
      onBlur={() => onActivePointChange(null)}
      onFocus={() => onActivePointChange(point)}
      onPointerEnter={() => onActivePointChange(point)}
      onPointerLeave={() => onActivePointChange(null)}
      role="graphics-symbol"
      tabIndex={0}
    >
      <circle cx={point.x} cy={point.y} r="4" />
      <path className={className} d={`M ${point.x} ${point.y} l 0 0.001`} />
    </g>
  ))
}

function ChartTooltip({ display, point }: { display: TrendsDisplay, point: TrendsChartPoint }) {
  const status = resolveTrendsStatus(point.entry.status)
  const horizontalClass = point.x < 18
    ? ' local-trends-chart-tooltip--left'
    : point.x > 82 ? ' local-trends-chart-tooltip--right' : ''
  const verticalClass = point.y < 32 ? ' local-trends-chart-tooltip--below' : ''
  return (
    <div
      className={`local-trends-chart-tooltip${horizontalClass}${verticalClass}`}
      role="tooltip"
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
    >
      <strong>{point.series === 'baseline' ? 'Baseline' : 'Run'} · {formatTrendsValue(point.value, display)}</strong>
      <span>{new Date(point.entry.evaluatedAtUtc).toLocaleString()}</span>
      <small>{formatHistoryContext(point.entry)}{status === 'Warmup' ? null : ` · ${status}`}</small>
    </div>
  )
}

function sortTrendsSeries(series: LocalTrendsSeries[]) {
  return series.slice().sort((left, right) => {
    const statusOrder = (trendsStatusPriority[resolveTrendsStatus(left.latestStatus)] ?? 6)
      - (trendsStatusPriority[resolveTrendsStatus(right.latestStatus)] ?? 6)
    if (statusOrder !== 0) {
      return statusOrder
    }
    return Date.parse(right.points.at(-1)?.evaluatedAtUtc ?? '')
      - Date.parse(left.points.at(-1)?.evaluatedAtUtc ?? '')
  })
}

function groupTrendsSeries(series: LocalTrendsSeries[]): TrendsGroup[] {
  const groups = new Map<string, LocalTrendsSeries[]>()
  series.forEach((candidate) => {
    const id = candidate.decisionId.trim().toLowerCase()
    groups.set(id, [...groups.get(id) ?? [], candidate])
  })

  return [...groups.entries()]
    .map(([id, candidates]) => ({
      id,
      title: resolveTrendsTitle(candidates[0].decisionId, candidates[0].chart ?? undefined),
      decisionId: candidates[0].decisionId,
      series: sortTrendsSeries(candidates),
    }))
    .sort((left, right) => {
      const statusOrder = (trendsStatusPriority[resolveTrendsGroupStatus(left)] ?? 6)
        - (trendsStatusPriority[resolveTrendsGroupStatus(right)] ?? 6)
      return statusOrder || left.title.localeCompare(right.title)
    })
}

function mergeTrendsGroupEntries(group: TrendsGroup) {
  const entriesByRun = new Map<string, LocalTrendsHistoryEntry[]>()
  group.series.forEach((series) => {
    series.points.forEach((entry) => {
      const key = trendsRunKey(entry)
      entriesByRun.set(key, [...entriesByRun.get(key) ?? [], entry])
    })
  })

  return [...entriesByRun.values()]
    .map(mergeTrendsRunEntries)
    .sort((left, right) => {
      const timeOrder = Date.parse(left.evaluatedAtUtc) - Date.parse(right.evaluatedAtUtc)
      return timeOrder || left.evaluationId.localeCompare(right.evaluationId)
    })
}

function mergeTrendsRunEntries(entries: LocalTrendsHistoryEntry[]) {
  const representative = entries.slice().sort((left, right) => trendsEntryInformationScore(right) - trendsEntryInformationScore(left))[0]
  const worstStatus = entries
    .map((entry) => resolveTrendsStatus(entry.status))
    .sort((left, right) => (trendsStatusPriority[left] ?? 6) - (trendsStatusPriority[right] ?? 6))[0]
    ?? resolveTrendsStatus(representative.status)

  return {
    ...representative,
    status: worstStatus,
    blocking: entries.some((entry) => entry.blocking),
    baselineRunCount: Math.max(...entries.map((entry) => entry.baselineRunCount)),
    minimumBaselineRunCount: Math.max(...entries.map((entry) => entry.minimumBaselineRunCount)),
  }
}

function trendsEntryInformationScore(entry: LocalTrendsHistoryEntry) {
  return (entry.baselineValue == null ? 0 : 10_000)
    + entry.baselineRunCount * 100
    + (entry.relativeDeltaPercent == null && entry.absoluteDelta == null ? 0 : 10)
    + (entry.message.trim() ? 1 : 0)
}

function trendsRunKey(entry: LocalTrendsHistoryEntry) {
  return [
    entry.evaluationId,
    entry.metricKey,
    normalizeSpanGroup(entry.spanGroup),
  ].join('\u001f')
}

function resolveTrendsGroupStatus(group: TrendsGroup) {
  return group.series
    .map((candidate) => resolveTrendsStatus(candidate.latestStatus))
    .sort((left, right) => (trendsStatusPriority[left] ?? 6) - (trendsStatusPriority[right] ?? 6))[0]
    ?? 'Unknown'
}

function summarizeTrendsGroups(groups: TrendsGroup[]) {
  return groups.reduce((summary, group) => {
    const status = resolveTrendsGroupStatus(group)
    if (status === 'Error') {
      summary.errors += 1
    } else if (status === 'Regressed') {
      summary.regressed += 1
    } else if (status === 'Suspect') {
      summary.suspect += 1
    } else if (status === 'Healthy' || status === 'Recovered') {
      summary.healthy += 1
    }
    return summary
  }, { errors: 0, regressed: 0, suspect: 0, healthy: 0 })
}

function combinedTrendsContextLabels(entries: LocalTrendsHistoryEntry[]) {
  return [
    `${entries.length} run${entries.length === 1 ? '' : 's'}`,
    commonTrendsValue(entries, (entry) => entry.appVersion),
    commonTrendsValue(entries, (entry) => entry.spanGroup, (value) => `Group: ${value}`),
    commonTrendsValue(entries, (entry) => entry.platform),
    commonTrendsValue(entries, (entry) => entry.deviceModel),
    commonTrendsValue(entries, (entry) => entry.operatingSystemMajor, (value) => `OS ${value}`),
    commonTrendsValue(entries, (entry) => entry.buildConfiguration),
    commonTrendsValue(entries, (entry) => entry.buildNumber, (value) => `Build ${value}`),
  ].filter((value): value is string => Boolean(value))
}

function commonTrendsValue(
  entries: LocalTrendsHistoryEntry[],
  select: (entry: LocalTrendsHistoryEntry) => string | null | undefined,
  format: (value: string) => string = (value) => value,
) {
  const values = [...new Set(entries.map(select).map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
  return values.length === 1 ? format(values[0]) : null
}

function normalizeSpanGroup(value?: string | null) {
  return value?.trim() ?? ''
}

function resolveTrendsStatus(status: string | number) {
  return typeof status === 'number' ? trendsStatusNames[status] ?? 'Unknown' : status
}

function formatHistoryContext(trends: LocalTrendsHistoryEntry) {
  return [
    trends.appVersion ?? 'Unknown version',
    trends.platform,
    trends.deviceModel,
    trends.spanGroup,
  ].filter((value): value is string => Boolean(value?.trim())).join(' · ')
}

function resolveTrendsDisplay(
  decisionId: string,
  entries: LocalTrendsHistoryEntry[],
  metrics: LocalTrendsMetricHistoryEntry[],
  chart?: LocalTrendsChart,
): TrendsDisplay {
  const metricKey = entries.at(-1)?.metricKey ?? chart?.metricKey ?? ''
  const rawUnit = resolveMetricUnit(entries, metrics, metricKey)
  const sourceUnit = resolveSourceUnit(rawUnit, metricKey)
  const values = entries.flatMap((entry) => entry.baselineValue == null
    ? [entry.currentValue]
    : [entry.currentValue, entry.baselineValue])
  const automatic = resolveAutomaticUnit(sourceUnit, values)
  const configuredUnit = chart?.yAxis.unit?.trim()
  const unit = configuredUnit || automatic.unit
  const conversionScale = configuredUnit
    ? resolveUnitConversionScale(sourceUnit, configuredUnit)
    : null
  const scale = chart?.yAxis.scale ?? conversionScale ?? automatic.scale
  const scaledValues = values.map((value) => value * scale)
  return {
    title: resolveTrendsTitle(decisionId, chart),
    unit,
    scale,
    fractionDigits: chart?.yAxis.fractionDigits
      ?? resolveFractionDigits(unit, scaledValues),
    minimum: chart?.yAxis.minimum ?? undefined,
    maximum: chart?.yAxis.maximum ?? undefined,
    includeZero: chart?.yAxis.includeZero ?? automatic.includeZero,
  }
}

function resolveTrendsTitle(decisionId: string, chart?: LocalTrendsChart) {
  if (chart?.title?.trim()) {
    return chart.title.trim()
  }
  const words = decisionId
    .replace(/[-_.]+regression$/i, '')
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((word) => formatTitleWord(word))
  const title = words.join(' ')
  return title ? `${title.charAt(0).toUpperCase()}${title.slice(1)}` : 'Trends metric'
}

function formatTitleWord(word: string) {
  switch (word.toLowerCase()) {
    case '3d': return '3D'
    case 'fps': return 'FPS'
    case 'cpu': return 'CPU'
    case 'gpu': return 'GPU'
    case 'ios': return 'iOS'
    case 'mib': return 'MiB'
    case 'ms': return 'ms'
    default: return word.toLowerCase()
  }
}

function resolveMetricUnit(
  entries: LocalTrendsHistoryEntry[],
  metrics: LocalTrendsMetricHistoryEntry[],
  metricKey: string,
) {
  const latestEvaluationId = entries.at(-1)?.evaluationId
  const exact = metrics.find((metric) =>
    metric.evaluationId === latestEvaluationId
      && metric.metricKey === metricKey)
  const fallback = metrics.find((metric) => metric.metricKey === metricKey)
  return exact?.unit?.trim() || entries.at(-1)?.unit?.trim() || fallback?.unit?.trim() || ''
}

function resolveSourceUnit(rawUnit: string, metricKey: string) {
  return normalizeUnit(rawUnit) === 'value' || !rawUnit
    ? inferUnitFromMetricKey(metricKey)
    : rawUnit
}

function resolveAutomaticUnit(sourceUnit: string, values: number[]) {
  const normalized = normalizeUnit(sourceUnit)
  const maximumMagnitude = Math.max(0, ...values.map((value) => Math.abs(value)))
  switch (normalized) {
    case 'ratio':
      return { unit: '%', scale: 100, includeZero: true }
    case 'byte':
    case 'bytes':
      if (maximumMagnitude >= 1024 ** 3) {
        return { unit: 'GiB', scale: 1 / (1024 ** 3), includeZero: true }
      }
      if (maximumMagnitude >= 1024 ** 2) {
        return { unit: 'MiB', scale: 1 / (1024 ** 2), includeZero: true }
      }
      if (maximumMagnitude >= 1024) {
        return { unit: 'KiB', scale: 1 / 1024, includeZero: true }
      }
      return { unit: 'B', scale: 1, includeZero: true }
    case 'millisecond':
    case 'milliseconds':
    case 'ms':
      return { unit: 'ms', scale: 1, includeZero: true }
    case 'second':
    case 'seconds':
    case 's':
      return { unit: 's', scale: 1, includeZero: true }
    case 'fps':
      return { unit: 'fps', scale: 1, includeZero: true }
    case 'percent':
    case 'percentage':
    case '%':
      return { unit: '%', scale: 1, includeZero: true }
    case 'mib':
      return { unit: 'MiB', scale: 1, includeZero: true }
    case 'mib/s':
    case 'mibpersecond':
      return { unit: 'MiB/s', scale: 1, includeZero: true }
    case 'count':
      return { unit: 'count', scale: 1, includeZero: true }
    default:
      return { unit: sourceUnit === 'value' ? '' : sourceUnit, scale: 1, includeZero: false }
  }
}

function inferUnitFromMetricKey(metricKey: string) {
  const normalized = metricKey.toLowerCase()
  if (/(^|[.\-_])(duration|latency|elapsed)([.\-_]|$)/.test(normalized)
    && /(^|[.\-_])ms($|[.\-_])/.test(normalized)) {
    return 'ms'
  }
  if (/(^|[.\-_])fps($|[.\-_])/.test(normalized)) {
    return 'fps'
  }
  if (/(^|[.\-_])(ratio|rate)($|[.\-_])/.test(normalized)) {
    return 'ratio'
  }
  if (normalized.includes('mib-per-second') || normalized.includes('mib-second')) {
    return 'MiB/s'
  }
  if (/(^|[.\-_])mib($|[.\-_])/.test(normalized)) {
    return 'MiB'
  }
  if (/(^|[.\-_])bytes?($|[.\-_])/.test(normalized)) {
    return 'bytes'
  }
  if (/(^|[.\-_])(percent|percentage)($|[.\-_])/.test(normalized)) {
    return '%'
  }
  return ''
}

function normalizeUnit(unit: string) {
  return unit.trim().toLowerCase().replaceAll(' ', '')
}

function resolveUnitConversionScale(sourceUnit: string, targetUnit: string) {
  const source = normalizeUnit(sourceUnit)
  const target = normalizeUnit(targetUnit)
  if (source === target) {
    return 1
  }
  if (source === 'ms' && (target === 's' || target === 'second' || target === 'seconds')) {
    return 0.001
  }
  if ((source === 's' || source === 'second' || source === 'seconds') && target === 'ms') {
    return 1000
  }
  if (source === 'ratio' && (target === '%' || target === 'percent' || target === 'percentage')) {
    return 100
  }
  const byteScales: Record<string, number> = {
    b: 1,
    byte: 1,
    bytes: 1,
    kib: 1 / 1024,
    mib: 1 / (1024 ** 2),
    gib: 1 / (1024 ** 3),
  }
  if (source in byteScales && target in byteScales) {
    return byteScales[target] / byteScales[source]
  }
  return null
}

function resolveFractionDigits(unit: string, values: number[]) {
  const normalized = normalizeUnit(unit)
  const allIntegers = values.every((value) => Number.isInteger(value))
  if (normalized === 'count') {
    return 0
  }
  if (normalized === 'fps') {
    return allIntegers ? 0 : 1
  }
  if (normalized === 'ms') {
    return allIntegers ? 0 : 1
  }
  if (normalized === 's') {
    return 2
  }
  if (normalized === '%' || normalized === 'mib' || normalized === 'gib' || normalized === 'kib') {
    return 1
  }
  if (normalized === 'mib/s') {
    return 2
  }
  return allIntegers ? 0 : 3
}

function resolveTrendsAxis(values: number[], display: TrendsDisplay): TrendsAxis {
  const scaledValues = values.map((value) => value * display.scale)
  const dataMinimum = Math.min(...scaledValues)
  const dataMaximum = Math.max(...scaledValues)
  let targetMinimum = display.minimum ?? dataMinimum
  let targetMaximum = display.maximum ?? dataMaximum
  if (display.includeZero && display.minimum == null && targetMinimum > 0) {
    targetMinimum = 0
  }
  if (display.includeZero && display.maximum == null && targetMaximum < 0) {
    targetMaximum = 0
  }
  if (targetMaximum <= targetMinimum) {
    const padding = Math.max(Math.abs(targetMaximum) * 0.1, 1)
    if (display.minimum == null) {
      targetMinimum -= padding
    }
    if (display.maximum == null) {
      targetMaximum += padding
    }
  }

  const rawStep = Math.max((targetMaximum - targetMinimum) / 2, Number.EPSILON)
  const step = niceNumber(rawStep)
  const minimum = display.minimum ?? Math.floor(targetMinimum / step) * step
  const maximum = display.maximum ?? Math.ceil(targetMaximum / step) * step
  const safeMaximum = maximum > minimum ? maximum : minimum + step * 2
  return {
    minimum,
    maximum: safeMaximum,
    ticks: [safeMaximum, minimum + ((safeMaximum - minimum) / 2), minimum],
  }
}

function niceNumber(value: number) {
  const exponent = Math.floor(Math.log10(value))
  const magnitude = 10 ** exponent
  const normalized = value / magnitude
  const factor = normalized <= 1.5
    ? 1
    : normalized <= 2.25
      ? 2
      : normalized <= 3.5
        ? 2.5
        : normalized <= 7.5
          ? 5
          : 10
  return factor * magnitude
}

function formatTrendsValue(value: number, display: TrendsDisplay) {
  return formatDisplayValue(value * display.scale, display)
}

function formatTrendsDelta(trends: LocalTrendsHistoryEntry, display: TrendsDisplay) {
  if (trends.relativeDeltaPercent != null) {
    const prefix = trends.relativeDeltaPercent > 0 ? '+' : ''
    return `${prefix}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(trends.relativeDeltaPercent)}%`
  }
  if (trends.absoluteDelta != null) {
    const scaled = trends.absoluteDelta * display.scale
    const prefix = scaled > 0 ? '+' : ''
    return `${prefix}${formatDisplayValue(scaled, display)}`
  }
  return '—'
}

function formatDisplayValue(value: number, display: TrendsDisplay) {
  const number = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: display.fractionDigits,
    maximumFractionDigits: display.fractionDigits,
  }).format(value)
  if (!display.unit) {
    return number
  }
  return display.unit === '%' ? `${number}%` : `${number} ${display.unit}`
}

function formatChartTimestamp(value?: string, includeDate = false) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  return includeDate
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
    : date.toLocaleTimeString(undefined, { timeStyle: 'medium' })
}

function timestampsShareDate(first?: string, last?: string) {
  if (!first || !last) {
    return true
  }
  const firstDate = new Date(first)
  const lastDate = new Date(last)
  return firstDate.getFullYear() === lastDate.getFullYear()
    && firstDate.getMonth() === lastDate.getMonth()
    && firstDate.getDate() === lastDate.getDate()
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
