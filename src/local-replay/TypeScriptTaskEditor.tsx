import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/typescript/register'
import {
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
  getTypeScriptWorker,
  typescriptDefaults,
} from 'monaco-editor/languages/features/typescript/register'
import 'monaco-editor/editor/contrib/codeAction/browser/codeActionContributions'
import 'monaco-editor/editor/contrib/codelens/browser/codelensController'
import 'monaco-editor/editor/contrib/documentSymbols/browser/documentSymbols'
import 'monaco-editor/editor/contrib/folding/browser/folding'
import 'monaco-editor/editor/contrib/format/browser/formatActions'
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError'
import 'monaco-editor/editor/contrib/gotoSymbol/browser/goToSymbol'
import 'monaco-editor/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition'
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/editor/contrib/inlayHints/browser/inlayHintsContribution'
import 'monaco-editor/editor/contrib/parameterHints/browser/parameterHints'
import 'monaco-editor/editor/contrib/rename/browser/rename'
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2'
import 'monaco-editor/editor/contrib/suggest/browser/suggestController'
import './monacoEnvironment'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { validateRecordedAutomationIds, withRecordedAutomationIds } from './recordedAutomationIds'
import type { LocalTaskSupportModule } from './types'

export type TypeScriptEditorDiagnostics = {
  errorCount: number
  isReady: boolean
  warningCount: number
}

type DiagnosticMessage = string | {
  messageText: string
  next?: DiagnosticMessage[]
}

const semanticValidationTimeoutMs = 10_000

export function TypeScriptTaskEditor({
  automationIds,
  fileName,
  onChange,
  onDiagnosticsChange,
  readOnly,
  source,
  supportModules,
  typeDefinitions,
}: {
  automationIds?: readonly string[] | null
  fileName: string
  onChange: (source: string) => void
  onDiagnosticsChange: (diagnostics: TypeScriptEditorDiagnostics) => void
  readOnly: boolean
  source: string
  supportModules: LocalTaskSupportModule[]
  typeDefinitions: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const onChangeRef = useRef(onChange)
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange)
  const initialReadOnlyRef = useRef(readOnly)
  const initialSourceRef = useRef(source)
  const validationRequestRef = useRef(0)
  const validationTimerRef = useRef<number | null>(null)
  const recordedDefinitions = useMemo(() => withRecordedAutomationIds(typeDefinitions, automationIds), [typeDefinitions, automationIds])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onDiagnosticsChangeRef.current = onDiagnosticsChange
  }, [onDiagnosticsChange])

  useEffect(() => {
    typescriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.NodeJs,
      noEmit: true,
      strict: true,
      target: ScriptTarget.ESNext,
    })
    typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    })
    typescriptDefaults.setEagerModelSync(true)

    const definitionUri = 'file:///ansight/tasks/ansight-task.d.ts'
    const disposable = typescriptDefaults.addExtraLib(
      recordedDefinitions,
      definitionUri,
    )
    const supportDisposables = supportModules.map((module) => typescriptDefaults.addExtraLib(
      module.source,
      `file:///ansight/tasks/${module.path.split('/').map(encodeURIComponent).join('/')}`,
    ))
    if (modelRef.current) {
      scheduleSemanticValidation(
        modelRef.current,
        validationRequestRef,
        validationTimerRef,
        onDiagnosticsChangeRef,
      )
    }
    return () => {
      disposable.dispose()
      supportDisposables.forEach((supportDisposable) => supportDisposable.dispose())
    }
  }, [supportModules, recordedDefinitions])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const modelUri = monaco.Uri.parse(`file:///ansight/tasks/${encodeURIComponent(fileName)}.ts`)
    const model = monaco.editor.createModel(initialSourceRef.current, 'typescript', modelUri)
    modelRef.current = model
    const editor = monaco.editor.create(container, {
      ariaLabel: `TypeScript editor for ${fileName}.ts`,
      automaticLayout: true,
      codeLens: true,
      contextmenu: true,
      cursorBlinking: 'smooth',
      fixedOverflowWidgets: true,
      folding: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      formatOnPaste: true,
      glyphMargin: true,
      hover: { enabled: 'on' },
      inlayHints: { enabled: 'on' },
      lineHeight: 19,
      minimap: { enabled: false },
      model,
      padding: { bottom: 12, top: 12 },
      readOnly: initialReadOnlyRef.current,
      renderValidationDecorations: 'on',
      scrollBeyondLastLine: false,
      'semanticHighlighting.enabled': true,
      stickyScroll: { enabled: true },
      suggest: { showWords: false },
      quickSuggestions: { other: true, comments: false, strings: true },
      tabSize: 2,
      theme: resolveEditorTheme(),
      wordWrap: 'off',
    })
    editorRef.current = editor

    const contentDisposable = editor.onDidChangeModelContent(() => {
      onChangeRef.current(model.getValue())
      scheduleSemanticValidation(model, validationRequestRef, validationTimerRef, onDiagnosticsChangeRef)
    })
    scheduleSemanticValidation(model, validationRequestRef, validationTimerRef, onDiagnosticsChangeRef)
    const themeObserver = new MutationObserver(() => monaco.editor.setTheme(resolveEditorTheme()))
    themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'], attributes: true })
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => monaco.editor.setTheme(resolveEditorTheme())
    colorScheme.addEventListener('change', updateSystemTheme)

    return () => {
      colorScheme.removeEventListener('change', updateSystemTheme)
      themeObserver.disconnect()
      contentDisposable.dispose()
      cancelSemanticValidation(validationRequestRef, validationTimerRef)
      monaco.editor.setModelMarkers(model, 'ansight-task-compiler', [])
      editor.dispose()
      model.dispose()
      editorRef.current = null
      modelRef.current = null
    }
  }, [fileName])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    const validate = () => {
      monaco.editor.setModelMarkers(model, 'ansight-recorded-selectors', validateRecordedAutomationIds(model.getValue(), automationIds).map((warning) => {
        const start = model.getPositionAt(warning.start)
        const end = model.getPositionAt(warning.end)
        return {
          message: warning.message,
          severity: monaco.MarkerSeverity.Warning,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        }
      }))
    }
    validate()
    scheduleSemanticValidation(model, validationRequestRef, validationTimerRef, onDiagnosticsChangeRef)
    const subscription = model.onDidChangeContent(validate)
    return () => {
      subscription.dispose()
      if (!model.isDisposed()) monaco.editor.setModelMarkers(model, 'ansight-recorded-selectors', [])
    }
  }, [automationIds, fileName])

  useEffect(() => {
    const model = modelRef.current
    if (model && model.getValue() !== source) model.setValue(source)
  }, [fileName, source])

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly })
  }, [readOnly])

  return <div className="local-task-extraction-editor" ref={containerRef} />
}

