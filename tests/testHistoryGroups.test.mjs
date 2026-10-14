import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTestHistoryExecutions, groupTestHistoryExecutions, normalizeRunStatus, summarizeTestHistoryCosts } from '../src/local-replay/testHistoryGroups.ts'

const appId = 'com.example.app'
const workspacePath = '/projects/example'
const startedUtc = '2026-10-14T03:00:00Z'

function run(runId, overrides = {}) {
  return {
    runId, appId, workspacePath, startedUtc, completedUtc: startedUtc,
    displayName: 'Open map', testName: 'Open map', testId: 'open-map',
    status: 'succeeded', message: '', sessionId: `session-${runId}`,
    durationMilliseconds: 1200, totalTokens: 50, modelPassCount: 1,
    ansightToolCallCount: 2, filePath: `${runId}.json`, ...overrides,
  }
}

function batch(batchRunId, tests, overrides = {}) {
  return { filePath: `${batchRunId}.json`, audit: {
    batchRunId, workspacePath, startedUtc, status: 'failed', tests: tests.map((test, index) => ({
      index: index + 1, appId, testId: `test-${index}`, testName: `Test ${index}`,
      status: 'succeeded', message: '', durationMilliseconds: 0, totalTokens: 0,
      modelPassCount: 0, ansightToolCallCount: 0, ...test,
    })), ...overrides,
  } }
}

test('batch grouping retains skipped tests and missing audits without counting child runs twice', () => {
  const history = {
    batches: [batch('batch-1', [
      { agentRunId: 'agent-1', testId: 'open-map', testName: 'Open map' },
      { taskRunId: 'task-1', testId: 'copy-location', testName: 'Copy location' },
      { status: 'skipped', testName: 'Skipped after failure' },
      { agentRunId: 'expired-audit', status: 'failed', testName: 'Older audit' },
      { appId: 'com.example.other', agentRunId: 'other-app' },
    ])],
    runs: [run('agent-1', { batchRunId: 'batch-1' }), run('task-1', { batchRunId: 'batch-1', executionKind: 'task' }), run('standalone')],
  }
  const items = buildTestHistoryExecutions(history, appId.toUpperCase())
  assert.equal(items.length, 5)
  const groups = groupTestHistoryExecutions(items, 'batch')
  assert.deepEqual(groups.map((group) => group.items.length), [4, 1])
  assert.deepEqual(groups[0].items.map((item) => item.inspectionRunId), ['agent-1', 'task-1', 'batch-1', 'batch-1'])
  assert.equal(groups[0].items[1].run.executionKind, 'task')
  assert.equal(groups[0].items[2].run.status, 'skipped')
  assert.equal(groups[1].title, 'Standalone runs')
})

test('keeps orphaned batch runs visible and orders batches by batch start, newest first', () => {
  const items = buildTestHistoryExecutions({
    batches: [batch('older', [{ agentRunId: 'older-run' }]), batch('newer', [{ agentRunId: 'newer-run' }], { startedUtc: '2026-10-15T00:00:00Z' })],
    runs: [
      run('older-run', { batchRunId: 'older', startedUtc: '2026-10-16T00:00:00Z' }),
      run('newer-run', { batchRunId: 'newer', startedUtc: '2026-10-15T00:00:00Z' }),
      run('orphan', { batchRunId: 'missing-batch' }),
    ],
  }, appId)
  const groups = groupTestHistoryExecutions(items, 'batch')
  assert.deepEqual(groups.map((group) => group.id), ['batch:newer', 'batch:older', 'batch:missing-batch'])
  assert.equal(groups[2].items[0].inspectionRunId, 'orphan')
  assert.equal(groups[2].batch, undefined)
})

test('test grouping combines repeated executions across batches and standalone history without conflating workspaces', () => {
  const items = buildTestHistoryExecutions({
    batches: [batch('batch-1', [{ agentRunId: 'child', testId: 'open-map', testName: 'Open map' }])],
    runs: [
      run('child', { batchRunId: 'batch-1' }),
      run('standalone', { startedUtc: '2026-10-15T00:00:00Z' }),
      run('different-workspace', { workspacePath: '/projects/other' }),
      run('same-name', { testId: 'different-test' }),
    ],
  }, appId)
  const groups = groupTestHistoryExecutions(items, 'test')
  assert.equal(groups.length, 3)
  assert.deepEqual(groups.find((group) => group.items.length === 2).items.map((item) => item.run.runId), ['standalone', 'child'])
  for (const grouping of ['batch', 'test', 'date', 'outcome', 'none']) {
    const regrouped = groupTestHistoryExecutions(items, grouping).flatMap((group) => group.items.map((item) => item.id))
    assert.equal(regrouped.length, items.length)
    assert.equal(new Set(regrouped).size, items.length)
  }
})

