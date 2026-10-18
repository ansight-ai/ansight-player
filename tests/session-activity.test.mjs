import assert from 'node:assert/strict'
import test from 'node:test'
import { activityOperations, activityOutcome, activityPageWarning } from '../dist/library/replay/sessionActivity.js'

const event = (phase, operationId = 'op', provenance = 'local') => ({
  schema: 'ansight.session-activity/v1', eventId: `${operationId}-${phase}`, operationId, traceId: 'trace',
  runtimeId: 'runtime', phase, timestampUtc: '2026-10-18T02:00:00Z', startedAtUtc: '2026-10-18T01:00:00Z',
  operation: 'session.UpdateMetadata', category: 'session', sessionId: 'session',
  caller: { kind: 'unknown', principalAttribution: 'unknown', executorAttribution: 'unknown', ingress: 'cli' },
  outcome: phase === 'completed' ? 'succeeded' : null, provenance, evidenceIds: [],
})

test('completion wins across pages, duplicates and out of order starts', () => {
  const operations = activityOperations([event('completed'), event('started'), event('completed')])
  assert.equal(operations.length, 1)
  assert.equal(activityOutcome(operations[0]), 'succeeded')
  assert.equal(operations[0].startedAtUtc, '2026-10-18T01:00:00Z')
})

test('uncompleted operations are incomplete and cannot imply success', () => {
  const operations = activityOperations([event('started')])
  assert.equal(activityOutcome(operations[0]), 'incomplete')
  assert.equal(activityOutcome({ ...event('completed'), outcome: null }), 'unknown')
})

test('imported operations cannot complete a local operation with the same ID', () => {
  const operations = activityOperations([event('started'), event('completed', 'op', 'imported')])
  assert.equal(operations.length, 2)
  assert.equal(activityOutcome(operations.find(value => value.provenance === 'local')), 'incomplete')
})

test('corrupt timestamps and missing identity never crash the activity panel', () => {
  assert.deepEqual(activityOperations([{ ...event('completed'), caller: null }, { ...event('started'), startedAtUtc: 'bad' }]), [])
})

test('retention, partial writes and persistence gaps are surfaced separately', () => {
  const warning = activityPageWarning({ records: [], retentionLimited: true, cursorExpired: true, skippedRecords: 2, incompleteTail: true, persistenceError: 'Unable to persist.' })
  for (const fragment of ['expired', '2 unreadable', 'incomplete record', 'Unable to persist.']) assert.match(warning, new RegExp(fragment))
  assert.equal(activityPageWarning({ records: [], retentionLimited: false, cursorExpired: false, skippedRecords: 0, incompleteTail: false }), null)
})
