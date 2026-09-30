import type {
  AppGraphBinding,
  AppGraphBindingCandidate,
  AppGraphDefinition,
  AppGraphDestinationKind,
  AppGraphEdge,
  AppGraphNode,
  AppGraphNodeKind,
  AppGraphNavigationHost,
  AppGraphReviewedTrajectory,
  AppGraphTabGroup,
  AppGraphTimelineAnnotation,
} from '../types'

const supportedNodeKinds: AppGraphDestinationKind[] = [
  'screen',
  'dialog',
  'state',
]

const horizontalSpacing = 232
const verticalSpacing = 118
const canvasInsetX = 48
const canvasInsetY = 46

export function createStarterAppGraph(scope: string): AppGraphDefinition {
  const purpose = scope.trim() ? `Observed within: ${scope.trim()}` : ''
  return {
    schema: 'ansight.app-graph/v1',
    nodes: [
      { ...createNode('screen_1', 'screen', 'Starting screen', canvasInsetX, canvasInsetY), purpose, isEntry: true },
      { ...createNode('screen_2', 'screen', 'Resulting screen or state', canvasInsetX + horizontalSpacing, canvasInsetY), purpose },
    ],
    edges: [
      createEdge('screen_1', 'screen_2', 'Describe what the element does'),
    ],
  }
}

export function createAppGraphFromMermaid(mermaidDefinition: string, intent: string): AppGraphDefinition {
  const nodeById = new Map<string, AppGraphNode>()
  const edges: AppGraphEdge[] = []
  const nodePattern = /\b([a-z][\w-]*)\s*(?:\[\s*"([^"]+)"\s*\]|\[\s*([^\]]+)\s*\]|\(\s*"?([^")]+)"?\s*\)|\{\s*"?([^"}]+)"?\s*\})/gi
  const edgePattern = /\b([a-z][\w-]*)\s*(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\})?\s*-->(?:\|([^|]+)\|)?\s*([a-z][\w-]*)/gi

  for (const line of mermaidDefinition.split(/\r?\n/)) {
    for (const match of line.matchAll(nodePattern)) {
      const id = match[1]
      const label = cleanMermaidLabel(match[2] ?? match[3] ?? match[4] ?? match[5] ?? id)
      nodeById.set(id, createNode(id, inferNodeKind(id), label, 0, 0))
    }

    for (const match of line.matchAll(edgePattern)) {
      const from = match[1]
      const label = cleanMermaidLabel(match[2] ?? '')
      const to = match[3]
      edges.push(createEdge(from, to, label))
    }
  }

  for (const edge of edges) {
    if (!nodeById.has(edge.from)) {
      nodeById.set(edge.from, createNode(edge.from, inferNodeKind(edge.from), humanizeNodeId(edge.from), 0, 0))
    }
    if (!nodeById.has(edge.to)) {
      nodeById.set(edge.to, createNode(edge.to, inferNodeKind(edge.to), humanizeNodeId(edge.to), 0, 0))
    }
  }

  if (nodeById.size < 2 || edges.length === 0) {
    const fallback = createStarterAppGraph(intent)
    return { ...fallback, sourceMermaid: mermaidDefinition }
  }

  return {
    schema: 'ansight.app-graph/v1',
    nodes: layoutNodes([...nodeById.values()], edges),
    edges: deduplicateEdges(edges),
    sourceMermaid: mermaidDefinition,
  }
}

