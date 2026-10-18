export interface ArtifactRecord { line: number; value: unknown; error?: string }
export interface ArtifactRecords { columns: string[]; records: ArtifactRecord[]; warnings: string[] }
const maximumRecords = 100_000

export function parseJsonLines(text: string): ArtifactRecords {
  const records: ArtifactRecord[] = []
  const columns = new Set<string>()
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const sourceLine = lines[index]
    const line = (sourceLine.charCodeAt(0) === 30 ? sourceLine.slice(1) : sourceLine).trim()
    if (!line) continue
    if (records.length >= maximumRecords) throw new Error(`Record limit exceeded (${maximumRecords.toLocaleString()}). Open a smaller export.`)
    try {
      const value: unknown = JSON.parse(line)
      if (value && typeof value === 'object' && !Array.isArray(value)) Object.keys(value).slice(0, 100).forEach(key => { if (columns.size < 100) columns.add(key) })
      else columns.add('value')
      records.push({ line: index + 1, value })
    } catch (error) {
      records.push({ line: index + 1, value: line, error: error instanceof Error ? error.message : 'Invalid JSON' })
    }
  }
  return { columns: [...columns], records, warnings: [] }
}

export function parseDelimitedRecords(text: string, delimiter: ',' | '\t'): ArtifactRecords {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false, afterQuote = false
  const source = text.replace(/^\uFEFF/, '')
  const pushCell = () => { if (row.length >= 1000) throw new Error('Table exceeds 1,000 columns.'); row.push(cell); cell = ''; afterQuote = false }
  const pushRow = () => { pushCell(); if (rows.length > maximumRecords) throw new Error('Table exceeds 100,000 records.'); rows.push(row); row = [] }
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index++ }
      else if (character === '"') { quoted = false; afterQuote = true }
      else cell += character
    } else if (character === delimiter) pushCell()
    else if (character === '\n' || character === '\r') { pushRow(); if (character === '\r' && source[index + 1] === '\n') index++ }
    else if (character === '"' && cell.length === 0 && !afterQuote) quoted = true
    else {
      if (afterQuote) throw new Error('Unexpected content after a closing quote.')
      cell += character
    }
  }
  if (quoted) throw new Error('Unterminated quoted field. The file may be truncated.')
  if (cell || row.length || afterQuote) pushRow()
  const headers = rows.shift() ?? []
  const width = rows.reduce((maximum, values) => Math.max(maximum, values.length), headers.length)
  const used = new Set<string>()
  const columns = Array.from({ length: width }, (_, index) => {
    const name = headers[index] || `Column ${index + 1}`
    let unique = name, suffix = 2
    while (used.has(unique)) unique = `${name} (${suffix++})`
    used.add(unique)
    return unique
  })
  return {
    columns,
    records: rows.map((values, index) => ({ line: index + 2, value: Object.fromEntries(columns.map((column, columnIndex) => [column, values[columnIndex] ?? ''])) })),
    warnings: rows.some(values => values.length !== headers.length) ? ['Some records have a different number of columns from the header.'] : [],
  }
}

export function displayArtifactValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try { return JSON.stringify(value, (_, child) => typeof child === 'bigint' ? child.toString() : child) ?? '' }
  catch { return '[Value exceeds the preview nesting limit]' }
}
