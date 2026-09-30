import { CircleNotch, Info, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { LocalHostHealth } from './types'

export function AboutInstallationPanel({ onClose }: { onClose: () => void }) {
  const [health, setHealth] = useState<LocalHostHealth | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function loadInstallationDetails() {
      try {
        const response = await fetch('api/health', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`The local host returned HTTP ${response.status}.`)
        setHealth(await response.json() as LocalHostHealth)
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(resolveError(error, 'Unable to load installation details.'))
        }
      }
    }

    void loadInstallationDetails()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="local-admin-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <section aria-label="About Ansight" aria-modal="true" className="local-admin-panel local-about-panel" role="dialog">
        <header className="local-admin-header">
          <div><p className="eyebrow">About Ansight</p><span>Local installation and runtime details</span></div>
          <button aria-label="Close About Ansight" className="local-icon-button" onClick={onClose} type="button"><X aria-hidden="true" /></button>
        </header>
        {message ? <p className="inline-message local-admin-message" role="alert">{message}</p> : null}
        <div className="local-admin-content local-about-content">
          {!health && !message ? (
            <div className="local-admin-empty"><CircleNotch aria-hidden="true" className="spin" /><span>Loading installation details</span></div>
          ) : health ? (
            <>
              <section className="local-admin-section local-about-identity">
                <Info aria-hidden="true" />
                <span><strong>Ansight Local Host</strong><small>Version {health.hostVersion}</small></span>
              </section>
              <section className="local-admin-section">
                <dl className="local-admin-definition-list local-about-details">
                  <div><dt>Version</dt><dd>{health.hostVersion}</dd></div>
                  <div><dt>Operating system</dt><dd>{health.operatingSystem}</dd></div>
                  <div><dt>Architecture</dt><dd>{health.architecture}</dd></div>
                  <div><dt>.NET runtime</dt><dd>{health.dotNetVersion}</dd></div>
                  <div><dt>Data directory</dt><dd><code>{health.dataDirectory}</code></dd></div>
                  <div><dt>Log directory</dt><dd><code>{health.logDirectory}</code></dd></div>
                  <div><dt>Host status</dt><dd>{health.isHealthy ? 'Healthy' : 'Needs attention'}</dd></div>
                </dl>
              </section>
              <p className="local-about-caption">These details describe the Ansight Host serving this local explorer.</p>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function resolveError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
