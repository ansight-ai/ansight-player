import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAppGraphDefinition, validateAppGraph, mergeAppGraphObservations } from '../dist/library/replay/appGraphModel.js'
import { createCompoundCanvasLayout } from '../dist/library/replay/appGraphLayout.js'
import { createLiveDefinition } from '../dist/library/local-replay/AppGraphProgressPanel.js'

function graph() {
  return {
    schema: 'ansight.app-graph/v1',
    nodes: ['Flyout', 'Main tabs', 'Map', 'Crags', 'Details', 'Overview', 'Routes', 'Dialog'].map((name, index) => ({
      id: ['flyout', 'tabs', 'map', 'crags', 'details', 'overview', 'routes', 'dialog'][index],
      kind: index === 7 ? 'dialog' : index >= 5 ? 'state' : 'screen',
      parentScreen: index === 5 || index === 6 ? 'Details' : undefined,
      name, synonyms: [], purpose: `Use ${name}`, x: 80, y: 80,
    })),
    edges: [{ id: 'open', from: 'map', to: 'dialog', action: { automationId: 'open', semanticMeaning: 'Open dialog' } }],
    navigationHosts: [
      { id: 'outer', destinationId: 'flyout', name: 'Flyout', kind: 'flyout', activeChildDestinationId: 'tabs', childDestinationIds: ['tabs'] },
      { id: 'inner', destinationId: 'tabs', name: 'Main tabs', kind: 'top_tabs', activeChildDestinationId: 'map', childDestinationIds: ['map', 'crags', 'details'] },
    ],
    tabGroups: [{ id: 'sections', parentDestinationId: 'details', selectedDestinationId: 'overview', tabDestinationIds: ['overview', 'routes'] }],
  }
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

test('nested hosts render recursively, with each node once and no synthetic action edges', () => {
  const definition = normalizeAppGraphDefinition(graph())
  assert.deepEqual(validateAppGraph(definition), [])
  assert.equal(definition.nodes.find(node => node.id === 'tabs').parentScreen, 'Flyout')
  assert.equal(definition.nodes.find(node => node.id === 'map').parentScreen, 'Main tabs')
  const layout = createCompoundCanvasLayout(definition)
  assert.equal(layout.nodes.length, 8)
  assert.equal(new Set(layout.nodes.map(placement => placement.node.id)).size, 8)
  assert.equal(layout.definition.edges.length, 1)
  const outer = layout.groups.find(group => group.key === 'flyout')
  const tabs = layout.groups.find(group => group.key === 'tabs')
  const details = layout.groups.find(group => group.key === 'details')
  assert.equal(outer.kindLabel, 'Flyout')
  assert.equal(tabs.kindLabel, 'Tab pages')
  assert.ok(contains(outer, tabs))
  assert.ok(contains(tabs, details))
  assert.ok(contains(details, layout.nodeById.get('routes')))
  assert.ok(!contains(outer, layout.nodeById.get('dialog')))
  assert.deepEqual(outer.nodeIds, ['flyout', 'tabs', 'map', 'crags', 'details', 'overview', 'routes'])
})

test('ownership uses IDs even when nested hosts have identical display names', () => {
  const definition = graph()
  definition.nodes.find(node => node.id === 'tabs').name = 'Flyout'
  const layout = createCompoundCanvasLayout(definition)
  assert.ok(contains(layout.groups.find(group => group.key === 'flyout'), layout.groups.find(group => group.key === 'tabs')))
  assert.ok(contains(layout.groups.find(group => group.key === 'tabs'), layout.nodeById.get('map')))
})

test('live progress uses the same recursive dimensions to keep other roots outside the flyout', () => {
  const definition = graph()
  const run = { ...definition, nodes: definition.nodes.map(node => ({ ...node, scrollStatus: 'not_scrollable' })),
    edges: definition.edges.map(edge => ({ ...edge, automationId: edge.action.automationId, semanticMeaning: edge.action.semanticMeaning })) }
  const live = createLiveDefinition(run)
  const layout = createCompoundCanvasLayout(live)
  const outer = layout.groups.find(group => group.key === 'flyout')
  assert.ok(contains(outer, layout.groups.find(group => group.key === 'tabs')))
  const dialog = layout.nodeById.get('dialog')
  assert.ok(dialog.x >= outer.x + outer.width || dialog.y >= outer.y + outer.height)
  assert.equal(live.edges.length, 1)
})

for (const kind of ['self', 'cycle', 'flattened']) {
  test(`invalid ${kind} ownership is reported and partial evidence still renders finitely`, () => {
    const definition = graph()
    if (kind === 'self') definition.navigationHosts[0].childDestinationIds.push('flyout')
    if (kind === 'cycle') definition.navigationHosts[1].childDestinationIds.push('flyout')
    if (kind === 'flattened') definition.navigationHosts[0].childDestinationIds.push('map')
    assert.ok(validateAppGraph(definition).some(error => /own itself|cycle|multiple direct owners/.test(error)))
    const layout = createCompoundCanvasLayout(definition)
    assert.equal(layout.nodes.length, 8)
    assert.ok(layout.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)))
  })
}

test('review merge retains a single-child flyout and its nested tab host', () => {
  const merged = mergeAppGraphObservations([graph(), graph()], ['first', 'second'])
  assert.equal(merged.navigationHosts.length, 2)
  const flyout = merged.navigationHosts.find(host => host.kind === 'flyout')
  const tabs = merged.navigationHosts.find(host => host.kind === 'top_tabs')
  assert.deepEqual(flyout.childDestinationIds, [tabs.destinationId])
  const layout = createCompoundCanvasLayout(merged)
  assert.ok(contains(layout.groups.find(group => group.key === flyout.destinationId), layout.groups.find(group => group.key === tabs.destinationId)))
})
