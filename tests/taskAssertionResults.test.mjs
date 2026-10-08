import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskAssertionResults } from '../dist/library/local-replay/TaskAssertionResults.js'

test('shows assertion counts and opens the failing comparison with both values', () => {
  const html = renderToStaticMarkup(createElement(TaskAssertionResults, { trace: {
    message: null,
    rows: [
      { id: '0', taskPath: '', assertion: { assertionId: 'ready', passed: true, matcher: 'expect.toBe', expected: true, actual: true } },
      { id: '1', taskPath: '2', assertion: { assertionId: 'clipboard', passed: false, matcher: 'expect.toEqual', message: 'Clipboard matches the card', expected: '-33.56641', actual: '-33.56' } },
    ],
  } }))
  assert.match(html, /2 checked · 1 passed · 1 failed/)
  assert.equal((html.match(/open=""/g) ?? []).length, 1)
  assert.match(html, /Expected/)
  assert.match(html, /Actual/)
  assert.match(html, /-33.56641/)
  assert.match(html, /-33.56/)
  assert.match(html, /Nested task call 2/)
})

test('distinguishes unavailable legacy values from a recorded null comparison', () => {
  const html = renderToStaticMarkup(createElement(TaskAssertionResults, { trace: {
    message: null,
    rows: [{ id: '0', taskPath: '', assertion: { assertionId: 'legacy', passed: false, actual: null } }],
  } }))
  assert.equal((html.match(/Not recorded in this trace\./g) ?? []).length, 1)
  assert.match(html, /<pre>null<\/pre>/)
})