export function validateAppGraph(definition: AppGraphDefinition): string[] {
  const errors: string[] = []
  const nodeIds = new Set(definition.nodes.map((node) => node.id))
  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]))

  if (definition.schema !== 'ansight.app-graph/v1') {
    errors.push(`Unsupported App Graph schema '${String(definition.schema)}'.`)
  }
  if (definition.nodes.length < 2) {
    errors.push('Add at least two destinations.')
  }
  if (definition.edges.length === 0) errors.push('Add at least one element action between destinations.')
  if (new Set(definition.nodes.map((node) => node.id)).size !== definition.nodes.length) {
    errors.push('Every node must have a unique ID.')
  }
  if (new Set(definition.edges.map((edge) => edge.id)).size !== definition.edges.length) {
    errors.push('Every connection must have a unique ID.')
  }
  if (definition.nodes.some((node) => !node.name.trim())) {
    errors.push('Every destination must have a canonical name.')
  }
  if (definition.nodes.some((node) => !supportedNodeKinds.includes(node.kind as AppGraphDestinationKind))) {
    errors.push('Every destination must be a screen, dialog, or named state.')
  }
  if (definition.nodes.some((node) => node.kind === 'state' && !node.parentScreen?.trim())) {
    errors.push('Every named state must identify its containing screen.')
  }
  if (definition.nodes.some((node) => node.kind === 'dialog' && node.parentScreen?.trim())) {
    errors.push('Dialogs cannot be grouped under a containing screen or navigation host.')
  }
  if (definition.nodes.some((node) => !node.purpose.trim())) {
    errors.push('Every destination must describe its purpose.')
  }
  if (definition.edges.some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))) {
    errors.push('Every connection must reference existing nodes.')
  }
  if (definition.edges.some((edge) => {
    const meaning = edge.action.semanticMeaning.trim()
    return !meaning || /^describe\b/i.test(meaning)
  })) {
    errors.push('Every action must describe what using the element means.')
  }
  if (definition.edges.some((edge) => !edge.action.automationId.trim())) {
    errors.push("Every action must identify its element's automation ID.")
  }
  if (definition.edges.some((edge) => edge.from === edge.to)) {
    errors.push('A connection cannot point back to the same node.')
  }
  if (new Set((definition.navigationHosts ?? []).map((host) => host.id)).size !== (definition.navigationHosts ?? []).length) {
    errors.push('Every navigation host must have a unique ID.')
  }
  for (const host of definition.navigationHosts ?? []) {
    if (!nodeIds.has(host.destinationId)
      || host.childDestinationIds.some((id) => !nodeIds.has(id))
      || host.childDestinationIds.length < 2
      || !host.childDestinationIds.includes(host.activeChildDestinationId)) {
      errors.push(`Navigation host '${host.id}' has incomplete or invalid destination membership.`)
    }
  }
  if (definition.nodes.some((node) => node.kind === 'screen'
    && !!node.parentScreen?.trim()
    && !(definition.navigationHosts ?? []).some((host) => host.childDestinationIds.includes(node.id)
      && nodeById.get(host.destinationId)?.name.trim() === node.parentScreen?.trim()))) {
    errors.push('A screen may identify a parent only when that navigation host declares it as a child.')
  }
  if (new Set((definition.tabGroups ?? []).map((group) => group.id)).size !== (definition.tabGroups ?? []).length) {
    errors.push('Every tab group must have a unique ID.')
  }
  for (const group of definition.tabGroups ?? []) {
    if (!nodeIds.has(group.parentDestinationId)
      || group.tabDestinationIds.some((id) => !nodeIds.has(id))
      || group.tabDestinationIds.length < 2
      || !group.tabDestinationIds.includes(group.selectedDestinationId)) {
      errors.push(`Tab group '${group.id}' has incomplete or invalid destination membership.`)
    }
  }

  const targetNodeIds = new Set(definition.edges.map((edge) => edge.to))
  const explicitEntryNodes = definition.nodes.filter((node) => node.isEntry)
  const inferredEntryNodes = definition.nodes.filter((node) => !targetNodeIds.has(node.id))
  const entryNodes = explicitEntryNodes.length > 0
    ? explicitEntryNodes
    : inferredEntryNodes.length > 0
      ? inferredEntryNodes
      : definition.nodes.slice(0, 1)
  const reachableNodeIds = new Set(entryNodes.map((node) => node.id))
  let discoveredNode = true
  while (discoveredNode) {
    discoveredNode = false
    for (const edge of definition.edges) {
      if (reachableNodeIds.has(edge.from) && !reachableNodeIds.has(edge.to)) {
        reachableNodeIds.add(edge.to)
        discoveredNode = true
      }
    }
    for (const host of definition.navigationHosts ?? []) {
      if (!reachableNodeIds.has(host.destinationId)) continue
      for (const childId of host.childDestinationIds) {
        if (!reachableNodeIds.has(childId)) {
          reachableNodeIds.add(childId)
          discoveredNode = true
        }
      }
    }
    for (const group of definition.tabGroups ?? []) {
      if (!reachableNodeIds.has(group.parentDestinationId)) continue
      for (const tabId of group.tabDestinationIds) {
        if (!reachableNodeIds.has(tabId)) {
          reachableNodeIds.add(tabId)
          discoveredNode = true
        }
      }
    }
  }

  const unreachableNodes = definition.nodes.filter((node) => !reachableNodeIds.has(node.id))
  if (unreachableNodes.length > 0) {
    errors.push(`${unreachableNodes.length} destination${unreachableNodes.length === 1 ? ' is' : 's are'} not reachable from an entry destination.`)
  }

  return errors
}

export function normalizeAppGraphDefinition(definition: AppGraphDefinition): AppGraphDefinition {
  const nodeByMeaning = new Map<string, AppGraphNode>()
  const nodeIdRedirects = new Map<string, string>()

  for (const sourceNode of definition.nodes) {
    if (isVisualTreeImplementationLeak(sourceNode)) continue
    const normalizedNode = normalizeDestinationNode(sourceNode)
    const meaning = createNodeMeaning(normalizedNode)
    const existing = nodeByMeaning.get(meaning)
    if (existing) {
      nodeIdRedirects.set(sourceNode.id, existing.id)
      existing.provenanceObservationIds = deduplicateStrings([
        ...(existing.provenanceObservationIds ?? []),
        ...(sourceNode.provenanceObservationIds ?? []),
      ])
      existing.confidence = Math.max(existing.confidence ?? 0, sourceNode.confidence ?? 0) || undefined
      existing.synonyms = deduplicateStrings([...existing.synonyms, ...normalizedNode.synonyms])
      if (!existing.purpose && normalizedNode.purpose) existing.purpose = normalizedNode.purpose
      if (sourceNode.isEntry) existing.isEntry = true
      continue
    }

    const node = cloneNode(normalizedNode)
    nodeByMeaning.set(meaning, node)
    nodeIdRedirects.set(sourceNode.id, node.id)
  }

  const nodes = [...nodeByMeaning.values()]
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = deduplicateEdges(definition.edges.flatMap((sourceEdge) => {
    const from = nodeIdRedirects.get(sourceEdge.from)
    const to = nodeIdRedirects.get(sourceEdge.to)
    if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to)) return []
    return [{
      ...cloneEdge(sourceEdge),
      from,
      to,
      action: normalizeElementAction(sourceEdge.action),
    }]
  }))

  const navigationHosts = definition.navigationHosts?.flatMap((host) => {
    const destinationId = nodeIdRedirects.get(host.destinationId)
    const activeChildDestinationId = nodeIdRedirects.get(host.activeChildDestinationId)
    const childDestinationIds = host.childDestinationIds
      .map((id) => nodeIdRedirects.get(id))
      .filter((id): id is string => !!id)
    if (!destinationId || !activeChildDestinationId) return []
    return [{ ...host, destinationId, activeChildDestinationId, childDestinationIds }]
  })
  const tabGroups = definition.tabGroups?.flatMap((group) => {
    const parentDestinationId = nodeIdRedirects.get(group.parentDestinationId)
    const selectedDestinationId = nodeIdRedirects.get(group.selectedDestinationId)
    const tabDestinationIds = group.tabDestinationIds
      .map((id) => nodeIdRedirects.get(id))
      .filter((id): id is string => !!id)
    if (!parentDestinationId || !selectedDestinationId) return []
    return [{ ...group, parentDestinationId, selectedDestinationId, tabDestinationIds }]
  })

  return { ...definition, nodes, edges, navigationHosts, tabGroups }
}

