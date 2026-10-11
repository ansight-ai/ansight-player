import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import { elapsed, frameAt, type ImageFrame, type Replay } from './timeline';
import { buildGestures, visibleTouches } from './touches';
import { RecordedTouchOverlay } from '../replay/components/RecordedTouchOverlay';
import { AnnotationShape } from './annotations';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import './style.css';

const bridge = new App({ name: 'Ansight Replay', version: '0.2.0' }, { availableDisplayModes: ['inline', 'fullscreen'] });
type Result = { isError?: boolean; content?: Array<{ type: string; text?: string }>; _meta?: Record<string, unknown> };
type Snapshot = { replay?: Replay; images: ImageFrame[]; error?: string; connected: boolean; fullscreen: boolean; canExpand: boolean };
let snapshot: Snapshot = { images: [], connected: false, fullscreen: false, canExpand: false };
const subscribers = new Set<(value: Snapshot) => void>();
function publish(update: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...update };
  subscribers.forEach(listener => listener(snapshot));
}
function readResult(result: Result) {
  if (result.isError) { publish({ error: result.content?.find(item => item.type === 'text')?.text || 'Could not load replay.' }); return; }
  const replay = result._meta?.replay as Replay | undefined;
  if (replay?.frames?.length) publish({ replay, images: result._meta?.frames as ImageFrame[] ?? [], error: undefined });
}
bridge.ontoolresult = readResult;
bridge.onhostcontextchanged = context => {
  if (context.theme) document.documentElement.dataset.theme = context.theme;
  if (context.displayMode) publish({ fullscreen: context.displayMode === 'fullscreen' });
};
bridge.onteardown = async () => { publish({ connected: false }); return {}; };

