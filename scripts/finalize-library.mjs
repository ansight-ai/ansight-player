import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { buildFingerprint } from './build-fingerprint.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
function visit(directory, operation) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) visit(file, operation)
    else operation(file)
  }
}
visit(join(root, 'src'), (file) => {
  if (['.ts', '.tsx'].includes(extname(file))) return
  cpSync(file, file.replace(join(root, 'src'), join(root, 'dist/library')), { recursive: true })
})
visit(join(root, 'dist/library'), (file) => {
  if (extname(file) !== '.js') return
  let source = readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits = []
  function visitNode(node) {
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
      const target = resolve(dirname(file), specifier.text)
      if (existsSync(`${target}.js`)) edits.push({ start: specifier.getStart(tree), end: specifier.getEnd(), value: JSON.stringify(`${specifier.text}.js`) })
    }
    ts.forEachChild(node, visitNode)
  }
  visitNode(tree)
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end)
  writeFileSync(file, source)
})

writeFileSync(join(root, 'dist/library/build-manifest.json'), `${JSON.stringify(buildFingerprint(root), null, 2)}\n`)
