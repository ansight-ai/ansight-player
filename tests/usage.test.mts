import { test } from 'node:test'
import assert from 'node:assert/strict'
import { observeLocalActivity, trackInspection } from '../src/local-replay/usage.ts'

test('local activity records coarse engagement, ignores background and synthetic input, and cleans up', () => {
  const requests: unknown[] = []
  const handlers = new Map<string, (event: { isTrusted: boolean }) => void>()
  let tick: (() => void) | undefined
  let cleared = false
  const originalFetch = globalThis.fetch
  Object.assign(globalThis, {
    document: { visibilityState: 'visible', addEventListener: (name: string, handler: typeof tick) => handlers.set(name, handler as never), removeEventListener: (name: string) => handlers.delete(name) },
    window: { setInterval: (callback: () => void) => { tick = callback; return 1 }, clearInterval: () => { cleared = true } },
    fetch: (_url: string, options: { body: string }) => { requests.push(JSON.parse(options.body)); return Promise.resolve({}) },
  })
  try {
    const stop = observeLocalActivity()
    tick!()
    assert.equal(requests.length, 0)
    handlers.get('keydown')!({ isTrusted: false })
    assert.equal(requests.length, 0)
    Object.assign(document, { visibilityState: 'hidden' })
    handlers.get('pointerdown')!({ isTrusted: true })
    assert.equal(requests.length, 0)
    Object.assign(document, { visibilityState: 'visible' })
    handlers.get('pointerdown')!({ isTrusted: true })
    handlers.get('keydown')!({ isTrusted: true })
    assert.deepEqual(requests, [{ kind: 'usage', feature: 'active_minute' }, { kind: 'engagement_action' }])
    trackInspection('network')
    trackInspection('network')
    assert.deepEqual(requests[2], { kind: 'usage', feature: 'network' })
    assert.equal(requests.length, 3)
    globalThis.fetch = () => { throw new Error('transport unavailable') }
    assert.doesNotThrow(() => trackInspection('playback'))
    stop()
    assert.equal(handlers.size, 0)
    assert(cleared)
  } finally { globalThis.fetch = originalFetch }
})