export function validateExecutableAppGraph(
  definition: AppGraphDefinition,
  bindings: AppGraphBinding[],
): string[] {
  const errors = validateAppGraph(definition)
  const bindingEdgeIds = new Set(bindings.map((binding) => binding.edge_id))
  const unboundEdges = definition.edges.filter((edge) => !bindingEdgeIds.has(edge.id))
  if (unboundEdges.length > 0) {
    errors.push(`${unboundEdges.length} connection${unboundEdges.length === 1 ? ' needs' : 's need'} an execution binding.`)
  }
  for (const binding of bindings) {
    const edge = definition.edges.find((candidate) => candidate.id === binding.edge_id)
    if (binding.mechanism === 'app_tool' && (typeof binding.configuration.toolId !== 'string' || !binding.configuration.toolId.trim())) {
      errors.push(`App tool binding for ${binding.edge_id} needs a toolId.`)
    }
    if (binding.mechanism === 'app_link' && (typeof binding.configuration.url !== 'string' || !binding.configuration.url.trim())) {
      errors.push(`App link binding for ${binding.edge_id} needs a URL template.`)
    }
    if (binding.mechanism === 'native_route' && (typeof binding.configuration.route !== 'string' || !binding.configuration.route.trim())) {
      errors.push(`Native route binding for ${binding.edge_id} needs a route.`)
    }
    if (binding.mechanism === 'ui_action' && (typeof binding.configuration.action !== 'string' || !binding.configuration.action.trim())) {
      errors.push(`UI action binding for ${binding.edge_id} needs an action.`)
    }
    if (binding.mechanism === 'ui_action'
      && binding.configuration.action === 'tap'
      && readSelectorAutomationId(binding.configuration) === '') {
      errors.push(`UI action binding for ${binding.edge_id} needs selector.automationId.`)
    }
    if (binding.mechanism === 'ui_action'
      && edge?.action?.automationId
      && readSelectorAutomationId(binding.configuration) !== edge.action.automationId) {
      errors.push(`UI action binding for ${binding.edge_id} must target automation ID ${edge.action.automationId}.`)
    }
    if (binding.postconditions.length === 0) {
      errors.push(`Binding for ${binding.edge_id} needs at least one observable postcondition.`)
    }
  }
  return errors
}

export function readAppGraphBindingCandidates(
  definition: AppGraphDefinition,
): Array<AppGraphBindingCandidate & { edgeId: string }> {
  return definition.edges.flatMap((edge) => (edge.bindingCandidates ?? []).map((candidate) => ({
    ...cloneBindingCandidate(candidate),
    edgeId: edge.id,
  })))
}

