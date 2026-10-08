import type { LocalTestToolCallAudit } from './types'

export const taskChoiceToolName = 'ansight_declare_uncovered_step'
export const taskChoiceTitle = 'Choose how to continue'
export const taskChoiceHelp = 'The agent checks whether a saved task can handle the next step, or whether it needs to use the app controls.'

export function taskChoicePresentation(call: LocalTestToolCallAudit) {
  if (call.toolName !== taskChoiceToolName) return null
  const args = readObject(call.arguments?.content)
  const payload = readObject(call.result?.content)
  const result = objectValue(payload?.result) ?? payload
  const nextStep = textValue(result?.uncoveredStep) ?? textValue(args?.uncoveredStep)
  const evidence = textValue(result?.evidence) ?? textValue(args?.evidence)
  const task = textValue(result?.relatedTaskTitle) ?? textValue(result?.relatedTaskId) ?? textValue(args?.relatedTaskId)
  const taskLabel = task ? `“${task}”` : 'The saved task'
  const reason = textValue(result?.reason) ?? textValue(args?.reason)
  const explanations: Record<string, string> = {
    'no-matching-task': 'No saved task covers this step.',
    'starting-state-not-satisfied': `${taskLabel} needs its starting screen or app state set up first.`,
    'scope-mismatch': `${taskLabel} includes work outside this test.`,
    'missing-input': `${taskLabel} needs information that is not available.`,
    'partial-task-residual': `${taskLabel} passed. This step still needs to be completed.`,
    'task-failed': `${taskLabel} failed. The agent has proposed a next step.`,
  }
  const accepted = !call.isError && result?.accepted === true
  const canUseAppControls = accepted && result?.manualUiAllowed === true
  let summary = call.isError
    ? 'The agent needs to check its task choice again before continuing. See the recorded result for the reason.'
    : 'The agent is checking whether a saved task can handle the next step.'
  if (accepted) {
    const explanation = explanations[reason ?? ''] ?? 'The agent has checked the available saved tasks.'
    summary = canUseAppControls
      ? `${explanation} ${nextStep ? `Next, the agent will use the app controls: ${nextStep}` : 'The agent can continue using the app controls.'}`
      : `${explanation} Other saved tasks still need to be checked before using the app controls.`
  }
  return { title: taskChoiceTitle, summary, nextStep, evidence, canUseAppControls }
}

function readObject(content?: string | null): Record<string, unknown> | null {
  if (!content) return null
  try { return objectValue(JSON.parse(content)) } catch { return null }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
