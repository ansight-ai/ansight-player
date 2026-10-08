import { CheckCircle, XCircle } from '@phosphor-icons/react'
import type { TaskAssertionTrace } from './taskCallTrace'

export function TaskAssertionResults({ trace }: { trace: TaskAssertionTrace }) {
  const failed = trace.rows.filter(({ assertion }) => !assertion.passed).length
  return <section aria-label="Task assertions" className="local-task-call-results">
    <header className="local-task-call-results-header">
      <div><strong>Assertions</strong>{trace.rows.length ? <span>{trace.rows.length} checked · {trace.rows.length - failed} passed · {failed} failed</span> : null}</div>
    </header>
    {trace.message ? <p className="local-task-call-notice">{trace.message}</p> : null}
    {trace.rows.map(({ id, taskPath, assertion }) => <details className="local-task-assertion" key={id} open={!assertion.passed}>
      <summary>
        <span className={`local-task-call-status${assertion.passed ? '' : ' local-task-call-status--failed'}`}>{assertion.passed ? <CheckCircle aria-hidden="true" /> : <XCircle aria-hidden="true" />}{assertion.passed ? 'Passed' : 'Failed'}</span>
        <code>{assertion.matcher ?? 'expect'}</code><strong>{assertion.assertionId}</strong>
        {taskPath ? <span>Nested task call {taskPath}</span> : null}
      </summary>
      <div className="local-task-call-detail">
        <div className="local-task-call-metadata"><p>{assertion.message}</p>{assertion.completedAtUtc ? <span>Checked (UTC): {assertion.completedAtUtc}</span> : null}</div>
        <div className="local-task-call-payloads">
          {(['expected', 'actual'] as const).map((key) => <section className="local-task-call-payload" key={key}>
            <h5>{key === 'expected' ? 'Expected' : 'Actual'}</h5>
            {key in assertion ? <pre>{JSON.stringify(assertion[key], null, 2)}</pre> : <p className="local-task-call-notice">Not recorded in this trace.</p>}
          </section>)}
        </div>
      </div>
    </details>)}
  </section>
}
