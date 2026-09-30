import { getCloudPlayerAdapter } from '../adapters/cloudPlayerAdapter'
import type { AiProvider, SessionAiCapabilities, SessionAiExtractionKind, SessionAiExtractionMode, SessionAiExtractionSummary, SessionAiSourcePart } from '../types'

export type CreateSessionAiExtractionRequest = {
  sessionId: string
  kind: SessionAiExtractionKind
  analysisMode: SessionAiExtractionMode
  provider: AiProvider
  model: string
  sourceParts: SessionAiSourcePart[]
  sliceStartMs: number | null
  sliceEndMs: number | null
  promptInstructions: string
}

export type SessionAiSourcePartOption = {
  value: SessionAiSourcePart
  label: string
  count?: number
}

export const aiProviders: Array<{ value: AiProvider; label: string; defaultModel: string }> = [
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-5.5' },
  { value: 'anthropic', label: 'Anthropic', defaultModel: 'claude-sonnet-4-6' },
  { value: 'gemini', label: 'Gemini', defaultModel: 'gemini-3-flash-preview' },
]

export const defaultSessionAiPrompts: Record<SessionAiExtractionKind, string> = {
  analysis: `Write concise steps to reproduce for a debugging handoff.

Format:
- Use 6-8 numbered steps maximum.
- Each step should be one short sentence.
- Write direct present-tense instructions, for example: "Open Settings", "Tap Retry", "Verify the error appears", or "Confirm the dialog closes".
- Do not use the term "the user".
- Do not narrate past actions with "opened", "saw", "selected", or similar history language.
- Do not add a "Next step to reproduce" item or any closing recommendation.
- Start from the first meaningful screen or action needed to replay the issue.
- Include expected observations as "Verify..." or "Confirm..." steps.
- Include at most 3 evidence references total, only where they anchor the main failure or reproduction path.
- Do not list IDs, routes, screenshots, timestamps, asset sizes, or internal logs unless essential to reproduce or identify the issue.
- Compress setup/search/navigation into fewer steps when possible.

The result should read like a tester's reproduction script, not a forensic transcript.`,
  mermaid:
    `Extract a compact Mermaid flowchart for a debugging handoff.

Format:
- Return a valid Mermaid flowchart only, without markdown fences.
- Use 6-8 nodes maximum.
- Keep node labels short, ideally 3-8 words.
- Show the user-visible journey and final unresolved issue.
- Use one simple top-to-bottom path unless a branch is essential.
- Merge setup, routine navigation, successful loads, repeated errors, and implementation details into nearby user-flow nodes.
- Do not create separate nodes for cache clearing, view model loading, analytics, asset sizes, search cache setup, incidental 404 clusters, or technical logs unless they are the main issue.
- Prefer one final issue node for relevant failures instead of many error nodes.

The result should read like a compact visual reproduction path, not a forensic event timeline.`,
}

export const sessionAiSourcePartLabels: Record<SessionAiSourcePart, string> = {
  session_metadata: 'Session metadata',
  logs: 'Logs',
  screenshots: 'Screenshots',
  visual_tree: 'Visual tree',
  metrics: 'Metrics',
  annotations: 'Annotations',
  artifacts: 'Artifacts',
}

export async function loadSessionAiCapabilities(sessionId: string): Promise<SessionAiCapabilities | null> {
  return getCloudPlayerAdapter().ai.loadSessionAiCapabilities(sessionId)
}

export async function loadSessionAiExtractions(sessionId: string): Promise<SessionAiExtractionSummary[]> {
  return getCloudPlayerAdapter().ai.loadSessionAiExtractions(sessionId)
}

export async function createSessionAiExtraction(request: CreateSessionAiExtractionRequest): Promise<string> {
  return getCloudPlayerAdapter().ai.createSessionAiExtraction(request)
}

export async function archiveSessionAiExtraction(runId: string, shouldArchive: boolean): Promise<void> {
  return getCloudPlayerAdapter().ai.archiveSessionAiExtraction(runId, shouldArchive)
}

export async function invokeSessionAiExtraction(runId: string, options: { notifyTeam?: boolean } = {}): Promise<void> {
  return getCloudPlayerAdapter().ai.invokeSessionAiExtraction(runId, options)
}

export function providerIsConfigured(capabilities: SessionAiCapabilities | null, provider: AiProvider): boolean {
  if (!capabilities) {
    return false
  }

  if (provider === 'openai') {
    return capabilities.openai_configured
  }
  if (provider === 'anthropic') {
    return capabilities.anthropic_configured
  }

  return capabilities.gemini_configured
}

export function defaultModelForProvider(provider: AiProvider): string {
  return aiProviders.find((entry) => entry.value === provider)?.defaultModel ?? ''
}

export function defaultPromptForSessionAiKind(kind: SessionAiExtractionKind): string {
  return defaultSessionAiPrompts[kind]
}

export function formatAiProvider(provider: AiProvider): string {
  return aiProviders.find((entry) => entry.value === provider)?.label ?? provider
}

export function formatSessionAiKind(kind: SessionAiExtractionKind): string {
  return kind === 'mermaid' ? 'Flowchart' : 'Summary'
}

export function formatSessionAiMode(mode: SessionAiExtractionMode): string {
  return mode === 'thorough' ? 'Thorough' : 'Fast'
}

export function formatSessionAiSourceParts(parts: SessionAiSourcePart[]): string {
  return parts.map((part) => sessionAiSourcePartLabels[part] ?? part).join(', ')
}

export function formatTokenCount(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function formatCostMicros(value: number | null, currency: string): string {
  if (value === null) {
    return 'Rate card pending'
  }

  return new Intl.NumberFormat(undefined, {
    currency: currency || 'USD',
    style: 'currency',
    maximumFractionDigits: 6,
  }).format(value / 1_000_000)
}

export type SessionAiDataServices = {
  loadSessionAiCapabilities: (sessionId: string) => Promise<SessionAiCapabilities | null>
  loadSessionAiExtractions: (sessionId: string) => Promise<SessionAiExtractionSummary[]>
  createSessionAiExtraction: (request: CreateSessionAiExtractionRequest) => Promise<string>
  archiveSessionAiExtraction: (runId: string, shouldArchive: boolean) => Promise<void>
  invokeSessionAiExtraction: (runId: string, options?: { notifyTeam?: boolean }) => Promise<void>
}
