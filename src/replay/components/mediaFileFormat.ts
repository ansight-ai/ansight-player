export type MediaFileFormat = {
  kind: 'audio' | 'video'
  mimeType: string
}

const mediaMimeTypes: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.mpe': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.mp2': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.weba': 'audio/webm',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.caf': 'audio/x-caf',
}

export function resolveMediaFileFormat(
  fileName: string,
  mimeType?: string,
  fileExtension?: string,
): MediaFileFormat | null {
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? ''
  if (normalizedMimeType.startsWith('audio/') || normalizedMimeType.startsWith('video/')) {
    return { kind: normalizedMimeType.startsWith('audio/') ? 'audio' : 'video', mimeType: normalizedMimeType }
  }

  const name = fileName.replaceAll('\\', '/').split('/').pop() ?? ''
  const suppliedExtension = fileExtension?.trim().toLowerCase()
  const extension = suppliedExtension
    ? `.${suppliedExtension.replace(/^\./, '')}`
    : name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
  const inferredMimeType = mediaMimeTypes[extension]
  return inferredMimeType
    ? { kind: inferredMimeType.startsWith('audio/') ? 'audio' : 'video', mimeType: inferredMimeType }
    : null
}
