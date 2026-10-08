import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPromptReferenceDiagnostics, getPromptReferenceHover, getPromptReferences, referenceToken } from '../src/local-replay/testPromptReferences.ts'

const tasks = [{ enabled: true, taskId: 'map.open' }, { enabled: false, taskId: 'disabled' }]

test('references decode exact IDs and preserve punctuation', () => {
  const source = 'prompt: Run @task/map.open. Tap @selector/com.app%3Aid%2Fcopy.'
  const references = getPromptReferences(source, 1)
  assert.deepEqual(references.map(({kind, id}) => ({kind, id})), [{kind:'task',id:'map.open'}, {kind:'selector',id:'com.app:id/copy'}])
  assert.equal(source[references[0].endColumn - 1], '.')
  assert.equal(getPromptReferenceHover(source, 1, source.indexOf('com.app') + 2)?.id, 'com.app:id/copy')
})

test('diagnostics distinguish missing tasks from unrecorded selectors and unavailable catalogs', () => {
  const source = 'prompt: |-\n  Run @task/missing and @task/disabled.\n  Tap @selector/new-screen.'
  const diagnostics = getPromptReferenceDiagnostics(source, tasks, ['copy'])
  assert.deepEqual(diagnostics.map(({severity, lineNumber}) => ({severity, lineNumber})), [{severity:'error',lineNumber:2},{severity:'error',lineNumber:2},{severity:'warning',lineNumber:3}])
  assert.deepEqual(getPromptReferenceDiagnostics(source, null, null), [])
  assert.deepEqual(getPromptReferenceDiagnostics('prompt: Run @task/map.open then tap @selector/copy.', tasks, ['copy']), [])
})

test('malformed and empty reference IDs are diagnosed', () => {
  for (const id of ['', '%XY', '%0A']) {
    assert.equal(getPromptReferenceDiagnostics('prompt: Tap @selector/' + id)[0]?.severity, 'error')
  }
  assert.equal(referenceToken('selector', "Profile's tab"), '@selector/Profile%27s%20tab')
  assert.equal(referenceToken('selector', 'copy.'), '@selector/copy%2E')
  assert.equal(getPromptReferences('prompt: Tap @selector/copy%2E.', 1)[0]?.id, 'copy.')
})

test('references are restricted to instruction values including literal block text', () => {
  const source = '# @task/comment\nname: @task/title\nprompt: |-\n  Confirm: @selector/copy.\n  # This is literal text: @task/map.open\nrequiredSecrets:\n  - @task/secret'
  assert.equal(getPromptReferences(source, 1).length, 0)
  assert.equal(getPromptReferences(source, 2).length, 0)
  assert.equal(getPromptReferences(source, 4)[0]?.id, 'copy')
  assert.equal(getPromptReferences(source, 5)[0]?.id, 'map.open')
  assert.equal(getPromptReferences(source, 7).length, 0)
})
