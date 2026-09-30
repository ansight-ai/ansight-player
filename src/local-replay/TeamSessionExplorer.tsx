import { OptionalPlayerPanel } from './OptionalPlayerPanel'
import type { ReactNode } from 'react'

export function TeamSessionExplorer(props: { headingAction?: ReactNode; onOpenSession: (sessionId: string) => void; onShowLocalSessions: () => void }) {
  return <OptionalPlayerPanel component="TeamSessionExplorer" panelProps={props} />
}
