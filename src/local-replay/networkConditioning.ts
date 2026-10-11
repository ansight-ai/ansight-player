export type NetworkProfile = {
  downloadKbps: number; uploadKbps: number; latencyMs: number; jitterMs: number
  seed: number; blocked: boolean; stall: boolean
}
export type NetworkCapabilities = { available: boolean; reason?: string; scope: string; limitations: string[] }
export type NetworkLease = {
  leaseId: string; sessionId?: string; status: string; expiresAtUtc: string; scope: string
  profile?: NetworkProfile
  counters?: { connections: number; bypassedConnections: number; uploadBytes: number; downloadBytes: number; blockedConnections: number }
}
const normal: NetworkProfile = { downloadKbps: 0, uploadKbps: 0, latencyMs: 0, jitterMs: 0, seed: 42, blocked: false, stall: false }
export const networkPresets = [
  { id: 'normal', label: 'Unrestricted', description: 'No speed or delay limits', profile: normal },
  { id: 'slow', label: 'Slow connection', description: '1.5 Mbps download · 150 ms delay', profile: { ...normal, downloadKbps: 1500, uploadKbps: 750, latencyMs: 150, jitterMs: 30 } },
  { id: 'poor', label: 'Poor connection', description: '256 kbps download · 600 ms delay', profile: { ...normal, downloadKbps: 256, uploadKbps: 128, latencyMs: 600, jitterMs: 150 } },
  { id: 'blocked', label: 'Blocked', description: 'Close TCP connections', profile: { ...normal, blocked: true } },
  { id: 'stall', label: 'Stalled', description: 'Hold transfers until reset', profile: { ...normal, stall: true } },
]

// A logarithmic scale makes low rates usable while preserving the host's full range.
// The far-right stop represents unlimited; exact numeric edits remain in kbps.
export function networkRateSliderPosition(kbps: number): number {
  return !Number.isFinite(kbps) || kbps <= 0 ? 100 : Math.max(0, Math.min(99, Math.log10(kbps) * 99 / 6))
}

export function networkRateFromSlider(position: number): number {
  return position >= 100 ? 0 : Math.min(1_000_000, Math.max(1, Math.round(10 ** (position * 6 / 99))))
}

export function networkProfilePreset(profile: NetworkProfile): string {
  return networkPresets.find(preset => (Object.keys(preset.profile) as (keyof NetworkProfile)[])
    .every(key => preset.profile[key] === profile[key]))?.id ?? 'custom'
}

export function networkPorts(text: string): number[] {
  if (!text.trim()) return []
  const parts = text.split(',').map(value => value.trim())
  if (parts.length > 32 || parts.some(value => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) {
    throw new Error('Enter up to 32 TCP ports between 1 and 65535, separated by commas.')
  }
  return [...new Set(parts.map(Number))]
}

export async function networkRequest<T>(action: 'capabilities' | 'get' | 'set' | 'reset', body: object): Promise<T> {
  const response = await fetch(`api/network/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const text = await response.text()
  let value: { message?: string; error?: string } = {}
  try { value = JSON.parse(text) } catch { /* Preserve the host's plain-text error. */ }
  if (!response.ok) throw new Error(value.message || value.error || text || `Network control returned HTTP ${response.status}.`)
  return value as T
}
