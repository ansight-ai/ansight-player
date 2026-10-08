import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summariseLocalAnnotation } from '../dist/library/local-replay/annotationSummary.js'

const options = { startUtc: '2026-10-08T02:00:10Z', endUtc: '2026-10-08T02:00:20Z', reasoning: 'deep' }

test('section summary sends the selected bounds and reasoning, streams progress, and returns an editable comment', async context => {
  const requests = []
  context.mock.method(globalThis, 'fetch', async (url, request) => {
    requests.push({ url, ...request })
    return new Response([
      JSON.stringify({ status: 'running', progress: { message: 'Analyzing screenshots…' } }),
      JSON.stringify({ status: 'success', result: { isSuccess: true, comment: 'In this section, the tester searched.\n\n1. Entered "Approach".' } }),
    ].join('\n'), { headers: { 'Content-Type': 'application/x-ndjson' } })
  })
  const progress = []
  const comment = await summariseLocalAnnotation('session/one', options, item => progress.push(item.message))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'api/sessions/session%2Fone/annotation-summary')
  assert.equal(requests[0].method, 'POST')
  assert.deepEqual(JSON.parse(requests[0].body), options)
  assert.deepEqual(progress, ['Analyzing screenshots…'])
  assert.equal(comment, 'In this section, the tester searched.\n\n1. Entered "Approach".')
})

test('section summary accepts a JSON response and rejects empty results and host errors', async context => {
  const responses = [
    Response.json({ isSuccess: true, comment: ' Summary ' }),
    Response.json({ isSuccess: true, comment: ' ' }),
    Response.json({ isSuccess: false, message: 'No evidence in this section.' }, { status: 400 }),
    new Response('{"status":"error","message":"Analysis failed."}\n', { headers: { 'Content-Type': 'application/x-ndjson' } }),
  ]
  context.mock.method(globalThis, 'fetch', async () => responses.shift())
  assert.equal(await summariseLocalAnnotation('session', options, () => {}), 'Summary')
  await assert.rejects(summariseLocalAnnotation('session', options, () => {}), /empty annotation/)
  await assert.rejects(summariseLocalAnnotation('session', options, () => {}), /No evidence/)
  await assert.rejects(summariseLocalAnnotation('session', options, () => {}), /Analysis failed/)
})
