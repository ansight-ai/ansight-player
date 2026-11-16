import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildFingerprint } from './build-fingerprint.mjs'

export function verifyBuild(packageRoot, sourceRoot) {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
  const expected = sourceRoot ? buildFingerprint(sourceRoot) : null
  let packageDigest

  for (const name of ['dist/library/build-manifest.json', 'dist/local/session-replay-build.json']) {
    const built = JSON.parse(readFileSync(resolve(packageRoot, name), 'utf8'))
    const validFingerprint = typeof built.sourceDigest === 'string'
      && /^[a-f0-9]{64}$/.test(built.sourceDigest)
      && built.version === manifest.version

    if (!validFingerprint) {
      throw new Error(`Invalid player build metadata in ${name}; rebuild and repack @ansight/player.`)
    }

    if (packageDigest && built.sourceDigest !== packageDigest) {
      throw new Error(`Inconsistent player build fingerprints in ${name}; rebuild both the library and local UI.`)
    }

    packageDigest = built.sourceDigest

    const matchesSource = !expected
      || (built.version === expected.version && built.sourceDigest === expected.sourceDigest)

    if (!matchesSource) {
      throw new Error(`Stale player package: ${name} does not match ${sourceRoot}. Run npm run pack:release in ansight-player, then node scripts/build/update-player-package.mjs <ansight-player-checkout> in ansight-cli, or build with ANSIGHT_PLAYER_REPOSITORY pointing to the freshly built checkout.`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [packageRoot, sourceRoot, ...extra] = process.argv.slice(2)

  if (!packageRoot || extra.length > 0) {
    throw new Error('Usage: node scripts/verify-build.mjs <package-root> [source-root]')
  }

  verifyBuild(resolve(packageRoot), sourceRoot ? resolve(sourceRoot) : undefined)
  console.log('Player build fingerprint verified.')
}
