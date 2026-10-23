export type PenDetails = {
  tool?: string | null; sampleKind?: string | null; inputSource?: string | null;
  force?: number | null; maximumPossibleForce?: number | null; pressure?: number | null;
  altitudeRadians?: number | null; azimuthRadians?: number | null; rollRadians?: number | null;
  tiltRadians?: number | null; orientationRadians?: number | null; distance?: number | null;
};
export type Touch = PenDetails & {
  id: string; action: string; timeMs: number; pointerId: number; pointerIndex: number;
  x: number; y: number; normalizedX?: number | null; normalizedY?: number | null;
  surfaceWidth?: number | null; surfaceHeight?: number | null; coordinateUnit: string;
  details?: PenDetails | null;
};
type Point = { x: number; y: number };
export type Gesture = { id: string; startMs: number; endMs: number; samples: Touch[] };
export const touchFadeMs = 1600;

function action(value: string) {
  const normalized = value?.trim().toLowerCase();
  if (['down', 'began', 'pressed'].includes(normalized)) return 'down';
  if (['up', 'ended', 'released', 'cancel', 'cancelled', 'canceled'].includes(normalized)) return 'up';
  if (['move', 'moved'].includes(normalized)) return 'move';
  if (['hoverenter', 'hovermove', 'hoverexit'].includes(normalized)) return normalized;
  return 'ignore';
}
const isPen = (sample: Touch) => ['stylus', 'pencil', 'pen', 'eraser'].includes(sample.tool ?? '');
const finite = (value: number | null | undefined, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

// Keep distinct contacts separate. Estimated-property corrections are not fresh moves.
export function buildGestures(touches: Touch[]): Gesture[] {
  const gestures: Gesture[] = [], open = new Map<string, Gesture>();
  for (const raw of [...touches].sort((a, b) => a.timeMs - b.timeMs)) {
    const sample = { ...raw, ...raw.details };
    const phase = action(sample.action);
    if (!Number.isFinite(sample.timeMs) || sample.sampleKind === 'estimatedUpdate' || phase === 'ignore') continue;
    const key = `${sample.tool ?? 'finger'}:${sample.pointerId}:${sample.pointerIndex}`;
    let gesture = open.get(key);
    if (phase === 'down' || phase === 'hoverenter' || !gesture) {
      if (gesture) gesture.endMs = sample.timeMs;
      gesture = { id: sample.id, startMs: sample.timeMs, endMs: sample.timeMs, samples: [] };
      gestures.push(gesture); open.set(key, gesture);
    }
    gesture.samples.push(sample);
    gesture.endMs = sample.timeMs;
    if (phase === 'up' || phase === 'hoverexit') open.delete(key);
  }
  return gestures;
}

function unit(normalized: number | null | undefined, raw: number, surface: number | null | undefined, pixels: number, coordinateUnit: string): number | null {
  const isUnit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  if (isUnit(normalized)) return normalized;
  if (['normalized', 'unit', 'ratio'].includes(coordinateUnit?.toLowerCase()) && isUnit(raw)) return raw;
  const length = typeof surface === 'number' && Number.isFinite(surface) && surface > 0 ? surface : pixels;
  if (!Number.isFinite(raw) || !Number.isFinite(length) || length <= 0) return null;
  return Math.min(1, Math.max(0, raw / length));
}

export function touchPoint(sample: Touch, frame: { width: number; height: number }): Point | null {
  const x = unit(sample.normalizedX, sample.x, sample.surfaceWidth, frame.width, sample.coordinateUnit);
  const y = unit(sample.normalizedY, sample.y, sample.surfaceHeight, frame.height, sample.coordinateUnit);
  return x === null || y === null ? null : { x, y };
}

export function penPresentation(sample: Touch) {
  const hover = action(sample.action).startsWith('hover');
  const maximum = finite(sample.maximumPossibleForce);
  const pressure = hover ? 0 : clamp(finite(sample.pressure, maximum > 0 ? finite(sample.force) / maximum : finite(sample.force)));
  const altitude = Math.max(0, Math.min(Math.PI / 2, finite(sample.altitudeRadians, Math.PI / 2 - finite(sample.tiltRadians))));
  const distance = hover ? clamp(finite(sample.distance)) : 0;
  return {
    hover, pressure, distance,
    length: 32 + 48 * Math.cos(altitude),
    rotation: finite(sample.azimuthRadians, finite(sample.orientationRadians, Math.PI / 2) - Math.PI / 2) * 180 / Math.PI,
    roll: finite(sample.rollRadians),
    opacity: hover ? .8 - .5 * distance : 1,
    lift: hover ? 5 + distance * 26 : 0,
  };
}
export type VisibleTouch = {
  id: string; point: Point; trail: Point[]; opacity: number; radius: number;
  released: boolean; tool: string; pen?: ReturnType<typeof penPresentation>;
  showTip: boolean; tapProgress: number | null; tapPoint: Point | null;
};

export function visibleTouches(gestures: Gesture[], timeMs: number, frame: { width: number; height: number }): VisibleTouch[] {
  const visible: VisibleTouch[] = [];
  let newestPen: VisibleTouch | undefined;
  for (const gesture of gestures) {
    if (timeMs < gesture.startMs || timeMs >= gesture.endMs + touchFadeMs) continue;
    const samples = gesture.samples.filter(sample => sample.timeMs <= timeMs);
    const latest = samples.at(-1);
    if (!latest) continue;
    let point = touchPoint(latest, frame);
    if (!point) continue;
    const pen = isPen(latest);
    let presentation = pen ? penPresentation(latest) : undefined;
    // Interpolate continuous pen values without bridging contact/hover boundaries.
    const next = gesture.samples[samples.length];
    if (pen && next && action(next.action).startsWith('hover') === action(latest.action).startsWith('hover') && next.timeMs > latest.timeMs) {
      const nextPoint = touchPoint(next, frame);
      const t = clamp((timeMs - latest.timeMs) / (next.timeMs - latest.timeMs));
      if (nextPoint) point = { x: point.x + (nextPoint.x - point.x) * t, y: point.y + (nextPoint.y - point.y) * t };
      const end = penPresentation(next), start = presentation!;
      const angle = (a: number, b: number, period: number) => a + (((b - a + period / 2) % period + period) % period - period / 2) * t;
      presentation = { ...start,
        length: start.length + (end.length - start.length) * t,
        pressure: start.pressure + (end.pressure - start.pressure) * t,
        distance: start.distance + (end.distance - start.distance) * t,
        opacity: start.opacity + (end.opacity - start.opacity) * t,
        lift: start.lift + (end.lift - start.lift) * t,
        rotation: angle(start.rotation, end.rotation, 360), roll: angle(start.roll, end.roll, 2 * Math.PI),
      };
    }
    const trail = samples.filter(sample => sample.timeMs >= timeMs - touchFadeMs && !action(sample.action).startsWith('hover'))
      .map(sample => touchPoint(sample, frame)).filter((value): value is Point => value !== null);
    const released = timeMs >= gesture.endMs;
    const fade = released ? (timeMs - gesture.endMs) / touchFadeMs : 0;
    const down = samples.find(sample => action(sample.action) === 'down');
    const tapAge = down ? (timeMs - down.timeMs) / 450 : 1;
    const touch: VisibleTouch = { id: gesture.id, point, trail, opacity: 1 - fade, radius: 48 + fade * 28,
      released, tool: latest.tool ?? 'finger', pen: presentation, showTip: pen,
      tapPoint: down ? touchPoint(down, frame) : null,
      tapProgress: pen && tapAge >= 0 && tapAge < 1 ? tapAge : null };
    if (pen) {
      if (newestPen) newestPen.showTip = false;
      newestPen = touch;
    }
    visible.push(touch);
  }
  return visible;
}
