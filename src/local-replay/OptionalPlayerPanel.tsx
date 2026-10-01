import { useEffect, useState, type ComponentType } from 'react'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { CircleNotch, X } from '@phosphor-icons/react'

// Optional bundles share the renderer's React instance, including JSX runtime identity.
if (typeof window !== 'undefined') Object.assign(window, { __ansightPlayerReact: React, __ansightPlayerJsx: JsxRuntime })

type OptionalPanelModule = { default: Record<string, ComponentType<Record<string, unknown>>> }
const modules = new Map<string, Promise<OptionalPanelModule>>()

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
        const response = await fetch('api/bootstrap', { cache: 'no-store' })
        if (!response.ok) throw new Error('Unable to load optional feature metadata.')
        const bootstrap = await response.json() as { extensionUi?: Record<string, string> }
        const entry = bootstrap.extensionUi?.[component]
        if (!entry) throw new Error('This feature requires the optional cloud extension.')
        const url = new URL(entry, window.location.href)
        if (url.origin !== window.location.origin) throw new Error('Optional features must be served by this host.')
        let pending = modules.get(url.href)
        if (!pending) {
          pending = import(/* @vite-ignore */ url.href) as Promise<OptionalPanelModule>
          modules.set(url.href, pending)
          void pending.catch(() => modules.delete(url.href))
        }
        const module = await pending
        const panel = module.default[component]
        if (!panel) throw new Error('The installed extension does not provide this panel.')
        if (active) setPanel(() => panel)
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Unable to load this optional feature.')
      }
    }
    void load()
    return () => { active = false }
  }, [component])
  if (Panel) return <Panel {...panelProps} />

  const title = component === 'CloudAnalysisPlayer' ? 'Cloud analysis' : 'Optional feature'
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
