import { getCloudPlayerAdapter } from '../adapters/cloudPlayerAdapter'
type User = { id: string }
import type { Team, TeamContext, TeamRole, TeamSession, SessionAccessStatus } from '../types'

export const sessionArchiveBucket = 'team-session-archives'

export const teamOrgImageBucket = 'team-org-images'

export const legacyStreamSessionLayout = 'stream_manifest_v1'

export const streamSessionLayout = 'stream_manifest_v2'

export const isStreamSessionLayout = (layout: string | null | undefined): boolean =>
  layout === legacyStreamSessionLayout || layout === streamSessionLayout

export const maxTeamOrgImageBytes = 2 * 1024 * 1024

export const attachmentLimitBytesPerMb = 1024 * 1024

export const defaultSessionAttachmentMaxFileBytes = 20 * attachmentLimitBytesPerMb

export const defaultSessionAttachmentMaxTotalBytes = 50 * attachmentLimitBytesPerMb

export const minSessionAttachmentLimitMb = 1

export const maxSessionAttachmentFileLimitMb = 50

export const maxSessionAttachmentTotalLimitMb = 1024

export const maxAllowedAppIds = 100

export const teamOrgImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

export const sessionColumns =
  'id, team_id, uploaded_by_user_id, app_id, app_name, session_id, title, description, storage_bucket, storage_path, storage_layout, manifest_storage_path, stream_byte_size, stream_file_count, archive_byte_size, archive_content_type, captured_start_at, captured_end_at, uploaded_at, updated_at, duration_ms, log_count, screenshot_count, visual_tree_snapshot_count, artifact_snapshot_count, artifact_file_count, artifact_byte_size, annotation_count, analysis_count, metric_sample_count, metric_channel_count, author_user_id, author_email, author_name, author_company, platform_key, operating_system, app_version, sdk_name, sdk_version, sdk_language, device_model, device_os_name, is_emulator, tags, metadata, access_status, archived_at, archived_by_user_id, capture_upload_id, upload_source'

const selectedTeamStoragePrefix = 'ansight.portal.selectedTeamId.'

export const sessionAccessStatusOptions: Array<{ value: SessionAccessStatus; label: string }> = [
  { value: 'team', label: 'Team' },
  { value: 'public_with_auth', label: 'Signed-in users' },
  { value: 'public_no_auth', label: 'Anyone with the link' },
]

export const emptyTeamContext: TeamContext = {
  teams: [],
  selectedTeam: null,
  members: [],
  invitations: [],
  currentUserRole: null,
}

export type UserTeamRoleSummary = {
  role: TeamRole | null
  team: Team
}

export type TeamAttachmentLimits = {
  maxFileBytes: number
  maxTotalBytes: number
}

export type LoadTeamSessionsOptions = {
  archivedOnly?: boolean
  includeArchived?: boolean
}

export type SessionDetailsUpdate = {
  title: string
  description: string
  appName: string
  appId: string
  sourceSessionId: string
  authorName: string
  authorEmail: string
  authorCompany: string
  tags: string[]
  metadata: unknown
  accessStatus: SessionAccessStatus
}

export function readSelectedTeamId(user: User): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(createSelectedTeamStorageKey(user))
}

export function writeSelectedTeamId(user: User, teamId: string | null): void {
  if (typeof window === 'undefined') {
    return
  }

  const key = createSelectedTeamStorageKey(user)
  if (!teamId) {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, teamId)
}

export async function loadTeamAttachmentLimits(teamId: string): Promise<TeamAttachmentLimits> {
  return getCloudPlayerAdapter().team.loadTeamAttachmentLimits(teamId)
}

export async function updateSessionDetails(sessionId: string, details: SessionDetailsUpdate): Promise<TeamSession> {
  return getCloudPlayerAdapter().team.updateSessionDetails(sessionId, details)
}

export async function archiveTeamSession(sessionId: string, shouldArchive: boolean): Promise<TeamSession> {
  return getCloudPlayerAdapter().team.archiveTeamSession(sessionId, shouldArchive)
}

export async function deleteTeamSession(session: TeamSession): Promise<void> {
  return getCloudPlayerAdapter().team.deleteTeamSession(session)
}

export async function canCurrentUserManageSession(session: TeamSession): Promise<boolean> {
  return getCloudPlayerAdapter().team.canCurrentUserManageSession(session)
}

export function formatSessionAuthor(session: Pick<TeamSession, 'author_name' | 'author_email' | 'author_company'>): string {
  return joinDisplay(session.author_name, session.author_email, session.author_company) ?? 'Unknown author'
}

export function formatSessionAccessStatus(accessStatus: SessionAccessStatus): string {
  return sessionAccessStatusOptions.find((option) => option.value === accessStatus)?.label ?? 'Team'
}

