import { useCallback, useEffect, useState } from 'react'
import type { LocalCompanionOverview, LocalRemoteRunnerRegistration, LocalRemoteRunnerStatus } from './types'

export function useHostAccessStatus(enabled: boolean) {
  const [companion, setCompanion] = useState<LocalCompanionOverview | null>(null)
  const [runnerStatus, setRunnerStatus] = useState<LocalRemoteRunnerStatus | null>(null)
  const [runnerRegistration, setRunnerRegistration] = useState<LocalRemoteRunnerRegistration | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(current => current + 1), [])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    async function readStatus(path: string) {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }
    async function poll() {
      const [companionResult, runnerResult] = await Promise.allSettled([
        readStatus('api/companion'), readStatus('api/runner'),
      ])
      if (controller.signal.aborted) return
      setCompanion(companionResult.status === 'fulfilled' ? companionResult.value as LocalCompanionOverview : null)
      if (runnerResult.status === 'fulfilled') {
        const result = runnerResult.value as { runner: LocalRemoteRunnerStatus; registration: LocalRemoteRunnerRegistration | null }
        setRunnerStatus(result.runner)
        setRunnerRegistration(result.registration)
      } else {
        setRunnerStatus(null)
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 10_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [enabled, revision])

  return { companion, runnerStatus, runnerRegistration, refresh }
}
