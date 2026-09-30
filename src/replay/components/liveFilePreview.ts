export const largeFilePreviewWarningBytes = 10 * 1024 * 1024

export function isLargeFilePreview(sizeBytes: number | null | undefined): boolean {
  return typeof sizeBytes === 'number'
    && Number.isFinite(sizeBytes)
    && sizeBytes > largeFilePreviewWarningBytes
}
