import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveDeviceFrame } from '../src/replay/deviceFrame.ts'

test('hardware identifiers select the real model, including landscape iPhones', () => {
  assert.deepEqual(resolveDeviceFrame(['iPhone17,1', 'Apple'], 'desktop'), { name: 'iPhone 16 Pro', style: 'iphone-island', kind: 'phone', cameraControl: true })
  assert.equal(resolveDeviceFrame(['iPhone14,7'], 'phone').style, 'iphone-notch')
  assert.equal(resolveDeviceFrame(['iPhone14,6'], 'phone').style, 'iphone-home')
  assert.equal(resolveDeviceFrame(['iPhone 16 Pro'], 'phone').style, 'iphone-island')
})
test('iPads distinguish home-button and all-screen generations', () => {
  assert.equal(resolveDeviceFrame(['iPad13,4'], 'tablet').style, 'ipad')
  assert.equal(resolveDeviceFrame(['iPad12,1'], 'tablet').style, 'ipad-home')
})
test('Android and unknown Apple models use honest family fallbacks', () => {
  assert.equal(resolveDeviceFrame(['Pixel 9', 'Android'], 'phone').style, 'android')
  assert.equal(resolveDeviceFrame(['Samsung', 'Android', 'Tablet'], 'tablet').style, 'android-tablet')
  assert.equal(resolveDeviceFrame(['iPhone99,1', 'Apple'], 'phone').name, 'iPhone99,1')
  assert.equal(resolveDeviceFrame(['iPhone99,1', 'Apple'], 'phone').style, 'iphone-unknown')
  assert.equal(resolveDeviceFrame(['macOS'], 'desktop').style, 'desktop')
})
