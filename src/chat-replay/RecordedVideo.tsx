import { useEffect, useRef, useState, type ReactNode } from 'react';
import { recordingTime, type Recording } from './timeline';
import { loadRecording, type VideoChunk } from './video';

type Props = {
  recording: Recording;
  timeMs: number;
  playing: boolean;
  readChunk: (offset: number) => Promise<VideoChunk>;
  onPresented: (timeMs: number) => void;
  onPlaybackTime: (timeMs: number) => void;
  onEnded: () => void;
  children: ReactNode;
};

export function RecordedVideo({ recording, timeMs, playing, readChunk, onPresented, onPlaybackTime, onEnded, children }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onPresented, onPlaybackTime, onEnded });
  callbacks.current = { onPresented, onPlaybackTime, onEnded };
  const requestedTime = useRef(timeMs);
  requestedTime.current = timeMs;
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setSource(''); setError(''); setReady(false);
    void loadRecording(recording, readChunk, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Video could not load.');
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [recording, readChunk, retry]);

  useEffect(() => {
    const element = video.current;
    if (!element || !source) return;
    let callback = 0;
    let active = true;
    const presented = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (!active) return;
      const actualTime = recording.startMs + metadata.mediaTime * 1000;
      callbacks.current.onPresented(actualTime);
      setReady(true);
      if (!element.paused) callbacks.current.onPlaybackTime(actualTime);
      callback = element.requestVideoFrameCallback(presented);
    };
    callback = element.requestVideoFrameCallback(presented);
    return () => { active = false; element.cancelVideoFrameCallback(callback); };
  }, [recording, source]);

  useEffect(() => {
    const element = video.current;
    if (!element || !source || element.readyState < 1) return;
    if (playing) {
      void element.play().catch(() => setError('Video playback could not start. Use the timeline or retry.'));
    } else {
      element.pause();
      const target = recordingTime(recording, timeMs);
      if (Math.abs(element.currentTime - target) > 0.001) element.currentTime = target;
    }
  }, [recording, timeMs, playing, source]);

  return <div className="recorded-video">
    {source && <video ref={video} src={source} muted playsInline preload="auto" aria-label="Recorded app video"
      onLoadedMetadata={() => {
        const element = video.current!;
        element.currentTime = recordingTime(recording, requestedTime.current);
        if (playing) void element.play().catch(() => setError('Video playback could not start.'));
      }}
      onEnded={() => callbacks.current.onEnded()}
      onError={() => setError('The recorded video could not be decoded. Open the full replay or retry.')} />}
    {ready && !error && children}
    {(!ready || error) && <div className="video-status loading" role="status">{error || 'Loading recorded video…'}
      {error && <button onClick={() => setRetry(value => value + 1)}>Retry</button>}
    </div>}
  </div>;
}
