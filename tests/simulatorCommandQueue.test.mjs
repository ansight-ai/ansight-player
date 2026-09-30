import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSimulatorCommandQueue } from '../src/local-replay/simulatorCommandQueue.ts'

test('pointer-up waits for pointer-down delivery to finish', async () => {
  const queue = createSimulatorCommandQueue()
  const delivered = []
  let finishDown
  const downDelivery = new Promise((resolve) => { finishDown = resolve })
  const down = queue.enqueue(async () => {
    delivered.push('down')
    await downDelivery
  })
  const up = queue.enqueue(async () => { delivered.push('up') })

  await Promise.resolve()
  assert.deepEqual(delivered, ['down'])
  finishDown()
  await Promise.all([down, up])
  assert.deepEqual(delivered, ['down', 'up'])
})

test('failed delivery rejects without blocking or replaying subsequent input', async () => {
  const queue = createSimulatorCommandQueue()
  const delivered = []
  const failed = queue.enqueue(async () => {
    delivered.push('failed')
    throw new Error('transport unavailable')
  })
  const next = queue.enqueue(async () => {
    delivered.push('next')
    return 'delivered'
  })

  await assert.rejects(failed, /transport unavailable/)
  assert.equal(await next, 'delivered')
  assert.deepEqual(delivered, ['failed', 'next'])
})

test('a synchronous transport error does not strand the queue', async () => {
  const queue = createSimulatorCommandQueue()
  const failed = queue.enqueue(() => { throw new Error('channel closed') })
  const next = queue.enqueue(async () => 'delivered')

  await assert.rejects(failed, /channel closed/)
  assert.equal(await next, 'delivered')
})
