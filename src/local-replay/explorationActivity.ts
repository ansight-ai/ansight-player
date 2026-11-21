import { useSyncExternalStore } from 'react'
const active = new Map<string, string>()
const listeners = new Set<() => void>()
export function setExplorationActivity(sessionId: string, recordingId: string | null) {
  if (recordingId) active.set(sessionId, recordingId)
  else active.delete(sessionId)
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function useExplorationActivity(sessionId: string) {
  return useSyncExternalStore(subscribe, () => active.get(sessionId) ?? null, () => null)
}
