import type { AppGraphDefinition } from '../types'

export function minimumHostChildren(kind: string): number {
  return ['flyout', 'drawer', 'shell'].includes(kind) ? 1 : 2
}

export function readAppGraphContainment(definition: AppGraphDefinition): {
  parentById: Map<string, string>
  errors: string[]
} {
  const nodeById = new Map(definition.nodes.map(node => [node.id, node]))
  const parentById = new Map<string, string>()
  const errors: string[] = []
  function add(parent: string, child: string) {
    if (parent === child) {
      errors.push(`Destination '${child}' cannot own itself.`)
      return
    }
    const existing = parentById.get(child)
    if (existing && existing !== parent) {
      errors.push(`Destination '${child}' has multiple direct owners: '${existing}' and '${parent}'.`)
      return
    }
    if (nodeById.has(parent) && nodeById.has(child)) parentById.set(child, parent)
  }
  for (const host of definition.navigationHosts ?? []) {
    for (const child of host.childDestinationIds) add(host.destinationId, child)
  }
  for (const group of definition.tabGroups ?? []) {
    for (const child of group.tabDestinationIds) add(group.parentDestinationId, child)
  }
  for (const node of definition.nodes) {
    if (parentById.has(node.id) || node.kind === 'dialog' || !node.parentScreen?.trim()) continue
    const reference = node.parentScreen.trim()
    const matches = definition.nodes.filter(candidate => candidate.name === reference)
    const parent = nodeById.get(reference) ?? (matches.length === 1 ? matches[0] : undefined)
    if (parent) add(parent.id, node.id)
  }
  // Partial reports may contain invalid ownership. Report it, but keep rendering finite.
  for (const child of parentById.keys()) {
    const visited = new Set([child])
    let current = child
    while (parentById.has(current)) {
      const parent = parentById.get(current)!
      if (visited.has(parent)) {
        errors.push(`Navigation ownership contains a cycle involving '${parent}'.`)
        parentById.delete(current)
        break
      }
      visited.add(parent)
      current = parent
    }
  }
  return { parentById, errors: [...new Set(errors)] }
}
