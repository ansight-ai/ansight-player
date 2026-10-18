import { Gunzip, Unzip, UnzipInflate } from 'fflate'

export interface ArchiveMember { path: string; size: number; bytes?: Uint8Array; note?: string }
export interface ArchivePreview { members: ArchiveMember[]; expandedBytes: number }
export const maximumArtifactBytes = 64 * 1024 * 1024
const maximumExpandedBytes = 128 * 1024 * 1024
const maximumMemberBytes = 32 * 1024 * 1024
const maximumMembers = 2000

export function safeArchivePath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.includes('\0') || normalized.split('/').includes('..')) throw new Error(`Unsafe archive member path: ${path}`)
  return normalized.split('/').filter(part => part && part !== '.').join('/')
}

export function parseArtifactArchive(bytes: Uint8Array, fileName: string): ArchivePreview {
  if (bytes.byteLength > maximumArtifactBytes) throw new Error('Compressed archive exceeds 64 MiB.')
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return parseZip(bytes)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const chunks: Uint8Array[] = []
    let length = 0
    const stream = new Gunzip((chunk) => {
      length += chunk.byteLength
      if (length > maximumExpandedBytes) throw new Error('GZIP expansion exceeds 128 MiB.')
      chunks.push(chunk)
    })
    for (let offset = 0; offset < bytes.length; offset += 1024) stream.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
    const expanded = combine(chunks, length)
    const name = fileName.replace(/\.tgz$/i, '.tar').replace(/\.(gz|gzip)$/i, '')
    if (name.toLowerCase().endsWith('.tar') || isTar(expanded)) return parseTar(expanded)
    return { members: [{ path: safeArchivePath(name.split('/').pop() || 'contents'), size: length, bytes: length <= maximumMemberBytes ? expanded : undefined, note: length > maximumMemberBytes ? 'Member exceeds the 32 MiB preview limit.' : undefined }], expandedBytes: length }
  }
  if (fileName.toLowerCase().endsWith('.tar') || isTar(bytes)) return parseTar(bytes)
  throw new Error('Expected a ZIP, TAR, or GZIP archive. The file may be incomplete.')
}

function parseZip(bytes: Uint8Array): ArchivePreview {
  // Require the end record so a truncated download cannot look like a complete archive.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) { end = offset; break }
  }
  if (end < 0) throw new Error('ZIP end record is missing; the archive is incomplete.')
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('Multi-volume ZIP archives are not supported.')
  const expected = view.getUint16(end + 10, true)
  if (expected > maximumMembers) throw new Error('Archive exceeds 2,000 members (including ZIP64 archives).')
  const members: ArchiveMember[] = [], seen = new Set<string>()
  let expandedBytes = 0, completed = 0, entries = 0
  const unzip = new Unzip(file => {
    if (++entries > maximumMembers) throw new Error('Archive exceeds 2,000 members.')
    const path = safeArchivePath(file.name)
    if (seen.has(path)) throw new Error(`Duplicate archive member: ${path}`)
    seen.add(path)
    const member: ArchiveMember = { path, size: file.originalSize ?? 0 }
    const chunks: Uint8Array[] = []
    let length = 0
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      length += chunk.byteLength; expandedBytes += chunk.byteLength
      if (expandedBytes > maximumExpandedBytes) throw new Error('ZIP expansion exceeds 128 MiB.')
      if (length > maximumMemberBytes) throw new Error(`Archive member '${path}' exceeds 32 MiB.`)
      chunks.push(chunk)
      if (final) {
        completed++
        member.size = length
        if (!file.name.endsWith('/')) { member.bytes = combine(chunks, length); members.push(member) }
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let offset = 0; offset < bytes.length; offset += 1024) unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
  if (entries !== expected || completed !== expected) throw new Error('ZIP member count does not match the directory; the archive may be incomplete or encrypted.')
  return { members, expandedBytes }
}

function isTar(bytes: Uint8Array): boolean { return bytes.length >= 512 && new TextDecoder().decode(bytes.subarray(257, 262)) === 'ustar' }
function combine(chunks: Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
function tarString(bytes: Uint8Array): string { return new TextDecoder().decode(bytes).replace(/\0.*$/s, '') }
function tarNumber(bytes: Uint8Array): number {
  if (bytes[0] & 0x80) throw new Error('TAR base-256 sizes are not supported.')
  const text = tarString(bytes).trim()
  if (text && !/^[0-7]+$/.test(text)) throw new Error('Invalid TAR numeric field.')
  return text ? parseInt(text, 8) : 0
}
function parsePax(bytes: Uint8Array): Record<string, string> {
  const fields: Record<string, string> = Object.create(null)
  let offset = 0
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset)
    const length = Number(new TextDecoder().decode(bytes.subarray(offset, space)))
    if (space < 0 || !Number.isSafeInteger(length) || length <= space - offset + 1 || offset + length > bytes.length) throw new Error('Invalid TAR extended header.')
    const record = new TextDecoder().decode(bytes.subarray(space + 1, offset + length - 1))
    const separator = record.indexOf('=')
    if (separator >= 0) fields[record.slice(0, separator)] = record.slice(separator + 1)
    offset += length
  }
  return fields
}
function parseTar(bytes: Uint8Array): ArchivePreview {
  const members: ArchiveMember[] = [], seen = new Set<string>()
  let offset = 0, entries = 0, expandedBytes = 0, longName = ''
  let globalPax: Record<string, string> = {}, pax: Record<string, string> = {}
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) return { members, expandedBytes }
    if (++entries > maximumMembers) throw new Error('Archive exceeds 2,000 members.')
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0)
    if (checksum !== tarNumber(header.subarray(148, 156))) throw new Error('TAR header checksum does not match.')
    const type = String.fromCharCode(header[156])
    const metadata = { ...globalPax, ...pax }
    const headerSize = tarNumber(header.subarray(124, 136))
    const size = ['x', 'g', 'L'].includes(type) ? headerSize : metadata.size !== undefined ? Number(metadata.size) : headerSize
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.length) throw new Error('TAR member is incomplete or has an invalid size.')
    const data = bytes.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
    if (type === 'x') { pax = parsePax(data); continue }
    if (type === 'g') { globalPax = { ...globalPax, ...parsePax(data) }; continue }
    if (type === 'L') { longName = tarString(data); continue }
    const prefix = tarString(header.subarray(345, 500))
    const path = safeArchivePath(metadata.path || longName || `${prefix ? prefix + '/' : ''}${tarString(header.subarray(0, 100))}`)
    pax = {}; longName = ''
    if (seen.has(path)) throw new Error(`Duplicate archive member: ${path}`)
    seen.add(path)
    if (type === '5') continue
    expandedBytes += size
    if (expandedBytes > maximumExpandedBytes) throw new Error('TAR expansion exceeds 128 MiB.')
    const regular = type === '0' || type === '\0'
    members.push({ path, size, bytes: regular && size <= maximumMemberBytes ? data.slice() : undefined, note: !regular ? 'Links and special files are listed but never followed.' : size > maximumMemberBytes ? 'Member exceeds the 32 MiB preview limit.' : undefined })
  }
  throw new Error('TAR end marker is missing; the archive is incomplete.')
}
