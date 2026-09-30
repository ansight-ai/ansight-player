import { OptionalPlayerPanel } from './OptionalPlayerPanel'
import type { LocalSessionSummary } from './types'

export function ShareLocalSessionModal(props: { onClose: () => void; onOpenAccount: () => void; session: LocalSessionSummary }) {
  return <OptionalPlayerPanel component="ShareLocalSessionModal" panelProps={props} />
}
