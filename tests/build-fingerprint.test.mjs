import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildFingerprint } from '../scripts/build-fingerprint.mjs'
import { verifyBuild } from '../scripts/verify-build.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ansight-player-fingerprint-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  function write(name, contents) {
    const path = join(root, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, contents)
  }

  write('package.json', JSON.stringify({ version: '0.1.29', dependencies: {}, peerDependencies: {} }))
  write('src/player.ts', 'export const companionEnabled = true\n')

  for (const name of ['vite.config.ts', 'tsconfig.app.json', 'tsconfig.library.json']) {
    write(name, '{}')
  }

  const fingerprint = buildFingerprint(root)

  for (const name of ['dist/library/build-manifest.json', 'dist/local/session-replay-build.json']) {
    write(name, JSON.stringify(fingerprint))
  }

  return { root, write, fingerprint }
}

test('accepts a package built from the current source', t => {
  const { root } = fixture(t)
  assert.doesNotThrow(() => verifyBuild(root, root))
})

test('rejects old assets even when the player version is unchanged', t => {
  const { root, write } = fixture(t)
  write('src/player.ts', 'export const companionEnabled = false\n')
  assert.throws(() => verifyBuild(root, root), /Stale player package/)
})

test('checks the local UI independently of the library build', t => {
  const { root, write, fingerprint } = fixture(t)
  write('dist/local/session-replay-build.json', JSON.stringify({ ...fingerprint, sourceDigest: '0'.repeat(64) }))
  assert.throws(() => verifyBuild(root, root), /Inconsistent player build fingerprints/)
  assert.throws(() => verifyBuild(root), /Inconsistent player build fingerprints/)
})

test('supports standalone packages without a source checkout', t => {
  const { root } = fixture(t)
  rmSync(join(root, 'src'), { recursive: true })
  assert.doesNotThrow(() => verifyBuild(root))
})

test('rejects missing or inconsistent package metadata', t => {
  const { root, write, fingerprint } = fixture(t)
  write('dist/local/session-replay-build.json', JSON.stringify({ ...fingerprint, version: '0.1.28' }))
  assert.throws(() => verifyBuild(root), /Invalid player build metadata/)
  rmSync(join(root, 'dist/local/session-replay-build.json'))
  assert.throws(() => verifyBuild(root), /ENOENT/)
})