export function mergeAppGraphObservations(
  candidates: AppGraphDefinition[],
  observationIds: string[],
  baseline?: AppGraphDefinition,
): AppGraphDefinition {
  if (candidates.length === 0) {
    return normalizeAppGraphDefinition(baseline ?? createStarterAppGraph('Observed app navigation'))
  }

  const normalizedBaseline = baseline ? normalizeAppGraphDefinition(baseline) : undefined
  const normalizedCandidates = candidates.map(normalizeAppGraphDefinition)

  const nodeByMeaning = new Map<string, AppGraphNode>()
  const nodeMeaningByCandidateId = new Map<string, string>()
  const occurrenceByNodeMeaning = new Map<string, number>()
  const edgeByMeaning = new Map<string, AppGraphEdge>()
  const occurrenceByEdgeMeaning = new Map<string, number>()
  const baselineNodeIds = new Set<string>()
  const baselineEdgeIds = new Set<string>()
  const usedNodeIds = new Set<string>()
  const usedEdgeIds = new Set<string>()

  if (normalizedBaseline) {
    for (const node of normalizedBaseline.nodes) {
      const meaning = createNodeMeaning(node)
      nodeByMeaning.set(meaning, cloneNode(node))
      baselineNodeIds.add(node.id)
      usedNodeIds.add(node.id)
    }
    for (const edge of normalizedBaseline.edges) {
      const fromNode = normalizedBaseline.nodes.find((node) => node.id === edge.from)
      const toNode = normalizedBaseline.nodes.find((node) => node.id === edge.to)
      if (!fromNode || !toNode) continue
      const fromMeaning = createNodeMeaning(fromNode)
      const toMeaning = createNodeMeaning(toNode)
      if (fromMeaning === toMeaning) continue
      const meaning = `${fromMeaning}->${toMeaning}:${normalizeMeaning(edge.action.semanticMeaning)}`
      edgeByMeaning.set(meaning, cloneEdge(edge))
      baselineEdgeIds.add(edge.id)
      usedEdgeIds.add(edge.id)
    }
  }

  normalizedCandidates.forEach((candidate, candidateIndex) => {
    const observationId = observationIds[candidateIndex]
    candidate.nodes.forEach((node) => {
      const meaning = createNodeMeaning(node)
      nodeMeaningByCandidateId.set(`${candidateIndex}:${node.id}`, meaning)
      occurrenceByNodeMeaning.set(meaning, (occurrenceByNodeMeaning.get(meaning) ?? 0) + 1)
      const existing = nodeByMeaning.get(meaning)
      if (existing) {
        existing.provenanceObservationIds = deduplicateStrings([
          ...(existing.provenanceObservationIds ?? []),
          observationId,
        ])
        existing.synonyms = deduplicateStrings([...existing.synonyms, ...node.synonyms])
        if (!existing.purpose && node.purpose) existing.purpose = node.purpose
        if (node.isEntry) existing.isEntry = true
        return
      }
      const nodeId = allocateSemanticId(node.kind, usedNodeIds)
      nodeByMeaning.set(meaning, {
        ...node,
        id: nodeId,
        provenanceObservationIds: observationId ? [observationId] : [],
      })
      usedNodeIds.add(nodeId)
    })

    candidate.edges.forEach((edge) => {
      const fromMeaning = nodeMeaningByCandidateId.get(`${candidateIndex}:${edge.from}`)
      const toMeaning = nodeMeaningByCandidateId.get(`${candidateIndex}:${edge.to}`)
      if (!fromMeaning || !toMeaning || fromMeaning === toMeaning) return
      const semanticMeaning = collapseDuplicateBoundaryAction(edge.action.semanticMeaning)
      const meaning = `${fromMeaning}->${toMeaning}:${normalizeMeaning(semanticMeaning)}`
      occurrenceByEdgeMeaning.set(meaning, (occurrenceByEdgeMeaning.get(meaning) ?? 0) + 1)
      const existing = edgeByMeaning.get(meaning)
      if (existing) {
        existing.provenanceObservationIds = deduplicateStrings([
          ...(existing.provenanceObservationIds ?? []),
          observationId,
        ])
        existing.bindingCandidates = mergeBindingCandidates(
          existing.bindingCandidates ?? [],
          edge.bindingCandidates ?? [],
        )
        const normalizedAction = normalizeElementAction(edge.action)
        if (!existing.action.automationId && normalizedAction.automationId) existing.action = normalizedAction
        return
      }
      const edgeId = allocateSemanticId('edge', usedEdgeIds)
      edgeByMeaning.set(meaning, {
        ...edge,
        id: edgeId,
        from: nodeByMeaning.get(fromMeaning)?.id ?? edge.from,
        to: nodeByMeaning.get(toMeaning)?.id ?? edge.to,
        action: {
          automationId: edge.action.automationId,
          semanticMeaning: semanticMeaning || 'Describe the element action',
        },
        provenanceObservationIds: observationId ? [observationId] : [],
      })
      usedEdgeIds.add(edgeId)
    })
  })

  const nodes = [...nodeByMeaning.entries()].map(([meaning, node]) => ({
    ...node,
    confidence: baselineNodeIds.has(node.id)
      ? Math.max(node.confidence ?? 0.5, (occurrenceByNodeMeaning.get(meaning) ?? 0) / candidates.length)
      : (occurrenceByNodeMeaning.get(meaning) ?? 1) / normalizedCandidates.length,
  }))
  const edges = [...edgeByMeaning.entries()].map(([meaning, edge]) => ({
    ...edge,
    confidence: baselineEdgeIds.has(edge.id)
      ? Math.max(edge.confidence ?? 0.5, (occurrenceByEdgeMeaning.get(meaning) ?? 0) / candidates.length)
      : (occurrenceByEdgeMeaning.get(meaning) ?? 1) / normalizedCandidates.length,
  }))

  const laidOutNodes = layoutNodes(nodes, edges)
  const maxBaselineX = Math.max(canvasInsetX, ...nodes.filter((node) => baselineNodeIds.has(node.id)).map((node) => node.x))
  let newNodeIndex = 0
  const additiveLayout = laidOutNodes.map((node) => {
    if (baselineNodeIds.has(node.id)) return nodeByMeaning.get(createNodeMeaning(node)) ?? node
    const column = Math.floor(newNodeIndex / 5)
    const row = newNodeIndex % 5
    newNodeIndex += 1
    return {
      ...node,
      x: normalizedBaseline ? maxBaselineX + horizontalSpacing * (column + 1) : node.x,
      y: normalizedBaseline ? canvasInsetY + row * verticalSpacing : node.y,
    }
  })

  const structureSources = [
    ...(normalizedBaseline ? [normalizedBaseline] : []),
    ...normalizedCandidates,
  ]
  const navigationHostByDestination = new Map<string, AppGraphNavigationHost>()
  const tabGroupByParent = new Map<string, AppGraphTabGroup>()
  const usedNavigationHostIds = new Set<string>()
  const usedTabGroupIds = new Set<string>()
  for (const source of structureSources) {
    const redirect = (sourceId: string): string | undefined => {
      const sourceNode = source.nodes.find((node) => node.id === sourceId)
      return sourceNode ? nodeByMeaning.get(createNodeMeaning(sourceNode))?.id : undefined
    }
    for (const host of source.navigationHosts ?? []) {
      const destinationId = redirect(host.destinationId)
      const activeChildDestinationId = redirect(host.activeChildDestinationId)
      const childDestinationIds = host.childDestinationIds
        .map(redirect)
        .filter((id): id is string => !!id)
      if (!destinationId || !activeChildDestinationId || childDestinationIds.length < 2) continue
      const existing = navigationHostByDestination.get(destinationId)
      if (existing) {
        existing.childDestinationIds = deduplicateStrings([...existing.childDestinationIds, ...childDestinationIds])
        existing.activeChildDestinationId = activeChildDestinationId
        existing.confidence = Math.max(existing.confidence ?? 0, host.confidence ?? 0) || undefined
        continue
      }
      const id = usedNavigationHostIds.has(host.id)
        ? allocateSemanticId('host', usedNavigationHostIds)
        : host.id
      usedNavigationHostIds.add(id)
      navigationHostByDestination.set(destinationId, {
        ...host,
        id,
        destinationId,
        activeChildDestinationId,
        childDestinationIds,
      })
    }
    for (const group of source.tabGroups ?? []) {
      const parentDestinationId = redirect(group.parentDestinationId)
      const selectedDestinationId = redirect(group.selectedDestinationId)
      const tabDestinationIds = group.tabDestinationIds
        .map(redirect)
        .filter((id): id is string => !!id)
      if (!parentDestinationId || !selectedDestinationId || tabDestinationIds.length < 2) continue
      const existing = tabGroupByParent.get(parentDestinationId)
      if (existing) {
        existing.tabDestinationIds = deduplicateStrings([...existing.tabDestinationIds, ...tabDestinationIds])
        existing.confidence = Math.max(existing.confidence ?? 0, group.confidence ?? 0) || undefined
        continue
      }
      const id = usedTabGroupIds.has(group.id)
        ? allocateSemanticId('tabs', usedTabGroupIds)
        : group.id
      usedTabGroupIds.add(id)
      tabGroupByParent.set(parentDestinationId, {
        ...group,
        id,
        parentDestinationId,
        selectedDestinationId,
        tabDestinationIds,
      })
    }
  }

  return normalizeAppGraphDefinition({
    schema: 'ansight.app-graph/v1',
    nodes: additiveLayout,
    edges,
    navigationHosts: [...navigationHostByDestination.values()],
    tabGroups: [...tabGroupByParent.values()],
    sourceMermaid: normalizedCandidates.map((candidate) => candidate.sourceMermaid).filter(Boolean).join('\n\n%% Demonstration boundary\n\n'),
  })
}

