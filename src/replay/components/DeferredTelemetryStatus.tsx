import { useEffect, useState } from 'react'
import { CircleNotch, Record, WarningCircle } from '@phosphor-icons/react'
import type { DeferredTelemetryReport } from '../deferredTelemetry'

export function DeferredTelemetryStatus({ report }: { report: DeferredTelemetryReport | null }) {
  const [now, setNow] = useState(Date.now)
  const isProcessing = report?.status === 'processing'
  useEffect(() => {
    if (!isProcessing) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isProcessing])
  if (!report) return null
  const started = report.processingStartedUtc ? Date.parse(report.processingStartedUtc) : NaN
  const elapsed = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null
  const Icon = isProcessing ? CircleNotch : report.status === 'recording' ? Record : WarningCircle
  return (
    <section className={`deferred-telemetry-status deferred-telemetry-status--${report.status}`} aria-label="Telemetry capture status">
      <Icon aria-hidden="true" className={isProcessing ? 'spin' : undefined} />
      <div className="deferred-telemetry-status-body">
        <div role="status" aria-live="polite" aria-atomic="true">
          <strong>{report.title}</strong>
          <p>{report.detail}</p>
        </div>
        {isProcessing ? (
          <>
            <span className="deferred-telemetry-status-meta">
              {report.progress ? `Step ${report.progress.step} of ${report.progress.total}` : 'Processing'}
              {elapsed !== null ? ` · ${elapsed}s elapsed` : ''}
            </span>
            <progress aria-label="Telemetry processing progress"
              aria-valuetext={report.progress ? `Step ${report.progress.step} of ${report.progress.total}: ${report.progress.stage}` : 'Processing captured telemetry'}
              max={report.progress?.total ?? 1} value={report.progress ? report.progress.step - 1 : undefined} />
          </>
        ) : null}
      </div>
    </section>
  )
}
