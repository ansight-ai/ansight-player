import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/yaml/register'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/folding/browser/folding'
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/editor/contrib/suggest/browser/suggestController'
import './monacoEnvironment'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { getTestCompletions, getTestIdConflict, getTestIdDeclaration, getTestKeyDocumentation, getTestTaskHover, type TestSchema } from './yamlTestCompletions'
import type { LocalRepositoryTask, LocalRepositoryWorkspaceCatalog, LocalWorkspaceTest } from './types'

const SourceCodeEditor = lazy(() => import('./TraceSourceCodeEditor'))

export function YamlTestEditor({ appId, source, onChange, onIdConflictChange, currentTestPath, validationError }: {
  appId: string
  source: string
  onChange: (source: string) => void
  onIdConflictChange?: (conflict: boolean) => void
  currentTestPath?: string | null
  validationError: string | null
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const onChangeRef = useRef(onChange)
  const initialSourceRef = useRef(source)
  const schemaRef = useRef<TestSchema | null>(null)
  const tasksRef = useRef<LocalRepositoryTask[]>([])
  const testsRef = useRef<LocalWorkspaceTest[]>([])
  const currentTestPathRef = useRef(currentTestPath)
  const onIdConflictChangeRef = useRef(onIdConflictChange)
  const [selectedTask, setSelectedTask] = useState<LocalRepositoryTask | null>(null)
  const [previewTask, setPreviewTask] = useState<LocalRepositoryTask | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [testId, setTestId] = useState<string | null>(null)
  const [idCatalogStatus, setIdCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onIdConflictChangeRef.current = onIdConflictChange }, [onIdConflictChange])
  useEffect(() => { currentTestPathRef.current = currentTestPath; updateIdConflict() }, [currentTestPath])

  function updateIdConflict() {
    const model = modelRef.current
    if (!model) return
    setTestId(getTestIdDeclaration(model.getValue())?.value ?? null)
    const conflict = getTestIdConflict(model.getValue(), testsRef.current, currentTestPathRef.current)
    const message = conflict ? `Test ID '${conflict.test.testId}' is already used by '${conflict.test.name}' at ${conflict.test.filePath}. Choose a unique ID.` : null
    setConflictMessage(message)
    onIdConflictChangeRef.current?.(!!conflict)
    monaco.editor.setModelMarkers(model, 'ansight-test-id', conflict ? [{
      message: message!, severity: monaco.MarkerSeverity.Error,
      startLineNumber: conflict.lineNumber, endLineNumber: conflict.lineNumber,
      startColumn: conflict.startColumn, endColumn: conflict.endColumn,
    }] : [])
  }

  useEffect(() => {
    if (!containerRef.current) return
    const model = monaco.editor.createModel(initialSourceRef.current, 'yaml')
    modelRef.current = model
    const editor = monaco.editor.create(containerRef.current, {
      ariaLabel: 'Ansight test YAML editor',
      automaticLayout: true,
      folding: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: false },
      model,
      padding: { top: 12, bottom: 12 },
      renderValidationDecorations: 'on',
      scrollBeyondLastLine: false,
      quickSuggestions: { other: true, comments: false, strings: true },
      wordBasedSuggestions: 'off',
      tabSize: 2,
      theme: editorTheme(),
      wordWrap: 'on',
    })
    editorRef.current = editor
    const completionProvider = monaco.languages.registerCompletionItemProvider('yaml', {
      triggerCharacters: [':', ' ', '-'],
      provideCompletionItems(candidate, position) {
        const schema = schemaRef.current
        if (candidate !== model || !schema) return { suggestions: [] }
        return { suggestions: getTestCompletions(candidate.getValue(), position.lineNumber, position.column, schema, tasksRef.current).map((completion) => ({
          label: completion.label,
          kind: completion.kind === 'key' ? monaco.languages.CompletionItemKind.Property
            : completion.kind === 'task' ? monaco.languages.CompletionItemKind.Reference
              : monaco.languages.CompletionItemKind.Value,
          insertText: completion.insertText,
          detail: completion.detail,
          documentation: completion.documentation,
          sortText: `${completion.kind === 'task' ? '0' : '1'}${completion.label}`,
          range: new monaco.Range(position.lineNumber, completion.startColumn, position.lineNumber, completion.endColumn),
        })) }
      },
    })
    const hoverProvider = monaco.languages.registerHoverProvider('yaml', {
      provideHover(candidate, position) {
        if (candidate !== model) return null
        const taskHover = getTestTaskHover(candidate.getValue(), position.lineNumber, position.column, tasksRef.current)
        if (taskHover) {
          const { task } = taskHover
          return {
            range: new monaco.Range(position.lineNumber, taskHover.startColumn, position.lineNumber, taskHover.endColumn),
            contents: [
              { value: `**${escapeMarkdown(task.title || task.taskId)}**` },
              { value: `Task ID: \`${escapeMarkdown(task.taskId)}\`` },
              ...(task.description ? [{ value: escapeMarkdown(task.description) }] : []),
              { value: 'Select the task ID, then use **Preview task** below the editor.' },
            ],
          }
        }
        const schema = schemaRef.current
        if (!schema) return null
        const documentation = getTestKeyDocumentation(candidate.getValue(), position.lineNumber, position.column, schema)
        return documentation ? { contents: [{ value: documentation }] } : null
      },
    })
    const updateSelectedTask = () => {
      const position = editor.getPosition()
      setSelectedTask(position ? getTestTaskHover(model.getValue(), position.lineNumber, position.column, tasksRef.current)?.task ?? null : null)
    }
    const contentSubscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(model.getValue())
      updateSelectedTask()
      updateIdConflict()
    })
    const cursorSubscription = editor.onDidChangeCursorPosition(updateSelectedTask)
    const clickSubscription = editor.onMouseDown((event) => {
      if (!event.event.metaKey && !event.event.ctrlKey) return
      const position = event.target.position
      const task = position ? getTestTaskHover(model.getValue(), position.lineNumber, position.column, tasksRef.current)?.task : null
      if (task) {
        event.event.preventDefault()
        setPreviewTask(task)
      }
    })
    updateIdConflict()
    const updateTheme = () => monaco.editor.setTheme(editorTheme())
    const themeObserver = new MutationObserver(updateTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', updateTheme)
    return () => {
      media.removeEventListener('change', updateTheme)
      themeObserver.disconnect()
      contentSubscription.dispose()
      cursorSubscription.dispose()
      clickSubscription.dispose()
      completionProvider.dispose()
      hoverProvider.dispose()
      monaco.editor.setModelMarkers(model, 'ansight-yaml', [])
      monaco.editor.setModelMarkers(model, 'ansight-test-id', [])
      editor.dispose()
      model.dispose()
      editorRef.current = null
      modelRef.current = null
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('api/apps/workspace/test-schema', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json() as TestSchema
      })
      .then((schema) => {
        schemaRef.current = schema
        showAvailableTaskSuggestions(editorRef.current, modelRef.current, schema, tasksRef.current)
      })
      .catch(() => { schemaRef.current = null })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    tasksRef.current = []
    fetch(`api/apps/workspace?appId=${encodeURIComponent(appId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json() as LocalRepositoryWorkspaceCatalog
      })
      .then((catalog) => {
        tasksRef.current = catalog.tasks.filter((task) => task.appId.toLowerCase() === appId.toLowerCase())
        if (schemaRef.current) showAvailableTaskSuggestions(editorRef.current, modelRef.current, schemaRef.current, tasksRef.current)
      })
      .catch(() => { tasksRef.current = [] })
    return () => controller.abort()
  }, [appId])

  useEffect(() => {
    let controller: AbortController | null = null
    testsRef.current = []
    updateIdConflict()
    const refreshTests = () => {
      controller?.abort()
      controller = new AbortController()
      const requestController = controller
      fetch(`api/apps/workspace/test-ids?appId=${encodeURIComponent(appId)}`, { cache: 'no-store', signal: requestController.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return await response.json() as LocalWorkspaceTest[]
        })
        .then((tests) => { if (!requestController.signal.aborted) { testsRef.current = tests; setIdCatalogStatus('ready'); updateIdConflict() } })
        .catch(() => { if (!requestController.signal.aborted) { testsRef.current = []; setIdCatalogStatus('error'); updateIdConflict() } })
    }
    refreshTests()
    const editorFocusSubscription = editorRef.current?.onDidFocusEditorText(refreshTests)
    window.addEventListener('focus', refreshTests)
    return () => { controller?.abort(); editorFocusSubscription?.dispose(); window.removeEventListener('focus', refreshTests) }
  }, [appId])

  useEffect(() => {
    if (modelRef.current && modelRef.current.getValue() !== source) modelRef.current.setValue(source)
  }, [source])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    const location = validationError?.match(/\bline\s*:?\s*(\d+)(?:[,;\s]+(?:column|col)\s*:?\s*(\d+))?/i)
    const line = Math.min(model.getLineCount(), Math.max(1, Number(location?.[1] ?? 1)))
    const column = Math.min(model.getLineMaxColumn(line), Math.max(1, Number(location?.[2] ?? 1)))
    monaco.editor.setModelMarkers(model, 'ansight-yaml', validationError ? [{
      message: validationError,
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: line,
      endLineNumber: line,
      startColumn: column,
      endColumn: Math.min(model.getLineMaxColumn(line), column + 1),
    }] : [])
  }, [validationError])

  return <div className="local-yaml-test-editor-wrap">
    <div className="local-yaml-test-editor" ref={containerRef} />
    <div className="local-yaml-test-editor-actions">
      <span>{conflictMessage ? <span role="alert" className="local-yaml-test-id-conflict">{conflictMessage}</span>
        : idCatalogStatus === 'error' ? <span role="status">Could not check existing test IDs; Validate will check before saving.</span>
          : idCatalogStatus === 'loading' ? <span role="status">Checking existing test IDs…</span>
            : testId ? <span role="status">Test ID <code>{testId}</code> is available in this workspace.</span>
              : 'Select a task ID to preview its definition.'}</span>
      {selectedTask ? <button className="button button--secondary" onClick={() => setPreviewTask(selectedTask)} type="button">Preview task</button> : null}
    </div>
    {previewTask ? <TaskPreviewModal appId={appId} task={previewTask} onClose={() => setPreviewTask(null)} /> : null}
  </div>
}

function editorTheme(): string {
  return document.documentElement.dataset.theme === 'dark'
    || (document.documentElement.dataset.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'vs-dark' : 'vs'
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>-]/g, '\\$&')
}

function TaskPreviewModal({ appId, task, onClose }: { appId: string, task: LocalRepositoryTask, onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`api/apps/workspace/task-source?appId=${encodeURIComponent(appId)}&taskId=${encodeURIComponent(task.taskId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { source?: string, message?: string }
        if (!response.ok || typeof body.source !== 'string') throw new Error(body.message || `HTTP ${response.status}`)
        return body.source
      })
      .then(setSource)
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load task source.') })
    return () => controller.abort()
  }, [appId, task.taskId])
  return <dialog ref={dialogRef} className="local-task-source-modal local-task-preview-modal" aria-labelledby="task-preview-title"
    onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="local-task-source-body">
      <header><div><h3 id="task-preview-title">{task.title || task.taskId}</h3><p><code>{task.taskId}</code> · {task.enabled ? 'Enabled' : 'Disabled'}</p></div>
        <button type="button" aria-label="Close task preview" onClick={onClose}>Close</button></header>
      <div className="local-task-source-controls local-task-preview-details">
        <p>{task.description || 'No description.'}</p>
        <p><strong>Feature:</strong> {task.feature || 'Uncategorised'} · <strong>Keywords:</strong> {task.keywords.join(', ') || 'None'}</p>
        <p><strong>Host tools:</strong> {task.declaredHostTools.join(', ') || 'None'} · <strong>Limits:</strong> {task.timeoutSeconds}s, {task.maximumActions} actions</p>
        <code>{task.modulePath}</code>
      </div>
      <div className="local-task-source-editor local-task-preview-source">
        {error ? <p role="alert">{error}</p> : source === null ? <p role="status">Loading task source…</p>
          : <Suspense fallback={<p role="status">Loading code viewer…</p>}>
            <SourceCodeEditor module={{ path: task.modulePath, language: 'typescript', content: source }} />
          </Suspense>}
      </div>
    </div>
  </dialog>
}

function showAvailableTaskSuggestions(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  model: monaco.editor.ITextModel | null,
  schema: TestSchema,
  tasks: LocalRepositoryTask[],
): void {
  const position = editor?.getPosition()
  if (!editor?.hasTextFocus() || !model || !position) return
  const suggestions = getTestCompletions(model.getValue(), position.lineNumber, position.column, schema, tasks)
  if (suggestions.some((suggestion) => suggestion.kind === 'task')) {
    editor.trigger('ansight-yaml', 'editor.action.triggerSuggest', {})
  }
}
