import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getTestCompletions, getTestIdConflict, getTestIdDeclaration, getTestKeyDocumentation, getTestTaskHover } from '../src/local-replay/yamlTestCompletions.ts'

const schema = JSON.parse(readFileSync(new URL('../../ansight-cli/src/Ansight.Host/Workspaces/Authoring/Resources/test-definition.v1.schema.json', import.meta.url), 'utf8'))
const tasks = [
  { enabled: true, taskId: 'open-settings', title: 'Open settings', description: 'Navigates to settings.' },
  { enabled: false, taskId: 'old-task', title: 'Old task', description: '' },
]

test('completes schema keys without repeating existing keys', () => {
  const source = 'appId: demo\npro'
  const completions = getTestCompletions(source, 2, 4, schema, tasks)
  assert.ok(completions.some((item) => item.label === 'prompt' && item.detail === 'Required test key'))
  assert.ok(!completions.some((item) => item.label === 'appId'))
  assert.ok(getTestKeyDocumentation(source, 1, 3, schema)?.startsWith('Required.'))
})

test('completes nested validation keys from the schema', () => {
  const completions = getTestCompletions('validation:\n  as', 2, 5, schema, tasks)
  assert.ok(completions.some((item) => item.label === 'assertions'))
  assert.ok(!completions.some((item) => item.label === 'appId'))
})

test('suggests enabled repository tasks in taskId and hintTasks values', () => {
  for (const source of ['taskId: open-', 'hintTasks:\n  - open-', 'hintTasks: [open-']) {
    const lines = source.split('\n')
    const line = lines.at(-1)
    const completions = getTestCompletions(source, lines.length, line.length + 1, schema, tasks)
    assert.deepEqual(completions.filter((item) => item.kind === 'task').map((item) => item.label), ['open-settings'])
    assert.equal(completions[0].startColumn, line.indexOf('open-') + 1)
  }
  const blankHintTasks = getTestCompletions('hintTasks: ', 1, 12, schema, tasks)
  assert.deepEqual(blankHintTasks.map((item) => item.label), ['open-settings'])
  assert.equal(blankHintTasks[0].insertText, '\n  - open-settings')
  assert.deepEqual([blankHintTasks[0].startColumn, blankHintTasks[0].endColumn], [11, 12])
  assert.equal(getTestCompletions('taskId:', 1, 8, schema, tasks)[0].insertText, ' open-settings')
  assert.equal(getTestCompletions('hintTasks:\n  -', 2, 4, schema, tasks)[0].insertText, ' open-settings')
})

test('completes schema literals where the schema specifies them', () => {
  assert.deepEqual(getTestCompletions('enabled: ', 1, 10, schema, tasks).map((item) => item.label), ['true', 'false'])
  assert.deepEqual(getTestCompletions('schemaVersion: ', 1, 16, schema, tasks).map((item) => item.label), ['1'])
})

test('all test fields explain their purpose in completion and hover', () => {
  for (const [key, property] of Object.entries(schema.properties)) {
    assert.ok(property.description?.length > 30, `${key} needs a useful description`)
    assert.ok(getTestKeyDocumentation(`${key}: value`, 1, 2, schema)?.includes(property.description))
  }
  for (const [key, property] of Object.entries(schema.properties.validation.oneOf[1].properties)) {
    assert.ok(property.description?.length > 30, `validation.${key} needs a useful description`)
    assert.ok(getTestKeyDocumentation(`validation:\n  ${key}: value`, 2, 4, schema)?.includes(property.description))
  }
})

