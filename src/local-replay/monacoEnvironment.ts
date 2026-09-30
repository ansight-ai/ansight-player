import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'

type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, label: string) => Worker
  }
}

;(globalThis as MonacoGlobal).MonacoEnvironment = {
  getWorker: (_moduleId, label) => label === 'typescript' || label === 'javascript'
    ? new TypeScriptWorker()
    : label === 'json' ? new JsonWorker() : new EditorWorker(),
}
