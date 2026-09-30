import type { TeamDataServices } from '../replay/teamData'
import type { SessionViewerDataServices } from '../replay/sessionViewerData'
import type { SessionAiDataServices } from '../replay/sessionAiData'
import type { SessionAttachmentDataServices } from '../replay/sessionAttachmentData'

/** The embedding cloud application owns authentication, storage and service calls. */
export type CloudPlayerAdapter = {
  team: TeamDataServices
  sessions: SessionViewerDataServices
  ai: SessionAiDataServices
  attachments: SessionAttachmentDataServices
  currentUserId: () => Promise<string | null>
}

let adapter: CloudPlayerAdapter | undefined

/** Configure once at cloud application startup. Local players need no cloud adapter. */
export function configureCloudPlayerAdapter(value: CloudPlayerAdapter): void {
  adapter = value
}

export function getCloudPlayerAdapter(): CloudPlayerAdapter {
  if (!adapter) throw new Error('This player has no cloud service adapter. Use a local session source or configure a cloud adapter.')
  return adapter
}

export async function loadPlayerCurrentUserId(): Promise<string | null> {
  return getCloudPlayerAdapter().currentUserId()
}
