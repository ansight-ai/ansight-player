import { Check, CheckCircle, Sparkle } from '@phosphor-icons/react'
import { agentReasoningModes, type AgentReasoning } from '../../agentReasoning'
import type { SessionOperationProgress } from '../../local-replay/sessionOperationStream'

const steps = ['Load session', 'Prepare evidence', 'Analyse section', 'Write annotation']
const stageSteps: Record<string, number> = { loading: 0, preparing: 1, evidence: 1, screenshots: 1, analysis: 2, formatting: 3 }

export function AnnotationSummaryProgress({ progress, elapsedSeconds, reasoning, isRunning }: {
  progress: SessionOperationProgress
  elapsedSeconds: number
  reasoning: AgentReasoning
  isRunning: boolean
}) {
  if (!isRunning) return <p className="annotation-summary-ready" role="status"><CheckCircle aria-hidden="true" />{progress.message}</p>

  const activeStep = stageSteps[progress.stage ?? 'loading'] ?? 0
  const reasoningLabel = agentReasoningModes.find(mode => mode.value === reasoning)?.label ?? 'Fast'
  const elapsed = elapsedSeconds < 60 ? `${elapsedSeconds}s` : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`
  return (
    <div className="annotation-summary-progress">
      <div className="annotation-summary-progress-heading">
        <strong><Sparkle className="summary-sparkle-pulse" aria-hidden="true" />Summarising section</strong>
        <span className="annotation-summary-elapsed" aria-live="off">{elapsed} elapsed</span>
      </div>
      <ol className="annotation-summary-steps" aria-label="Summary stages">
        {steps.map((step, index) => <li key={step} className={index < activeStep ? 'is-complete' : index === activeStep ? 'is-current' : ''} aria-current={index === activeStep ? 'step' : undefined}>
          <span className="annotation-summary-step-icon" aria-hidden="true">{index < activeStep ? <Check weight="bold" /> : index + 1}</span>
          <span>{step}</span>
        </li>)}
      </ol>
      <div className="annotation-summary-activity" role="progressbar" aria-label="Summarising section" aria-valuetext={progress.message}><span /></div>
      <p className="annotation-summary-current" role="status">{progress.message}</p>
      {activeStep === 2 ? <p className="muted">{reasoningLabel} reasoning{reasoning === 'deep' ? ' may take longer' : ' selected'}. Waiting for the model’s response.</p> : null}
    </div>
  )
}
