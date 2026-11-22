import { localAnnotationTranscription } from '../dist/library/local-replay/annotationTranscription.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localAnnotationAgents, isDeliveryPending } from '../dist/library/local-replay/annotationAgentDelivery.js'

test('discovery and status are read-only, scoped and URL encoded', async context => {
  const calls = []
  context.mock.method(globalThis, 'fetch', async (...args) => { calls.push(args); return Response.json({ isSuccess: true }) })
  await localAnnotationAgents.catalog('session/one', 'claude', '/work tree')
  await localAnnotationAgents.status('session/one', 'delivery-one')
  assert.equal(calls[0][0], 'api/sessions/session%2Fone/annotation-agents/catalog?provider=claude&projectId=%2Fwork+tree')
  assert.equal(calls[1][0], 'api/sessions/session%2Fone/annotation-agents/status?submissionId=delivery-one')
  assert.equal(calls[0][1].cache, 'no-store')
})
test('send preserves idempotency key and destination and never retries a transport failure', async context => {
  let calls = 0
  const request = { submissionId: 'delivery-one', annotationId: 'note-one', provider: 'codex', projectId: 'project-one', chatSessionId: 'chat-one', startNewTask: false }
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++
    assert.equal(url, 'api/sessions/session/annotation-agents/send')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), request)
    throw new Error('Connection dropped')
  })
  await assert.rejects(localAnnotationAgents.send('session', request), /Connection dropped/)
  assert.equal(calls, 1)
})
test('host errors retain actionable text and uncertain delivery is not reported as running', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Install Claude Code' }, { status: 400 }))
  await assert.rejects(localAnnotationAgents.catalog('session', 'claude'), /Install Claude Code/)
  assert.equal(isDeliveryPending('needs_attention'), false)
  assert.equal(isDeliveryPending('queued'), true)
  assert.equal(isDeliveryPending('running'), true)
  assert.equal(isDeliveryPending('ready_for_review'), false)
})

test('queued delivery uses the explicit queue endpoint and preserves its destination', async context => {
  const request = { submissionId: 'queued-one', annotationId: 'note-one', provider: 'codex', projectId: 'project-one', chatSessionId: 'chat-one', startNewTask: false, queueAfterCurrent: true }
  let calls = 0
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++
    assert.equal(url, 'api/sessions/session/annotation-agents/queue')
    assert.deepEqual(JSON.parse(options.body), request)
    return Response.json({ isSuccess: true, status: 'queued' })
  })
  assert.equal((await localAnnotationAgents.send('session', request)).status, 'queued')
  assert.equal(calls, 1)
})

test('an older host cannot silently turn a queue request into an immediate send', async context => {
  const paths = []
  context.mock.method(globalThis, 'fetch', async url => { paths.push(url); return new Response('', { status: 404 }) })
  await assert.rejects(localAnnotationAgents.send('session', { queueAfterCurrent: true }), /HTTP 404/)
  assert.deepEqual(paths, ['api/sessions/session/annotation-agents/queue'])
})


test('voice transcription sends audio only to the local host with cancellation', async context => {
  const audio = new Blob(['recorded audio'], { type: 'audio/webm;codecs=opus' })
  const controller = new AbortController()
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'api/sessions/session%2Fone/annotation-transcription')
    assert.equal(options.body, audio)
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['Content-Type'], audio.type)
    assert.equal(options.signal, controller.signal)
    return Response.json({ text: 'Fix this button.' })
  })
  assert.deepEqual(await localAnnotationTranscription.transcribe('session/one', audio, controller.signal), { text: 'Fix this button.' })
})

test('voice preflight reports an old host before microphone capture', async context => {
  context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }))
  await assert.rejects(localAnnotationTranscription.transcriptionStatus('session', new AbortController().signal), /updated local host/)
})
