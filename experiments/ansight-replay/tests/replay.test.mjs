import test from 'node:test';
import assert from 'node:assert/strict';
import { AnsightBackend, assertId, localHostUrl, makeReplay } from '../src/backend.mjs';
import { createMcpServer, createReplayTools, resourceUri, viewerBuild } from '../src/server.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { frameAt } from '../web/timeline.ts';
import { buildGestures, touchPoint, visibleTouches, touchFadeMs } from '../web/touches.ts';

const summary = { sessionId: 'capture-1', name: 'Real timing', clientName: 'Test app',
  createdUtc: '2026-10-11T00:00:00Z', lastUpdatedUtc: '2026-10-11T00:00:30Z' };
const images = { items: [
  { frameId: 'frame-b', capturedAtUtc: '2026-10-11T00:00:20Z' },
  { frameId: 'invalid-time', capturedAtUtc: 'invalid' },
  { frameId: 'frame-a', capturedAtUtc: '2026-10-11T00:00:10Z' },
] };
const annotations = { items: [{ annotationId: 'marker-1', label: 'A moment', startUtc: '2026-10-11T00:00:15Z' }] };
const touch = (id, timeMs, action, overrides = {}) => ({ id, timeMs, action, pointerId: 1, pointerIndex: 0,
  x: 195, y: 422, surfaceWidth: 390, surfaceHeight: 844, coordinateUnit: 'points', ...overrides });
const touchIndex = { totalCount: 2, items: [
  { ...touch('tap-down', 0, 'down'), capturedAtUtc: '2026-10-11T00:00:12Z' },
  { ...touch('tap-up', 0, 'up'), capturedAtUtc: '2026-10-11T00:00:12.100Z' },
] };
function fixtureBackend() {
  let stored = structuredClone(annotations.items);
  return new AnsightBackend({ run: async args => {
    if (args[0] === 'host') return { isRunning: true, explorerUrl: 'http://127.0.0.1:47231/ansight/' };
    if (args[1] === 'list') return { sessions: [summary] };
    if (args[1] === 'images') return images;
    if (args[1] === 'annotations') return { items: stored };
    if (args[1] === 'touches') return touchIndex;
    throw new Error('Unexpected command');
  }, fetcher: async (url, options) => {
    if (options.method === 'POST') {
      assert.equal(url.toString(), 'http://127.0.0.1:47231/ansight/api/sessions/capture-1/annotations');
      stored.push(JSON.parse(options.body));
      return Response.json({ isSuccess: true });
    }
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
  } });
}

test('preserves capture timestamps and selects the preceding screenshot between sparse frames', () => {
  const replay = makeReplay(summary, images, annotations);
  assert.deepEqual(replay.frames.map(frame => frame.frameId), ['frame-a', 'frame-b']);
  assert.equal(frameAt(replay.frames, replay.startMs + 5000), 0);
  assert.equal(frameAt(replay.frames, replay.startMs + 10000), 1);
  assert.equal(replay.endMs - replay.startMs, 20_000);
  assert.equal(replay.markers[0].timeMs - replay.startMs, 5000);
});

test('rejects non-local hosts, path traversal, command-like identifiers, and empty captures', () => {
  for (const host of ['https://example.com/', 'http://127.0.0.1.evil.test/', 'file:///tmp/', 'http://user:pass@localhost/']) {
    assert.throws(() => localHostUrl(host));
  }
  for (const id of ['../frame', 'foo/bar', '--option', 'a..b', 'a?x=1']) assert.throws(() => assertId(id));
  assert.throws(() => makeReplay(summary, { items: [] }, annotations), /no recorded screenshots/);
});

test('frame loader refuses frames outside the selected recording', async () => {
  const backend = fixtureBackend();
  await backend.load('capture-1');
  await assert.rejects(backend.frames('capture-1', ['foreign-frame']), /does not belong/);
  await assert.rejects(backend.frames('capture-1', []), /1–6/);
  const frames = await backend.frames('capture-1', ['frame-a']);
  assert.equal(frames[0].dataUrl, 'data:image/webp;base64,AQID');
});

