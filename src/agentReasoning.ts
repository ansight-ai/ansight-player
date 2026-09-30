export const agentReasoningModes = [
  { value: 'fast', label: 'Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'deep', label: 'Deep' },
] as const

export type AgentReasoning = (typeof agentReasoningModes)[number]['value']

export const defaultAgentReasoning: AgentReasoning = 'fast'

export const providerReasoningEfforts = ['low', 'medium', 'high', 'xhigh'] as const

export type ProviderReasoningEffort = (typeof providerReasoningEfforts)[number]
