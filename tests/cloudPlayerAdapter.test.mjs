import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configureCloudPlayerAdapter, getCloudPlayerAdapter, loadPlayerCurrentUserId } from '../dist/library/adapters/cloudPlayerAdapter.js'
import { loadSessionViewerPayload } from '../dist/library/replay/sessionViewerData.js'
import { archiveTeamSession } from '../dist/library/replay/teamData.js'
import { invokeSessionAiExtraction } from '../dist/library/replay/sessionAiData.js'
import { deleteSessionAttachment } from '../dist/library/replay/sessionAttachmentData.js'

test('local import makes no cloud calls; cloud operations require an explicit adapter', async () => {
  assert.throws(() => getCloudPlayerAdapter(), /no cloud service adapter/)
  await assert.rejects(loadPlayerCurrentUserId(), /no cloud service adapter/)
  await assert.rejects(loadSessionViewerPayload('local-session'), /no cloud service adapter/)
})

test('embedding application owns identity and all cloud transport operations', async () => {
  const calls = []
  const capture = (operation, result) => async (...arguments_) => { calls.push({ operation, arguments_ }); return result }
  const payload = { session: { id: 'cloud-session' } }
  configureCloudPlayerAdapter({
    currentUserId: capture('identity', 'user-123'),
    sessions: { loadSessionViewerPayload: capture('session', payload) },
    team: { archiveTeamSession: capture('archive', payload.session) },
    ai: { invokeSessionAiExtraction: capture('ai') },
    attachments: { deleteSessionAttachment: capture('attachment') },
  })
  assert.deepEqual(calls, [])
  assert.equal(await loadPlayerCurrentUserId(), 'user-123')
  assert.equal(await loadSessionViewerPayload('cloud-session', { superAdminMode: true }), payload)
  assert.equal(await archiveTeamSession('cloud-session', true), payload.session)
  await invokeSessionAiExtraction('run-123', { notifyTeam: false })
  const attachment = { id: 'attachment-123' }
  await deleteSessionAttachment(attachment)
  assert.deepEqual(calls, [
    { operation: 'identity', arguments_: [] },
    { operation: 'session', arguments_: ['cloud-session', { superAdminMode: true }] },
    { operation: 'archive', arguments_: ['cloud-session', true] },
    { operation: 'ai', arguments_: ['run-123', { notifyTeam: false }] },
    { operation: 'attachment', arguments_: [attachment] },
  ])
})
