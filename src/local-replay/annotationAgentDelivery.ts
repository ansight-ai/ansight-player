export type AnnotationAgentProvider = 'codex' | 'claude'
export type AnnotationAgentCatalog = {
  isSuccess: boolean
  message: string
  projects: Array<{ id: string; name: string; roots: string[] }>
  chats: Array<{ sessionId: string; title: string; status: string; workingDirectory?: string | null }>
  projectId?: string | null
  canQueue?: boolean
  canBatch?: boolean
}
export type AnnotationAgentRequest = {
  submissionId: string
  annotationId: string
  annotationIds?: string[]
  provider: AnnotationAgentProvider
  projectId: string
  chatSessionId?: string
  startNewTask: boolean
  queueAfterCurrent?: boolean
}
export type AnnotationAgentDelivery = {
  isSuccess: boolean
  message: string
  status: string
  taskLink?: { provider: AnnotationAgentProvider; providerTaskId: string; providerTaskTitle?: string | null; workingDirectory?: string | null } | null
}
export type AnnotationAgentSource = {
  transcriptionStatus?: (sessionId: string, signal: AbortSignal) => Promise<{ isConfigured: boolean; isSupported?: boolean }>
  prepareTranscription?: (sessionId: string, signal: AbortSignal) => Promise<{ isConfigured: boolean }>
  transcribe?: (sessionId: string, audio: Blob, signal: AbortSignal) => Promise<{ text: string }>
  catalog: (sessionId: string, provider: AnnotationAgentProvider, projectId?: string) => Promise<AnnotationAgentCatalog>
  send: (sessionId: string, request: AnnotationAgentRequest) => Promise<AnnotationAgentDelivery>
  status: (sessionId: string, submissionId: string) => Promise<AnnotationAgentDelivery>
}
export function isDeliveryPending(status: string) {
  return ['starting', 'creating', 'dispatching', 'accepted', 'steered', 'queued', 'running'].includes(status)
}
export const localAnnotationAgents: AnnotationAgentSource = {
  transcriptionStatus: async (sessionId, signal) => readTranscription(await fetch(`api/sessions/${encodeURIComponent(sessionId)}/annotation-transcription`, { signal })),
  prepareTranscription: async (sessionId, signal) => readTranscription(await fetch(`api/sessions/${encodeURIComponent(sessionId)}/annotation-transcription/prepare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal })),
  transcribe: async (sessionId, audio, signal) => readTranscription(await fetch(`api/sessions/${encodeURIComponent(sessionId)}/annotation-transcription`, {
    method: 'POST', headers: { 'Content-Type': audio.type }, body: audio, signal,
  })),
  catalog: (sessionId, provider, projectId) => get(sessionId, 'catalog', new URLSearchParams({ provider, ...(projectId ? { projectId } : {}) })),
  status: (sessionId, submissionId) => get(sessionId, 'status', new URLSearchParams({ submissionId })),
  send: async (sessionId, request) => read(await fetch(url(sessionId, request.queueAfterCurrent ? 'queue' : 'send'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })),
}
function url(sessionId: string, action: string) {
  return `api/sessions/${encodeURIComponent(sessionId)}/annotation-agents/${action}`
}
async function get<T>(sessionId: string, action: string, query: URLSearchParams): Promise<T> {
  return read(await fetch(`${url(sessionId, action)}?${query}`, { cache: 'no-store' }))
}
async function read<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.message || `Unable to reach the annotation delivery service (HTTP ${response.status}).`)
  return result as T
}

async function readTranscription<T>(response: Response): Promise<T> {
  if (response.status === 404) throw new Error('Restart Ansight with the updated local host to enable voice annotations.')
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.message || `Unable to transcribe audio (HTTP ${response.status}).`)
  return result as T
}
