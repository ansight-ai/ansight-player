import { CircleNotch, Play, Stop, X } from '@phosphor-icons/react'

export function TaskDraftTestControls({ status, canTest, hasResult, isUpdating, onTest, onCancel, onClear }: {
  status: string
  canTest: boolean
  hasResult: boolean
  isUpdating: boolean
  onTest: () => void
  onCancel: () => void
  onClear: () => void
}) {
  const isRunning = status === 'running' || status === 'cancelling'
  return <div className="local-admin-actions local-task-extraction-test-actions">
    <button className="button button--secondary" disabled={!canTest || isRunning || isUpdating} onClick={onTest} type="button">
      {isRunning ? <CircleNotch className="spin" /> : <Play />}Test draft
    </button>
    {isRunning ? <button className="button button--danger" disabled={isUpdating || status === 'cancelling'} onClick={onCancel} type="button">
      {status === 'cancelling' ? <CircleNotch className="spin" /> : <Stop />}{status === 'cancelling' ? 'Cancelling…' : 'Cancel test'}
    </button> : hasResult ? <button className="button button--secondary" disabled={isUpdating} onClick={onClear} type="button">
      <X />Clear result
    </button> : null}
  </div>
}
