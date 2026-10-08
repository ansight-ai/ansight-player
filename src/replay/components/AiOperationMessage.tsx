import { ArrowSquareOut, WarningCircle } from '@phosphor-icons/react'

export function AiOperationMessage({ message, role }: { message: string; role?: 'alert' | 'status' }) {
  const allowanceReached = /no AI billing allowance remaining|no (?:billable AI credit|AI tokens) remaining|insufficient available AI credits/i.test(message)
  const billingNotConfigured = /no active OpenAI billing period/i.test(message)

  if (!allowanceReached && !billingNotConfigured) {
    return <p className="inline-message" role={role}>{message}</p>
  }

  return (
    <div className="inline-message ai-billing-notice" role="alert">
      <strong className="ai-billing-notice-heading">
        <WarningCircle aria-hidden="true" />
        {billingNotConfigured ? 'AI billing needs setup' : 'AI allowance reached'}
      </strong>
      <p>{billingNotConfigured
        ? 'Your organisation does not have an active AI billing period.'
        : 'Your organisation does not have enough AI credit available for this request.'}</p>
      <p>Open Billing in Ansight Portal and select the organisation used for this session. {billingNotConfigured
        ? 'An organisation owner or administrator can set up its billing.'
        : 'An organisation owner or administrator can review its billing and request more credit in the Credits section.'}</p>
      <a className="button button--secondary button--compact" href="https://app.ansight.ai/#billing" target="_blank" rel="noopener noreferrer" aria-label="Review AI allowance (opens in a new tab)">
        Review AI allowance <ArrowSquareOut aria-hidden="true" />
      </a>
      <p>{billingNotConfigured ? 'After billing is set up' : 'After the allowance is updated'}, return here and try again.</p>
    </div>
  )
}