function Player() {
  const [data, setData] = useState(snapshot);
  const [time, setTime] = useState(0);
  const [imageVersion, setImageVersion] = useState(0);
  const [frameError, setFrameError] = useState('');
  const [actionError, setActionError] = useState('');
  const [retry, setRetry] = useState(0);
  const [openingFullReplay, setOpeningFullReplay] = useState(false);
  const [refreshingAnnotations, setRefreshingAnnotations] = useState(false);
  const [annotationError, setAnnotationError] = useState('');
  const cache = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, Promise<void>>());
  const generation = useRef(0);
  const replay = data.replay;
  const position = replay ? frameAt(replay.frames, time) : 0;
  const frame = replay?.frames[position];
  const imageUrl = frame && cache.current.get(frame.frameId);
  const selectedMarker = replay?.markers.find(marker => Math.abs(marker.timeMs - time) < 1000);
  const gestures = useMemo(() => buildGestures(replay?.touches ?? []), [replay]);
  const dimensions = { width: frame?.width || 1000, height: frame?.height || 1000 };
  const viewHeight = 1000 * dimensions.height / dimensions.width;
  const touches = visibleTouches(gestures, time, dimensions);

  useEffect(() => { subscribers.add(setData); setData(snapshot); return () => { subscribers.delete(setData); }; }, []);
  useEffect(() => {
    generation.current++;
    cache.current.clear(); pending.current.clear();
    for (const image of data.images) cache.current.set(image.frameId, image.dataUrl);
    setTime(replay?.initialTimeMs ?? 0); setFrameError(''); setActionError(''); setAnnotationError('');
    setImageVersion(version => version + 1);
  }, [replay?.frames, data.images]);

  useEffect(() => {
    if (!replay || !data.connected || !frame) return;
    const ids = replay.frames.slice(position, position + 4).map(item => item.frameId)
      .filter(id => !cache.current.has(id) && !pending.current.has(id));
    if (!ids.length) return;
    const currentGeneration = generation.current;
    const work = bridge.callServerTool({ name: 'get_replay_frames', arguments: { sessionId: replay.sessionId, frameIds: ids } })
      .then(result => {
        if (currentGeneration !== generation.current) return;
        if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text as string || 'Screenshot could not load.');
        const images = result._meta?.frames as ImageFrame[] | undefined;
        for (const image of images ?? []) {
          if (/^data:image\/(webp|png|jpeg);base64,/.test(image.dataUrl)) cache.current.set(image.frameId, image.dataUrl);
        }
        // Keep a bounded cache. Preserve the frame currently being fetched.
        while (cache.current.size > 48) cache.current.delete(cache.current.keys().next().value!);
        if (!cache.current.has(frame.frameId)) throw new Error('The host returned no screenshot for this moment.');
        setFrameError(''); setImageVersion(version => version + 1);
      }).catch(error => {
        if (currentGeneration === generation.current) setFrameError(error.message);
      }).finally(() => {
        if (currentGeneration === generation.current) for (const id of ids) pending.current.delete(id);
      });
    for (const id of ids) pending.current.set(id, work);
  }, [replay, position, data.connected, retry]);

  function context() {
    return { sessionId: replay!.sessionId, title: replay!.title, playheadUtc: new Date(time).toISOString(),
      screenshotFrameId: frame!.frameId, screenshotCapturedAtUtc: frame!.capturedAtUtc,
      annotationId: selectedMarker?.id ?? null, annotationLabel: selectedMarker?.label ?? null,
      note: 'This is selection metadata. Fetch the Ansight screenshot to inspect the pixels.' };
  }
  useEffect(() => {
    if (!replay || !frame || !data.connected) return;
    const timer = setTimeout(() => {
      void bridge.updateModelContext({ content: [{ type: 'text', text: JSON.stringify(context()) }] }).catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [replay, frame, data.connected, time]);

  function seek(next: number) { setFrameError(''); setTime(next); }
  async function expand() {
    try {
      setActionError('');
      const result = await bridge.requestDisplayMode({ mode: data.fullscreen ? 'inline' : 'fullscreen' });
      publish({ fullscreen: result.mode === 'fullscreen' });
    } catch { setActionError('This host could not expand the player.'); }
  }
  async function openFullReplay() {
    if (openingFullReplay || !replay) return;
    setOpeningFullReplay(true);
    try {
      setActionError('');
      const result = await bridge.callServerTool({ name: 'open_replay_in_browser', arguments: { sessionId: replay.sessionId } });
      if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text as string || 'Could not open the local host player.');
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not open the full replay.'); }
    finally { setOpeningFullReplay(false); }
  }
  async function refreshAnnotations() {
    if (refreshingAnnotations || !replay) return;
    const currentGeneration = generation.current;
    setRefreshingAnnotations(true); setAnnotationError('');
    try {
      const result = await bridge.callServerTool({ name: 'refresh_replay_annotations', arguments: { sessionId: replay.sessionId } });
      if (currentGeneration !== generation.current) return;
      if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text as string || 'Could not refresh annotations.');
      const markers = result._meta?.markers as Replay['markers'] | undefined;
      const annotations = result._meta?.annotations as Replay['annotations'] | undefined;
      if (!Array.isArray(markers) || !Array.isArray(annotations)) throw new Error('The host returned no annotation list.');
      // Keep the same frames and images so refreshing never resets the playhead or cache.
      publish({ replay: { ...replay, markers, annotations } });
    } catch (error) {
      if (currentGeneration === generation.current) setAnnotationError(error instanceof Error ? error.message : 'Could not refresh annotations.');
    } finally { setRefreshingAnnotations(false); }
  }

  if (!replay) return <div className="empty" role="status">{data.error || 'Loading replay…'}</div>;
  return <main className={`player${data.fullscreen ? ' fullscreen' : ''}`} data-frame={frame?.frameId} data-loaded={Boolean(imageUrl)} data-image-version={imageVersion}>
    <header><div className="heading">
      <h1>{replay.title}</h1></div>
      {data.canExpand && <button className="expand" onClick={expand} aria-label={data.fullscreen ? 'Exit fullscreen' : 'Expand replay'}>{data.fullscreen ? '↙' : '↗'}</button>}</header>
    <section className="stage" aria-label="Recorded app screen">
      {imageUrl ? <svg className="recorded-frame" viewBox={`0 0 1000 ${viewHeight}`} preserveAspectRatio="xMidYMid meet">
        <image key={frame!.frameId} href={imageUrl} x="0" y="0" width="1000" height={viewHeight}
          role="img" aria-label={`Recorded screen at ${frame!.capturedAtUtc}`} onError={() => setFrameError('Screenshot could not be decoded.')} />
        <RecordedTouchOverlay touches={touches} viewHeight={viewHeight} />
        <g aria-hidden="true">{(replay.annotations ?? []).flatMap(annotation => (annotation.geometry ?? [])
          .filter(geometry => geometry.frameId === frame?.frameId)
          .map((geometry, index) => <AnnotationShape key={`${annotation.annotationId}-${index}`} geometry={geometry} height={viewHeight} />))}
        </g>
      </svg>
        : <div className="loading" role="status">{frameError || 'Loading screenshot…'}{frameError && <button onClick={() => { setFrameError(''); setRetry(value => value + 1); }}>Retry</button>}</div>}
    </section>
    <div className="transport">
      <div className="frame-controls">
        <button aria-label="Previous screenshot" disabled={position === 0} onClick={() => seek(replay.frames[position - 1].timeMs)}>‹</button>
        <button aria-label="Next screenshot" disabled={position >= replay.frames.length - 1} onClick={() => seek(replay.frames[position + 1].timeMs)}>›</button>
      </div>
      <input className="seek-track" aria-label="Replay timeline" aria-valuetext={`${elapsed(time - replay.startMs)} of ${elapsed(replay.endMs - replay.startMs)}`} type="range"
        min={replay.startMs} max={Math.max(replay.startMs + 1, replay.endMs)} step="1" value={Math.max(replay.startMs, time)}
        style={{ backgroundImage: `linear-gradient(to right, var(--accent) ${100 * (time - replay.startMs) / Math.max(1, replay.endMs - replay.startMs)}%, var(--line) 0)` }}
        onChange={event => seek(Number(event.target.value))} />
      <span className="clock">{elapsed(time - replay.startMs)} <span>/ {elapsed(replay.endMs - replay.startMs)}</span></span>
      <button className="full-replay" disabled={!data.connected || openingFullReplay} onClick={openFullReplay}>{openingFullReplay ? 'Opening…' : 'Open full replay'} <span aria-hidden="true">↗</span></button>
    </div>
    <section className="markers" aria-label="Replay annotations" aria-busy={refreshingAnnotations}>
      <div className="annotations-heading"><h2>Annotations <span>{replay.markers.length}</span></h2>
        <button className="refresh-annotations" disabled={!data.connected || refreshingAnnotations} onClick={() => void refreshAnnotations()}>{refreshingAnnotations ? 'Refreshing…' : 'Refresh annotations'}</button></div>
      {replay.markers.length ? <ol className="annotation-list">{replay.markers.map(marker => <li key={marker.id}>
        <button className={`marker${selectedMarker?.id === marker.id ? ' selected' : ''}`} aria-current={selectedMarker?.id === marker.id ? 'true' : undefined} onClick={() => seek(marker.timeMs)}>
          <span className="marker-text"><span className="marker-label">{marker.label || 'Untitled annotation'}</span>{marker.notes && <span className="marker-notes">{marker.notes}</span>}</span>
          <time dateTime={marker.capturedAtUtc}>{elapsed(marker.timeMs - replay.startMs)}</time></button>
      </li>)}</ol> : <p className="annotations-empty">No annotations saved for this replay.</p>}
      {annotationError && <p className="error" role="alert">{annotationError}</p>}
    </section>
    {(actionError || (frameError && imageUrl) || data.error) && <p className="error" role="alert">{actionError || frameError || data.error}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Player />);
void bridge.connect().then(() => {
  const host = bridge.getHostContext();
  if (host?.theme) document.documentElement.dataset.theme = host.theme;
  publish({ connected: true, canExpand: host?.availableDisplayModes?.includes('fullscreen') ?? false,
    fullscreen: host?.displayMode === 'fullscreen' });
}).catch(error => publish({ error: `The replay host connection failed: ${error.message}` }));