export function buildReviewedTrajectory(
  scope: string,
  annotations: AppGraphTimelineAnnotation[],
): AppGraphReviewedTrajectory {
  const ordered = [...annotations]
    .filter((annotation) => annotation.kind !== 'ignore')
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  const stateAnnotations = ordered.filter((annotation): annotation is AppGraphTimelineAnnotation & { kind: 'state' } => annotation.kind === 'state')
  const states = stateAnnotations.map((annotation, index) => ({
    id: `trajectory_state_${index + 1}`,
    annotationId: annotation.id,
    kind: 'state' as const,
    label: annotation.label.trim(),
    destinationKind: annotation.destinationKind,
    synonyms: annotation.synonyms ? deduplicateStrings(annotation.synonyms) : undefined,
    purpose: annotation.purpose?.trim() || annotation.description.trim() || undefined,
    parentStateLabel: annotation.parentStateLabel?.trim() || undefined,
    description: annotation.description.trim(),
    startMs: annotation.startMs,
    endMs: annotation.endMs,
  }))
  const transitions = states.slice(0, -1).map((state, index) => {
    const nextState = states[index + 1]
    const actions = ordered.filter((annotation) => (
      annotation.kind === 'action'
      && annotation.startMs > state.startMs
      && annotation.startMs <= nextState.startMs
    ))
    const branchConditions = ordered.filter((annotation) => (
      annotation.kind === 'condition'
      && annotation.startMs > state.startMs
      && annotation.startMs <= nextState.startMs
    ))
    const label = collapseDuplicateBoundaryAction(actions.map((action) => action.label.trim()).filter(Boolean).join(' + ')) || 'Continue'
    const preconditions = deduplicateStrings([
      ...actions.flatMap((action) => action.preconditions),
      ...branchConditions.map((condition) => condition.label.trim()),
      ...branchConditions.flatMap((condition) => condition.preconditions),
    ])
    const postconditions = deduplicateStrings([
      ...[...actions, ...branchConditions].flatMap((annotation) => annotation.postconditions),
      ...annotations.find((annotation) => annotation.id === nextState.annotationId)?.postconditions ?? [],
    ])
    const bindingCandidates = mergeBindingCandidates(
      [],
      actions.flatMap((action) => action.bindingCandidate
        ? [{
            ...cloneBindingCandidate(action.bindingCandidate),
            preconditions: deduplicateStrings([...action.bindingCandidate.preconditions, ...preconditions]),
            postconditions: deduplicateStrings([...action.bindingCandidate.postconditions, ...postconditions]),
          }]
        : []),
    )
    return {
      id: `trajectory_transition_${index + 1}`,
      fromStateId: state.id,
      toStateId: nextState.id,
      annotationIds: [...actions, ...branchConditions].map((annotation) => annotation.id),
      label,
      intent: [...actions, ...branchConditions].map((annotation) => annotation.description.trim()).filter(Boolean).join(' ') || label,
      parameters: deduplicateStrings([...actions, ...branchConditions].flatMap((annotation) => annotation.parameters)),
      preconditions,
      postconditions,
      ...(bindingCandidates.length > 0 ? { bindingCandidates } : {}),
    }
  })

  return {
    schema: 'ansight.app-graph-trajectory/v1',
    scope: scope.trim(),
    states,
    transitions,
  }
}

