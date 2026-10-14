import { CheckCircle, CircleNotch, MinusCircle, TestTube, XCircle } from '@phosphor-icons/react'
import type { SessionUiTest } from '../sessionUiTest'
import './SessionUiTestBadge.css'

export function SessionUiTestBadge({ test }: { test: SessionUiTest | null }) {
  if (!test) return null
  const label = {
    running: 'Running', passed: 'Passed', failed: 'Failed', cancelled: 'Cancelled', skipped: 'Skipped', unknown: 'Unknown',
  }[test.status]
  const Icon = test.status === 'running' ? CircleNotch : test.status === 'passed' ? CheckCircle
    : test.status === 'failed' ? XCircle : test.status === 'unknown' ? TestTube : MinusCircle
  return (
    <span aria-label={`UI test: ${label}`} className={`session-ui-test-badge session-ui-test-badge--${test.status}`} role="status"
      title={[`UI test: ${label}`, test.testName, test.testId && `Test: ${test.testId}`, test.runId && `Run: ${test.runId}`, test.batchRunId && `Batch: ${test.batchRunId}`].filter(Boolean).join('\n')}>
      <Icon aria-hidden="true" className={test.status === 'running' ? 'spin' : undefined} />
    </span>
  )
}
