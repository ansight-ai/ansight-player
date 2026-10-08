import type { LocalRepositoryTask } from './types'

export type TestPromptReference = { kind: 'task' | 'selector'; id: string; startColumn: number; endColumn: number }
export type TestPromptReferenceDiagnostic = { lineNumber: number; startColumn: number; endColumn: number; message: string; severity: 'error' | 'warning' }

// Only inspect scalar text belonging to prompt or validation. YAML comments and metadata are not instructions.
function promptTextRange(lines: string[], index: number): { start: number; end: number } | null {
  const line = lines[index] ?? ''
  let root = index
  while (root >= 0 && (!/^[A-Za-z][\w-]*:/.test(lines[root]))) root--
  if (root < 0) return null
  const key = lines[root].match(/^([\w-]+):/)?.[1]
  if (key !== 'prompt' && key !== 'validation') return null
  let header = root
  if (key === 'validation' && !lines[root].slice(lines[root].indexOf(':') + 1).trim()) {
    for (let previous = index; previous > root; previous--) {
      if (/^\s+(?:prompt|assertions):/.test(lines[previous])) { header = previous; break }
    }
    if (header === root) return null
  }
  const block = /:\s*[|>][\d+-]*\s*(?:#.*)?$/.test(lines[header])
  if (block) return index > header && /^\s+\S/.test(line) ? { start: 0, end: line.length } : null
  if (line.trimStart().startsWith('#')) return null
  const start = index === header ? line.indexOf(':') + 1 : 0
  let quote: string | null = null
  for (let i = start; i < line.length; i++) {
    const char = line[i]
    if (quote) {
      if (char === '\\' && quote === '"') i++
      else if (char === quote) {
        if (quote === "'" && line[i + 1] === "'") i++
        else quote = null
      }
    } else if (char === '"' || char === "'") quote = char
    else if (char === '#' && (i === start || /\s/.test(line[i - 1]))) return { start, end: i }
  }
  return { start, end: line.length }
}

export function getPromptReferenceCompletionRange(source: string, lineNumber: number, column: number) {
  const lines = source.split(/\r?\n/)
  const line = lines[lineNumber - 1] ?? ''
  const range = promptTextRange(lines, lineNumber - 1)
  if (!range || column - 1 < range.start || column - 1 > range.end) return null
  const before = line.slice(range.start, column - 1)
  const match = /(?:^|[^\w@/\\])(@[a-z]*(?:\/[A-Za-z0-9_.:/%~-]*)?)$/.exec(before)
  if (!match) return null
  const start = column - 1 - match[1].length
  let end = column - 1
  while (end < range.end && /[A-Za-z0-9_.:/%~-]/.test(line[end])) end++
  while (end > column - 1 && /[.:]/.test(line[end - 1])) end--
  return { prefix: match[1], startColumn: start + 1, endColumn: end + 1 }
}

export function getPromptReferences(source: string, lineNumber: number): TestPromptReference[] {
  return getLineReferences(source.split(/\r?\n/), lineNumber)
}

function getLineReferences(lines: string[], lineNumber: number): TestPromptReference[] {
  const range = promptTextRange(lines, lineNumber - 1)
  if (!range) return []
  const value = lines[lineNumber - 1].slice(range.start, range.end)
  return [...value.matchAll(/(?<![\w@/\\])@(task|selector)\/([A-Za-z0-9_.:/%~-]*)/g)].map((match) => {
    const encoded = match[2].replace(/[.:]+$/, '')
    let id = ''
    try { id = decodeURIComponent(encoded) } catch { /* Report malformed encoding as an invalid reference. */ }
    if ([...id].some((character) => character.charCodeAt(0) < 32 || (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159))) id = ''
    const startColumn = range.start + match.index! + 1
    return { kind: match[1] as 'task' | 'selector', id, startColumn, endColumn: startColumn + match[0].length - match[2].length + encoded.length }
  })
}

export function getPromptReferenceHover(source: string, lineNumber: number, column: number): TestPromptReference | null {
  return getPromptReferences(source, lineNumber).find((reference) => column >= reference.startColumn && column < reference.endColumn) ?? null
}

export function getPromptReferenceDiagnostics(source: string, tasks?: readonly LocalRepositoryTask[] | null, automationIds?: readonly string[] | null): TestPromptReferenceDiagnostic[] {
  const lines = source.split(/\r?\n/)
  return lines.flatMap((_, index) => getLineReferences(lines, index + 1).flatMap((reference): TestPromptReferenceDiagnostic[] => {
    const location = { lineNumber: index + 1, startColumn: reference.startColumn, endColumn: reference.endColumn }
    if (!reference.id.trim()) return [{ ...location, severity: 'error', message: 'Supply a valid ID after the slash; percent-encode special characters.' }]
    if (reference.kind === 'task' && tasks && !tasks.some((task) => task.enabled && task.taskId === reference.id)) {
      return [{ ...location, severity: 'error', message: `Unknown or disabled workspace task '${reference.id}'. Select a task from completion.` }]
    }
    if (reference.kind === 'selector' && automationIds && !automationIds.includes(reference.id)) {
      return [{ ...location, severity: 'warning', message: `Automation ID '${reference.id}' was not observed in this draft's recorded evidence. Verify it against the live app.` }]
    }
    return []
  }))
}

export function referenceToken(kind: 'task' | 'selector', id: string): string {
  return `@${kind}/${encodeURIComponent(id).replace(/[!'()*]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase()).replace(/\.+$/, (dots) => '%2E'.repeat(dots.length))}`
}