export function createAppGraphFromReviewedTrajectory(
  trajectory: AppGraphReviewedTrajectory,
  sourceMermaid?: string,
): AppGraphDefinition {
  const stateNodes: AppGraphNode[] = []
  const stateNodeByTrajectoryId = new Map<string, AppGraphNode>()
  const stateNodeByMeaning = new Map<string, AppGraphNode>()

  trajectory.states.forEach((state, index) => {
    const candidate: AppGraphNode = {
      ...createNode(
        `observed_state_${stateNodes.length + 1}`,
        state.destinationKind ?? inferDestinationKind(state.label, state.parentStateLabel),
        state.label,
        canvasInsetX + horizontalSpacing * stateNodes.length,
        canvasInsetY,
      ),
      parentScreen: state.parentStateLabel,
      synonyms: state.synonyms ? deduplicateStrings(state.synonyms) : [],
      purpose: state.purpose || state.description,
      ...(index === 0 ? { isEntry: true } : {}),
    }
    const meaning = createNodeMeaning(candidate)
    const node = stateNodeByMeaning.get(meaning) ?? candidate
    if (index === 0) node.isEntry = true
    if (!stateNodeByMeaning.has(meaning)) {
      stateNodeByMeaning.set(meaning, node)
      stateNodes.push(node)
    }
    stateNodeByTrajectoryId.set(state.id, node)
  })

  const edges: AppGraphEdge[] = []
  trajectory.transitions.forEach((transition, index) => {
    const from = stateNodeByTrajectoryId.get(transition.fromStateId)
    const to = stateNodeByTrajectoryId.get(transition.toStateId)
    if (!from || !to || from.id === to.id) return
    edges.push({
      id: `edge_transition_${index + 1}`,
      from: from.id,
      to: to.id,
      action: createElementAction(
        collapseDuplicateBoundaryAction(transition.label),
        transition.bindingCandidates,
      ),
      parameters: transition.parameters,
      preconditions: transition.preconditions,
      postconditions: transition.postconditions.length > 0
        ? transition.postconditions
        : [`${to.name} is visible`],
      ...(transition.bindingCandidates?.length
        ? {
            bindingCandidates: transition.bindingCandidates.map((candidate) => ({
              ...cloneBindingCandidate(candidate),
              preconditions: candidate.preconditions.length > 0 ? candidate.preconditions : transition.preconditions,
              postconditions: candidate.postconditions.length > 0
                ? candidate.postconditions
                : transition.postconditions.length > 0
                  ? transition.postconditions
                  : [`${to.name} is visible`],
            })),
          }
        : {}),
    })
  })
  return normalizeAppGraphDefinition({ schema: 'ansight.app-graph/v1', nodes: stateNodes, edges, sourceMermaid })
}

export function createAppGraphInductionPrompt(
  scope: string,
  reviewedTrajectory?: AppGraphReviewedTrajectory,
): string {
  const optionalDescription = scope.trim()
    ? `\nThe graph has this optional human description: "${scope.trim()}"\n`
    : ''
  const reviewedEvidence = reviewedTrajectory
    ? `\nThe teacher has already reviewed this destination path. Treat it as authoritative:\n${reviewedTrajectory.states.map((state, index) => {
      const transition = reviewedTrajectory.transitions[index]
      return transition
        ? `- ${formatMilliseconds(state.startMs)} ${formatTrajectoryStateLabel(state)} --[${transition.label}]--> ${reviewedTrajectory.states[index + 1] ? formatTrajectoryStateLabel(reviewedTrajectory.states[index + 1]) : ''}`
        : `- ${formatMilliseconds(state.startMs)} ${formatTrajectoryStateLabel(state)}`
    }).join('\n')}\n`
    : ''
  return `Extract reusable semantic App Graph knowledge from this demonstrated app behaviour.
${optionalDescription}
${reviewedEvidence}

Return a valid Mermaid flowchart only, without markdown fences.
- Start with exactly: flowchart LR
- Use 2-12 destination nodes and one directed action edge per line.
- Prefix node IDs with screen_, dialog_, or state_ to classify the destination.
- Declare every node as node_id["Canonical destination name"].
- Express each demonstrated path as destination -->|Element semantics| resulting destination.
- Express a branch as multiple action edges leaving a destination; put the branch guard in that edge's preconditions.
- Begin with the observed starting destination and finish with the observed resulting destination.
- A screen is a full navigable surface. A dialog is a modal, alert, sheet, or popover that temporarily overlays a screen. A named state is a meaningful destination within the same screen, such as a selected tab or mode.
- Preserve containment by writing a state label as "Parent screen › Named state" (for example, "Area details › Routes"). Do not turn incidental loading frames, expanded panels, or content changes into destinations.
- Model the element's product meaning as the edge label, not the raw gesture. Prefer "Show settings" over "Tap button".
- Retain the interacted element's stable automation ID in the UI-action binding evidence whenever one is present. Do not substitute coordinates, visible text, or implementation type when an automation ID is available.
- Prefer semantic actions, product operations, routes, and observable destinations over raw screen coordinates.
- Merge incidental taps, repeated loading frames, and implementation noise into the nearest semantic action.
- Treat names, IDs, search terms, and other changing values as action parameters rather than hard-coded destinations.
- Record the canonical name, likely synonyms, and user-facing purpose of each screen or dialog in the supporting evidence. Do not invent synonyms that are not supported by titles, labels, routes, or reviewed teaching.

This graph does not encode an agent goal or a preselected solution. It is a reusable destination-and-action directory that an agent can search later. Do not invent actions, branches, routes, or destinations that are not supported by the session evidence. Never contradict or omit a teacher-reviewed destination or transition.`
}

