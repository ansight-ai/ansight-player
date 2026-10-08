/** Add recorded values to TypeScript completion without restricting valid runtime strings. */
export function withRecordedAutomationIds(definitions: string, automationIds?: readonly string[] | null): string {
  if (!automationIds?.length) return definitions
  const literals = [...new Set(automationIds)].sort().map((id) => JSON.stringify(id)).join(' | ')
  return definitions.replace(/(export interface UiSelector\s*\{)([\s\S]*?)(\n\})/, (_match, start, body: string, end) =>
    `${start}${body.replace(/(\b(?:automationId|ancestorAutomationId)\?:\s*)string\b/g, '$1RecordedAutomationId')}${end}`)
    + `\n/** Automation IDs observed in this draft's recorded evidence. */\nexport type RecordedAutomationId = ${literals} | (string & {});\n`
}

export type RecordedAutomationIdWarning = { start: number; end: number; message: string }
type Token = { text: string; start: number; end: number; literal?: string; complete?: boolean }
const selectorMethods = new Set(['assert', 'find', 'pinch', 'scroll', 'swipe', 'tap', 'typeText', 'waitFor'])

/** Check inline literal selectors; the host remains responsible for compound selector grounding. */
export function validateRecordedAutomationIds(source: string, automationIds?: readonly string[] | null): RecordedAutomationIdWarning[] {
  if (!automationIds) return []
  const tokens = tokenize(source)
  const warnings: RecordedAutomationIdWarning[] = []
  for (let index = 0; index + 6 < tokens.length; index++) {
    const path = tokens.slice(index, index + 7).map((token) => token.text)
    if (path[0] !== 'ansight' || path[1] !== '.' || path[3] !== '.' || path[5] !== '(' || path[6] !== '{'
      || !(path[2] === 'ui' && selectorMethods.has(path[4]) || path[2] === 'keyboard' && path[4] === 'open')) continue
    const properties = new Map<string, Token | null>()
    let depth = 1
    let hasSpread = false
    for (let cursor = index + 7; cursor < tokens.length && depth > 0; cursor++) {
      const token = tokens[cursor]
      if (depth === 1 && (token.text === '...' || token.text === '[')) hasSpread = true
      if (depth === 1 && ['{', ','].includes(tokens[cursor - 1].text)) {
        const key = token.literal ?? token.text
        const value = tokens[cursor + 2]
        properties.set(key, tokens[cursor + 1]?.text === ':' && value
          && [',', '}'].includes(tokens[cursor + 3]?.text) ? value : null)
      }
      if (['{', '[', '('].includes(token.text)) depth++
      if (['}', ']', ')'].includes(token.text)) depth--
    }
    // A spread or computed match option can override the literal selector or its matching rules.
    if (hasSpread || ['matchMode', 'exact', 'caseSensitive'].some((name) => properties.has(name)
      && !isLiteralOption(properties.get(name)))) continue
    const matchMode = properties.get('matchMode')?.literal
    if (matchMode === 'fuzzy') continue
    const contains = matchMode === 'contains' || (!matchMode && properties.get('exact')?.text === 'false')
    const caseSensitive = properties.get('caseSensitive')?.text === 'true'
    for (const name of ['automationId', 'ancestorAutomationId']) {
      const token = properties.get(name)
      if (token?.literal === undefined || !token.complete) continue
      if (automationIds.some((id) => matchesId(id, token.literal!, contains, caseSensitive))) continue
      warnings.push({
        start: token.start,
        end: token.end,
        message: `${name} ${JSON.stringify(token.literal)} was not observed in this draft's recorded evidence. Select a recorded ID from completion or verify it against the live app.`,
      })
    }
  }
  return warnings
}

function isLiteralOption(token: Token | null | undefined): boolean {
  return !!token && (token.literal !== undefined || token.text === 'true' || token.text === 'false')
}

function matchesId(actual: string, expected: string, contains: boolean, caseSensitive: boolean): boolean {
  expected = expected.trim()
  if (!caseSensitive) { actual = actual.toLowerCase(); expected = expected.toLowerCase() }
  if (contains) return actual.includes(expected)
  if (actual === expected) return true
  const resourceName = (id: string) => /^.+:id\/(.+)$/.exec(id)?.[1]
  const actualResource = resourceName(actual)
  const expectedResource = resourceName(expected)
  return !!((actualResource && !/[:/]/.test(expected) && actualResource === expected)
    || (expectedResource && !/[:/]/.test(actual) && actual === expectedResource))
}

function tokenize(source: string): Token[] {
  const pattern = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?|`(?:\\[\s\S]|[^`\\])*`?|\.\.\.|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s]/g
  return [...source.matchAll(pattern)].flatMap((match) => {
    const text = match[0]
    if (text.startsWith('//') || text.startsWith('/*')) return []
    const token: Token = { text, start: match.index!, end: match.index! + text.length }
    if (['"', "'", '`'].includes(text[0])) {
      token.complete = text.length > 1 && text.endsWith(text[0])
      if (token.complete && !(text[0] === '`' && text.includes('${'))) {
        token.literal = decodeString(text.slice(1, -1))
      }
    }
    return [token]
  })
}

function decodeString(value: string): string {
  return value.replace(/\\(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2})|\r?\n|([\s\S]))/gi, (_match, point, unicode, hex, char) => {
    if (point || unicode || hex) {
      const code = parseInt(point || unicode || hex, 16)
      return code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD'
    }
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' } as Record<string, string>)[char] ?? char ?? ''
  })
}
