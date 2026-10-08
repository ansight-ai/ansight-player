import type { LocalRepositoryTask, LocalWorkspaceTest } from './types'
import { getPromptReferenceCompletionRange, getPromptReferenceHover, referenceToken } from './testPromptReferences.ts'

export type TestSchemaProperty = {
  description?: string
  type?: string
  const?: string | number | boolean
  enum?: Array<string | number | boolean>
  properties?: Record<string, TestSchemaProperty>
  oneOf?: TestSchemaProperty[]
}

export type TestSchema = TestSchemaProperty & {
  required?: string[]
  properties: Record<string, TestSchemaProperty>
}

export type TestCompletion = {
  label: string
  insertText: string
  detail: string
  documentation?: string
  kind: 'key' | 'value' | 'task' | 'selector'
  startColumn: number
  endColumn: number
}

export type TestTaskHover = {
  task: LocalRepositoryTask
  startColumn: number
  endColumn: number
}

export type TestIdConflict = {
  test: Pick<LocalWorkspaceTest, 'testId' | 'name' | 'filePath'>
  lineNumber: number
  startColumn: number
  endColumn: number
}

export type TestIdDeclaration = Pick<TestIdConflict, 'lineNumber' | 'startColumn' | 'endColumn'> & { value: string }

const keyPattern = /^\s*([A-Za-z][\w-]*):/

export function getTestCompletions(source: string, lineNumber: number, column: number, schema: TestSchema, tasks: LocalRepositoryTask[], automationIds?: readonly string[] | null): TestCompletion[] {
  const mention = getPromptReferenceCompletionRange(source, lineNumber, column)
  if (mention) {
    const candidates: TestCompletion[] = [
      ...tasks.filter((task) => task.enabled).map((task): TestCompletion => ({
        label: referenceToken('task', task.taskId), insertText: referenceToken('task', task.taskId),
        kind: 'task', detail: task.title || 'Repository task',
        documentation: `${task.description || ''}\n\nInputs: ${JSON.stringify(task.inputSchema ?? {})}`, ...mention,
      })),
      ...[...new Set(automationIds ?? [])].sort().map((id): TestCompletion => ({
        label: referenceToken('selector', id), insertText: referenceToken('selector', id),
        kind: 'selector', detail: `Automation ID: ${id}`,
        documentation: `Recorded selector: ${JSON.stringify({ automationId: id, matchMode: 'exact' })}`, ...mention,
      })),
    ]
    return candidates.filter((candidate) => candidate.label.startsWith(mention.prefix))
  }
  const lines = source.split(/\r?\n/)
  const line = lines[lineNumber - 1] ?? ''
  const before = line.slice(0, column - 1)
  const indentation = line.match(/^\s*/)?.[0].length ?? 0
  const parent = findParentKey(lines, lineNumber - 1, indentation)
  const match = line.match(keyPattern)
  const colonIndex = match ? line.indexOf(':', match[0].length - 1) : -1

  if (match && colonIndex < column - 1) {
    if (match[1] === 'taskId' && !parent) {
      return taskCompletions(line, column, colonIndex + 1, tasks)
    }
    if (match[1] === 'hintTasks' && !parent) {
      if (before.slice(colonIndex + 1).includes('[')) return taskCompletions(line, column, colonIndex + 1, tasks)
      if (!line.slice(colonIndex + 1).trim()) return hintTaskListCompletions(line, colonIndex, tasks)
    }
    const property = (parent === 'validation' ? validationProperties(schema) : schema.properties)[match[1]]
    if (!property) return []
    const values = property.enum ?? (property.const === undefined ? property.type === 'boolean' ? [true, false] : [] : [property.const])
    const range = valueRange(line, column, colonIndex + 1)
    return values.map((value) => ({
      label: String(value), insertText: valuePrefix(line, range.startColumn) + String(value), detail: 'Schema value', kind: 'value', ...range,
    }))
  }
  if (match) return []

  if (parent === 'hintTasks' && /^\s*-/.test(line)) {
    return taskCompletions(line, column, line.indexOf('-') + 1, tasks)
  }

  const properties = parent === 'validation' ? validationProperties(schema) : parent ? null : schema.properties
  if (!properties || before.trimStart().startsWith('#') || before.trimStart().startsWith('-')) return []
  const existing = new Set(lines.flatMap((candidate, index) => {
    if (index === lineNumber - 1) return []
    const candidateIndent = candidate.match(/^\s*/)?.[0].length ?? 0
    if (candidateIndent !== indentation) return []
    const candidateParent = findParentKey(lines, index, candidateIndent)
    return candidateParent === parent ? [candidate.match(keyPattern)?.[1]].filter((key): key is string => !!key) : []
  }))
  const fragmentStart = indentation
  if (before.slice(fragmentStart).includes(':')) return []
  return Object.entries(properties).filter(([key]) => !existing.has(key)).map(([key, property]) => ({
    label: key,
    insertText: `${key}: `,
    detail: schema.required?.includes(key) && !parent ? 'Required test key' : 'Test schema key',
    documentation: property.description,
    kind: 'key',
    startColumn: fragmentStart + 1,
    endColumn: line.length + 1,
  }))
}

export function getTestKeyDocumentation(source: string, lineNumber: number, column: number, schema: TestSchema): string | null {
  const lines = source.split(/\r?\n/)
  const line = lines[lineNumber - 1] ?? ''
  const match = line.match(keyPattern)
  if (!match || column - 1 < line.indexOf(match[1]) || column - 1 > line.indexOf(match[1]) + match[1].length) return null
  const indentation = line.match(/^\s*/)?.[0].length ?? 0
  const parent = findParentKey(lines, lineNumber - 1, indentation)
  const property = (parent === 'validation' ? validationProperties(schema) : parent ? {} : schema.properties)[match[1]]
  if (!property) return null
  const required = !parent && schema.required?.includes(match[1]) ? 'Required. ' : ''
  return `${required}${property.description ?? `Type: ${property.type ?? 'schema-defined'}.`}`
}

