import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import { validateRecordedAutomationIds, withRecordedAutomationIds } from '../src/local-replay/recordedAutomationIds.ts'

test('recorded selector types offer completion for both ID fields and still accept runtime strings', () => {
  const definitions = withRecordedAutomationIds(`export interface UiSelector {
  automationId?: string;
  ancestorAutomationId?: string;
}
export interface UiNode { automationId?: string; }`, ['save', 'page', 'save', 'a"b'])
  assert.match(definitions, /automationId\?: RecordedAutomationId/)
  assert.match(definitions, /ancestorAutomationId\?: RecordedAutomationId/)
  assert.match(definitions, /interface UiNode[\s\S]*?automationId\?: string/)
  assert.equal(definitions.match(/"save"/g)?.length, 1)
  const files = new Map([['/task.d.ts', definitions]])
  const host = {
    getScriptFileNames: () => [...files.keys()], getScriptVersion: () => '1',
    getScriptSnapshot: (path) => files.has(path) ? ts.ScriptSnapshot.fromString(files.get(path)) : undefined,
    getCurrentDirectory: () => '/', getCompilationSettings: () => ({ noLib: true, strict: true }),
    getDefaultLibFileName: () => '', fileExists: (path) => files.has(path), readFile: (path) => files.get(path),
  }
  for (const field of ['automationId', 'ancestorAutomationId']) {
    const source = `import type { UiSelector } from './task'; const selector: UiSelector = { ${field}: "" };`
    files.set('/main.ts', source)
    const service = ts.createLanguageService(host)
    const entries = service.getCompletionsAtPosition('/main.ts', source.indexOf('""') + 1, {})?.entries ?? []
    assert.ok(entries.some((item) => item.name === 'save'), field)
    assert.ok(entries.some((item) => item.name === 'page'), field)
    service.dispose()
  }
  files.set('/main.ts', `import type { UiSelector } from './task'; const selector: UiSelector = { automationId: 'runtime-id' };`)
  const service = ts.createLanguageService(host)
  assert.deepEqual(service.getSemanticDiagnostics('/main.ts'), [])
  service.dispose()
})

test('warns on unknown IDs in UI and keyboard selectors with exact source locations', () => {
  const source = `await ansight.ui.tap({automationId: 'typo', ancestorAutomationId: "page"});
await ansight.keyboard.open({ automationId: 'missing' });`
  const warnings = validateRecordedAutomationIds(source, ['page'])
  assert.deepEqual(warnings.map((item) => source.slice(item.start, item.end)), ["'typo'", "'missing'"])
  assert.match(warnings[0].message, /automationId "typo" was not observed/)
  assert.equal(validateRecordedAutomationIds(source, []).length, 3)
  assert.deepEqual(validateRecordedAutomationIds(source, null), [])
})

test('matches runtime case rules, partial selectors, Android resource IDs and escaped literals', () => {
  const source = String.raw`
await ansight.ui.tap({ automationId: 'SAVE' });
await ansight.ui.tap({ automationId: 'field' });
await ansight.ui.tap({ automationId: 'av', exact: false });
await ansight.ui.tap({ automationId: 'pa', matchMode: 'contains' });
await ansight.ui.tap({ automationId: 's\u0061ve' });
await ansight.ui.tap({ automationId: 'sve', matchMode: 'fuzzy' });
await ansight.ui.tap({ automationId: 'SAVE', caseSensitive: true });
await ansight.ui.tap({ automationId: 'other:id/field' });`
  const warnings = validateRecordedAutomationIds(source, ['save', 'page', 'app:id/field'])
  assert.equal(warnings.length, 2)
  assert.match(warnings[0].message, /SAVE/)
  assert.match(warnings[1].message, /other:id\/field/)
})

test('does not mistake comments, strings, dynamic selectors or unrelated properties for literal selectors', () => {
  const source = String.raw`
// ansight.ui.tap({automationId: 'comment'});
/* ansight.ui.tap({automationId: 'comment'}); */
const example = "ansight.ui.tap({automationId: 'example'})";
const unrelated = {automationId: 'unrelated'};
await ansight.ui.tap({ automationId: input.id });
await ansight.ui.tap({ automationId: 'dynamic' + suffix });
await ansight.ui.tap({ automationId: 'overridden', ...input });
await ansight.ui.tap({ automationId: 'dynamic-options', exact: input.exact });
await ansight.ui.tap({ automationId: 'computed-options', [key]: value });
await other.ui.tap({ automationId: 'unrelated' });`
  assert.deepEqual(validateRecordedAutomationIds(source, []), [])
})

test('handles multiline selectors, quoted keys, templates and comments between properties', () => {
  const source = 'await ansight.ui.typeText({\n "automationId": /* comment */ `save`,\n ancestorAutomationId: \'missing\', value: "ansight.ui.tap({automationId: \'example\'})" });'
  assert.equal(validateRecordedAutomationIds(source, ['save']).length, 1)
  assert.deepEqual(validateRecordedAutomationIds('await ansight.ui.tap({ automationId: `item-${id}` });', []), [])
})
