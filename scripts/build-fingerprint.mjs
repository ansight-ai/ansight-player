import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
export function buildFingerprint(root) {
  const hash = createHash('sha256')
  const files = []
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else files.push(file)
    }
  }
  visit(join(root, 'src'))
  files.push(join(root, 'vite.config.ts'), join(root, 'tsconfig.app.json'), join(root, 'tsconfig.library.json'))
  for (const file of files.sort()) hash.update(relative(root, file)).update('\0').update(readFileSync(file)).update('\0')
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  hash.update(JSON.stringify({ version: manifest.version, dependencies: manifest.dependencies, peerDependencies: manifest.peerDependencies }))
  return { version: manifest.version, sourceDigest: hash.digest('hex') }
}
