import { ArrowRight, Check, Copy, DeviceMobile, Play, Robot, VideoCamera, X } from '@phosphor-icons/react'
import { useState } from 'react'
import type { LocalGettingStartedState, LocalSessionSummary } from './types'

const installPrompt = 'Use https://www.ansight.ai/skills/ansight-install.md to set up Ansight in this project and verify a connected development build.'

const sdkGuides = [
  ['.NET / MAUI', '/docs/sdk/dotnet/setup'],
  ['iOS', '/docs/sdk/ios/setup'],
  ['Android', '/docs/sdk/android/setup'],
  ['React Native', '/docs/sdk/react-native/setup'],
  ['Flutter', '/docs/sdk/flutter/setup'],
  ['Capacitor', '/docs/sdk/cordova/setup'],
] as const

export function GettingStartedPanel({ state, sessions, onAction, onClose, onOpenApps, onOpenSession }: {
  state: LocalGettingStartedState
  sessions: LocalSessionSummary[]
  onAction: (action: string) => Promise<void>
  onClose: () => void
  onOpenApps: () => void
  onOpenSession: (sessionId: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connected = sessions.find((session) => state.capturePath === 'external'
    ? session.captureSource === 'device'
    : session.captureSource === 'sdk')
  const capture = sessions.find((session) => !session.isConnected && session.screenshotCount > 0)
  const replayed = state.replayedSessionId !== null
  const stages = [
    { label: 'Choose capture', complete: state.capturePath !== null },
    { label: 'Connect your app', complete: connected !== undefined },
    { label: 'Capture a session', complete: capture !== undefined },
    { label: 'Replay the session', complete: replayed },
    { label: 'Extract an automation', complete: state.automationSaved },
  ]
  const completedCount = stages.filter((stage) => stage.complete).length

  async function act(action: string) {
    setError(null)
    try { await onAction(action) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save your progress.') }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(installPrompt)
      setCopied(true)
    } catch { setError('Clipboard access is unavailable. Select and copy the prompt below.') }
  }

  return (
    <div className="local-getting-started">
      <header className="local-getting-started-header">
        <div>
          <p className="eyebrow">Getting started · {completedCount} of {stages.length} steps</p>
          <h1>See your app in Ansight</h1>
          <p>Connect a development build, capture a short journey, then turn what happened into a repeatable automation.</p>
        </div>
        <button aria-label="Close getting started" className="local-icon-button" onClick={onClose} type="button"><X aria-hidden="true" /></button>
      </header>
      <ol aria-label="Getting started progress" className="local-getting-started-progress">
        {stages.map((stage, index) => <li className={stage.complete ? 'is-complete' : ''} key={stage.label}>
          <span>{stage.complete ? <Check aria-label="Complete" /> : index + 1}</span>{stage.label}
        </li>)}
      </ol>
      {error ? <p className="inline-message" role="alert">{error}</p> : null}

      <section className="local-getting-started-card">
        <div className="local-getting-started-card-title"><DeviceMobile aria-hidden="true" /><div><small>01 / Choose capture</small><h2>Connect the app you are building</h2></div></div>
        <p>The SDK gives your agent and replay the app’s own view of a journey: touches, screen and lifecycle events, visual trees, logs, and any network evidence or app tools you enable. Keep it in trusted development or QA builds. External capture is a quick way to begin with an installed simulator or emulator app.</p>
        <div className="local-getting-started-choices">
          <button aria-pressed={state.capturePath === 'sdk'} className={state.capturePath === 'sdk' ? 'is-selected' : ''} onClick={() => void act('choose-sdk')} type="button"><strong>Install the SDK</strong><small>Recommended for complete evidence and app tools</small></button>
          <button aria-pressed={state.capturePath === 'external'} className={state.capturePath === 'external' ? 'is-selected' : ''} onClick={() => void act('choose-external')} type="button"><strong>Start with external capture</strong><small>Record an installed simulator or emulator app</small></button>
        </div>
        {state.capturePath === 'sdk' ? <div className="local-getting-started-instructions">
          <p>Open your app project in a coding agent and give it this prompt:</p>
          <div className="local-getting-started-prompt"><code>{installPrompt}</code><button aria-label="Copy SDK installation prompt" onClick={() => void copyPrompt()} type="button">{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}</button></div>
          <p>Manual setup: {sdkGuides.map(([label, href], index) => <span key={label}>{index > 0 ? ' · ' : ''}<a href={`https://www.ansight.ai${href}`} rel="noopener noreferrer" target="_blank">{label}</a></span>)}</p>
        </div> : null}
        {state.capturePath === 'external' ? <div className="local-getting-started-instructions"><p>Add the app’s bundle or package ID under Apps → Monitoring, then launch it in a simulator or emulator.</p><button className="button button--secondary" onClick={onOpenApps} type="button">Open app monitoring <ArrowRight /></button></div> : null}
      </section>

      <section className="local-getting-started-card">
        <div className="local-getting-started-card-title"><VideoCamera aria-hidden="true" /><div><small>02 / Capture</small><h2>Record your first session</h2></div></div>
        <p>{connected ? `${connected.appName || connected.clientName} has connected. Use the app and complete a short journey, then close it to finish the recording.` : 'Start the host, run your development app, and use it normally. Ansight will show the connection here when it arrives.'}</p>
        {capture ? <p className="local-getting-started-success"><Check /> A recorded session is ready.</p> : null}
      </section>

      <section className="local-getting-started-card">
        <div className="local-getting-started-card-title"><Play aria-hidden="true" /><div><small>03 / Replay</small><h2>Review what happened</h2></div></div>
        <p>Open the recorded session and use its playback controls or timeline. Screens, logs, touches, and other available evidence stay aligned in time.</p>
        {capture ? <button className="button button--secondary" onClick={() => onOpenSession(capture.sessionId)} type="button">Open first replay <ArrowRight /></button> : null}
        {replayed ? <p className="local-getting-started-success"><Check /> You have explored a replay.</p> : null}
      </section>

      <section className="local-getting-started-card">
        <div className="local-getting-started-card-title"><Robot aria-hidden="true" /><div><small>04 / Automate</small><h2>Extract a test or task</h2></div></div>
        <p>In the replay, select a useful timeline range with <strong>Tools → Drag range</strong>, then choose <strong>Extract test or task</strong>. Review the draft before saving or running it.</p>
        {capture ? <button className="button button--secondary" onClick={() => onOpenSession(capture.sessionId)} type="button">Open session timeline <ArrowRight /></button> : null}
        {state.automationSaved ? <p className="local-getting-started-success"><Check /> Your first automation is saved.</p> : null}
      </section>

      <footer className="local-getting-started-footer">
        <button className="button button--secondary" onClick={() => void act('skip')} type="button">Skip getting started</button>
        <button className="button button--primary" onClick={onClose} type="button">Continue in player</button>
      </footer>
    </div>
  )
}
