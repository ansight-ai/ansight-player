export interface SessionTimelineLink {
  sessionId: string
  artifactId?: string
}

export function sessionTimelineHref(base: string, link: SessionTimelineLink | null): string {
  const url = new URL(base)
  url.searchParams.delete('session')
  url.searchParams.delete('sessionId')
  url.searchParams.delete('artifactId')
  if (link) {
    url.searchParams.set('sessionId', link.sessionId)
    if (link.artifactId) url.searchParams.set('artifactId', link.artifactId)
  }
  return url.toString()
}

export function readSessionTimelineLink(href: string): SessionTimelineLink | null {
  const query = new URL(href).searchParams
  const sessionId = query.get('sessionId') || query.get('session')
  if (!sessionId?.trim()) return null
  const artifactId = query.get('artifactId')
  return artifactId ? { sessionId, artifactId } : { sessionId }
}
