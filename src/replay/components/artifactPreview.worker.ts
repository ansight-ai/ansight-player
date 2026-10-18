import { parseArtifactArchive } from './artifactArchives'
import { parseArtifactConfig } from './artifactConfig'
import { parseArtifactProfiles } from './artifactProfiles'
import { parseDelimitedRecords, parseJsonLines } from './artifactRecords'

self.onmessage = (event: MessageEvent<{ format: string; text?: string; bytes?: Uint8Array; fileName: string }>) => {
  try {
    const { format, text = '', bytes, fileName } = event.data
    const value = format === 'archive' && bytes ? parseArtifactArchive(bytes, fileName)
      : format === 'yaml' || format === 'toml' ? parseArtifactConfig(text, format)
      : format === 'profile' ? parseArtifactProfiles(text)
      : format === 'jsonl' ? parseJsonLines(text)
      : parseDelimitedRecords(text, format === 'tsv' ? '\t' : ',')
    self.postMessage({ value })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}