export function createNewGraphNode(kind: AppGraphNodeKind, existingNodes: AppGraphNode[]): AppGraphNode {
  const ordinal = existingNodes.filter((node) => node.kind === kind).length + 1
  const maxX = Math.max(canvasInsetX, ...existingNodes.map((node) => node.x))
  const peerCount = existingNodes.filter((node) => node.x === maxX).length
  return createNode(`${kind}_${Date.now().toString(36)}`, kind, defaultNodeLabel(kind, ordinal), maxX + horizontalSpacing, canvasInsetY + peerCount * verticalSpacing)
}

export function appGraphNodeKinds(): AppGraphNodeKind[] {
  return [...supportedNodeKinds]
}

export function appGraphNodeKindLabel(kind: AppGraphNodeKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function createNode(id: string, kind: AppGraphNodeKind, label: string, x: number, y: number): AppGraphNode {
  const hierarchy = kind === 'state' ? splitHierarchicalStateLabel(label) : null
  return {
    id,
    kind,
    name: hierarchy?.label ?? label.trim(),
    ...(hierarchy?.parentStateLabel ? { parentScreen: hierarchy.parentStateLabel } : {}),
    synonyms: [],
    purpose: '',
    x,
    y,
  }
}

function createEdge(from: string, to: string, label = ''): AppGraphEdge {
  const semanticMeaning = label.trim()
  return {
    id: `${from}-${to}-${label}`.replace(/[^a-zA-Z0-9-]/g, '-'),
    from,
    to,
    action: { automationId: '', semanticMeaning },
  }
}

function cloneNode(node: AppGraphNode): AppGraphNode {
  return {
    ...node,
    ...(node.synonyms ? { synonyms: [...node.synonyms] } : {}),
    ...(node.provenanceObservationIds ? { provenanceObservationIds: [...node.provenanceObservationIds] } : {}),
  }
}

function cloneEdge(edge: AppGraphEdge): AppGraphEdge {
  return {
    ...edge,
    action: { ...edge.action },
    ...(edge.parameters ? { parameters: [...edge.parameters] } : {}),
    ...(edge.preconditions ? { preconditions: [...edge.preconditions] } : {}),
    ...(edge.postconditions ? { postconditions: [...edge.postconditions] } : {}),
    ...(edge.provenanceObservationIds ? { provenanceObservationIds: [...edge.provenanceObservationIds] } : {}),
    ...(edge.bindingCandidates
      ? { bindingCandidates: edge.bindingCandidates.map(cloneBindingCandidate) }
      : {}),
  }
}

function cloneBindingCandidate(candidate: AppGraphBindingCandidate): AppGraphBindingCandidate {
  return {
    ...candidate,
    configuration: cloneRecord(candidate.configuration),
    preconditions: [...candidate.preconditions],
    postconditions: [...candidate.postconditions],
  }
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function normalizeDestinationNode(source: AppGraphNode): AppGraphNode {
  return {
    ...source,
    name: source.name.trim(),
    parentScreen: source.kind === 'dialog' ? undefined : source.parentScreen?.trim() || undefined,
    synonyms: deduplicateStrings(source.synonyms),
    purpose: source.purpose.trim(),
  }
}

function inferDestinationKind(label: string, parentStateLabel?: string): AppGraphDestinationKind {
  if (parentStateLabel?.trim()) return 'state'
  return /\b(dialog|modal|sheet|alert|popover)\b/i.test(label) ? 'dialog' : 'screen'
}

function normalizeElementAction(action: AppGraphEdge['action']): AppGraphEdge['action'] {
  return {
    automationId: action.automationId.trim(),
    semanticMeaning: collapseDuplicateBoundaryAction(action.semanticMeaning),
  }
}

function createElementAction(
  semanticMeaning: string,
  candidates?: AppGraphBindingCandidate[],
): NonNullable<AppGraphEdge['action']> {
  return {
    automationId: readBindingAutomationId(candidates),
    semanticMeaning: semanticMeaning.trim(),
  }
}

function readBindingAutomationId(candidates?: AppGraphBindingCandidate[]): string {
  for (const candidate of candidates ?? []) {
    const automationId = readSelectorAutomationId(candidate.configuration)
    if (automationId) return automationId
  }
  return ''
}

function readSelectorAutomationId(configuration: Record<string, unknown>): string {
  const selector = configuration.selector
  if (!selector || Array.isArray(selector) || typeof selector !== 'object') return ''
  const automationId = (selector as Record<string, unknown>).automationId
  return typeof automationId === 'string' ? automationId.trim() : ''
}

function mergeBindingCandidates(
  existing: AppGraphBindingCandidate[],
  additions: AppGraphBindingCandidate[],
): AppGraphBindingCandidate[] {
  const candidates = existing.map(cloneBindingCandidate)
  for (const addition of additions) {
    const fingerprint = bindingCandidateFingerprint(addition)
    const match = candidates.find((candidate) => bindingCandidateFingerprint(candidate) === fingerprint)
    if (match) {
      match.preconditions = deduplicateStrings([...match.preconditions, ...addition.preconditions])
      match.postconditions = deduplicateStrings([...match.postconditions, ...addition.postconditions])
      match.confidence = Math.max(match.confidence, addition.confidence)
      continue
    }
    candidates.push(cloneBindingCandidate(addition))
  }
  return candidates.sort((left, right) => right.confidence - left.confidence)
}

function bindingCandidateFingerprint(candidate: AppGraphBindingCandidate): string {
  return `${candidate.mechanism}:${stableJson(candidate.configuration)}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map((entry) => `${JSON.stringify(entry[0])}:${stableJson(entry[1])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function allocateSemanticId(prefix: string, usedIds: Set<string>): string {
  let ordinal = 1
  while (usedIds.has(`${prefix}_${ordinal}`)) ordinal += 1
  return `${prefix}_${ordinal}`
}

function inferNodeKind(nodeId: string): AppGraphNodeKind {
  const prefix = nodeId.split(/[_-]/)[0].toLowerCase() as AppGraphNodeKind
  return supportedNodeKinds.includes(prefix as AppGraphDestinationKind) ? prefix : 'screen'
}

function cleanMermaidLabel(label: string): string {
  return label.replace(/^['"]|['"]$/g, '').replace(/<br\s*\/?\s*>/gi, ' · ').replace(/\s+/g, ' ').trim()
}

function humanizeNodeId(nodeId: string): string {
  return nodeId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function deduplicateEdges(edges: AppGraphEdge[]): AppGraphEdge[] {
  const edgeByMeaning = new Map<string, AppGraphEdge>()
  for (const edge of edges) {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.action.semanticMeaning}`
    const existing = edgeByMeaning.get(key)
    if (existing) {
      const normalizedAction = normalizeElementAction(edge.action)
      if (!existing.action.automationId && normalizedAction.automationId) existing.action = normalizedAction
      existing.bindingCandidates = mergeBindingCandidates(
        existing.bindingCandidates ?? [],
        edge.bindingCandidates ?? [],
      )
      existing.provenanceObservationIds = deduplicateStrings([
        ...(existing.provenanceObservationIds ?? []),
        ...(edge.provenanceObservationIds ?? []),
      ])
      continue
    }
    edgeByMeaning.set(key, cloneEdge(edge))
  }
  return [...edgeByMeaning.values()]
}

function collapseDuplicateBoundaryAction(label: string): string {
  const actions = label.split(/\s+\+\s+/).map((action) => action.trim()).filter(Boolean)
  if (actions.length < 2) return label.trim()
  const verbs = actions.map((action) => action.split(/\s+/)[0]?.toLowerCase())
  const duplicatedNavigationBoundary = new Set(verbs).size === 1
    && ['open', 'select', 'tap', 'choose', 'show'].includes(verbs[0] ?? '')
  return duplicatedNavigationBoundary ? actions.at(-1) ?? label.trim() : actions.join(' + ')
}

function isVisualTreeImplementationLeak(node: AppGraphNode): boolean {
  if (!node.parentScreen) return false
  const parent = normalizeMeaning(node.parentScreen)
  const implementationWindow = [
    'application window',
    'application window details',
    'application windows',
    'application windows details',
    'ui window',
    'ui window details',
    'window details',
  ].includes(parent)
  const implementationIdentifier = /^(?:[a-z0-9]+-){2,}[a-z0-9]+$/i.test(node.name.trim())
    && /(?:^|-)(?:tab|tabs|toolbar|button|view|window)(?:-|$)/i.test(node.name.trim())
  return implementationWindow && implementationIdentifier
}

function layoutNodes(nodes: AppGraphNode[], edges: AppGraphEdge[]): AppGraphNode[] {
  const targetNodeIds = new Set(edges.map((edge) => edge.to))
  const depthByNodeId = new Map(nodes.map((node) => [node.id, targetNodeIds.has(node.id) ? 1 : 0]))

  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const edge of edges) {
      const fromDepth = depthByNodeId.get(edge.from) ?? 0
      const toDepth = depthByNodeId.get(edge.to) ?? 1
      if (toDepth <= fromDepth && fromDepth < nodes.length - 1) {
        depthByNodeId.set(edge.to, fromDepth + 1)
      }
    }
  }

  const rowByDepth = new Map<number, number>()
  return nodes.map((node) => {
    const depth = Math.min(depthByNodeId.get(node.id) ?? 0, 5)
    const row = rowByDepth.get(depth) ?? 0
    rowByDepth.set(depth, row + 1)
    return {
      ...node,
      x: canvasInsetX + depth * horizontalSpacing,
      y: canvasInsetY + row * verticalSpacing,
    }
  })
}

function defaultNodeLabel(kind: AppGraphNodeKind, ordinal: number): string {
  const labels: Record<AppGraphNodeKind, string> = {
    screen: 'Name this screen',
    dialog: 'Name this dialog',
    state: 'Name this screen state',
  }
  return ordinal === 1 ? labels[kind] : `${labels[kind]} ${ordinal}`
}

function normalizeMeaning(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function createNodeMeaning(node: AppGraphNode): string {
  return `${node.kind}:${normalizeMeaning(node.parentScreen ?? '')}:${normalizeMeaning(node.name)}`
}

function splitHierarchicalStateLabel(value: string): { label: string; parentStateLabel?: string } {
  const parts = value.split(/\s*›\s*/).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return { label: value.trim() }
  return {
    label: parts.at(-1) ?? value.trim(),
    parentStateLabel: parts.slice(0, -1).join(' › '),
  }
}

function formatTrajectoryStateLabel(state: AppGraphReviewedTrajectory['states'][number]): string {
  return state.parentStateLabel ? `${state.parentStateLabel} › ${state.label}` : state.label
}

function formatMilliseconds(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function deduplicateStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))]
}
