import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deferredTelemetryReport } from '../src/replay/deferredTelemetry.ts'

const external = (instruments) => ({ customProperties: { appWatch: { id: 'watch' }, instruments } })

test('external watches show recording and processing notices until samples arrive', () => {
  assert.deepEqual(deferredTelemetryReport(external({ status: 'recording' })), {
    status: 'recording',
    title: 'Telemetry is being captured',
    detail: 'It will appear automatically after this session ends.',
  })
  assert.equal(deferredTelemetryReport(external({ status: 'processing' })).title, 'Processing captured telemetry')
  assert.equal(deferredTelemetryReport(external({ status: 'ingested', sampleMetricsIngested: true })), null)
})

test('processing reports actual stages and completed steps, with a fallback for older hosts', () => {
  const report = deferredTelemetryReport(external({ status: 'processing', processingStage: 'exporting-process-samples',
    processingStep: 3, processingStepCount: 5, processingStartedUtc: '2026-09-28T02:39:27Z' }))
  assert.deepEqual(report.progress, { step: 3, total: 5, stage: 'Exporting process samples' })
  assert.equal(report.processingStartedUtc, '2026-09-28T02:39:27Z')
  assert.match(report.detail, /automatically/)
  assert.equal(deferredTelemetryReport(external({ status: 'processing' })).progress, undefined)
  assert.equal(deferredTelemetryReport(external({ status: 'processing', processingStage: 'saving', processingStep: 6, processingStepCount: 5 })).progress, undefined)
})

test('completion removes the status message; failures retain their error', () => {
  const snapshot = { ...external({ status: 'ingested', sampleMetricsIngested: true,
    processingStartedUtc: '2026-09-28T02:39:27Z', completedUtc: '2026-09-28T02:39:45Z' }), totalMetricSampleCount: 230 }
  assert.equal(deferredTelemetryReport(snapshot), null)
  assert.equal(deferredTelemetryReport(external({ status: 'failed', error: 'The export timed out.' })).detail, 'The export timed out.')
})

test('capture failures and empty traces do not promise incoming samples', () => {
  assert.equal(deferredTelemetryReport(external({ status: 'failed' })).title, 'Telemetry capture failed')
  assert.equal(deferredTelemetryReport(external({ status: 'ingested', sampleMetricsIngested: false })).title, 'No telemetry samples were available')
})

test('SDK sessions and watches without Instruments retain the normal empty timeline', () => {
  assert.equal(deferredTelemetryReport({ customProperties: { instruments: { status: 'recording' } } }), null)
  assert.equal(deferredTelemetryReport(external(undefined)), null)
  assert.equal(deferredTelemetryReport(undefined), null)
})
