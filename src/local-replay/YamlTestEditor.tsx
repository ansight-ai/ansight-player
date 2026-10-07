import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/yaml/register'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/folding/browser/folding'
import './monacoEnvironment'
import { useEffect, useRef } from 'react'

export function YamlTestEditor({ source, onChange, validationError }: {
  source: string
  onChange: (source: string) => void
  validationError: string | null
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const onChangeRef = useRef(onChange)
  const initialSourceRef = useRef(source)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

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
      tabSize: 2,
      theme: editorTheme(),
      wordWrap: 'on',
    })
    editorRef.current = editor
    const contentSubscription = editor.onDidChangeModelContent(() => onChangeRef.current(model.getValue()))
    const updateTheme = () => monaco.editor.setTheme(editorTheme())
    const themeObserver = new MutationObserver(updateTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', updateTheme)
    return () => {
      media.removeEventListener('change', updateTheme)
      themeObserver.disconnect()
      contentSubscription.dispose()
      monaco.editor.setModelMarkers(model, 'ansight-yaml', [])
      editor.dispose()
      model.dispose()
      editorRef.current = null
      modelRef.current = null
    }
  }, [])

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

  return <div className="local-yaml-test-editor" ref={containerRef} />
}

function editorTheme(): string {
  return document.documentElement.dataset.theme === 'dark'
    || (document.documentElement.dataset.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'vs-dark' : 'vs'
}
