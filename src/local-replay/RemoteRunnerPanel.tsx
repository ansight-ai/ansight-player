import { OptionalPlayerPanel } from './OptionalPlayerPanel'
import { RunnerOpenAiSettings } from './RunnerOpenAiSettings'
import { X } from '@phosphor-icons/react'
import type { LocalRemoteRunnerRegistration, LocalRemoteRunnerStatus } from './types'

export function RemoteRunnerPanel(props: { canManage: boolean; supportsCloud?: boolean; onClose: () => void; onOpenAccount: () => void; registration: LocalRemoteRunnerRegistration | null; status: LocalRemoteRunnerStatus | null }) {
  if (props.supportsCloud !== false) {
    return <OptionalPlayerPanel component="RemoteRunnerPanel" panelProps={{ ...props, localAiSettings: <RunnerOpenAiSettings /> }} />
  }

  return (
    <div className="local-admin-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) {
        props.onClose()
      }
    }}>
      <section aria-label="Runner settings" className="local-admin-panel">
        <header className="local-admin-header">
          <div><p className="eyebrow">Runner</p><span>Local AI settings</span></div>
          <button aria-label="Close runner settings" className="local-icon-button" onClick={props.onClose} type="button"><X aria-hidden="true" /></button>
        </header>
        <div className="local-admin-content"><RunnerOpenAiSettings /></div>
      </section>
    </div>
  )
}
