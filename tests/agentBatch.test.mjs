import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAgentBatch, readTaskBatchReason } from '../src/local-replay/agentBatch.ts'

test('task and UI batches share trace grouping without grouping individual tasks', () => {
  assert.equal(isAgentBatch('ansight_run_ui_batch'), true)
  assert.equal(isAgentBatch('ansight_run_task_batch'), true)
  assert.equal(isAgentBatch('ansight_run_task'), false)
})

test('task batch decisions remain readable in traces and tolerate missing or truncated payloads', () => {
  const reason = 'Map is open; all inputs are supplied and each task verifies the next prerequisite.'
  assert.equal(readTaskBatchReason('ansight_run_task_batch', JSON.stringify({ reason })), reason)
  assert.equal(readTaskBatchReason('ansight_run_ui_batch', JSON.stringify({ reason })), null)
  for (const content of [undefined, '{', 'null', '{}', '{"reason":5}', '{"reason":"  "}']) {
    assert.equal(readTaskBatchReason('ansight_run_task_batch', content), null)
  }
})
