import type { AppGraphDefinition, AppGraphEdge, AppGraphNode } from '../types'
import { readAppGraphContainment } from './appGraphContainment'

export type AppGraphConnection = {
  node: AppGraphNode
  edges: AppGraphEdge[]
}

export function readAppGraphFocus(definition: AppGraphDefinition, nodeId: string) {
  const nodeById = new Map(definition.nodes.map(node => [node.id, node]))
  const node = nodeById.get(nodeId)
  if (!node) return null

  const { parentById } = readAppGraphContainment(definition)
  const ancestors: AppGraphNode[] = []
  let parentId = parentById.get(nodeId)
  while (parentId) {
    const parent = nodeById.get(parentId)
    if (!parent) break
    ancestors.unshift(parent)
    parentId = parentById.get(parentId)
  }

  const incoming = new Map<string, AppGraphConnection>()
  const outgoing = new Map<string, AppGraphConnection>()
  const localActions: AppGraphEdge[] = []
  function addConnection(connections: Map<string, AppGraphConnection>, destinationId: string, edge: AppGraphEdge) {
    const destination = nodeById.get(destinationId)
    if (!destination) return
    const connection = connections.get(destinationId) ?? { node: destination, edges: [] }
    connection.edges.push(edge)
    connections.set(destinationId, connection)
  }

  for (const edge of [...definition.edges, ...(definition.observedTransitions ?? [])]) {
    if (edge.from === nodeId && edge.to === nodeId) {
      localActions.push(edge)
    } else if (edge.from === nodeId) {
      addConnection(outgoing, edge.to, edge)
    } else if (edge.to === nodeId) {
      addConnection(incoming, edge.from, edge)
    }
  }

  const byName = (left: AppGraphConnection, right: AppGraphConnection) => left.node.name.localeCompare(right.node.name)
  return {
    node,
    ancestors,
    children: definition.nodes.filter(candidate => parentById.get(candidate.id) === nodeId),
    incoming: [...incoming.values()].sort(byName),
    outgoing: [...outgoing.values()].sort(byName),
    localActions,
  }
}