export function getTestTaskHover(source: string, lineNumber: number, column: number, tasks: LocalRepositoryTask[]): TestTaskHover | null {
  const mention = getPromptReferenceHover(source, lineNumber, column)
  if (mention?.kind === 'task') {
    const task = tasks.find((candidate) => candidate.taskId === mention.id)
    return task ? { task, startColumn: mention.startColumn, endColumn: mention.endColumn } : null
  }
  const lines = source.split(/\r?\n/)
  const line = lines[lineNumber - 1] ?? ''
  const indentation = line.match(/^\s*/)?.[0].length ?? 0
  const parent = findParentKey(lines, lineNumber - 1, indentation)
  const key = line.match(keyPattern)?.[1]
  let valueStart = -1
  let valueEnd = line.length

  if (key === 'taskId' && !parent) {
    valueStart = line.indexOf(':') + 1
  } else if (key === 'hintTasks' && !parent) {
    const openBracket = line.indexOf('[')
    if (openBracket < 0) return null
    valueStart = openBracket + 1
    valueEnd = line.lastIndexOf(']') >= valueStart ? line.lastIndexOf(']') : line.length
  } else if (parent === 'hintTasks') {
    const listItem = line.match(/^\s*-\s*/)
    if (listItem) valueStart = listItem[0].length
  }
  if (valueStart < 0) return null
  const commentStart = line.indexOf('#', valueStart)
  if (commentStart >= 0) valueEnd = Math.min(valueEnd, commentStart)

  for (const task of tasks) {
    let start = line.indexOf(task.taskId, valueStart)
    while (start >= valueStart && start < valueEnd) {
      const end = start + task.taskId.length
      if (end <= valueEnd && isTaskBoundary(line[start - 1]) && isTaskBoundary(line[end])
        && column >= start + 1 && column <= end) {
        return { task, startColumn: start + 1, endColumn: end + 1 }
      }
      start = line.indexOf(task.taskId, start + 1)
    }
  }
  return null
}

export function getTestIdConflict(
  source: string,
  tests: Array<Pick<LocalWorkspaceTest, 'testId' | 'name' | 'filePath'>>,
  currentTestPath?: string | null,
): TestIdConflict | null {
  const declaration = getTestIdDeclaration(source)
  if (!declaration) return null
  const existing = tests.find((test) => test.testId.toLowerCase() === declaration.value.toLowerCase()
    && (!currentTestPath || test.filePath !== currentTestPath))
  return existing ? { test: existing, ...declaration } : null
}

export function getTestIdDeclaration(source: string): TestIdDeclaration | null {
  const lines = source.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const match = /^id:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/.exec(line)
    if (!match) continue
    const id = match[1] ?? match[2] ?? match[3]
    if (!id) return null
    const start = line.indexOf(id, match.index + 3)
    return { value: id, lineNumber: index + 1, startColumn: start + 1, endColumn: start + id.length + 1 }
  }
  return null
}

function validationProperties(schema: TestSchema): Record<string, TestSchemaProperty> {
  const validation = schema.properties.validation
  return Object.assign({}, validation?.properties ?? {}, ...(validation?.oneOf ?? []).map((option) => option.properties ?? {}))
}

function findParentKey(lines: string[], index: number, indentation: number): string | null {
  for (let previous = index - 1; previous >= 0; previous--) {
    const line = lines[previous]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const previousIndent = line.match(/^\s*/)?.[0].length ?? 0
    if (previousIndent >= indentation) continue
    return line.match(keyPattern)?.[1] ?? null
  }
  return null
}

function taskCompletions(line: string, column: number, valueStart: number, tasks: LocalRepositoryTask[]): TestCompletion[] {
  const range = valueRange(line, column, valueStart)
  return tasks.filter((task) => task.enabled).map((task) => ({
    label: task.taskId,
    insertText: valuePrefix(line, range.startColumn) + task.taskId,
    detail: task.title || 'Repository task',
    documentation: task.description,
    kind: 'task',
    ...range,
  }))
}

function hintTaskListCompletions(line: string, colonIndex: number, tasks: LocalRepositoryTask[]): TestCompletion[] {
  return tasks.filter((task) => task.enabled).map((task) => ({
    label: task.taskId,
    insertText: `\n  - ${task.taskId}`,
    detail: task.title || 'Repository task',
    documentation: task.description,
    kind: 'task',
    startColumn: colonIndex + 2,
    endColumn: line.length + 1,
  }))
}

function valueRange(line: string, column: number, valueStart: number): Pick<TestCompletion, 'startColumn' | 'endColumn'> {
  let start = Math.min(column - 1, line.length)
  while (start > valueStart && !isValueDelimiter(line[start - 1])) start--
  let end = Math.min(column - 1, line.length)
  while (end < line.length && !isValueDelimiter(line[end])) end++
  return { startColumn: start + 1, endColumn: end + 1 }
}

function isValueDelimiter(character: string): boolean {
  return /\s/.test(character) || ',[]"\''.includes(character)
}

function isTaskBoundary(character: string | undefined): boolean {
  return character === undefined || isValueDelimiter(character) || character === '#'
}

function valuePrefix(line: string, startColumn: number): string {
  return /[:-]/.test(line[startColumn - 2] ?? '') ? ' ' : ''
}
