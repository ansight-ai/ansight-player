import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
mkdirSync(`${root}/products`, { recursive: true })
const result = spawnSync('npm', ['pack', '--pack-destination', 'products'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
process.exitCode = result.status ?? 1
