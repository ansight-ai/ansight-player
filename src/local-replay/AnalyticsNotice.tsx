import { ShieldCheck, X } from '@phosphor-icons/react'
import { useRef, useState } from 'react'

const dismissalKey = 'ansight.local-analytics-notice-dismissed'

export function AnalyticsNotice() {
  const trigger = useRef<HTMLButtonElement>(null)
  const notice = useRef<HTMLElement>(null)
  const [isOpen, setIsOpen] = useState(() => {
    try { return window.localStorage.getItem(dismissalKey) !== '1' }
    catch { return true }
  })

  function dismiss() {
    if (notice.current?.contains(document.activeElement)) trigger.current?.focus()
    setIsOpen(false)
    // Dismissal only hides this notice; it does not grant analytics consent.
    try { window.localStorage.setItem(dismissalKey, '1') }
    catch { /* The notice can still be dismissed when browser storage is unavailable. */ }
  }

  return <>
    <button
      aria-controls="local-analytics-notice"
      aria-expanded={isOpen}
      aria-label="Privacy and analytics"
      className="local-banner-button"
      onClick={() => isOpen ? dismiss() : setIsOpen(true)}
      ref={trigger}
      type="button"
    >
      <ShieldCheck aria-hidden="true" />
      Privacy
    </button>
    {isOpen ? <aside
      aria-labelledby="local-analytics-notice-title"
      className="local-analytics-notice"
      id="local-analytics-notice"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); dismiss() }
      }}
      ref={notice}
    >
      <div className="local-analytics-notice-heading">
        <strong id="local-analytics-notice-title">Usage analytics</strong>
        <button aria-label="Dismiss analytics notice" className="local-banner-button local-banner-button--icon" onClick={dismiss} type="button">
          <X aria-hidden="true" />
        </button>
      </div>
      <p>Ansight sends pseudonymous CLI and player activity to PostHog, including without sign-in. Baseline daily activity, hourly engagement, and install/update events remain enabled. Analytics excludes capture contents.</p>
      <p>Detailed analytics is off by default and requires sign-in and explicit opt-in. Disabling it leaves baseline measurement enabled.</p>
      <dl>
        <dt>Check status in your terminal</dt>
        <dd><code>ansight analytics status</code></dd>
        <dt>Disable detailed analytics</dt>
        <dd><code>ansight analytics detailed disable</code></dd>
      </dl>
      <a href="https://www.ansight.ai/privacy" rel="noreferrer" target="_blank">Read the privacy policy</a>
    </aside> : null}
  </>
}
