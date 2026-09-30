import type { ArtifactReference } from '../replay/components/artifactComparison'
import { readSessionTimelineLink, sessionTimelineHref } from './sessionLinks.ts'

export function artifactTimelineHref(base: string, reference: ArtifactReference): string {
  return sessionTimelineHref(base, reference)
}

export function readArtifactTimelineLink(url: string): ArtifactReference | null {
  const link = readSessionTimelineLink(url)
  return link?.artifactId ? { sessionId: link.sessionId, artifactId: link.artifactId } : null
}
