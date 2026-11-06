import type { AnnotationVisualTreeCaptureResult } from '../replay/annotationCapture'
import type { LiveVisualTreeCaptureResponse } from './types'

export async function captureLocalAnnotationVisualTree(sessionId: string): Promise<AnnotationVisualTreeCaptureResult> {
  try {
    const response = await fetch(`api/sessions/${encodeURIComponent(sessionId)}/visual-tree/capture`, {
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    })
    const result = await response.json() as LiveVisualTreeCaptureResponse
    const hasCapturedTree = response.ok
      && result.isSuccess
      && result.sessionId === sessionId
      && !!result.snapshotId?.trim()

    if (!hasCapturedTree) {
      throw new Error(result.message || 'The host did not return a visual-tree snapshot for this annotation.')
    }

    return { snapshotId: result.snapshotId! }
  } catch (error) {
    return {
      snapshotId: null,
      error: error instanceof Error ? error.message : 'Unable to capture the visual tree.',
    }
  }
}
