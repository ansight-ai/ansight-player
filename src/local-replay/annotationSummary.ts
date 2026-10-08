import type { AgentReasoning } from '../agentReasoning'
import { readSessionOperationStream, type SessionOperationProgress } from './sessionOperationStream'

export type AnnotationSummaryOptions = {
  startUtc: string
  endUtc: string
  reasoning: AgentReasoning
}

export async function summariseLocalAnnotation(
  sessionId: string,
  options: AnnotationSummaryOptions,
  onProgress: (progress: SessionOperationProgress) => void,
): Promise<string> {
  const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/annotation-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(options),
  })
  type SummaryResponse = { isSuccess: boolean; comment?: string; message?: string }
  const result = response.headers.get('Content-Type')?.includes('application/x-ndjson')
    ? await readSessionOperationStream<SummaryResponse>(response, onProgress)
    : await response.json().catch(() => null) as SummaryResponse | null
  if (!response.ok || !result?.isSuccess) {
    throw new Error(result?.message || `Unable to summarise the section: HTTP ${response.status}`)
  }
  if (!result.comment?.trim()) throw new Error('The summary returned an empty annotation. Please try again.')
  return result.comment.trim()
}