test('tool results keep image bytes in UI metadata and validate annotation selection', async () => {
  const invoke = createReplayTools(fixtureBackend());
  const result = await invoke('show_replay', { sessionId: 'capture-1', annotationId: 'marker-1' });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.frameCount, 2);
  assert.equal(result.structuredContent.touchCount, 2);
  assert.equal(result._meta.replay.fullReplayUrl, 'http://127.0.0.1:47231/ansight/?sessionId=capture-1');
  assert.equal(result._meta.replay.touches[0].timeMs, Date.parse('2026-10-11T00:00:12Z'));
  assert.equal(result.structuredContent.touches, undefined);
  assert.equal(result._meta.replay.initialTimeMs, Date.parse('2026-10-11T00:00:15Z'));
  assert.equal(result._meta.frames[0].frameId, 'frame-a');
  assert.ok(!JSON.stringify(result.structuredContent).includes('base64'));
  assert.equal((await invoke('show_replay', { sessionId: 'capture-1', annotationId: 'missing' })).isError, true);
  assert.equal((await invoke('get_replay_frames', { sessionId: 'capture-1', frameIds: ['frame-a'], url: 'http://example.com' })).isError, true);
});

test('touch coordinates use normalized values, surface points, and pixel fallback without density errors', () => {
  const frame = { width: 1170, height: 2532 };
  assert.deepEqual(touchPoint(touch('tap', 0, 'down'), frame), { x: .5, y: .5 });
  assert.deepEqual(touchPoint(touch('tap', 0, 'down', { normalizedX: .2, normalizedY: .7 }), frame), { x: .2, y: .7 });
  assert.deepEqual(touchPoint(touch('tap', 0, 'down', { x: .3, y: .8, coordinateUnit: 'normalized' }), frame), { x: .3, y: .8 });
  assert.deepEqual(touchPoint(touch('tap', 0, 'down', { x: 585, y: 1266, surfaceWidth: null, surfaceHeight: null, coordinateUnit: 'pixels' }), frame), { x: .5, y: .5 });
  assert.equal(touchPoint(touch('tap', 0, 'down', { x: NaN }), frame), null);
});

test('touches follow the scrubber: no future touches, long holds remain visible, release fades by capture time', () => {
  const gestures = buildGestures([touch('down', 100, 'down'), touch('move', 2000, 'move', { x: 100 }), touch('up', 3100, 'up', { x: 100 })]);
  const frame = { width: 1170, height: 2532 };
  assert.equal(visibleTouches(gestures, 99, frame).length, 0);
  const held = visibleTouches(gestures, 1900, frame)[0];
  assert.equal(held.opacity, 1);
  assert.equal(held.point.x, .5); // No future move leaked into the position.
  assert.equal(visibleTouches(gestures, 2000, frame)[0].point.x, 100 / 390);
  assert.equal(visibleTouches(gestures, 3900, frame)[0].opacity, .5);
  assert.equal(visibleTouches(gestures, 3100 + touchFadeMs, frame).length, 0);
  assert.equal(visibleTouches(gestures, 100, frame)[0].point.x, .5); // Scrubbing backwards is deterministic.
});

test('swipe trails stop at the playhead and multi-touch/reused pointer IDs stay separate', () => {
  const gestures = buildGestures([
    touch('a-down', 0, 'began'), touch('b-down', 1, 'down', { pointerId: 2, x: 300 }),
    touch('a-move', 100, 'moved', { x: 100 }), touch('a-up', 200, 'ended', { x: 80 }),
    touch('a-again', 300, 'down', { x: 20 }),
    touch('estimate', 301, 'move', { sampleKind: 'estimatedUpdate' }),
  ]);
  assert.equal(gestures.length, 3);
  const visible = visibleTouches(gestures, 150, { width: 1170, height: 2532 });
  assert.equal(visible.length, 2);
  assert.deepEqual(visible[0].trail.map(point => point.x), [.5, 100 / 390]);
  assert.equal(gestures[2].samples.length, 1);
});

