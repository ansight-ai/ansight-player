import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptySessionFilters, matchesPackagePattern, matchesSessionFilters } from '../src/local-replay/sessionFilters.ts'

const session = {
  appId: 'com.example.sample',
  createdUtc: '2026-10-04T12:00:00Z',
  lastUpdatedUtc: '2026-10-04T12:04:30Z',
  isSimulatorOrEmulator: true,
  runtimePlatform: 'ios',
  technology: 'react-native',
  tags: ['release', 'smoke'],
}

test('package ID patterns support wildcards and plain partial matches', () => {
  assert.equal(matchesPackagePattern(session.appId, 'example'), true)
  assert.equal(matchesPackagePattern(session.appId, 'COM.*.sample'), true)
  assert.equal(matchesPackagePattern(session.appId, 'com.example.samp?e'), true)
  assert.equal(matchesPackagePattern(session.appId, 'com.example.*.other'), false)
  assert.equal(matchesPackagePattern(session.appId, 'com.example.[sample]'), false)
})

test('session filters combine length, metadata, device type, and inclusive captured dates', () => {
  const filters = {
    ...emptySessionFilters,
    minimumSeconds: '270',
    maximumSeconds: '270',
    packagePattern: 'com.example.*',
    tags: ['release', 'smoke'],
    platforms: ['ios'],
    technologies: ['react-native'],
    deviceType: 'virtual',
    capturedFrom: '2026-10-04',
    capturedTo: '2026-10-04',
  }
  assert.equal(matchesSessionFilters(session, filters), true)
  assert.equal(matchesSessionFilters(session, { ...filters, deviceType: 'physical' }), false)
  assert.equal(matchesSessionFilters(session, { ...filters, minimumSeconds: '271' }), false)
  assert.equal(matchesSessionFilters(session, { ...filters, capturedTo: '2026-10-03' }), false)
  assert.equal(matchesSessionFilters(session, { ...filters, technologies: ['flutter'] }), false)
})
