import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/typescript/register'
import 'monaco-editor/languages/definitions/javascript/register'
import 'monaco-editor/languages/features/json/register'
import './monacoEnvironment'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/folding/browser/folding'
import { useEffect, useRef } from 'react'
import type { LocalTaskSourceModule } from './types'

export default function TraceSourceCodeEditor({ module }: { module: LocalTaskSourceModule }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!container.current) return
    const theme = () => document.documentElement.dataset.theme === 'dark'
      || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'vs-dark' : 'vs'
    const model = monaco.editor.createModel(module.content, module.language)
    const editor = monaco.editor.create(container.current, {
      model, readOnly: true, domReadOnly: true, automaticLayout: true,
      ariaLabel: `Captured source for ${module.path}`, theme: theme(),
      minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on',
      scrollBeyondLastLine: false, folding: true, renderValidationDecorations: 'off',
      padding: { top: 12, bottom: 12 },
    })
    const updateTheme = () => monaco.editor.setTheme(theme())
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', updateTheme)
    return () => { observer.disconnect(); media.removeEventListener('change', updateTheme); editor.dispose(); model.dispose() }
  }, [module])
  return <div ref={container} style={{ height: '100%', width: '100%' }} />
}
