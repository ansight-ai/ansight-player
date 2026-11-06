import type { SessionAnnotation, SessionImageFrame } from './sessionViewerData'

export type AnnotationVisualTreeCaptureResult =
  | { snapshotId: string; error?: never }
  | { snapshotId: null; error: string }

export type ScreenshotAnnotationCapture = {
  frame: SessionImageFrame
  visualTree: Promise<AnnotationVisualTreeCaptureResult>
}

export type AnnotationEditorDraft = {
  annotation: SessionAnnotation
  visualTreeCapturePending?: boolean
  visualTreeCaptureError?: string
  visualTreeCapture?: Promise<AnnotationVisualTreeCaptureResult>
}

export function attachCapturedAnnotationVisualTree(
  draft: AnnotationEditorDraft | null,
  annotationId: string,
  capture: AnnotationVisualTreeCaptureResult,
): AnnotationEditorDraft | null {
  if (!draft || draft.annotation.annotationId !== annotationId) {
    return draft
  }

  return {
    ...draft,
    visualTreeCapturePending: false,
    visualTreeCaptureError: capture.error,
    visualTreeCapture: undefined,
    annotation: {
      ...draft.annotation,
      target: draft.annotation.target
        ? { ...draft.annotation.target, visualTreeSnapshotId: capture.snapshotId ?? '' }
        : null,
    },
  }
}
