import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchSimulatorScreenshot, resolveSimulatorResponseError } from '../src/local-replay/simulatorTransport.ts'

test('screenshot capture surfaces the plain-text host error instead of a broken image', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response(
    'Simulator control is not currently available from the local host.',
    { status: 409, headers: { 'content-type': 'text/plain' } },
  ))

  await assert.rejects(
    fetchSimulatorScreenshot('/frame', new AbortController().signal),
    /Simulator control is not currently available from the local host\./,
  )
})

test('screenshot capture keeps image bytes and forwards cancellation', async (context) => {
  const signal = new AbortController().signal
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/frame')
    assert.equal(options.signal, signal)
    assert.equal(options.cache, 'no-store')
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
  })

  const frame = await fetchSimulatorScreenshot('/frame', signal)
  assert.equal(frame.type, 'image/png')
  assert.deepEqual(new Uint8Array(await frame.arrayBuffer()), new Uint8Array([137, 80, 78, 71]))
})

test('a successful HTTP response must still contain an image', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('<html>Host unavailable</html>', {
    headers: { 'content-type': 'text/html' },
  }))

  await assert.rejects(fetchSimulatorScreenshot('/frame', new AbortController().signal), /did not return a screenshot image/)
})

test('JSON video and input errors preserve their diagnostic message', async () => {
  for (const body of [{ message: 'ADB input failed.' }, { error: 'ADB input failed.' }]) {
    const response = Response.json(body, { status: 503 })
    assert.equal(await resolveSimulatorResponseError(response, 'Input unavailable.'), 'ADB input failed.')
  }
})

test('unusable errors include HTTP status without displaying HTML', async () => {
  const response = new Response('<html>Bad gateway</html>', {
    status: 502,
    headers: { 'content-type': 'text/html' },
  })
  assert.equal(await resolveSimulatorResponseError(response, 'Screenshot capture failed.'), 'Screenshot capture failed. (HTTP 502)')
})
