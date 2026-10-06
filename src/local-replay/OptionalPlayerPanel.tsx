import { useEffect, useState, type ComponentType } from 'react'
import { CircleNotch, X } from '@phosphor-icons/react'
import { loadOptionalPlayerFeature } from './loadOptionalPlayerFeature'

export function OptionalPlayerPanel({ component, panelProps }: {
  component: string
  panelProps: Record<string, unknown>
}) {
  const [Panel, setPanel] = useState<ComponentType<Record<string, unknown>> | null>(null)
  const [message, setMessage] = useState('Loading optional feature…')
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const panel = await loadOptionalPlayerFeature<ComponentType<Record<string, unknown>>>(component)
        if (active) setPanel(() => panel)
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Unable to load this optional feature.')
      }
    }
    void load()
    return () => { active = false }
  }, [component])
  if (Panel) return <Panel {...panelProps} />

  const title = 'Optional feature'
  return (
    <div className="local-admin-backdrop" role="presentation">
      <section aria-label={title} className="local-admin-panel">
        <header className="local-admin-header">
          <div><p className="eyebrow">{title}</p></div>
          <div><button aria-label={`Close ${title.toLowerCase()}`} className="local-icon-button" onClick={panelProps.onClose as (() => void) | undefined} type="button"><X aria-hidden="true" /></button></div>
        </header>
        <div className="local-admin-empty" role="status">
          {message === 'Loading optional feature…' ? <CircleNotch className="spin" aria-hidden="true" /> : null}
          <strong>{message}</strong>
        </div>
      </section>
    </div>
  )
}
