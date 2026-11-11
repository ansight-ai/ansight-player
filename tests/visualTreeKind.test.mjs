import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveVisualTreeKind, visualTreeKindLabel } from '../src/replay/visualTreeKind.ts'

test('retained Avalonia captures recover their type from the payload on older hosts', () => {
  for (const kind of ['logical', 'visual']) {
    const snapshot = {
      visualTreeKind: 'unknown',
      visualTreeFormat: 'ansight.visual-tree.compact.v2',
      source: 'sdk.sessionCapture',
      runtimePlatform: 'ios',
      payload: { source: `avalonia-${kind}`, format: 'ansight.avalonia.visual-tree.compact.v2', treeKind: kind },
    }
    assert.equal(resolveVisualTreeKind(snapshot), `avalonia-${kind}`)
    assert.equal(visualTreeKindLabel(snapshot), `Avalonia ${kind} tree`)
  }
})

test('canonical Avalonia headers are labelled without requiring deferred tree payloads', () => {
  assert.equal(visualTreeKindLabel({ visualTreeKind: 'avalonia-logical' }), 'Avalonia logical tree')
  assert.equal(visualTreeKindLabel({ visualTreeKind: 'avalonia-visual' }), 'Avalonia visual tree')
})

test('Avalonia format needs a tree kind to distinguish logical and visual trees', () => {
  const snapshot = { visualTreeKind: 'unknown', payload: { format: 'ansight.avalonia.visual-tree.compact.v2' } }
  assert.equal(resolveVisualTreeKind(snapshot), 'unknown')
  for (const kind of ['logical', 'visual']) {
    assert.equal(resolveVisualTreeKind({ ...snapshot, payload: { ...snapshot.payload, treeKind: kind } }), `avalonia-${kind}`)
  }
  assert.equal(resolveVisualTreeKind({ visualTreeKind: 'unknown', payload: { treeKind: 'logical' } }), 'unknown')
})

test('existing accessibility, native and unavailable payload behaviour is preserved', () => {
  assert.equal(visualTreeKindLabel({ visualTreeKind: 'unknown', payload: { source: 'avalonia-accessibility' } }), 'Avalonia accessibility tree')
  assert.equal(resolveVisualTreeKind({ visualTreeKind: 'unknown', payload: { format: 'ansight.avalonia.accessibility-tree.compact.v2' } }), 'avalonia-accessibility')
  assert.equal(resolveVisualTreeKind({ visualTreeKind: 'unknown', payload: { source: 'core-simulator-ax-service' } }), 'accessibility')
  assert.equal(resolveVisualTreeKind({ visualTreeKind: 'unknown', payload: { format: 'ansight.device-accessibility.compact.v2' } }), 'accessibility')
  assert.equal(resolveVisualTreeKind({ visualTreeKind: 'native', payload: { source: 'native' } }), 'native')
  for (const payload of [undefined, null, [], 'invalid', { source: 123, format: false }]) {
    assert.equal(resolveVisualTreeKind({ visualTreeKind: 'unknown', payload }), 'unknown')
  }
})
