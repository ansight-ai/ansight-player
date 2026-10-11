import { useRef, useState, type PointerEvent } from 'react';
import type { SessionAnnotationGeometry } from '../replay/sessionViewerData';

export type GeometryDraft = { kind: 0 | 1; x: number; y: number; width?: number; height?: number };
type Point = { x: number; y: number };

export function geometryFromDrag(start: Point, end: Point, distance: number): GeometryDraft {
  return distance >= 6 ? { kind: 1, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) } : { kind: 0, ...start };
}

export function AnnotationShape({ geometry, height }: { geometry: SessionAnnotationGeometry; height: number }) {
  const kind = String(geometry.kind).toLowerCase();
  const common = { className: 'annotation-shape', vectorEffect: 'non-scaling-stroke' as const };
  const x = (geometry.x ?? 0) * 1000, y = (geometry.y ?? 0) * height;
  if (kind === '0' || kind === 'point') return <circle {...common} cx={x} cy={y} r="18" />;
  if (kind === '1' || kind === 'rectangle') return <rect {...common} x={x} y={y} width={(geometry.width ?? 0) * 1000} height={(geometry.height ?? 0) * height} />;
  if (kind === '2' || kind === 'ellipse') return <ellipse {...common} cx={x + (geometry.width ?? 0) * 500} cy={y + (geometry.height ?? 0) * height / 2} rx={(geometry.width ?? 0) * 500} ry={(geometry.height ?? 0) * height / 2} />;
  if (geometry.points?.length) return <polyline {...common} points={geometry.points.map(point => `${point.x * 1000},${point.y * height}`).join(' ')} />;
  return null;
}

// Same Ansight interaction: click for a point; drag at least 6 px for a rectangle.
export function AnnotationDrawing({ height, onCreate }: { height: number; onCreate: (draft: GeometryDraft) => void }) {
  const drag = useRef<{ point: Point; clientX: number; clientY: number; pointerId: number } | null>(null);
  const [draft, setDraft] = useState<GeometryDraft | null>(null);
  function point(event: PointerEvent<SVGRectElement>, clamp: boolean): Point | null {
    const svg = event.currentTarget.ownerSVGElement!;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const x = position.x / 1000, y = position.y / height;
    if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }
  function update(event: PointerEvent<SVGRectElement>) {
    const start = drag.current, end = point(event, true);
    if (!start || !end || event.pointerId !== start.pointerId) return null;
    const geometry = geometryFromDrag(start.point, end, Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY));
    setDraft(geometry); return geometry;
  }
  return <g>
    <rect className="annotation-drawing" aria-label="Click to annotate a point, or drag to annotate a region" role="img"
      x="0" y="0" width="1000" height={height}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const start = point(event, false); if (!start) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { point: start, clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
        setDraft({ kind: 0, ...start });
      }}
      onPointerMove={event => { if (drag.current) { event.preventDefault(); update(event); } }}
      onPointerUp={event => {
        const geometry = update(event); drag.current = null; setDraft(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (geometry) onCreate(geometry);
      }}
      onPointerCancel={() => { drag.current = null; setDraft(null); }} />
    {draft && <AnnotationShape geometry={draft} height={height} />}
  </g>;
}

export function AnnotationEditor({ busy, error, onSave, onClose }: {
  busy: boolean; error: string; onSave: (comment: string, status: string, ask: boolean) => void; onClose: () => void;
}) {
  const [comment, setComment] = useState(''), [status, setStatus] = useState('');
  return <form className="annotation-editor" onSubmit={event => { event.preventDefault(); onSave(comment, status, false); }}>
    <strong>Add Ansight annotation</strong>
    <label>Comment<textarea autoFocus required maxLength={8000} rows={3} value={comment} disabled={busy}
      placeholder="Describe the issue…" onChange={event => setComment(event.target.value)}
      onKeyDown={event => { if (event.metaKey && event.key === 'Enter' && comment.trim() && !busy) { event.preventDefault(); onSave(comment, status, false); } }} /></label>
    <label>Status<input value={status} maxLength={100} disabled={busy} placeholder="e.g. open" onChange={event => setStatus(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <div className="annotation-editor-actions">
      <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="submit" disabled={busy || !comment.trim()}>{busy ? 'Saving…' : 'Save annotation'}</button>
      <button type="button" className="primary" disabled={busy || !comment.trim()} onClick={() => onSave(comment, status, true)}>Save & ask ChatGPT</button>
    </div>
  </form>;
}
