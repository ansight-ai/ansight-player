import type { LocalSessionSummary } from './types'

export type SessionFilters = {
  minimumSeconds: string
  maximumSeconds: string
  packagePattern: string
  tags: string[]
  platforms: string[]
  technologies: string[]
  deviceType: 'any' | 'physical' | 'virtual'
  capturedFrom: string
  capturedTo: string
}

export const emptySessionFilters: SessionFilters = {
  minimumSeconds: '',
  maximumSeconds: '',
  packagePattern: '',
  tags: [],
  platforms: [],
  technologies: [],
  deviceType: 'any',
  capturedFrom: '',
  capturedTo: '',
}

export function hasSessionFilters(filters: SessionFilters): boolean {
  return Boolean(filters.minimumSeconds || filters.maximumSeconds || filters.packagePattern.trim()
    || filters.tags.length || filters.platforms.length || filters.technologies.length
    || filters.deviceType !== 'any' || filters.capturedFrom || filters.capturedTo)
}

export function matchesSessionFilters(session: LocalSessionSummary, filters: SessionFilters): boolean {
  const durationSeconds = Math.max(0, ((session.isConnected ? Date.now() : Date.parse(session.lastUpdatedUtc)) - Date.parse(session.createdUtc)) / 1000)
  if ((filters.minimumSeconds || filters.maximumSeconds) && !Number.isFinite(durationSeconds)) return false
  if (filters.minimumSeconds && durationSeconds < Number(filters.minimumSeconds)) return false
  if (filters.maximumSeconds && durationSeconds > Number(filters.maximumSeconds)) return false

  const pattern = filters.packagePattern.trim()
  if (pattern && !matchesPackagePattern(session.appId, pattern)) return false
  if (filters.tags.length && !filters.tags.every((tag) => session.tags.some((value) => value.toLowerCase() === tag.toLowerCase()))) return false
  if (filters.platforms.length && !filters.platforms.includes(session.runtimePlatform?.toLowerCase() ?? '')) return false
  if (filters.technologies.length && !filters.technologies.includes(session.technology?.toLowerCase() ?? '')) return false
  if (filters.deviceType === 'virtual' && !session.isSimulatorOrEmulator) return false
  if (filters.deviceType === 'physical' && session.isSimulatorOrEmulator) return false

  const capturedAt = Date.parse(session.createdUtc)
  if ((filters.capturedFrom || filters.capturedTo) && !Number.isFinite(capturedAt)) return false
  if (filters.capturedFrom && capturedAt < new Date(`${filters.capturedFrom}T00:00:00`).getTime()) return false
  if (filters.capturedTo) {
    const dayAfter = new Date(`${filters.capturedTo}T00:00:00`)
    dayAfter.setDate(dayAfter.getDate() + 1)
    if (capturedAt >= dayAfter.getTime()) return false
  }
  return true
}

export function matchesPackagePattern(packageId: string, pattern: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) return packageId.toLowerCase().includes(pattern.toLowerCase())
  const escaped = pattern.split(/([*?])/).map((part) => part === '*' ? '.*' : part === '?' ? '.' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')
  return new RegExp(`^${escaped}$`, 'i').test(packageId)
}

export function toggleFilterValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((current) => current !== value) : [...values, value]
}
