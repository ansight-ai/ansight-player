import assert from 'node:assert/strict'
import test from 'node:test'
import { readAppGraphFocus } from '../dist/library/replay/appGraphFocus.js'

function graph() {
  return {
    schema: 'ansight.app-graph/v1',
    nodes: ['host', 'tabs', 'map', 'routes', 'dialog', 'isolated'].map(id => ({
      id, name: id, kind: id === 'dialog' ? 'dialog' : 'screen', synonyms: [], purpose: '', x: 0, y: 0,
    })),
    navigationHosts: [
      { destinationId: 'host', childDestinationIds: ['tabs'] },
      { destinationId: 'tabs', childDestinationIds: ['map', 'routes'] },
    ],
    edges: [
      { id: 'open', from: 'map', to: 'dialog', action: { semanticMeaning: 'Open' } },
      { id: 'alternate', from: 'map', to: 'dialog', action: { semanticMeaning: 'Alternate action' } },
      { id: 'close', from: 'dialog', to: 'map', action: { semanticMeaning: 'Close' } },
      { id: 'update', from: 'map', to: 'map', action: { semanticMeaning: 'Update' } },
      { id: 'unrelated', from: 'routes', to: 'isolated', action: { semanticMeaning: 'Elsewhere' } },
    ],
    observedTransitions: [
      { id: 'observed', from: 'routes', to: 'map', action: { semanticMeaning: 'Observed navigation', hasStableAutomationId: false } },
    ],
  }
}

test('focus groups parallel actions without losing direction, observations or self loops', () => {
  const source = graph()
  const original = structuredClone(source)
  const focus = readAppGraphFocus(source, 'map')
  assert.deepEqual(focus.ancestors.map(node => node.id), ['host', 'tabs'])
  assert.deepEqual(focus.outgoing.map(connection => connection.node.id), ['dialog'])
  assert.deepEqual(focus.outgoing[0].edges.map(edge => edge.id), ['open', 'alternate'])
  assert.deepEqual(focus.incoming.map(connection => connection.node.id), ['dialog', 'routes'])
  assert.equal(focus.incoming[1].edges[0].action.hasStableAutomationId, false)
  assert.deepEqual(focus.localActions.map(edge => edge.id), ['update'])
  assert.deepEqual(source, original)
})

test('containers expose immediate children without inventing navigation edges', () => {
  const focus = readAppGraphFocus(graph(), 'tabs')
  assert.deepEqual(focus.children.map(node => node.id), ['map', 'routes'])
  assert.deepEqual(focus.ancestors.map(node => node.id), ['host'])
  assert.equal(focus.outgoing.length, 0)
  assert.equal(focus.incoming.length, 0)
})

test('partial graphs handle missing destinations, unknown selection and invalid containment finitely', () => {
  const source = graph()
  source.edges.push({ id: 'missing', from: 'map', to: 'missing', action: {} })
  source.navigationHosts[1].childDestinationIds.push('host')
  const focus = readAppGraphFocus(source, 'map')
  assert.equal(focus.outgoing.length, 1)
  assert.ok(focus.ancestors.length < source.nodes.length)
  assert.equal(readAppGraphFocus(source, 'missing'), null)
  assert.equal(readAppGraphFocus(source, 'isolated').outgoing.length, 0)
})
