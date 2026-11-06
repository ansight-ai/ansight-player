import type { Recording } from './timeline';

export type VideoChunk = { recordingId: string; offset: number; byteSize: number; data: string };
export const maximumInlineVideoBytes = 128 * 1024 * 1024;

export async function loadRecording(recording: Recording, readChunk: (offset: number) => Promise<VideoChunk>, signal: AbortSignal): Promise<Blob> {
  if (recording.byteSize > maximumInlineVideoBytes) {
    throw new Error('This recording exceeds the inline video limit. Open the full replay to watch it.');
  }

  const parts: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  while (offset < recording.byteSize) {
    signal.throwIfAborted();
    const chunk = await readChunk(offset);
    signal.throwIfAborted();
    const matchesRecording = chunk.recordingId === recording.recordingId
      && chunk.offset === offset
      && chunk.byteSize === recording.byteSize;
    if (!matchesRecording) {
      throw new Error('The host returned a chunk from a different recording or position.');
    }

    const bytes = Uint8Array.from(atob(chunk.data), character => character.charCodeAt(0));
    if (bytes.length === 0 || bytes.length > Math.min(1024 * 1024, recording.byteSize - offset)) {
      throw new Error('The host returned an invalid video chunk length.');
    }
    parts.push(bytes);
    offset += bytes.length;
  }
  return new Blob(parts, { type: 'video/mp4' });
}
