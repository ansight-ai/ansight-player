import test from 'node:test'
import assert from 'node:assert/strict'
import { networkPorts, networkRequest, networkRateSliderPosition, networkRateFromSlider, networkProfilePreset, networkPresets } from '../dist/library/local-replay/networkConditioning.js'

test('rate sliders preserve unlimited and exact rates over the full supported range', () => {
  for (const rate of [0, 1, 64, 128, 256, 1500, 750, 10000, 1_000_000]) {
    assert.equal(networkRateFromSlider(networkRateSliderPosition(rate)), rate)
  }
  assert.equal(networkRateFromSlider(100), 0)
  assert.equal(networkRateFromSlider(99), 1_000_000)
  assert.ok(networkRateFromSlider(40) < networkRateFromSlider(60))
})

test('restored profiles keep their preset unless a setting is actually custom', () => {
  for (const preset of networkPresets) assert.equal(networkProfilePreset({ ...preset.profile }), preset.id)
  assert.equal(networkProfilePreset({ ...networkPresets[1].profile, downloadKbps: 1750 }), 'custom')
})

test('port filters reject malformed values rather than silently broadening conditioning', () => {
  assert.deepEqual(networkPorts(''), [])
  assert.deepEqual(networkPorts('443, 8765,443'), [443, 8765])
  for (const value of ['0', '65536', '443,', '-80', '1e3', '443.5']) assert.throws(() => networkPorts(value))
})
test('panel sends JSON to the existing host and surfaces errors', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'api/network/reset')
      assert.equal(init.method, 'POST')
      assert.equal(init.headers['Content-Type'], 'application/json')
      assert.deepEqual(JSON.parse(init.body), { leaseId: 'lease' })
      return new Response(JSON.stringify({ status: 'stopped' }))
    }
    assert.deepEqual(await networkRequest('reset', { leaseId: 'lease' }), { status: 'stopped' })
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Conditioning lease is absent or expired.' }), { status: 409 })
    await assert.rejects(networkRequest('get', { leaseId: 'lease' }), /absent or expired/)
  } finally { globalThis.fetch = original }
})