test('task ID hover resolves repository details only in task fields', () => {
  for (const source of [
    'taskId: open-settings',
    'hintTasks:\n  - open-settings',
    'hintTasks: ["open-settings"]',
  ]) {
    const lines = source.split('\n')
    const line = lines.at(-1)
    const start = line.indexOf('open-settings') + 1
    const hover = getTestTaskHover(source, lines.length, start + 4, tasks)
    assert.equal(hover?.task.title, 'Open settings')
    assert.equal(hover?.task.description, 'Navigates to settings.')
    assert.deepEqual([hover?.startColumn, hover?.endColumn], [start, start + 'open-settings'.length])
  }
  assert.equal(getTestTaskHover('prompt: open-settings', 1, 13, tasks), null)
  assert.equal(getTestTaskHover('taskId: open-settings-more', 1, 13, tasks), null)
  assert.equal(getTestTaskHover('taskId: # open-settings', 1, 15, tasks), null)
})

test('detects conflicting test IDs across apps without flagging the same saved file', () => {
  const existing = [{ testId: 'copy-eagle-rock-location', name: 'Existing copy test', filePath: '/workspace/ansight/tests/older.yaml' }]
  const conflict = getTestIdConflict('schemaVersion: 1\nid: "Copy-Eagle-Rock-Location"\nappId: other.app', existing)
  assert.equal(conflict?.test.name, 'Existing copy test')
  assert.deepEqual([conflict?.lineNumber, conflict?.startColumn, conflict?.endColumn], [2, 6, 30])
  assert.equal(getTestIdConflict('id: copy-eagle-rock-location', existing, existing[0].filePath), null)
  assert.equal(getTestIdConflict('# id: copy-eagle-rock-location\nname: other', existing), null)
  assert.equal(getTestIdConflict('id: another-test', existing), null)
  assert.equal(getTestIdDeclaration('id: another-test')?.value, 'another-test')
  assert.equal(getTestIdDeclaration('id: ""'), null)
  assert.equal(getTestIdDeclaration('  id: copy-eagle-rock-location'), null)
})

test('completes inline task and selector mentions in prompt and validation prose', () => {
  for (const source of ['prompt: Run @task/op', 'prompt: |-\n  Run @task/op', 'prompt: >-\n  First: run @task/op', 'validation:\n  assertions:\n    - Verify after @task/op']) {
    const lines = source.split('\n')
    const line = lines.at(-1)
    const completions = getTestCompletions(source, lines.length, line.length + 1, schema, tasks, ['profile-tab'])
    assert.deepEqual(completions.map((item) => item.label), ['@task/open-settings'])
    assert.equal(completions[0].startColumn, line.indexOf('@') + 1)
    assert.ok(completions[0].documentation.includes('Navigates to settings'))
  }
  const source = 'prompt: Tap @selector/'
  const completions = getTestCompletions(source, 1, source.length + 1, schema, tasks, ['Profile tab', 'com.app:id/copy', 'Profile tab'])
  assert.deepEqual(completions.map((item) => item.label), ['@selector/Profile%20tab', '@selector/com.app%3Aid%2Fcopy'])
  assert.ok(completions.every((item) => item.kind === 'selector' && item.documentation.includes('"matchMode":"exact"')))
})

test('mention completion replaces the whole token while preserving adjacent punctuation', () => {
  const source = 'prompt: Run @task/open-settings.'
  const completions = getTestCompletions(source, 1, source.indexOf('open-') + 4, schema, tasks)
  assert.equal(completions[0].endColumn, source.length)
  const updated = source.slice(0, completions[0].startColumn - 1) + completions[0].insertText + source.slice(completions[0].endColumn - 1)
  assert.equal(updated, source)
})

test('mentions provide task previews in prompt text and ignore metadata and YAML comments', () => {
  const source = 'prompt: Run @task/open-settings.'
  assert.equal(getTestTaskHover(source, 1, source.indexOf('@task/') + 8, tasks)?.task.taskId, 'open-settings')
  for (const source of ['name: @task/op', '# prompt: @task/op', 'prompt: Go home # @task/op', 'prompt: someone@task/op', 'prompt: \\@task/op']) {
    assert.equal(getTestCompletions(source, 1, source.length + 1, schema, tasks).filter((item) => item.kind === 'task').length, 0, source)
  }
  assert.equal(schema.required.includes('validation'), false)
})
