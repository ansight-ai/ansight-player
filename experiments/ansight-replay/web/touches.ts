export type Touch = {
  id: string; action: string; timeMs: number; pointerId: number; pointerIndex: number;
  x: number; y: number; normalizedX?: number | null; normalizedY?: number | null;
  surfaceWidth?: number | null; surfaceHeight?: number | null; coordinateUnit: string;
  tool?: string; sampleKind?: string;
};
type Point = { x: number; y: number };
export type Gesture = { id: string; startMs: number; endMs: number; samples: Touch[] };
export const touchFadeMs = 1600;

function action(value: string) {
  const normalized = value?.trim().toLowerCase();
  if (['down', 'began', 'pressed'].includes(normalized)) return 'down';
  if (['up', 'ended', 'released', 'cancel', 'cancelled', 'canceled'].includes(normalized)) return 'up';
  if (['move', 'moved'].includes(normalized)) return 'move';
  return 'ignore';
}

// Keep distinct contacts separate, including repeated taps that reuse a pointer ID.
export function buildGestures(touches: Touch[]): Gesture[] {
  const gestures: Gesture[] = [], open = new Map<string, Gesture>();
  for (const sample of touches) {
    if (sample.sampleKind === 'estimatedUpdate' || action(sample.action) === 'ignore') continue;
    const key = `${sample.pointerId}:${sample.pointerIndex}`;
    let gesture = open.get(key);
    if (action(sample.action) === 'down' || !gesture) {
      if (gesture) gesture.endMs = sample.timeMs;
      gesture = { id: sample.id, startMs: sample.timeMs, endMs: sample.timeMs, samples: [] };
      gestures.push(gesture); open.set(key, gesture);
    }
    gesture.samples.push(sample);
    gesture.endMs = sample.timeMs;
    if (action(sample.action) === 'up') open.delete(key);
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

export function visibleTouches(gestures: Gesture[], timeMs: number, frame: { width: number; height: number }) {
  return gestures.flatMap(gesture => {
    if (timeMs < gesture.startMs || timeMs >= gesture.endMs + touchFadeMs) return [];
    const samples = gesture.samples.filter(sample => sample.timeMs <= timeMs);
    const latest = samples.at(-1);
    if (!latest) return [];
    const point = touchPoint(latest, frame);
    if (!point) return [];
    const trail = samples.filter(sample => sample.timeMs >= timeMs - touchFadeMs)
      .map(sample => touchPoint(sample, frame)).filter((value): value is Point => value !== null);
    const released = timeMs >= gesture.endMs;
    const fade = released ? (timeMs - gesture.endMs) / touchFadeMs : 0;
    return [{ id: gesture.id, point, trail, opacity: 1 - fade, radius: 48 + fade * 28,
      released, tool: latest.tool ?? 'finger' }];
  });
}
