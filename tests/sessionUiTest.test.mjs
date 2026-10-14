import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSessionUiTest, sessionDisplayTitle } from '../src/replay/sessionUiTest.ts'

test('test sessions show the test name and normalize the persisted outcome', () => {
  const customProperties = { 'ui-test': { testName: ' Checkout ', testId: 'checkout', runId: 'run-1', batchRunId: 'batch-1', status: 'succeeded' } }
  assert.equal(sessionDisplayTitle({ customProperties, clientName: 'Shop' }), 'Checkout')
  assert.deepEqual(readSessionUiTest(customProperties), {
    testName: 'Checkout', testId: 'checkout', runId: 'run-1', batchRunId: 'batch-1', status: 'passed',
  })
  for (const status of ['running', 'failed', 'cancelled', 'skipped']) {
    assert.equal(readSessionUiTest({ 'ui-test': { testId: 'checkout', status } }).status, status)
  }
})

test('old sessions and malformed properties retain the ordinary session title', () => {
  for (const customProperties of [undefined, null, [], {}, { 'ui-test': [] }, { 'ui-test': { testName: 42 } }]) {
    assert.equal(readSessionUiTest(customProperties), null)
    assert.equal(sessionDisplayTitle({ customProperties, name: 'Saved recording', clientName: 'Shop' }), 'Saved recording')
  }
  assert.equal(sessionDisplayTitle({ name: ' ', appName: 'Shop' }), 'Shop')
})

test('missing names fall back to test IDs and unknown statuses never imply success', () => {
  const run = readSessionUiTest({ 'ui-test': { testId: 'checkout', status: 'future-status', runId: 123 } })
  assert.equal(run.testName, 'checkout')
  assert.equal(run.status, 'unknown')
  assert.equal(run.runId, null)
})
