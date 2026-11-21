import { useEffect, useRef, useState } from 'react'
import { ArrowClockwise, PaperPlaneTilt } from '../icons'
import {
  isDeliveryPending, type AnnotationAgentCatalog, type AnnotationAgentDelivery,
  type AnnotationAgentProvider, type AnnotationAgentRequest, type AnnotationAgentSource,
} from './annotationAgentDelivery'

type SavedDelivery = { submissionId: string; provider: AnnotationAgentProvider; projectId?: string; chatSessionId?: string; queueAfterCurrent?: boolean }
function readSaved(key: string): SavedDelivery | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return value && typeof value.submissionId === 'string' && ['codex', 'claude'].includes(value.provider) ? value : null
  } catch { return null }
}

export function AnnotationAgentDeliveryPanel({ sessionId, annotationId, source, disabled, onSend, onBusyChange, showSave = true }: {
  showSave?: boolean
  sessionId: string
  annotationId: string
  source: AnnotationAgentSource
  disabled: boolean
  onSend: (request: AnnotationAgentRequest) => Promise<AnnotationAgentDelivery>
  onBusyChange: (busy: boolean) => void
}) {
  const storageKey = `ansight.annotationDelivery:${sessionId}:${annotationId}`
  const preferenceKey = `ansight.annotationDestination:${sessionId}`
  const [saved, setSaved] = useState(() => readSaved(storageKey))
  const [preferred] = useState(() => readSaved(preferenceKey))
  const [provider, setProvider] = useState<AnnotationAgentProvider>(saved?.provider ?? preferred?.provider ?? 'codex')
  const [projectId, setProjectId] = useState(saved?.projectId ?? preferred?.projectId ?? '')
  const [chatId, setChatId] = useState(saved?.chatSessionId ?? preferred?.chatSessionId ?? '')
  const [search, setSearch] = useState('')
  const [catalog, setCatalog] = useState<AnnotationAgentCatalog | null>(null)
  const [delivery, setDelivery] = useState<AnnotationAgentDelivery | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sendingMode, setSendingMode] = useState<'queue' | 'send'>('send')
  const [revision, setRevision] = useState(0)
  const busyRef = useRef(false)

  useEffect(() => {
    let active = true
    source.catalog(sessionId, provider, projectId || undefined).then(value => {
      if (!active) return
      setCatalog(value)
      if (!value.isSuccess) setError(value.message)
    }).catch(error => { if (active) setError(String(error.message || error)) })
    return () => { active = false }
  }, [source, sessionId, provider, projectId, revision, saved])

  useEffect(() => {
    if (!saved) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      try {
        const result = await source.status(sessionId, saved!.submissionId)
        if (!active) return
        setDelivery(previous => result.status === 'not_found' && previous?.status === 'failed' ? previous : result)
        if (result.status !== 'not_found') setError('')
        if (isDeliveryPending(result.status)) timer = setTimeout(() => void poll(), 2500)
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : 'Unable to check delivery. Your saved delivery will not be sent again.')
      }
    }
    void poll()
    return () => { active = false; clearTimeout(timer) }
  }, [source, sessionId, saved, revision])

  const loading = catalog === null && !error
  const selectedProject = projectId || catalog?.projectId || ''
  const chats = (catalog?.chats ?? []).filter(chat => `${chat.title} ${chat.sessionId}`.toLowerCase().includes(search.toLowerCase()))
  const selectedChat = catalog?.chats.find(chat => chat.sessionId === chatId)

  const canQueue = provider === 'codex' && !!chatId && chatId !== '__new__'

  async function send(queueAfterCurrent = false) {
    if (busyRef.current || disabled || loading || saved || !selectedProject || !chatId || !catalog?.isSuccess) return
    if (queueAfterCurrent && !canQueue) return
    if (queueAfterCurrent && catalog?.canQueue !== true) {
      setError('Restart Ansight with the updated local host to enable Queue. Your comment has not been sent.')
      return
    }
    setSendingMode(queueAfterCurrent ? 'queue' : 'send')
    busyRef.current = true
    setSending(true)
    onBusyChange(true)
    setError('')
    const pending: SavedDelivery = { submissionId: crypto.randomUUID(), provider, projectId: selectedProject, chatSessionId: chatId, queueAfterCurrent }
    // Persist before dispatch: a network failure must not silently create a second delivery.
    try {
      localStorage.setItem(storageKey, JSON.stringify(pending))
      localStorage.setItem(preferenceKey, JSON.stringify(pending))
      const result = await onSend({ ...pending, annotationId, projectId: selectedProject,
        chatSessionId: chatId === '__new__' ? undefined : chatId, startNewTask: chatId === '__new__' })
      setDelivery(result)
      setSaved(pending)
    } catch (error) {
      setSaved(pending)
      setError(error instanceof Error ? error.message : 'Unable to confirm delivery. Check its status before sending again.')
    } finally {
      busyRef.current = false
      setSending(false)
      onBusyChange(false)
    }
  }

  function newDelivery() {
    localStorage.removeItem(storageKey)
    setSaved(null)
    setCatalog(null)
    setDelivery(null)
    setError('')
    setChatId('')
  }

  return <>
    <section className="annotation-agent-delivery" aria-label="Send annotation to a coding agent"><div className="annotation-agent-fields">
        <div className="annotation-agent-destination">
          <label><span>Agent</span><select disabled={sending || !!saved} value={provider} onChange={event => {
            setProvider(event.target.value as AnnotationAgentProvider); setProjectId(''); setChatId(''); setSearch(''); setCatalog(null); setError('')
          }}><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
          <label><span>Project</span><select disabled={loading || sending || !!saved} value={selectedProject} onChange={event => {
            setProjectId(event.target.value); setChatId(''); setCatalog(null); setError('')
          }}><option value="">{loading ? 'Loading…' : 'Choose a project…'}</option>{catalog?.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        </div>
        <div className="annotation-agent-destination">
          <label><span>Find chat</span><input value={search} disabled={sending || !!saved || !selectedProject} placeholder="Search chats…" onChange={event => setSearch(event.target.value)} /></label>
          <label><span className="annotation-agent-chat-label">Chat
            <button aria-label="Refresh chats" title="Refresh chats" className="annotation-agent-refresh" type="button" disabled={loading || sending} onClick={() => { setCatalog(null); setError(''); setRevision(value => value + 1) }}><ArrowClockwise aria-hidden="true" /></button>
          </span><select aria-label="Chat" value={chatId} title={selectedChat?.workingDirectory || undefined} disabled={sending || loading || !!saved || !selectedProject} onChange={event => setChatId(event.target.value)}>
            <option value="">{loading ? 'Loading…' : 'Choose a chat…'}</option><option value="__new__">Start a new chat</option>
            {selectedChat && !chats.some(c => c.sessionId === chatId) && <option value={chatId}>{selectedChat.title}</option>}
            {chats.map(chat => <option key={chat.sessionId} value={chat.sessionId}>{chat.title} · {chat.sessionId.slice(0, 8)}</option>)}
          </select></label>
        </div>
      {delivery && <div role="status" className="annotation-agent-result">
        <strong>{delivery.status === 'ready_for_review' ? 'Ready to review' : delivery.status === 'needs_attention' ? 'Check the chat' : delivery.status.replaceAll('_', ' ')}</strong>
        <p>{delivery.message}</p>
        {delivery.taskLink?.providerTaskId && <>
          <p>Chat: {delivery.taskLink.providerTaskTitle || delivery.taskLink.providerTaskId}</p>
          {delivery.taskLink.provider === 'codex'
            ? <a href={`codex://threads/${encodeURIComponent(delivery.taskLink.providerTaskId)}`}>Open in Codex</a>
            : <p>Resume in Claude Code: <code>claude --resume {delivery.taskLink.providerTaskId}</code></p>}
        </>}
      </div>}
      {error && <p role="alert" className="inline-message">{error}</p>}
      {saved && <div className="annotation-agent-controls">
        <button className="button button--secondary button--compact" type="button" disabled={sending} onClick={() => setRevision(value => value + 1)}>Check delivery</button>
        {delivery && !isDeliveryPending(delivery.status) && <button className="button button--secondary button--compact" type="button" onClick={newDelivery}>Start another delivery</button>}
      </div>}
    </div></section>
    <div className="annotation-editor-actions annotation-editor-actions--right">
      {showSave ? <button className="button button--secondary" disabled={disabled || sending} type="submit">Save</button> : null}
      <button className="button button--secondary" type="button"
        title={provider !== 'codex' ? 'Queue is available for Codex chats.' : chatId === '__new__' ? 'Choose an existing chat to queue behind its current work.' : 'Save and queue after the agent’s current work'}
        disabled={disabled || sending || !!saved || loading || !catalog?.isSuccess || !selectedProject || !canQueue}
        onClick={() => void send(true)}>
        {sending && sendingMode === 'queue' ? 'Queueing…' : 'Queue'}
      </button>
      <button className="button button--primary" type="button"
        disabled={disabled || sending || !!saved || loading || !catalog?.isSuccess || !selectedProject || !chatId}
        onClick={() => void send()}>
        <PaperPlaneTilt aria-hidden="true" />{sending && sendingMode === 'send' ? 'Sending…' : 'Send'}
      </button>
    </div>
  </>
}
