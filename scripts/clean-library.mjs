import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
rmSync(fileURLToPath(new URL('../dist/library', import.meta.url)), { recursive: true, force: true })
