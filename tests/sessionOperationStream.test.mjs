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
