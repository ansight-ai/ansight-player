import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildFingerprint } from './build-fingerprint.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
writeFileSync(`${root}/dist/local/session-replay-build.json`, `${JSON.stringify(buildFingerprint(root), null, 2)}\n`)
