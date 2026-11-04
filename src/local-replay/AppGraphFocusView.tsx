import { ArrowDown, ArrowRight } from '@phosphor-icons/react'
import type { AppGraphDefinition, AppGraphEdge } from '../types'
import { readAppGraphFocus } from '../replay/appGraphFocus'
import type { AppGraphConnection } from '../replay/appGraphFocus'

export function AppGraphFocusView({ definition, nodeId, onSelectNode }: {
  definition: AppGraphDefinition
  nodeId: string
  onSelectNode: (nodeId: string) => void
}) {
  const focus = readAppGraphFocus(definition, nodeId)
  if (!focus) return null

  return (
    <section aria-label="Screen connections" className="local-app-graph-focus">
      {focus.ancestors.length > 0 ? (
        <nav aria-label="Containing screens" className="local-app-graph-breadcrumbs">
          <span>Inside</span>
          {focus.ancestors.map(ancestor => (
            <button key={ancestor.id} onClick={() => onSelectNode(ancestor.id)} type="button">
              {ancestor.name}<ArrowRight aria-hidden="true" />
            </button>
          ))}
        </nav>
      ) : null}
      <header className="local-app-graph-focus-node">
        <small>{focus.node.kind} · selected</small>
        <h2>{focus.node.name}</h2>
        <p>{focus.node.purpose}</p>
      </header>
      {focus.children.length > 0 ? (
        <section aria-label="Contained screens and states" className="local-app-graph-focus-children">
          <h3>Inside this screen <span>{focus.children.length}</span></h3>
          <div>{focus.children.map(child => (
            <button key={child.id} onClick={() => onSelectNode(child.id)} type="button">
              {child.name}<ArrowRight aria-hidden="true" />
            </button>
          ))}</div>
        </section>
      ) : null}
      <div className="local-app-graph-focus-connections">
        <ConnectionList connections={focus.incoming} direction="incoming" onSelectNode={onSelectNode} />
        <ConnectionList connections={focus.outgoing} direction="outgoing" onSelectNode={onSelectNode} />
      </div>
      {focus.localActions.length > 0 ? (
        <section className="local-app-graph-focus-local">
          <h3>Actions that stay here <span>{focus.localActions.length}</span></h3>
          <ActionList edges={focus.localActions} />
        </section>
      ) : null}
      <p className="local-app-graph-focus-hint">Select a connected screen to follow its paths. Only recorded transitions are shown.</p>
    </section>
  )
}

function ConnectionList({ connections, direction, onSelectNode }: {
  connections: AppGraphConnection[]
  direction: 'incoming' | 'outgoing'
  onSelectNode: (nodeId: string) => void
}) {
  const incoming = direction === 'incoming'
  const title = incoming ? 'Arrive from' : 'Go to'
  return (
    <section aria-label={title}>
      <h3>{title} <span>{connections.length}</span></h3>
      {connections.length === 0 ? <p className="local-app-graph-focus-hint">No recorded {direction} transitions.</p> : null}
      <div className="local-app-graph-connection-list">
        {connections.map(connection => (
          <article className="local-app-graph-connection" key={connection.node.id}>
            <button onClick={() => onSelectNode(connection.node.id)} type="button">
              <span><small>{connection.node.kind}</small><strong>{connection.node.name}</strong></span>
              <ArrowRight aria-hidden="true" />
            </button>
            <div className="local-app-graph-connection-actions">
              <small><ArrowDown aria-hidden="true" />{incoming ? 'To this screen' : 'From this screen'}</small>
              <ActionList edges={connection.edges} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ActionList({ edges }: { edges: AppGraphEdge[] }) {
  return <ul>{edges.map(edge => (
    <li key={edge.id}>
      <span>{edge.action.semanticMeaning || edge.action.automationId || 'Observed action'}</span>
      {edge.action.hasStableAutomationId === false || !edge.action.automationId
        ? <small>Observed selector · no stable ID</small>
        : null}
    </li>
  ))}</ul>
}
