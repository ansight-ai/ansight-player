import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artifactCommand, reorderArtifacts } from '../src/replay/components/artifactComparison.ts'

test('qualified CLI references preserve journey order and quote shell input', () => {
  const command = artifactCommand([{ sessionId: 'baseline', artifactId: 'A' }, { sessionId: "rerun'", artifactId: 'B' }], { arrayKey: 'id', path: 'scene state.json', ignoreWhitespace: true })
  assert.ok(command.indexOf("'baseline/A'") < command.indexOf("'rerun'\\''/B'"))
  assert.ok(command.includes("--path 'scene state.json'"))
  assert.ok(command.includes('--ignore-whitespace'))
})
test('reordering is immutable and respects boundaries', () => {
  const items = [{ reference: 's/A' }, { reference: 't/B' }, { reference: 's/C' }]
  assert.deepEqual(reorderArtifacts(items, 1, -1).map(item => item.reference), ['t/B', 's/A', 's/C'])
  assert.equal(items[0].reference, 's/A')
  assert.equal(reorderArtifacts(items, 0, -1), items)
})

test('timeline links preserve explicit session and capture identity', async () => {
  const { artifactTimelineHref, readArtifactTimelineLink } = await import('../src/local-replay/artifactLinks.ts')
  const reference = { sessionId: 'baseline session', artifactId: 'capture+A' }
  assert.deepEqual(readArtifactTimelineLink(artifactTimelineHref('http://localhost:5199/replay/?old=1', reference)), reference)
  assert.equal(readArtifactTimelineLink('http://localhost:5199/?artifactId=A'), null)
})

test('word highlighting retains surrounding text', async () => {
  const { changedWordSpan } = await import('../src/replay/components/artifactComparison.ts')
  assert.deepEqual(changedWordSpan('the new scene', 'the old scene'), { prefix: 'the ', changed: 'new', suffix: ' scene' })
})

test('grouping keeps different providers separate and labels generic data by filename', async () => {
  const { groupArtifacts } = await import('../src/replay/components/artifactComparison.ts')
  const captures = [
    { provider: 'files', logicalId: 'data', name: 'data', paths: ['files/data.db3'] },
    { provider: 'scene', logicalId: 'data', name: 'Scene', paths: [] },
    { provider: 'files', logicalId: 'data', name: 'data', paths: ['files/data.db3'] },
  ]
  const groups = groupArtifacts(captures)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].name, 'data.db3')
  assert.equal(groups[0].items.length, 2)
})

test('latest pair is chronological regardless of listing sort and does not mutate it', async () => {
  const { latestArtifactPair } = await import('../src/replay/components/artifactComparison.ts')
  const captures = [
    { reference: 's/C', capturedAtUtc: '2026-09-11T03:00:00Z' },
    { reference: 's/A', capturedAtUtc: '2026-09-11T01:00:00Z' },
    { reference: 's/B', capturedAtUtc: '2026-09-11T02:00:00Z' },
  ]
  assert.deepEqual(latestArtifactPair(captures).map(item => item.reference), ['s/B', 's/C'])
  assert.equal(captures[0].reference, 's/C')
})

test('path highlighting isolates changed components', async () => {
  const { changedWordSpan } = await import('../src/replay/components/artifactComparison.ts')
  assert.deepEqual(changedWordSpan('/assets/hd.glb', '/assets/uld.glb'), { prefix: '/assets/', changed: 'hd', suffix: '.glb' })
})

test('session picker defaults to exact app identity and can show every app', async () => {
  const { artifactSessionOptions } = await import('../src/replay/components/artifactComparison.ts')
  const sessions = [{sessionId:'baseline',appId:'com.example.app'}, {sessionId:'rerun',appId:'com.example.app'}, {sessionId:'different',appId:'com.example.app.beta'}, {sessionId:'unknown'}]
  assert.deepEqual(artifactSessionOptions(sessions,'baseline',false).map(item=>item.sessionId), ['baseline','rerun'])
  assert.equal(artifactSessionOptions(sessions,'baseline',true),sessions)
  assert.deepEqual(artifactSessionOptions(sessions,'unknown',false).map(item=>item.sessionId), ['unknown'])
  assert.deepEqual(artifactSessionOptions(sessions,'missing',false),[])
})

test('removing a comparison session removes only its captures and restores a valid active session', async () => {
  const { removeArtifactSession } = await import('../src/replay/components/artifactComparison.ts')
  const selected = [{sessionId:'base',artifactId:'A'}, {sessionId:'test',artifactId:'B'}, {sessionId:'base',artifactId:'C'}]
  const state = removeArtifactSession(['base','test'],'test',selected,'test')
  assert.deepEqual(state.sessionIds,['base'])
  assert.equal(state.browseSession,'base')
  assert.deepEqual(state.selected.map(item=>item.artifactId),['A','C'])
  assert.equal(selected.length,3)
  assert.equal(removeArtifactSession(['base','test','other'],'other',selected,'test').browseSession,'other')
})

test('adding empty or unavailable sessions never hides the original captures', async () => {
  const { listComparisonSessions } = await import('../src/replay/components/artifactComparison.ts')
  const source = { list: async ({sessionId}) => {
    if (sessionId === 'broken') throw new Error('Unavailable')
    return {items:sessionId === 'base' ? [{reference:'base/A'}] : [],total:sessionId === 'base' ? 1 : 0,nextOffset:null}
  } }
  const result = await listComparisonSessions(source,['base','empty','broken'],{limit:100,offset:0})
  assert.deepEqual(result.items.map(item=>item.reference),['base/A'])
  assert.equal(result.counts.empty,0)
  assert.equal(result.errors.length,1)
  assert.equal(result.nextOffset,null)
})
