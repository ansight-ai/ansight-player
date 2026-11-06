import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captureLocalAnnotationVisualTree } from '../dist/library/local-replay/liveAnnotationCapture.js'
import { attachCapturedAnnotationVisualTree } from '../dist/library/replay/annotationCapture.js'

function draft(annotationId = 'annotation-1') {
  return {
    annotation: {
      annotationId,
      label: 'Button is clipped',
      geometry: [{ frameId: 'frame-at-drag-start', x: 0.2, y: 0.4 }],
      target: { kind: 'visualTreeRegion', visualTreeSnapshotId: '' },
    },
    visualTreeCapturePending: true,
  }
}

test('a live annotation requests a fresh tree immediately and keeps the exact returned snapshot', async (context) => {
  let completeCapture
  let requests = 0
  context.mock.method(globalThis, 'fetch', (url, options) => {
    requests += 1
    assert.equal(url, 'api/sessions/phone%2Fsession/visual-tree/capture')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), {})
    assert.ok(options.signal instanceof AbortSignal)
    return new Promise(resolve => { completeCapture = resolve })
  })

  const pendingCapture = captureLocalAnnotationVisualTree('phone/session')
  assert.equal(requests, 1)
  const current = draft()
  completeCapture(Response.json({ isSuccess: true, sessionId: 'phone/session', snapshotId: 'fresh-tree' }))
  const result = attachCapturedAnnotationVisualTree(current, 'annotation-1', await pendingCapture)

  assert.equal(result.visualTreeCapturePending, false)
  assert.equal(result.annotation.target.visualTreeSnapshotId, 'fresh-tree')
  assert.deepEqual(result.annotation.geometry, current.annotation.geometry)
  assert.equal(current.annotation.target.visualTreeSnapshotId, '')
})

test('late capture completion cannot reopen a cancelled annotation or change a different draft', () => {
  const capture = { snapshotId: 'fresh-tree' }
  assert.equal(attachCapturedAnnotationVisualTree(null, 'annotation-1', capture), null)
  const nextDraft = draft('annotation-2')
  assert.equal(attachCapturedAnnotationVisualTree(nextDraft, 'annotation-1', capture), nextDraft)
})

test('failed and invalid capture responses remain explicit and never reuse a stale tree', async (context) => {
  for (const body of [
    { isSuccess: false, message: 'Phone disconnected.' },
    { isSuccess: true, sessionId: 'phone', snapshotId: null },
    { isSuccess: true, sessionId: 'other-phone', snapshotId: 'wrong-tree' },
  ]) {
    const mock = context.mock.method(globalThis, 'fetch', async () => Response.json(body))
    const capture = await captureLocalAnnotationVisualTree('phone')
    assert.equal(capture.snapshotId, null)
    assert.ok(capture.error)

    const current = draft()
    current.annotation.target.visualTreeSnapshotId = 'stale-tree'
    const result = attachCapturedAnnotationVisualTree(current, 'annotation-1', capture)
    assert.equal(result.annotation.target.visualTreeSnapshotId, '')
    assert.equal(result.visualTreeCapturePending, false)
    assert.equal(result.visualTreeCaptureError, capture.error)
    mock.mock.restore()
  }
})

test('network and timeout failures settle even when a drawing is cancelled before completion', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('Capture timed out.') })
  assert.deepEqual(await captureLocalAnnotationVisualTree('phone'), {
    snapshotId: null,
    error: 'Capture timed out.',
  })
})
