import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import sharp from 'sharp';

const exec = promisify(execFile);
const localCli = `${homedir()}/.local/bin/ansight`;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/;
let cliEnvironment;

async function resolveCliEnvironment() {
  if (!cliEnvironment) {
    cliEnvironment = { ...process.env };
    // STDIO MCP clients often omit TMPDIR. .NET's local host pipe needs the
    // same per-user temporary directory as the resident Ansight process.
    if (process.platform === 'darwin' && !cliEnvironment.TMPDIR) {
      const { stdout } = await exec('/usr/bin/getconf', ['DARWIN_USER_TEMP_DIR'], { timeout: 5000 });
      cliEnvironment.TMPDIR = stdout.trim();
    }
  }
  return cliEnvironment;
}

export function assertId(value) {
  if (typeof value !== 'string' || !identifier.test(value) || value.includes('..')) {
    throw new Error('Invalid Ansight session or frame identifier.');
  }
  return value;
}

export function localHostUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash) {
    throw new Error('The replay MVP only connects to a local loopback Ansight host.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

export async function cliJson(args) {
  let stdout;
  try {
    ({ stdout } = await exec(process.env.ANSIGHT_BIN || (existsSync(localCli) ? localCli : 'ansight'),
      [...args, '--json'], { env: await resolveCliEnvironment(), timeout: 30_000, maxBuffer: 32 * 1024 * 1024 }));
  } catch (error) {
    let detail;
    try { detail = JSON.parse(error.stdout).message; } catch { /* Some failures have no JSON response. */ }
    throw new Error(detail || error.message);
  }
  const result = JSON.parse(stdout);
  if (result.code === 'failure') throw new Error(result.message || 'Ansight command failed.');
  return result;
}

export function makeReplay(summary, imageIndex, annotations, touchIndex = { items: [] }) {
  const frames = (imageIndex.items ?? []).filter(frame => Number.isFinite(Date.parse(frame.capturedAtUtc)))
    .map(frame => ({ frameId: assertId(frame.frameId), capturedAtUtc: frame.capturedAtUtc,
      timeMs: Date.parse(frame.capturedAtUtc), width: frame.width, height: frame.height }))
    .sort((a, b) => a.timeMs - b.timeMs);
  if (!frames.length) throw new Error('This session has no recorded screenshots to replay.');
  if (imageIndex.totalCount > frames.length || frames.length > 10_000) throw new Error('This MVP supports up to 10,000 screenshots. Select a shorter capture.');
  const touches = (touchIndex.items ?? []).filter(touch => Number.isFinite(Date.parse(touch.capturedAtUtc)))
    .map(touch => ({ id: touch.id, action: touch.action, timeMs: Date.parse(touch.capturedAtUtc),
      pointerId: touch.pointerId, pointerIndex: touch.pointerIndex, x: touch.x, y: touch.y,
      normalizedX: touch.normalizedX, normalizedY: touch.normalizedY,
      surfaceWidth: touch.surfaceWidth, surfaceHeight: touch.surfaceHeight, coordinateUnit: touch.coordinateUnit,
      tool: touch.details?.tool, sampleKind: touch.details?.sampleKind }))
    .sort((a, b) => a.timeMs - b.timeMs);
  const startMs = frames[0].timeMs;
  const endMs = Math.max(frames.at(-1).timeMs, Date.parse(summary.lastUpdatedUtc) || startMs, (touches.at(-1)?.timeMs ?? startMs) + 1600);
  const markers = (annotations.items ?? []).filter(marker => Number.isFinite(Date.parse(marker.startUtc)))
    .map((marker, index) => ({ id: marker.annotationId || `marker-${index}`, label: marker.label || 'Annotation',
      notes: marker.notes || '', timeMs: Math.min(endMs, Math.max(startMs, Date.parse(marker.startUtc))),
      capturedAtUtc: marker.startUtc }))
    .sort((a, b) => a.timeMs - b.timeMs);
  return { sessionId: summary.sessionId, title: summary.name || summary.clientName || summary.sessionId,
    appName: summary.clientName || summary.appId, startMs, endMs, frames, markers, touches, annotations: annotations.items ?? [],
    touchTotalCount: touchIndex.totalCount ?? touches.length,
    touchWarning: touchIndex.totalCount > touches.length ? `Showing the latest ${touches.length.toLocaleString()} of ${touchIndex.totalCount.toLocaleString()} touch samples. Open the full replay for all touches.` : null };
}

export class AnsightBackend {
  constructor({ run = cliJson, fetcher = fetch } = {}) {
    this.run = run;
    this.fetcher = fetcher;
    this.replays = new Map();
  }

  async list({ search, cursor, limit = 10 } = {}) {
    const args = ['session', 'list', '--limit', String(limit)];
    if (search) args.push('--search', search);
    if (cursor) args.push('--cursor', cursor);
    const result = await this.run(args);
    return { sessions: (result.sessions ?? []).map(session => ({ sessionId: session.sessionId,
      title: session.name || session.clientName || session.sessionId, appName: session.clientName || session.appId,
      createdUtc: session.createdUtc, lastUpdatedUtc: session.lastUpdatedUtc })),
    nextCursor: result.nextCursor ?? null };
  }

  async load(sessionId) {
    assertId(sessionId);
    const found = await this.run(['session', 'list', '--search', sessionId, '--limit', '20']);
    const summary = found.sessions?.find(session => session.sessionId === sessionId);
    if (!summary) throw new Error(`Local session ${sessionId} was not found.`);
    const [images, annotations, touches, status] = await Promise.all([
      this.run(['session', 'images', sessionId, '--limit', '10000']),
      this.run(['session', 'annotations', sessionId, '--limit', '10000']),
      this.run(['session', 'touches', sessionId, '--limit', '10000']),
      this.run(['host', 'status']),
    ]);
    const replay = makeReplay(summary, images, annotations, touches);
    if (!status.isRunning || !status.explorerUrl) throw new Error('Start the local Ansight host before loading a replay.');
    const fullReplay = localHostUrl(status.explorerUrl);
    fullReplay.searchParams.set('sessionId', sessionId);
    replay.fullReplayUrl = fullReplay.toString();
    if (this.replays.size >= 12) this.replays.delete(this.replays.keys().next().value);
    this.replays.set(sessionId, replay);
    return replay;
  }

  async frames(sessionId, frameIds) {
    assertId(sessionId);
    if (!Array.isArray(frameIds) || !frameIds.length || frameIds.length > 6) throw new Error('Request 1–6 frames.');
    const replay = this.replays.get(sessionId) || await this.load(sessionId);
    const allowed = new Set(replay.frames.map(frame => frame.frameId));
    for (const id of frameIds) if (!allowed.has(assertId(id))) throw new Error('Frame does not belong to this replay.');
    const status = await this.run(['host', 'status']);
    if (!status.isRunning || !status.explorerUrl) throw new Error('Start the local Ansight host before loading frames.');
    const base = localHostUrl(status.explorerUrl);
    return Promise.all(frameIds.map(async frameId => {
      const url = new URL(`api/sessions/${encodeURIComponent(sessionId)}/frames/${encodeURIComponent(frameId)}`, base);
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
      if (!response.ok) throw new Error(`Screenshot unavailable (HTTP ${response.status}).`);
      const mimeType = response.headers.get('content-type')?.split(';')[0];
      if (!['image/webp', 'image/png', 'image/jpeg'].includes(mimeType)) throw new Error('Unsupported screenshot format.');
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 32 * 1024 * 1024) throw new Error('Screenshot exceeds the 32 MiB source limit.');
        chunks.push(chunk);
      }
      let bytes = Buffer.concat(chunks);
      let displayMimeType = mimeType;
      if (bytes.length > 256 * 1024) {
        bytes = await sharp(bytes, { limitInputPixels: 40_000_000 })
          .resize({ width: 960, height: 1440, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 }).toBuffer();
        displayMimeType = 'image/webp';
      }
      if (bytes.length > 2 * 1024 * 1024) throw new Error('Display screenshot exceeds the 2 MiB limit.');
      return { frameId, dataUrl: `data:${displayMimeType};base64,${bytes.toString('base64')}` };
    }));
  }

  async createAnnotation(input) {
    const replay = await this.load(input.sessionId);
    const frame = replay.frames.find(frame => frame.frameId === input.frameId);
    if (!frame) throw new Error('Annotation frame does not belong to this replay.');
    const geometry = input.geometry;
    if (geometry.x + (geometry.width ?? 0) > 1 || geometry.y + (geometry.height ?? 0) > 1
      || (geometry.kind === 1 && (!(geometry.width > 0) || !(geometry.height > 0)))) {
      throw new Error('Annotation geometry must stay within the screenshot.');
    }
    const comment = input.comment.replaceAll('\r\n', '\n').trim();
    const [label, ...lines] = comment.split('\n');
    const annotation = {
      annotationId: input.annotationId, captureGroupId: input.annotationId,
      startUtc: frame.capturedAtUtc, endUtc: new Date(frame.timeMs + 2000).toISOString(),
      label: label.trim(), notes: lines.join('\n').trim() || null,
      source: 'mcp.replay.screenshot', status: input.status?.trim() || null,
      customData: null, target: null,
      geometry: [{ geometryId: `${input.annotationId}-shape`, frameId: frame.frameId,
        capturedAtUtc: frame.capturedAtUtc, kind: geometry.kind, x: geometry.x, y: geometry.y,
        width: geometry.kind === 1 ? geometry.width : null, height: geometry.kind === 1 ? geometry.height : null,
        strokeColor: '#FFFA441F', strokeWidth: 3 }],
    };
    const existing = replay.annotations.find(item => item.annotationId === input.annotationId);
    if (existing) {
      if (existing.source === annotation.source && existing.label === annotation.label && existing.notes === annotation.notes
        && existing.status === annotation.status && existing.geometry?.[0]?.frameId === frame.frameId
        && ['kind', 'x', 'y', 'width', 'height'].every(key => existing.geometry[0][key] === annotation.geometry[0][key])) return existing;
      throw new Error('That annotation ID already exists. Existing annotations cannot be replaced by this tool.');
    }
    const base = localHostUrl(new URL('.', replay.fullReplayUrl).toString());
    const response = await this.fetcher(new URL(`api/sessions/${encodeURIComponent(input.sessionId)}/annotations`, base), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(annotation),
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    const result = await response.json();
    if (!response.ok || !result.isSuccess) throw new Error(result.message || 'Ansight could not save the annotation.');
    const saved = await this.run(['session', 'annotations', input.sessionId, '--limit', '10000']);
    const verified = saved.items?.find(item => item.annotationId === input.annotationId);
    if (!verified) throw new Error('Ansight accepted the annotation but it could not be read back. Refresh annotations before retrying.');
    return verified;
  }
}
