import assert from 'node:assert/strict'
import test from 'node:test'
import { readScreenshotInspection, screenshotArtifactUrl } from '../dist/library/local-replay/screenshotInspection.js'

function result() {
  return {
    capability: 'screenshot.evaluate', sessionId: 'session-1', passed: false, message: 'Screenshot assessment: fail.',
    image: { frameId: 'frame-1', capturedAtUtc: '2026-10-18T01:00:00Z', artifact: { snapshotId: 'snapshot-1', path: 'actual.png' } },
    reference: { artifact: { snapshotId: 'snapshot-1', path: 'reference.png' } },
    evidence: { snapshotId: 'snapshot-1', path: 'result.json' },
    regions: [{ id: 'cube', label: 'Purple cube', crop: { snapshotId: 'snapshot-1', path: 'region-cube.png' },
      geometry: { frameId: 'frame-1', kind: 'rectangle', x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
    criteria: [{ id: 'purple-count', verdict: 'fail', explanation: 'One purple cube is visible; expected two.', regionIds: ['cube'] }],
  }
}

test('reads findings and reference image with normalized actual-frame regions', () => {
  assert.deepEqual(readScreenshotInspection(JSON.stringify(result())), result())
  const comparison = { ...result(), capability: 'screenshot.compare', criteria: undefined,
    overlay: { snapshotId: 'snapshot-1', path: 'overlay.png' } }
  assert.equal(readScreenshotInspection(JSON.stringify(comparison)).overlay.path, 'overlay.png')
})

test('refuses truncated payloads, invalid geometry, foreign frames and unsupported evidence', () => {
  assert.equal(readScreenshotInspection('{'), null)
  assert.equal(readScreenshotInspection('null'), null)
  for (const change of [
    value => { value.regions[0].geometry.x = -1 },
    value => { value.regions[0].geometry.width = 1 },
    value => { value.regions[0].geometry.frameId = 'other-frame' },
    value => { value.criteria[0].regionIds = ['missing'] },
    value => { value.image.capturedAtUtc = 'invalid' },
    value => { value.capability = 'other' },
  ]) {
    const value = result(); change(value)
    assert.equal(readScreenshotInspection(JSON.stringify(value)), null)
  }
})

test('artifact addresses always use the local host route and encode user-controlled values', () => {
  const address = screenshotArtifactUrl('session/?x', { snapshotId: 'snapshot&other=value', path: 'https://example.com/image.png' })
  assert.match(address, /^api\/sessions\/session%2F%3Fx\/artifacts\/content\?/)
  const url = new URL(address, 'http://127.0.0.1:1234/ansight/')
  assert.equal(url.origin, 'http://127.0.0.1:1234')
  assert.equal(url.searchParams.get('snapshotId'), 'snapshot&other=value')
  assert.equal(url.searchParams.get('path'), 'https://example.com/image.png')
})

test('reads retained ignore masks and pixel counts, rejecting invalid mask evidence', () => {
  const comparison = { ...result(), capability: 'screenshot.compare', criteria: undefined,
    ignoreRegions: [{ x: 0.8, y: 0, width: 0.2, height: 0.05 }], ignoredPixelCount: 100, totalPixelCount: 9900 }
  const parsed = readScreenshotInspection(JSON.stringify(comparison))
  assert.deepEqual(parsed.ignoreRegions, comparison.ignoreRegions)
  assert.equal(parsed.ignoredPixelCount, 100)
  assert.equal(parsed.totalPixelCount, 9900)
  for (const change of [
    value => { value.ignoreRegions[0].x = -1 },
    value => { value.ignoreRegions[0].width = 0 },
    value => { value.ignoreRegions[0].width = 0.3 },
    value => { value.ignoreRegions = 'clock' },
    value => { value.ignoreRegions = Array.from({ length: 65 }, () => comparison.ignoreRegions[0]) },
    value => { value.ignoredPixelCount = -1 },
    value => { value.totalPixelCount = 1.5 },
  ]) {
    const value = structuredClone(comparison); change(value)
    assert.equal(readScreenshotInspection(JSON.stringify(value)), null)
  }
})

test('keeps system UI mask origins tied to the actual frame', () => {
  const value = { ...result(), systemUiMaskResolutions: [{ kind: 'statusBar', state: 'absent', frameId: 'frame-1', regions: [] }] }
  assert.deepEqual(readScreenshotInspection(JSON.stringify(value)).systemUiMaskResolutions, value.systemUiMaskResolutions)
  for (const change of [
    item => { item.frameId = 'other-frame' }, item => { item.state = 'unknown' },
    item => { item.kind = 'keyboard' }, item => { item.state = 'present' },
    item => { item.regions = [{ x: 0, y: 0, width: 1, height: 0.1 }] },
  ]) {
    const invalid = structuredClone(value); change(invalid.systemUiMaskResolutions[0])
    assert.equal(readScreenshotInspection(JSON.stringify(invalid)), null)
  }
})