export function canManageTeam(role: TeamRole | null): boolean {
  return role === 'admin' || role === 'owner'
}

export function formatRole(role: TeamRole | null): string {
  if (role === 'owner') {
    return 'Owner'
  }
  if (role === 'admin') {
    return 'Admin'
  }
  return 'Member'
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export function defaultTeamAttachmentLimits(): TeamAttachmentLimits {
  return {
    maxFileBytes: defaultSessionAttachmentMaxFileBytes,
    maxTotalBytes: defaultSessionAttachmentMaxTotalBytes,
  }
}

export function normalizeTeamAttachmentLimits(limits: TeamAttachmentLimits): TeamAttachmentLimits {
  const minBytes = minSessionAttachmentLimitMb * attachmentLimitBytesPerMb
  const maxFileBytesAllowed = maxSessionAttachmentFileLimitMb * attachmentLimitBytesPerMb
  const maxTotalBytesAllowed = maxSessionAttachmentTotalLimitMb * attachmentLimitBytesPerMb
  const maxFileBytes = clampNumber(
    normalizeAttachmentLimitBytes(limits.maxFileBytes, defaultSessionAttachmentMaxFileBytes),
    minBytes,
    maxFileBytesAllowed,
  )
  const rawTotalBytes = normalizeAttachmentLimitBytes(limits.maxTotalBytes, defaultSessionAttachmentMaxTotalBytes)
  const maxTotalBytes = clampNumber(rawTotalBytes, maxFileBytes, maxTotalBytesAllowed)
  return { maxFileBytes, maxTotalBytes }
}

export function bytesToAttachmentLimitMb(bytes: number, fallbackBytes: number): number {
  const normalizedBytes = normalizeAttachmentLimitBytes(bytes, fallbackBytes)
  return Math.round(normalizedBytes / attachmentLimitBytesPerMb)
}

export function validateTeamAttachmentLimits(maxFileBytes: number, maxTotalBytes: number): void {
  const minBytes = minSessionAttachmentLimitMb * attachmentLimitBytesPerMb
  const maxFileBytesAllowed = maxSessionAttachmentFileLimitMb * attachmentLimitBytesPerMb
  const maxTotalBytesAllowed = maxSessionAttachmentTotalLimitMb * attachmentLimitBytesPerMb

  if (!Number.isFinite(maxFileBytes) || maxFileBytes < minBytes || maxFileBytes > maxFileBytesAllowed) {
    throw new Error(`Attachment file limit must be between ${minSessionAttachmentLimitMb} MB and ${maxSessionAttachmentFileLimitMb} MB.`)
  }

  if (!Number.isFinite(maxTotalBytes) || maxTotalBytes < maxFileBytes || maxTotalBytes > maxTotalBytesAllowed) {
    throw new Error(`Attachment total limit must be at least the file limit and no more than ${maxSessionAttachmentTotalLimitMb} MB.`)
  }
}

export function normalizeAllowedAppIds(appIds: string[]): string[] {
  const normalizedAppIds: string[] = []
  const seenAppIds = new Set<string>()

  for (const appId of appIds) {
    const normalizedAppId = appId.trim()
    if (!normalizedAppId) {
      continue
    }

    if (normalizedAppId === '*') {
      return ['*']
    }

    if (/\s/.test(normalizedAppId)) {
      throw new Error('App IDs cannot contain whitespace.')
    }

    const comparisonKey = normalizedAppId.toLowerCase()
    if (!seenAppIds.has(comparisonKey)) {
      seenAppIds.add(comparisonKey)
      normalizedAppIds.push(normalizedAppId)
    }
  }

  if (normalizedAppIds.length > maxAllowedAppIds) {
    throw new Error(`An organisation can allow at most ${maxAllowedAppIds} app IDs.`)
  }

  return normalizedAppIds.length > 0 ? normalizedAppIds : ['*']
}

function joinDisplay(...values: Array<string | null | undefined>): string | null {
  const parts = values.map((value) => value?.trim()).filter((value): value is string => !!value)
  return parts.length > 0 ? parts.join(' - ') : null
}

function normalizeAttachmentLimitBytes(bytes: number, fallbackBytes: number): number {
  return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : fallbackBytes
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function createSelectedTeamStorageKey(user: User): string {
  return `${selectedTeamStoragePrefix}${user.id}`
}

export type TeamDataServices = {
  loadTeamAttachmentLimits: (teamId: string) => Promise<TeamAttachmentLimits>
  updateSessionDetails: (sessionId: string, details: SessionDetailsUpdate) => Promise<TeamSession>
  archiveTeamSession: (sessionId: string, shouldArchive: boolean) => Promise<TeamSession>
  deleteTeamSession: (session: TeamSession) => Promise<void>
  canCurrentUserManageSession: (session: TeamSession) => Promise<boolean>
}
