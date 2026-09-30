// No URLs, input values, selectors or session identifiers enter analytics.
export type InspectionFeature = 'logs' | 'network' | 'visual_tree' | 'artifacts' | 'files' | 'playback' | 'annotations'
const lastSent = new Map<string, number>()
export function trackInspection(feature: InspectionFeature | 'active_minute'): void {
  try {
    const now = Date.now()
    if (now - (lastSent.get(feature) ?? 0) < (feature === 'active_minute' ? 30_000 : 5_000)) return
    lastSent.set(feature, now)
    void fetch('api/analytics/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'usage', feature }), keepalive: true,
    }).catch(() => { /* Analytics cannot affect inspection. */ })
  } catch { /* A disabled or unavailable transport must not interrupt UI actions. */ }
}

export function observeLocalActivity(): () => void {
  let lastInteraction = 0
  let lastEngagementAction = 0
  function interaction(event: Event) {
    if (!event.isTrusted || document.visibilityState !== 'visible') return
    const now = Date.now()
    lastInteraction = now
    trackInspection('active_minute')
    if (now - lastEngagementAction >= 2_000) {
      lastEngagementAction = now
      void fetch('api/analytics/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'engagement_action' }), keepalive: true,
      }).catch(() => { /* Analytics cannot affect interaction. */ })
    }
  }
  document.addEventListener('pointerdown', interaction, { passive: true })
  document.addEventListener('keydown', interaction, { passive: true })
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInteraction < 60_000)
      trackInspection('active_minute')
  }, 30_000)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('pointerdown', interaction)
    document.removeEventListener('keydown', interaction)
  }
}
