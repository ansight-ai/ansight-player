export function createSimulatorVideoProgressMonitor(videoTime: number, observedAt: number) {
  let lastVideoTime = videoTime
  let lastProgressAt = observedAt

  return {
    hasStalled(currentVideoTime: number, now: number): boolean {
      if (currentVideoTime !== lastVideoTime) {
        lastVideoTime = currentVideoTime
        lastProgressAt = now
      }
      return now - lastProgressAt >= 8_000
    },
  }
}
