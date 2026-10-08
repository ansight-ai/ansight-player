import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskDraftTestControls } from '../dist/library/local-replay/TaskDraftTestControls.js'

function controls(status, overrides = {}) {
  return renderToStaticMarkup(createElement(TaskDraftTestControls, {
    status, canTest: true, hasResult: status !== 'idle', isUpdating: false,
    onTest() {}, onCancel() {}, onClear() {}, ...overrides,
  }))
}

test('an active run has cancellation, including when no live session remains selected', () => {
  const html = controls('running', { canTest: false })
  assert.match(html, /Cancel test/)
  assert.doesNotMatch(html, /Clear result/)
  assert.equal((html.match(/disabled=""/g) || []).length, 1)
})

test('cancelling keeps retry and repeated cancellation disabled until the host stops', () => {
  const html = controls('cancelling')
  assert.match(html, /Cancelling…/)
  assert.equal((html.match(/disabled=""/g) || []).length, 2)
  assert.doesNotMatch(html, /Clear result/)
})

for (const status of ['failed', 'error', 'passed', 'cancelled']) {
  test(`${status} can be cleared or retried`, () => {
    const html = controls(status)
    assert.match(html, /Clear result/)
    assert.doesNotMatch(html, /Cancel test|disabled=""/)
  })
}

test('idle without a result only presents the test action', () => {
  assert.doesNotMatch(controls('idle'), /Clear result|Cancel test/)
})
