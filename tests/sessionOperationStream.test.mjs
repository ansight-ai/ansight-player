import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSessionOperationStream } from '../src/local-replay/sessionOperationStream.ts'

function response(chunks) {
  return new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
    controller.close()
  } }))
}

test('progress arrives before completion across partial lines and final lines without a newline', async () => {
  const progress = []
  const result = await readSessionOperationStream(response([
    '{"status":"running","progress":{"message":"Saving',
    ' logs…","completed":5,"total":10}}\n{"status":"success","result":{"isSuccess":true,"message":"Done"}}',
  ]), value => progress.push(value))
  assert.deepEqual(progress, [{ message: 'Saving logs…', completed: 5, total: 10 }])
  assert.equal(result.message, 'Done')
})

test('host errors and interrupted operations do not appear successful', async () => {
  await assert.rejects(readSessionOperationStream(response(['{"status":"error","message":"Save failed"}\n']), () => {}), /Save failed/)
  await assert.rejects(readSessionOperationStream(response(['{"status":"running","progress":{"message":"Saving"}}\n']), () => {}), /ended before/)
})

test('stage progress is delivered while the summary response is still pending', async () => {
  let controller
  const body = new ReadableStream({ start(value) { controller = value } })
  const progress = []
  let finished = false
  const result = readSessionOperationStream(new Response(body), value => progress.push(value))
  result.then(() => { finished = true })
  controller.enqueue(new TextEncoder().encode('{"status":"running","progress":{"stage":"loading","message":"Loading session evidence…"}}\n'))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(progress, [{ stage: 'loading', message: 'Loading session evidence…' }])
  assert.equal(finished, false)
  controller.enqueue(new TextEncoder().encode('{"status":"success","result":{"comment":"Ready"}}\n'))
  controller.close()
  assert.deepEqual(await result, { comment: 'Ready' })
})
