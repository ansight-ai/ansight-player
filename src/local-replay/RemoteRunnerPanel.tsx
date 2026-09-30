import { OptionalPlayerPanel } from './OptionalPlayerPanel'
import type { LocalRemoteRunnerRegistration, LocalRemoteRunnerStatus } from './types'

export function RemoteRunnerPanel(props: { canManage: boolean; onClose: () => void; onOpenAccount: () => void; registration: LocalRemoteRunnerRegistration | null; status: LocalRemoteRunnerStatus | null }) {
  return <OptionalPlayerPanel component="RemoteRunnerPanel" panelProps={props} />
}
