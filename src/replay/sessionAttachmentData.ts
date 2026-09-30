import { getCloudPlayerAdapter } from '../adapters/cloudPlayerAdapter'
import type { SessionAttachment, TeamSession } from '../types'

import { defaultSessionAttachmentMaxFileBytes, defaultSessionAttachmentMaxTotalBytes, defaultTeamAttachmentLimits, formatBytes, type TeamAttachmentLimits } from './teamData'

export const sessionAttachmentBucket = 'team-session-attachments'

export const maxSessionAttachmentBytes = defaultSessionAttachmentMaxFileBytes

export const maxSessionAttachmentTotalBytes = defaultSessionAttachmentMaxTotalBytes

export const sessionAttachmentColumns =
  'id, session_id, team_id, uploaded_by_user_id, name, notes, storage_bucket, storage_path, byte_size, content_type, original_file_name, created_at, updated_at'

export type CreateSessionAttachmentRequest = {
  session: TeamSession
  name: string
  notes: string
  file: File
  existingAttachments: SessionAttachment[]
  limits?: TeamAttachmentLimits
}

export async function loadSessionAttachments(sessionId: string): Promise<SessionAttachment[]> {
  return getCloudPlayerAdapter().attachments.loadSessionAttachments(sessionId)
}

export async function canCurrentUserAttachToSession(session: TeamSession): Promise<boolean> {
  return getCloudPlayerAdapter().attachments.canCurrentUserAttachToSession(session)
}

export async function createSessionAttachment(request: CreateSessionAttachmentRequest): Promise<SessionAttachment> {
  return getCloudPlayerAdapter().attachments.createSessionAttachment(request)
}

export async function createSessionAttachmentSignedUrl(attachment: SessionAttachment): Promise<string> {
  return getCloudPlayerAdapter().attachments.createSessionAttachmentSignedUrl(attachment)
}

export async function deleteSessionAttachment(attachment: SessionAttachment): Promise<void> {
  return getCloudPlayerAdapter().attachments.deleteSessionAttachment(attachment)
}

export function validateAttachmentFile(
  file: File,
  existingAttachments: SessionAttachment[],
  limits: TeamAttachmentLimits = defaultTeamAttachmentLimits(),
): void {
  if (file.size <= 0) {
    throw new Error('Choose a non-empty attachment file.')
  }

  if (file.size > limits.maxFileBytes) {
    throw new Error(`Attachments must be ${formatBytes(limits.maxFileBytes)} or smaller.`)
  }

  const existingTotalBytes = existingAttachments.reduce((total, attachment) => total + Math.max(0, attachment.byte_size), 0)
  if (existingTotalBytes + file.size > limits.maxTotalBytes) {
    throw new Error(`Session attachments cannot exceed ${formatBytes(limits.maxTotalBytes)} total.`)
  }
}

export type SessionAttachmentDataServices = {
  loadSessionAttachments: (sessionId: string) => Promise<SessionAttachment[]>
  canCurrentUserAttachToSession: (session: TeamSession) => Promise<boolean>
  createSessionAttachment: (request: CreateSessionAttachmentRequest) => Promise<SessionAttachment>
  createSessionAttachmentSignedUrl: (attachment: SessionAttachment) => Promise<string>
  deleteSessionAttachment: (attachment: SessionAttachment) => Promise<void>
}
