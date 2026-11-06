import type { SessionImageFrame, SessionAnnotation } from '../replay/sessionViewerData';
import type { Touch } from './touches';

// Preserve the existing player's frame IDs, timestamps, and annotation semantics.
export type Frame = Pick<SessionImageFrame, 'frameId' | 'width' | 'height'> & { timeMs: number; capturedAtUtc: string };
export type Marker = Pick<SessionAnnotation, 'label' | 'notes'> & { id: string; timeMs: number; capturedAtUtc: string };
export type Recording = { recordingId: string; startMs: number; endMs: number; width: number; height: number; byteSize: number };
export type Replay = { sessionId: string; title: string; appName: string; startMs: number; endMs: number;
  initialTimeMs: number; frames: Frame[]; markers: Marker[]; touches: Touch[]; touchTotalCount: number;
  touchWarning: string | null; fullReplayUrl: string; annotations: SessionAnnotation[]; recordings?: Recording[] };
export type ImageFrame = { frameId: string; dataUrl: string };

export function recordingAt(recordings: Recording[], timeMs: number): Recording | undefined {
  return recordings.filter(recording => recording.startMs <= timeMs && timeMs < recording.endMs)
    .sort((left, right) => right.startMs - left.startMs)[0];
}

export function recordingTime(recording: Recording, timeMs: number): number {
  return Math.max(0, Math.min(timeMs - recording.startMs, recording.endMs - recording.startMs - 1)) / 1000;
}

export function frameAt(frames: Frame[], timeMs: number): number {
  let left = 0, right = frames.length - 1;
  while (left < right) {
    const middle = Math.ceil((left + right) / 2);
    if (frames[middle].timeMs <= timeMs) left = middle;
    else right = middle - 1;
  }
  return left;
}

export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
