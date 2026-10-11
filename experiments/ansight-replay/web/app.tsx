import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import { elapsed, frameAt, type ImageFrame, type Replay } from './timeline';
import { buildGestures, visibleTouches } from './touches';
import { AnnotationDrawing, AnnotationEditor, AnnotationShape, type GeometryDraft } from './annotations';
import type { SessionAnnotation } from '../../../src/replay/sessionViewerData';
import logo from '../../../src/assets/ansight-logo.png';
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
  const [expandedMarkers, setExpandedMarkers] = useState(false);
  const [retry, setRetry] = useState(0);
  const [showTouches, setShowTouches] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState<{ id: string; frameId: string; geometry: GeometryDraft } | null>(null);
  const [annotationBusy, setAnnotationBusy] = useState(false);
  const [annotationError, setAnnotationError] = useState('');
  const [annotationMessage, setAnnotationMessage] = useState('');
  const cache = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, Promise<void>>());
  const generation = useRef(0);
  const replay = data.replay;
  const position = replay ? frameAt(replay.frames, time) : 0;
  const frame = replay?.frames[position];
  const imageUrl = frame && cache.current.get(frame.frameId);
  const selectedMarker = replay?.markers.find(marker => Math.abs(marker.timeMs - time) < 1000);
  const selectedAnnotation = replay?.annotations.find(annotation => annotation.annotationId === selectedMarker?.id);
  const gestures = useMemo(() => buildGestures(replay?.touches ?? []), [replay]);
  const dimensions = { width: frame?.width || 1000, height: frame?.height || 1000 };
  const viewHeight = 1000 * dimensions.height / dimensions.width;
  const touches = showTouches ? visibleTouches(gestures, time, dimensions) : [];
  const nextTouch = gestures.find(gesture => gesture.startMs > time + 1 && gesture.startMs >= (replay?.startMs ?? 0));
  const previousTouch = gestures.findLast(gesture => gesture.startMs < time - 1 && gesture.startMs >= (replay?.startMs ?? 0));

  useEffect(() => { subscribers.add(setData); setData(snapshot); return () => { subscribers.delete(setData); }; }, []);
  useEffect(() => {
    generation.current++;
    cache.current.clear(); pending.current.clear();
    for (const image of data.images) cache.current.set(image.frameId, image.dataUrl);
    setTime(replay?.initialTimeMs ?? 0); setFrameError(''); setActionError(''); setExpandedMarkers(false); setShowTouches(true);
    setDrawing(false); setAnnotationDraft(null); setAnnotationError('');
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

  function seek(next: number) { if (annotationDraft || drawing) return; setFrameError(''); setTime(next); }
  async function askAnnotation(annotation: SessionAnnotation) {
    await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text:
      `Act on Ansight annotation ${annotation.annotationId} in session ${replay!.sessionId}. Read the saved annotation and its screenshot with read_replay_annotation, inspect the relevant code, and address the issue. Annotation: ${annotation.label}${annotation.notes ? `\n${annotation.notes}` : ''}` }] });
  }
  async function ask() {
    try {
      setActionError('');
      await bridge.updateModelContext({ content: [{ type: 'text', text: JSON.stringify(context()) }] });
      if (selectedAnnotation) { await askAnnotation(selectedAnnotation); return; }
      await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text:
        `Review this moment in Ansight session ${replay!.sessionId}: ${new Date(time).toISOString()}, screenshot ${frame!.frameId}${selectedMarker ? `, marker "${selectedMarker.label}"` : ''}. Use the recorded screenshot and related evidence to explain what is happening.` }] });
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not send the selected moment.'); }
  }
  async function refreshAnnotations() {
    const result = await bridge.callServerTool({ name: 'refresh_replay_annotations', arguments: { sessionId: replay!.sessionId } });
    if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text as string || 'Could not refresh annotations.');
    // Refresh annotations without resetting the user's playhead or screenshot cache.
    const nextReplay = { ...replay!, markers: result._meta?.markers as Replay['markers'], annotations: result._meta?.annotations as SessionAnnotation[] };
    snapshot = { ...snapshot, replay: nextReplay };
    setData(current => ({ ...current, replay: nextReplay }));
    return nextReplay;
  }
  async function saveAnnotation(comment: string, status: string, askAfter: boolean) {
    if (!annotationDraft || annotationBusy) return;
    setAnnotationBusy(true); setAnnotationError('');
    try {
      const result = await bridge.callServerTool({ name: 'create_replay_annotation', arguments: {
        sessionId: replay!.sessionId, annotationId: annotationDraft.id, frameId: annotationDraft.frameId,
        geometry: annotationDraft.geometry, comment, status,
      } });
      if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text as string || 'Could not save annotation.');
      const annotation = result._meta?.annotation as SessionAnnotation;
      await refreshAnnotations();
      setTime(Date.parse(annotation.startUtc!)); setAnnotationDraft(null); setAnnotationMessage('Annotation saved in Ansight.');
      if (askAfter) {
        try { await askAnnotation(annotation); }
        catch { setActionError('Annotation saved. The chat message could not be sent; select the annotation and try Ask ChatGPT again.'); }
      }
    } catch (error) { setAnnotationError(error instanceof Error ? error.message : 'Could not save annotation.'); }
    finally { setAnnotationBusy(false); }
  }
  async function expand() {
    try {
      setActionError('');
      const result = await bridge.requestDisplayMode({ mode: data.fullscreen ? 'inline' : 'fullscreen' });
      publish({ fullscreen: result.mode === 'fullscreen' });
    } catch { setActionError('This host could not expand the player.'); }
  }
  async function openFullReplay() {
    try {
      setActionError('');
      const result = await bridge.openLink({ url: replay!.fullReplayUrl });
      if (result.isError) throw new Error('The host could not open the full replay.');
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not open the full replay.'); }
  }

  if (!replay) return <div className="empty" role="status"><span className="brand"><img src={logo} alt="Ansight" /></span>
    <p>{data.error || 'Loading your capture…'}</p></div>;
  const visibleMarkers = expandedMarkers ? replay.markers : replay.markers.slice(0, 5);
  return <main className={`player${data.fullscreen ? ' fullscreen' : ''}`} data-frame={frame?.frameId} data-loaded={Boolean(imageUrl)} data-image-version={imageVersion}>
    <header><div className="heading"><div className="eyebrow"><span className="brand"><img src={logo} alt="Ansight" /></span><span className="badge"><i /> Local capture</span></div>
      <h1>{replay.title}</h1><p>{replay.appName} · {replay.frames.length} screenshots · {replay.markers.length} markers</p></div>
      {data.canExpand && <button className="expand" onClick={expand} aria-label={data.fullscreen ? 'Exit fullscreen' : 'Expand replay'}>{data.fullscreen ? '↙' : '↗'}</button>}</header>
    <section className="stage" aria-label="Recorded app screen">
      {imageUrl ? <svg className="recorded-frame" viewBox={`0 0 1000 ${viewHeight}`} preserveAspectRatio="xMidYMid meet">
        <image key={frame!.frameId} href={imageUrl} x="0" y="0" width="1000" height={viewHeight}
          role="img" aria-label={`Recorded screen at ${frame!.capturedAtUtc}`} onError={() => setFrameError('Screenshot could not be decoded.')} />
        <g className="touch-overlay" aria-hidden="true" data-testid="touch-overlay">
          {touches.map(touch => <g key={touch.id} data-touch-id={touch.id} data-x={touch.point.x} data-y={touch.point.y} opacity={touch.opacity}>
            {touch.trail.length > 1 && <>
              <polyline className="touch-trail-outline" points={touch.trail.map(point => `${point.x * 1000},${point.y * viewHeight}`).join(' ')} vectorEffect="non-scaling-stroke" />
              <polyline className="touch-trail" points={touch.trail.map(point => `${point.x * 1000},${point.y * viewHeight}`).join(' ')} vectorEffect="non-scaling-stroke" />
            </>}
            <circle className="touch-ring-outline" cx={touch.point.x * 1000} cy={touch.point.y * viewHeight} r={touch.radius} vectorEffect="non-scaling-stroke" />
            <circle className="touch-ring" cx={touch.point.x * 1000} cy={touch.point.y * viewHeight} r={touch.radius} vectorEffect="non-scaling-stroke" />
            <circle className="touch-center" cx={touch.point.x * 1000} cy={touch.point.y * viewHeight} r="12" />
          </g>)}
        </g>
        <g aria-hidden="true">{(replay.annotations ?? []).flatMap(annotation => (annotation.geometry ?? [])
          .filter(geometry => geometry.frameId === frame?.frameId)
          .map((geometry, index) => <AnnotationShape key={`${annotation.annotationId}-${index}`} geometry={geometry} height={viewHeight} />))}
          {annotationDraft && <AnnotationShape geometry={annotationDraft.geometry} height={viewHeight} />}
        </g>
        {drawing && <AnnotationDrawing height={viewHeight} onCreate={geometry => {
          setAnnotationDraft({ id: crypto.randomUUID().replaceAll('-', ''), frameId: frame!.frameId, geometry });
          setDrawing(false); setAnnotationError(''); setAnnotationMessage('');
        }} />}
      </svg>
        : <div className="loading" role="status">{frameError || 'Loading screenshot…'}{frameError && <button onClick={() => { setFrameError(''); setRetry(value => value + 1); }}>Retry</button>}</div>}
      <span className="stage-label">RECORDED SCREEN</span>
      <span className="frame-age">{elapsed(Math.max(0, time - (frame?.timeMs ?? time)))} since frame</span>
    </section>
    {drawing && <p className="touch-notice">Click for a point, or drag a rectangle on the screenshot.</p>}
    {annotationDraft && <AnnotationEditor busy={annotationBusy} error={annotationError} onSave={saveAnnotation} onClose={() => setAnnotationDraft(null)} />}
    <div className="transport">
      <div className="seek-track"><input aria-label="Replay timeline" type="range" min={replay.startMs} max={Math.max(replay.startMs + 1, replay.endMs)} step="1" value={Math.max(replay.startMs, time)}
        disabled={drawing || Boolean(annotationDraft)} onChange={event => seek(Number(event.target.value))} />
        <div className="ticks" aria-hidden="true">{replay.markers.map(marker => <i key={marker.id} style={{ left: `${100 * (marker.timeMs - replay.startMs) / Math.max(1, replay.endMs - replay.startMs)}%` }} />)}</div>
        {showTouches && <div className="touch-ticks" aria-hidden="true">{gestures.filter(gesture => gesture.startMs >= replay.startMs).map(gesture => <i key={gesture.id} style={{ left: `${100 * (gesture.startMs - replay.startMs) / Math.max(1, replay.endMs - replay.startMs)}%` }} />)}</div>}
      </div>
      <div className="controls">
        <button aria-label="Previous screenshot" disabled={position === 0} onClick={() => seek(replay.frames[position - 1].timeMs)}>‹</button>
        <button aria-label="Next screenshot" disabled={position >= replay.frames.length - 1} onClick={() => seek(replay.frames[position + 1].timeMs)}>›</button>
        <span className="clock">{elapsed(time - replay.startMs)} <span>/ {elapsed(replay.endMs - replay.startMs)}</span></span>
        <button className="ask" disabled={!data.connected || Boolean(annotationDraft)} onClick={ask}>{selectedAnnotation ? 'Ask ChatGPT to act' : 'Ask about this moment'} <span>↗</span></button>
      </div>
    </div>
    <div className="annotation-actions">
      <button disabled={!imageUrl || Boolean(annotationDraft)} aria-pressed={drawing} onClick={() => { setDrawing(value => !value); setAnnotationMessage(''); }}>{drawing ? 'Cancel drawing' : 'Annotate screenshot'}</button>
      <button disabled={annotationBusy || Boolean(annotationDraft)} onClick={() => {
        setAnnotationBusy(true); setActionError('');
        void refreshAnnotations().then(() => setAnnotationMessage('Annotations refreshed from Ansight.'))
          .catch(error => setActionError(error.message)).finally(() => setAnnotationBusy(false));
      }}>Refresh annotations</button>
      {annotationMessage && <span role="status">{annotationMessage}</span>}
    </div>
    <div className="replay-actions">
      <button className="touch-toggle" aria-label="Show recorded touches" aria-pressed={showTouches}
        onClick={() => setShowTouches(value => !value)} disabled={!replay.touches.length}>
        <span aria-hidden="true">◉</span> Touches {showTouches ? 'on' : 'off'} <small>{gestures.length}</small>
      </button>
      <button className="touch-step" aria-label="Previous touch" title="Previous recorded touch" disabled={!previousTouch} onClick={() => { setShowTouches(true); seek(previousTouch!.startMs); }}>‹</button>
      <button className="touch-step" aria-label="Next touch" title="Next recorded touch" disabled={!nextTouch} onClick={() => { setShowTouches(true); seek(nextTouch!.startMs); }}>›</button>
      <button className="full-replay" onClick={openFullReplay}>Open full replay <span aria-hidden="true">↗</span></button>
    </div>
    {!replay.touches.length && <p className="touch-notice">No recorded touches in this capture.</p>}
    {replay.touchWarning && <p className="touch-notice">{replay.touchWarning}</p>}
    {!!replay.markers.length && <section className="markers" aria-label="Replay markers"><div className="section-label">MOMENTS IN THIS CAPTURE</div>
      {visibleMarkers.map((marker, index) => <button className={`marker${selectedMarker?.id === marker.id ? ' selected' : ''}`} key={marker.id} title={marker.notes || undefined} onClick={() => seek(marker.timeMs)}>
        <span className="marker-number">{String(index + 1).padStart(2, '0')}</span><span>{marker.label}</span><time>{elapsed(marker.timeMs - replay.startMs)}</time><span className="marker-arrow">↗</span></button>)}
      {replay.markers.length > 5 && <button className="more" onClick={() => setExpandedMarkers(!expandedMarkers)}>{expandedMarkers ? 'Show fewer' : `Show ${replay.markers.length - 5} more markers`}</button>}
    </section>}
    {(actionError || (frameError && imageUrl) || data.error) && <p className="error" role="alert">{actionError || frameError || data.error}</p>}
    <footer><span>Scrub to inspect screenshots and recorded touches</span><span>{new Date(frame!.capturedAtUtc).toISOString().replace('T', ' ').replace('Z', ' UTC')}</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Player />);
void bridge.connect().then(() => {
  const host = bridge.getHostContext();
  if (host?.theme) document.documentElement.dataset.theme = host.theme;
  publish({ connected: true, canExpand: host?.availableDisplayModes?.includes('fullscreen') ?? false,
    fullscreen: host?.displayMode === 'fullscreen' });
}).catch(error => publish({ error: `The replay host connection failed: ${error.message}` }));
