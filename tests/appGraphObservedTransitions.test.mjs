import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAppGraphDefinition, mergeAppGraphObservations, readAppGraphBindingCandidates } from '../dist/library/replay/appGraphModel.js'

function graph(prefix) {
  return {
    schema: 'ansight.app-graph/v1',
    nodes: ['Home', 'Account'].map((name, index) => ({ id: `${prefix}-${index}`, kind: 'screen', name, synonyms: [], purpose: `Use ${name}`, x: index * 300, y: 0 })),
    edges: [],
    observedTransitions: [{ id: `${prefix}-observed`, from: `${prefix}-0`, to: `${prefix}-1`, action: {
      automationId: '', semanticMeaning: 'Open Account', hasStableAutomationId: false, selector: { text: 'Account', role: 'text' },
    } }],
  }
}

test('normalization preserves observed selector evidence without adding executable edges', () => {
  const result = normalizeAppGraphDefinition(graph('first'))
  assert.equal(result.edges.length, 0)
  assert.equal(result.observedTransitions.length, 1)
  assert.deepEqual(result.observedTransitions[0].action.selector, { text: 'Account', role: 'text' })
  assert.equal(result.observedTransitions[0].action.hasStableAutomationId, false)
  assert.deepEqual(readAppGraphBindingCandidates(result), [])
})

test('review merge preserves observed links and redirects them to the merged destinations', () => {
  const result = mergeAppGraphObservations([graph('one'), graph('two')], ['observation-one', 'observation-two'])
  assert.equal(result.nodes.length, 2)
  assert.equal(result.edges.length, 0)
  assert.equal(result.observedTransitions.length, 1)
  const edge = result.observedTransitions[0]
  assert.equal(result.nodes.find(node => node.id === edge.from).name, 'Home')
  assert.equal(result.nodes.find(node => node.id === edge.to).name, 'Account')
  assert.equal(edge.action.hasStableAutomationId, false)
  assert.deepEqual(edge.action.selector, { text: 'Account', role: 'text' })
})
