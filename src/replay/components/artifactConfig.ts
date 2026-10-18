import { parseAllDocuments } from 'yaml'
import { parse as parseToml } from 'smol-toml'

export interface ConfigDocument { value: unknown; warnings: string[] }

export function parseArtifactConfig(text: string, format: 'yaml' | 'toml'): ConfigDocument {
  if (text.length > 16 * 1024 * 1024) throw new Error('Configuration preview is limited to 16 MiB.')
  if (format === 'toml') return { value: normalizeConfig(parseToml(text)), warnings: [] }
  const documents = parseAllDocuments(text, { prettyErrors: true, stringKeys: true, uniqueKeys: true })
  const errors = documents.flatMap(document => document.errors)
  if (errors.length) throw new Error(errors.slice(0, 10).map(error => error.message).join('\n'))
  const values = documents.map(document => normalizeConfig(document.toJS({ maxAliasCount: 100 })))
  return { value: values.length === 1 ? values[0] : values, warnings: documents.flatMap(document => document.warnings.map(warning => warning.message)) }
}

function normalizeConfig(value: unknown, ancestors = new Set<object>(), depth = 0): unknown {
  if (depth > 100) throw new Error('Configuration nesting exceeds 100 levels.')
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (!value || typeof value !== 'object') return value
  if (ancestors.has(value)) return '[Circular YAML alias]'
  const next = new Set(ancestors).add(value)
  if (Array.isArray(value)) return value.map(item => normalizeConfig(item, next, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeConfig(item, next, depth + 1)]))
}