test('search and outcomes address individual batch tests while retaining searchable batch IDs', () => {
  const items = buildTestHistoryExecutions({
    batches: [batch('batch-needle', [
      { agentRunId: 'passed', testName: 'Open map', status: 'passed' },
      { agentRunId: 'failed', testName: 'Copy location', status: 'failed' },
    ])],
    runs: [run('passed'), run('failed')],
  }, appId)
  assert.equal(items.filter((item) => normalizeRunStatus(item.run.status) === 'failed').length, 1)
  assert.equal(items.filter((item) => item.searchText.toLowerCase().includes('copy location')).length, 1)
  assert.equal(items.filter((item) => item.searchText.includes('batch-needle')).length, 2)
  const groups = groupTestHistoryExecutions(items, 'outcome')
  assert.deepEqual(groups.map((group) => group.title), ['Succeeded', 'Failed'])
})

test('date grouping follows local calendar days including timestamps with different offsets', () => {
  const localMorning = new Date(2026, 9, 14, 8).toISOString()
  const localEvening = new Date(2026, 9, 14, 22).toISOString()
  const items = buildTestHistoryExecutions({ batches: [], runs: [
    run('morning', { startedUtc: localMorning }),
    run('evening', { startedUtc: localEvening }),
    run('previous', { startedUtc: new Date(2026, 9, 13, 12).toISOString() }),
    run('unknown', { startedUtc: 'invalid' }),
  ] })
  const groups = groupTestHistoryExecutions(items, 'date')
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.run.runId)), [['evening', 'morning'], ['previous'], ['unknown']])
  assert.equal(groups.at(-1).title, 'Unknown date')
})

test('empty and app-filtered history produces no empty groups', () => {
  assert.deepEqual(buildTestHistoryExecutions(null), [])
  const items = buildTestHistoryExecutions({ batches: [batch('batch', [{ appId: 'other-app' }])], runs: [run('other', { appId: 'other-app' })] }, appId)
  assert.deepEqual(items, [])
  assert.deepEqual(groupTestHistoryExecutions(items, 'batch'), [])
})

test('trace cost totals use recorded customer costs, preserve zero, and report incomplete coverage', () => {
  const summary = summarizeTestHistoryCosts([
    run('current', { calculatedCost: { costMicros: 1200, customerCostMicros: 5000, providerCostMicros: 800, currency: 'USD' } }),
    run('legacy', { calculatedCost: { customerCostMicros: 300, currency: 'usd' } }),
    run('zero', { calculatedCost: { costMicros: 0, currency: 'USD' } }),
    run('missing'),
    run('provider-only', { calculatedCost: { providerCostMicros: 900, currency: 'USD' } }),
  ])
  assert.deepEqual(summary, { totalCount: 5, pricedCount: 3, totals: [{ currency: 'USD', costMicros: 1500 }] })
})

test('trace costs stay separate per currency, are not double-counted, and exclude unusable values', () => {
  const usd = run('usd', { calculatedCost: { costMicros: 2500, currency: 'USD' } })
  const summary = summarizeTestHistoryCosts([
    usd, usd,
    run('aud', { calculatedCost: { costMicros: 8000, currency: 'AUD' } }),
    run('unknown', { calculatedCost: { costMicros: 2000, currency: '' } }),
    run('invalid', { calculatedCost: { costMicros: NaN, currency: 'USD' } }),
    run('negative', { calculatedCost: { costMicros: -10, currency: 'USD' } }),
  ])
  assert.deepEqual(summary, { totalCount: 5, pricedCount: 2, totals: [{ currency: 'AUD', costMicros: 8000 }, { currency: 'USD', costMicros: 2500 }] })
  assert.deepEqual(summarizeTestHistoryCosts([run('unpriced')]).totals, [])
})

test('group and filtered cost summaries use the same deduplicated executions as the visible results', () => {
  const items = buildTestHistoryExecutions({
    batches: [batch('priced-batch', [
      { agentRunId: 'passed', status: 'succeeded' },
      { agentRunId: 'failed', status: 'failed' },
      { status: 'skipped' },
    ])],
    runs: [
      run('passed', { batchRunId: 'priced-batch', calculatedCost: { costMicros: 1000000, currency: 'USD' } }),
      run('failed', { batchRunId: 'priced-batch', calculatedCost: { costMicros: 2000000, currency: 'USD' } }),
    ],
  }, appId)
  const group = groupTestHistoryExecutions(items, 'batch')[0]
  assert.deepEqual(summarizeTestHistoryCosts(group.items.map((item) => item.run)), {
    totalCount: 3, pricedCount: 2, totals: [{ currency: 'USD', costMicros: 3000000 }],
  })
  assert.deepEqual(summarizeTestHistoryCosts(items.filter((item) => item.run.status === 'failed').map((item) => item.run)), {
    totalCount: 1, pricedCount: 1, totals: [{ currency: 'USD', costMicros: 2000000 }],
  })
})
