import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addSessionRange } from '../src/local-replay/sessionSelection.ts'

test('shift selection includes the whole filtered range, including unloaded sessions', () => {
  const orderedIds = ['pinned', 'one', 'two', 'three', 'four', 'five', 'six']
  assert.deepEqual([...addSessionRange(new Set(['pinned']), orderedIds, 'one', 'five')], ['pinned', 'one', 'two', 'three', 'four', 'five'])
  assert.deepEqual([...addSessionRange(new Set(), orderedIds, 'five', 'two')], ['two', 'three', 'four', 'five'])
  assert.deepEqual([...addSessionRange(new Set(), orderedIds, 'hidden', 'two')], ['two'])
})
