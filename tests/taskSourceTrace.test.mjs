import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readTaskSources } from '../src/local-replay/taskSourceTrace.ts'
const module = { path: 'tasks/main.ts', language: 'typescript', content: 'const x: number = 1', sha256: 'hash', originalCharacterCount: 19, wasTruncated: false }
const source = { taskId: 'main', modules: [module] }
test('retains dedicated source and composed runs even when result JSON was truncated', () => {
  const entries = readTaskSources({ taskSource: source, taskCalls: [{ sequence: 2, sourceTrace: { ...source, taskId: 'child' }, childCalls: [{ sequence: 1, sourceTrace: source }] }], result: { content: '{' } })
  assert.equal(entries.length, 3)
  assert.deepEqual(entries[0].modules, [module])
  assert.equal(entries[1].taskId, 'child')
  assert.equal(entries[2].invocation, 'Call.2.1')
})
test('reads exported direct and wrapped results, and handles old or malformed traces', () => {
  for (const value of [{ sourceTrace: source }, { result: { sourceTrace: source } }]) {
    assert.equal(readTaskSources({ result: { content: JSON.stringify(value) } })[0].modules[0].content, module.content)
  }
  assert.deepEqual(readTaskSources({ result: { content: '{}' } }), [])
  assert.deepEqual(readTaskSources({ taskSource: { taskId: 'broken', modules: [null, { content: 5 }] } })[0].modules, [])
})
test('retains capture errors and truncation metadata without inventing missing code', () => {
  const entries = readTaskSources({ taskSource: { ...source, captureError: 'Unavailable', modules: [{ ...module, content: '', wasTruncated: true }] } })
  assert.equal(entries[0].captureError, 'Unavailable')
  assert.equal(entries[0].modules[0].content, '')
  assert.equal(entries[0].modules[0].wasTruncated, true)
})
