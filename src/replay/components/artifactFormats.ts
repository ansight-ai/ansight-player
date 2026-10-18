export type ArtifactFormat = 'binary' | 'code' | 'csv' | 'tsv' | 'json' | 'jsonl' | 'xml' | 'yaml' | 'toml'
  | 'markdown' | 'html' | 'har' | 'profile' | 'perfetto' | 'nettrace' | 'geo' | 'archive'
  | 'sqlite' | 'model3d' | 'image' | 'pdf' | 'audio' | 'video' | 'text'

/** Specific formats must precede generic structured-suffix and text fallbacks. */
export function resolveArtifactFormat(fileName: string, suppliedMimeType = '', text?: string): ArtifactFormat {
  const name = fileName.toLowerCase()
  const extension = name.slice(name.lastIndexOf('.'))
  const mime = suppliedMimeType.split(';', 1)[0].trim().toLowerCase()
  if (['.glb', '.gltf', '.obj', '.stl'].includes(extension) || ['model/gltf+json', 'model/gltf-binary', 'model/obj', 'model/stl'].includes(mime)) return 'model3d'
  if (['.zip', '.tar', '.gz', '.gzip', '.tgz'].includes(extension) || ['application/zip', 'application/x-zip-compressed', 'application/x-tar', 'application/gzip', 'application/x-gzip'].includes(mime)) return 'archive'
  if (extension === '.nettrace') return 'nettrace'
  if (['.perfetto-trace', '.pftrace'].includes(extension) || mime === 'application/vnd.perfetto.trace') return 'perfetto'
  if (extension === '.cpuprofile' || name.endsWith('.speedscope.json') || mime === 'application/vnd.speedscope+json') return 'profile'
  if (extension === '.har' || mime === 'application/har+json') return 'har'
  if (['.geojson', '.gpx', '.kml'].includes(extension) || ['application/geo+json', 'application/gpx+xml', 'application/vnd.google-earth.kml+xml'].includes(mime)) return 'geo'
  if (['.jsonl', '.ndjson'].includes(extension) || ['application/x-ndjson', 'application/ndjson', 'application/jsonl', 'application/jsonlines', 'application/json-seq'].includes(mime)) return 'jsonl'
  if (extension === '.tsv' || mime === 'text/tab-separated-values') return 'tsv'
  if (extension === '.csv' || mime === 'text/csv') return 'csv'
  if (['.yaml', '.yml'].includes(extension) || ['application/yaml', 'application/x-yaml', 'text/yaml', 'text/x-yaml'].includes(mime)) return 'yaml'
  if (extension === '.toml' || ['application/toml', 'text/toml'].includes(mime)) return 'toml'
  if (['.html', '.htm'].includes(extension) || mime === 'text/html') return 'html'
  if (['.db', '.db3', '.sqlite', '.sqlite3'].includes(extension) || mime.includes('sqlite')) return 'sqlite'
  if (['.md', '.markdown', '.mdx'].includes(extension) || mime === 'text/markdown') return 'markdown'
  if (extension === '.pdf' || mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico', '.heic', '.heif'].includes(extension)) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (extension === '.json' || mime.endsWith('+json') || mime === 'application/json' || (extension === '.trace' && text?.trimStart().startsWith('{'))) {
    // A JSON file may carry a well-known diagnostic schema without a special suffix.
    if (text && text.length <= 16 * 1024 * 1024) {
      try {
        const data = JSON.parse(text)
        if (data && typeof data === 'object') {
          if (Array.isArray(data.log?.entries)) return 'har'
          if (Array.isArray(data.traceEvents) || (Array.isArray(data) && data.some(item => item && typeof item === 'object' && typeof item.ph === 'string' && typeof item.ts === 'number')) || (Array.isArray(data.nodes) && Array.isArray(data.samples)) || (data.shared?.frames && Array.isArray(data.profiles))) return 'profile'
          if (['Feature', 'FeatureCollection', 'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(data.type)) return 'geo'
        }
      } catch { /* The raw JSON viewer explains invalid or incomplete content. */ }
    }
    return 'json'
  }
  if (mime.endsWith('+xml') || ['application/xml', 'text/xml'].includes(mime) || ['.xml', '.xaml', '.plist', '.csproj', '.props', '.targets'].includes(extension)) return 'xml'
  if (mime.startsWith('text/') || ['.txt', '.log', '.ini'].includes(extension)) return 'text'
  return text !== undefined ? 'code' : 'binary'
}

export function isArtifactTextFormat(format: string): boolean {
  return ['code', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'toml', 'markdown', 'html', 'har', 'profile', 'geo', 'text'].includes(format)
}

export const specializedArtifactFormats = new Set(['csv', 'tsv', 'jsonl', 'yaml', 'toml', 'html', 'har', 'profile', 'geo', 'archive', 'perfetto', 'nettrace'])
