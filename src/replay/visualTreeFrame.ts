import type { SessionImageFrame, SessionVisualTreeSnapshot } from './sessionViewerData'

// An explicitly selected tree is a comparison, so prefer its linked frame and
// otherwise the closest capture, including frames just after the tree.
export function selectFrameForVisualTree(
  frames: SessionImageFrame[],
  snapshot: SessionVisualTreeSnapshot,
): SessionImageFrame | null {
  const linkedFrameId = snapshot.screenshotFrameId?.trim()
  const linkedFrame = linkedFrameId ? frames.find((frame) => frame.frameId === linkedFrameId) : null
  if (linkedFrame) return linkedFrame

  const timestamp = Date.parse(snapshot.capturedAtUtc ?? '')
  if (!Number.isFinite(timestamp)) return null

  let closest: SessionImageFrame | null = null
  let closestTimestamp = Number.POSITIVE_INFINITY
  let closestDistance = Number.POSITIVE_INFINITY
  for (const frame of frames) {
    const frameTimestamp = Date.parse(frame.capturedAtUtc ?? '')
    const distance = Math.abs(frameTimestamp - timestamp)
    if (distance < closestDistance || (distance === closestDistance && frameTimestamp < closestTimestamp)) {
      closest = frame
      closestTimestamp = frameTimestamp
      closestDistance = distance
    }
  }
  return closest
}
