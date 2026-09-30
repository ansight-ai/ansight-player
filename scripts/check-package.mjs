import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildFingerprint } from './build-fingerprint.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
for (const file of ['dist/library/index.js', 'dist/library/index.d.ts', 'dist/local/session-replay.html', 'dist/local/session-replay.js', 'LICENSE', 'NOTICE']) {
  if (!existsSync(`${root}/${file}`)) throw new Error(`Missing ${file}; run npm run build before packing.`)
}
const manifest = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
if (manifest.dependencies?.['@supabase/supabase-js']) throw new Error('The public player must not depend on the cloud client.')
if (manifest.files.includes('src')) throw new Error('Release packages must contain compiled player outputs, not the source tree.')

for (const [name, entry] of Object.entries(manifest.exports)) {
  for (const target of typeof entry === 'string' ? [entry] : Object.values(entry)) {
    if (target.startsWith('./src/')) throw new Error(`Package export ${name} must use a compiled output.`)
    if (!existsSync(`${root}/${target}`)) throw new Error(`Package export ${name} has a missing target: ${target}`)
  }
}

const fingerprint = buildFingerprint(root)
for (const file of ['dist/library/build-manifest.json', 'dist/local/session-replay-build.json']) {
  const built = JSON.parse(readFileSync(`${root}/${file}`, 'utf8'))
  if (built.version !== fingerprint.version || built.sourceDigest !== fingerprint.sourceDigest) {
    throw new Error(`${file} is stale; run npm run build before packing.`)
  }
}