test('partial touch evidence is labelled and oversized screenshot captures are not silently truncated', () => {
  const replay = makeReplay(summary, images, annotations, { ...touchIndex, totalCount: 10001 });
  assert.match(replay.touchWarning, /latest 2 of 10,001/);
  assert.throws(() => makeReplay(summary, { ...images, totalCount: 10001 }, annotations), /shorter capture/);
});

test('MCP handshake, tool discovery, rendering resource, and UI-only frame calls work together', async () => {
  const server = createMcpServer('<html>Replay widget</html>', createReplayTools(fixtureBackend()));
  const client = new Client({ name: 'replay-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    assert.deepEqual(tools.find(tool => tool.name === 'get_replay_frames')._meta.ui.visibility, ['app']);
    assert.equal(tools.find(tool => tool.name === 'show_replay')._meta.ui.resourceUri, resourceUri);
    assert.ok(tools.every(tool => tool.outputSchema));
    assert.ok(tools.filter(tool => tool.name !== 'create_replay_annotation').every(tool => tool.annotations.readOnlyHint));
    assert.equal(tools.find(tool => tool.name === 'create_replay_annotation').annotations.readOnlyHint, false);
    assert.deepEqual(tools.find(tool => tool.name === 'create_replay_annotation')._meta.ui.visibility, ['app']);
    const resource = await client.readResource({ uri: resourceUri });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.deepEqual(resource.contents[0]._meta.ui.csp.connectDomains, []);
    const result = await client.callTool({ name: 'show_replay', arguments: { sessionId: 'capture-1' } });
    assert.equal(result.structuredContent.title, 'Real timing');
    assert.equal(result.structuredContent.viewerBuild, viewerBuild);
    assert.equal(result.structuredContent.touchCount, 2);
    assert.ok(resourceUri.includes(`/${viewerBuild}/`));
    assert.equal(result._meta.frames.length, 1);
  } finally { await client.close(); await server.close(); }
});

test('annotation creation writes the native Ansight contract, reads it back, and cannot replace existing notes', async () => {
  const invoke = createReplayTools(fixtureBackend());
  const input = { sessionId: 'capture-1', annotationId: 'review-test', frameId: 'frame-a',
    comment: 'Button overlaps text\nMove it below the title.', status: 'open',
    geometry: { kind: 1, x: .2, y: .3, width: .4, height: .1 } };
  const created = await invoke('create_replay_annotation', input);
  assert.equal(created.isError, undefined, JSON.stringify(created));
  const saved = created._meta.annotation;
  assert.equal(saved.label, 'Button overlaps text');
  assert.equal(saved.notes, 'Move it below the title.');
  assert.equal(saved.geometry[0].frameId, 'frame-a');
  assert.equal(saved.geometry[0].kind, 1);
  assert.equal(saved.target, null); // No invented visual-tree target.
  assert.equal(saved.startUtc, images.items[2].capturedAtUtc);
  assert.equal((await invoke('create_replay_annotation', input)).isError, undefined); // Safe retry.
  assert.equal((await invoke('create_replay_annotation', { ...input, comment: 'Replacement' })).isError, true);
  assert.equal((await invoke('create_replay_annotation', { ...input, annotationId: 'other', frameId: 'foreign' })).isError, true);
  assert.equal((await invoke('create_replay_annotation', { ...input, annotationId: 'other', geometry: { ...input.geometry, x: .9 } })).isError, true);
  const refreshed = await invoke('refresh_replay_annotations', { sessionId: 'capture-1' });
  assert.equal(refreshed.structuredContent.annotationCount, 2);
  const read = await invoke('read_replay_annotation', { sessionId: 'capture-1', annotationId: 'review-test' });
  assert.equal(read.structuredContent.annotation.annotationId, 'review-test');
  assert.equal(read.content[1].type, 'image');
  assert.equal(read.content[1].mimeType, 'image/webp');
});