function cancelSemanticValidation(
  requestRef: MutableRefObject<number>,
  timerRef: MutableRefObject<number | null>,
) {
  requestRef.current += 1
  if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  timerRef.current = null
}

function scheduleSemanticValidation(
  model: monaco.editor.ITextModel,
  requestRef: MutableRefObject<number>,
  timerRef: MutableRefObject<number | null>,
  diagnosticsRef: MutableRefObject<(diagnostics: TypeScriptEditorDiagnostics) => void>,
) {
  requestRef.current += 1
  const request = requestRef.current
  if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  diagnosticsRef.current({ errorCount: 0, isReady: false, warningCount: 0 })
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null
    void runSemanticValidation(model, request, requestRef, diagnosticsRef)
  }, 200)
}

async function runSemanticValidation(
  model: monaco.editor.ITextModel,
  request: number,
  requestRef: MutableRefObject<number>,
  diagnosticsRef: MutableRefObject<(diagnostics: TypeScriptEditorDiagnostics) => void>,
) {
  try {
    const diagnostics = await withTimeout((async () => {
      const workerFactory = await getTypeScriptWorker()
      const worker = await workerFactory(model.uri)
      const fileName = model.uri.toString()
      return [
        ...await worker.getSyntacticDiagnostics(fileName),
        ...await worker.getSemanticDiagnostics(fileName),
      ]
    })(), semanticValidationTimeoutMs)
    if (request !== requestRef.current || model.isDisposed()) return
    const markers: monaco.editor.IMarkerData[] = diagnostics.map((diagnostic) => {
      const start = model.getPositionAt(diagnostic.start ?? 0)
      const end = model.getPositionAt((diagnostic.start ?? 0) + Math.max(1, diagnostic.length ?? 1))
      return {
        code: String(diagnostic.code),
        endColumn: end.column,
        endLineNumber: end.lineNumber,
        message: flattenDiagnosticMessage(diagnostic.messageText),
        severity: diagnostic.category === 1
          ? monaco.MarkerSeverity.Error
          : diagnostic.category === 0
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
        startColumn: start.column,
        startLineNumber: start.lineNumber,
      }
    })
    monaco.editor.setModelMarkers(model, 'ansight-task-compiler', markers)
    diagnosticsRef.current({
      errorCount: markers.filter((marker) => marker.severity === monaco.MarkerSeverity.Error).length,
      isReady: true,
      warningCount: markers.filter((marker) => marker.severity === monaco.MarkerSeverity.Warning).length
        + monaco.editor.getModelMarkers({ resource: model.uri, owner: 'ansight-recorded-selectors' }).length,
    })
  } catch {
    if (request !== requestRef.current || model.isDisposed()) return
    monaco.editor.setModelMarkers(model, 'ansight-task-compiler', [{
      endColumn: 1,
      endLineNumber: 1,
      message: 'The bundled TypeScript language service could not validate this task.',
      severity: monaco.MarkerSeverity.Error,
      startColumn: 1,
      startLineNumber: 1,
    }])
    diagnosticsRef.current({ errorCount: 1, isReady: true, warningCount: 0 })
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: number | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = window.setTimeout(
          () => reject(new Error(`TypeScript validation exceeded ${timeoutMs}ms.`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout)
  }
}

function flattenDiagnosticMessage(message: DiagnosticMessage): string {
  if (typeof message === 'string') return message
  const nested = message.next?.map(flattenDiagnosticMessage) ?? []
  return [message.messageText, ...nested].join('\n')
}

function resolveEditorTheme(): 'vs' | 'vs-dark' {
  const explicitTheme = document.documentElement.dataset.theme
  if (explicitTheme === 'dark') return 'vs-dark'
  if (explicitTheme === 'light') return 'vs'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs'
}
