import type { AppGraphDefinition, AppGraphNode } from '../types'
import { normalizeAppGraphDefinition } from './appGraphModel'
import { readAppGraphContainment } from './appGraphContainment'

export const groupHeaderHeight = 62
const padding = 20
const edgeGutter = 38
const childGap = 24
const columnGap = 44
const parentGap = 56
const maximumRows = 4

export type CanvasNode = {
  node: AppGraphNode
  x: number
  y: number
  width: number
  height: number
  groupKey?: string
}

export type CanvasGroup = {
  key: string
  label: string
  kindLabel: string
  memberLabel: string
  x: number
  y: number
  width: number
  height: number
  nodeIds: string[]
  stateCount: number
}

export type CanvasRoot = {
  id: string
  primaryNodeId: string | null
  nodeIds: string[]
  x: number
  y: number
  width: number
  height: number
}

export type CanvasLayout = {
  definition: AppGraphDefinition
  groups: CanvasGroup[]
  nodes: CanvasNode[]
  nodeById: Map<string, CanvasNode>
  roots: CanvasRoot[]
}

type Branch = {
  key: string
  label: string
  node?: AppGraphNode
  children: Branch[]
  width: number
  height: number
  columns: Branch[][]
}

export function createCompoundCanvasLayout(source: AppGraphDefinition): CanvasLayout {
  const definition = normalizeAppGraphDefinition(source)
  const { parentById } = readAppGraphContainment(definition)
  const branches = new Map<string, Branch>(definition.nodes.map(node => [node.id, {
    key: node.id, label: node.name, node, children: [], width: 0, height: 0, columns: [],
  }]))
  const rootBranches: Branch[] = []
  for (const branch of [...branches.values()]) {
    const parent = branches.get(parentById.get(branch.key) ?? '')
    if (parent) {
      parent.children.push(branch)
    } else if (branch.node?.kind === 'state' && branch.node.parentScreen?.trim()
      && !definition.nodes.some(node => node.id === branch.node?.parentScreen || node.name === branch.node?.parentScreen)) {
      // Older graphs can name a containing screen without retaining its destination.
      const key = `missing-parent:${branch.node.parentScreen}`
      let group = branches.get(key)
      if (!group) {
        group = { key, label: branch.node.parentScreen, children: [], width: 0, height: 0, columns: [] }
        branches.set(key, group)
        rootBranches.push(group)
      }
      group.children.push(branch)
    } else {
      rootBranches.push(branch)
    }
  }
  const hostByDestination = new Map((definition.navigationHosts ?? []).map(host => [host.destinationId, host]))
  const orderedChildren = new Map([
    ...(definition.navigationHosts ?? []).map(host => [host.destinationId, host.childDestinationIds] as const),
    ...(definition.tabGroups ?? []).map(group => [group.parentDestinationId, group.tabDestinationIds] as const),
  ])
  for (const branch of branches.values()) {
    const order = orderedChildren.get(branch.key)
    if (order) branch.children.sort((left, right) => {
      const leftIndex = order.indexOf(left.key), rightIndex = order.indexOf(right.key)
      return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex)
    })
  }
  const kindLabels: Record<string, string> = {
    flyout: 'Flyout', drawer: 'Drawer', bottom_tabs: 'Tab pages', top_tabs: 'Tab pages',
    navigation_rail: 'Navigation rail', shell: 'Navigation host', other: 'Navigation host',
  }
  function measure(branch: Branch, nested: boolean) {
    if (!branch.children.length) {
      branch.width = nested ? 150 : 212
      branch.height = nested ? 68 : 96
      return
    }
    branch.children.forEach(child => measure(child, true))
    // Keep the observed child order, including the order of tabs, at every depth.
    for (let index = 0; index < branch.children.length; index += maximumRows) {
      branch.columns.push(branch.children.slice(index, index + maximumRows))
    }
    const contentWidth = branch.columns.reduce((total, column, index) =>
      total + Math.max(...column.map(child => child.width)) + (index ? columnGap : 0), 0)
    const contentHeight = Math.max(...branch.columns.map(column =>
      column.reduce((total, child, index) => total + child.height + (index ? childGap : 0), 0)))
    branch.width = Math.max(360, padding * 2 + (branch.node ? 212 + parentGap : 0) + contentWidth)
    branch.height = groupHeaderHeight + padding * 2 + Math.max(branch.node ? 96 : 0, contentHeight) + edgeGutter
  }
  function nodeIds(branch: Branch): string[] {
    return [...(branch.node ? [branch.node.id] : []), ...branch.children.flatMap(nodeIds)]
  }
  const nodes: CanvasNode[] = []
  const groups: CanvasGroup[] = []
  function place(branch: Branch, x: number, y: number, parentKey?: string) {
    if (!branch.children.length) {
      if (branch.node) nodes.push({ node: branch.node, x, y, width: branch.width, height: branch.height, groupKey: parentKey })
      return
    }
    const host = hostByDestination.get(branch.key)
    groups.push({ key: branch.key, label: branch.label, kindLabel: host ? kindLabels[host.kind] ?? 'Navigation host' : 'Screen',
      memberLabel: host ? 'child destination' : 'internal state', x, y, width: branch.width, height: branch.height,
      nodeIds: nodeIds(branch), stateCount: branch.children.length })
    const contentY = y + groupHeaderHeight + padding
    const contentHeight = branch.height - groupHeaderHeight - padding * 2 - edgeGutter
    if (branch.node) nodes.push({ node: branch.node, x: x + padding, y: contentY + (contentHeight - 96) / 2,
      width: 212, height: 96, groupKey: branch.key })
    let columnX = x + padding + (branch.node ? 212 + parentGap : 0)
    for (const column of branch.columns) {
      let childY = contentY
      for (const child of column) {
        place(child, columnX, childY, branch.key)
        childY += child.height + childGap
      }
      columnX += Math.max(...column.map(child => child.width)) + columnGap
    }
  }
  const roots: CanvasRoot[] = []
  for (const branch of rootBranches) {
    measure(branch, false)
    const members = nodeIds(branch)
    const firstNode = branch.node ?? definition.nodes.find(node => members.includes(node.id))
    const x = Math.max(24, firstNode?.x ?? 24)
    let y = Math.max(24, firstNode?.y ?? 24)
    // Expanding a nested host must not obscure a sibling root or dialog.
    for (;;) {
      const overlap = roots.find(root => x < root.x + root.width + 24 && x + branch.width + 24 > root.x
        && y < root.y + root.height + 24 && y + branch.height + 24 > root.y)
      if (!overlap) break
      y = overlap.y + overlap.height + 24
    }
    roots.push({ id: branch.key, primaryNodeId: branch.node?.id ?? null, nodeIds: members, x, y, width: branch.width, height: branch.height })
    place(branch, x, y)
  }
  return { definition, groups, nodes, nodeById: new Map(nodes.map(node => [node.node.id, node])), roots }
}
