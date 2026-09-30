import type { SessionSnapshot } from './sessionViewerData'

export type DeferredTelemetryReport = {
  title: string
  detail: string
  status: 'recording' | 'processing' | 'failed' | 'empty'
  processingStartedUtc?: string
  progress?: { step: number; total: number; stage: string }
}

const processingStages: Record<string, string> = {
  stopping: 'Finalizing the recording',
  'preparing-trace': 'Preparing the captured trace',
  'exporting-metadata': 'Exporting trace metadata',
  'exporting-process-samples': 'Exporting process samples',
  'building-telemetry': 'Building telemetry charts',
  'recovering-process-samples': 'Recovering process samples from the trace',
  saving: 'Saving telemetry and capture artifacts',
}

export function deferredTelemetryReport(snapshot: SessionSnapshot | undefined): DeferredTelemetryReport | null {
  if (!snapshot?.customProperties?.appWatch) return null
  const instruments = snapshot.customProperties.instruments
  const status = instruments?.status
  if (status === 'recording') return {
    status: 'recording',
    title: 'Telemetry is being captured',
    detail: 'It will appear automatically after this session ends.',
  }
  if (status === 'processing') {
    const step = instruments?.processingStep
    const total = instruments?.processingStepCount
    const stage = typeof instruments?.processingStage === 'string' ? processingStages[instruments.processingStage] : undefined
    const progress = stage && typeof step === 'number' && Number.isInteger(step)
      && typeof total === 'number' && Number.isInteger(total) && step >= 1 && step <= total && total <= 20
      ? { step, total, stage } : undefined
    return {
      status: 'processing',
      title: 'Processing captured telemetry',
      detail: progress ? `${progress.stage}. Telemetry will appear automatically.` : 'It will appear automatically when processing finishes.',
      processingStartedUtc: typeof instruments?.processingStartedUtc === 'string' ? instruments.processingStartedUtc : undefined,
      progress,
    }
  }
  if (status === 'failed') return {
    status: 'failed',
    title: 'Telemetry capture failed',
    detail: typeof instruments?.error === 'string' && instruments.error.trim()
      ? instruments.error : 'Screenshots and timeline markers are still available.',
  }
  if (status === 'ingested' && instruments?.sampleMetricsIngested === false) return {
    status: 'empty',
    title: 'No telemetry samples were available',
    detail: 'The captured Instruments trace is available in Artifacts.',
  }
  return null
}
