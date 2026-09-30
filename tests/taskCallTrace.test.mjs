import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readTaskCallTrace, taskCallPayloadPreview } from '../src/local-replay/taskCallTrace.ts'

function payload(content, wasTruncated = false) {
  return { content, originalCharacterCount: content.length, wasTruncated, sha256: 'test-hash' }
}

function apiCall(overrides = {}) {
  return {
    sequence: 1,
    toolName: 'ansight.getLiveVisualTree',
    startedAtUtc: '2026-09-07T01:02:03.004Z',
    completedAtUtc: '2026-09-07T01:02:03.026Z',
    durationMilliseconds: 22,
    isError: false,
    message: 'Captured tree',
    correlationId: 'task:1',
    arguments: payload('{"sessionId":"session-1"}'),
    result: payload('{"nodes":[]}'),
    ...overrides,
  }
}

test('reads dedicated call inputs, outputs and timings even when the enclosing result is truncated', () => {
  const call = apiCall()
  const trace = readTaskCallTrace({ taskCalls: [call], result: payload('{"result":', true) })
  assert.equal(trace.message, null)
  assert.equal(trace.rows.length, 1)
  assert.deepEqual(trace.rows[0].call, { ...call, childCalls: null })
})

test('keeps an empty dedicated call list authoritative over legacy JSON', () => {
  const trace = readTaskCallTrace({ taskCalls: [], result: payload(JSON.stringify({ toolCalls: [apiCall()] })) })
  assert.deepEqual(trace.rows, [])
  assert.match(trace.message, /did not record any API calls/)
})

test('reads metadata-only older calls from both direct and wrapped task results without fabricating payloads or timestamps', () => {
  const legacyCall = { sequence: 1, toolName: 'app.getState', durationMilliseconds: 9, isError: false, message: 'Read state' }
  for (const result of [{ toolCalls: [legacyCall] }, { isError: false, result: { toolCalls: [legacyCall] } }]) {
    const trace = readTaskCallTrace({ result: payload(JSON.stringify(result)) })
    assert.equal(trace.rows.length, 1)
    assert.equal(trace.rows[0].call.arguments, null)
    assert.equal(trace.rows[0].call.result, null)
    assert.equal(trace.rows[0].call.startedAtUtc, null)
    assert.equal(trace.rows[0].call.durationMilliseconds, 9)
  }
})

test('orders calls by invocation sequence and preserves nested context with distinct row IDs', () => {
  const child = apiCall({ sequence: 1, toolName: 'app.getState' })
  const trace = readTaskCallTrace({ taskCalls: [
    apiCall({ sequence: 2, childCalls: [child] }),
    apiCall({ sequence: 1, childCalls: [apiCall({ sequence: 2 }), child] }),
  ] })
  assert.deepEqual(trace.rows.map((row) => row.sequenceLabel), ['1', '1.1', '1.2', '2', '2.1'])
  assert.deepEqual(trace.rows.map((row) => row.depth), [0, 1, 1, 0, 1])
  assert.equal(new Set(trace.rows.map((row) => row.id)).size, trace.rows.length)
})

test('preserves captured errors, explicit null outputs and payload truncation metadata', () => {
  const result = { ...payload('{"partial":', true), originalCharacterCount: 80_000 }
  const trace = readTaskCallTrace({ taskCalls: [
    apiCall({ isError: true, result }),
    apiCall({ sequence: 2, result: payload('null') }),
  ] })
  assert.equal(trace.rows[0].call.isError, true)
  assert.deepEqual(trace.rows[0].call.result, result)
  assert.equal(taskCallPayloadPreview(trace.rows[1].call.result), 'null')
  assert.match(taskCallPayloadPreview(trace.rows[0].call.result), /^Truncated/)
  assert.equal(taskCallPayloadPreview(null), 'Not recorded')
})

test('reports unreadable legacy results without throwing', () => {
  assert.match(readTaskCallTrace({ result: payload('{"result":', true) }).message, /truncated/)
  assert.match(readTaskCallTrace({ result: payload(JSON.stringify({ truncated: true, prefix: '{"result":' })) }).message, /truncated/)
  assert.match(readTaskCallTrace({ result: payload('not json') }).message, /could not be read/)
  for (const value of [null, [], {}, { result: null }, { result: { toolCalls: 42 } }]) {
    assert.deepEqual(readTaskCallTrace({ result: payload(JSON.stringify(value)) }).rows, [])
  }
})

test('isolates malformed entries and malformed payloads while retaining readable calls', () => {
  const trace = readTaskCallTrace({ taskCalls: [null, {}, apiCall({ arguments: { content: null }, childCalls: [null, apiCall()] })] })
  assert.match(trace.message, /Some saved API call entries could not be read/)
  assert.equal(trace.rows.length, 2)
  assert.equal(trace.rows[0].call.arguments, null)
  assert.equal(trace.rows[1].depth, 1)
})
