import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sessionId = process.argv[2];
if (!sessionId) throw new Error('Usage: npm run test:live -- <session-id> [installed-server-path]');
const build = JSON.parse(await readFile(new URL('../dist/build.json', import.meta.url), 'utf8'));
const serverPath = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL(`../${build.server}`, import.meta.url));
const client = new Client({ name: 'ansight-replay-live-check', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath,
  args: [serverPath], stderr: 'inherit' }));
try {
  const { tools } = await client.listTools();
  const replayTool = tools.find(tool => tool.name === 'show_replay');
  assert.equal(replayTool._meta.ui.resourceUri, build.resourceUri);
  const resource = await client.readResource({ uri: build.resourceUri });
  assert.ok(resource.contents[0].text.includes('touch-overlay'));
  assert.ok(resource.contents[0].text.includes('Show recorded touches'));
  const listed = await client.callTool({ name: 'list_replays', arguments: { search: sessionId } });
  assert.equal(listed.isError, undefined, JSON.stringify(listed.content));
  assert.ok(listed.structuredContent.sessions.some(session => session.sessionId === sessionId));
  const result = await client.callTool({ name: 'show_replay', arguments: { sessionId } });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  assert.ok(result._meta.frames[0].dataUrl.startsWith('data:image/'));
  assert.ok(Array.isArray(result._meta.replay.touches));
  assert.equal(result.structuredContent.touchCount, result._meta.replay.touches.length);
  assert.equal(result.structuredContent.viewerBuild, build.viewerBuild, 'The MCP connection is running an older build.');
  const fullReplayUrl = new URL(result._meta.replay.fullReplayUrl);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(fullReplayUrl.hostname));
  assert.equal(fullReplayUrl.searchParams.get('sessionId'), sessionId);
  const marker = result.structuredContent.markers.at(-1);
  if (marker) {
    const jumped = await client.callTool({ name: 'show_replay', arguments: { sessionId, annotationId: marker.id } });
    assert.equal(jumped.isError, undefined, JSON.stringify(jumped.content));
    assert.equal(jumped._meta.replay.initialTimeMs, Date.parse(marker.capturedAtUtc));
    assert.ok(jumped._meta.frames[0].dataUrl.startsWith('data:image/'));
    const read = await client.callTool({ name: 'read_replay_annotation', arguments: { sessionId, annotationId: marker.id } });
    assert.equal(read.isError, undefined, JSON.stringify(read.content.filter(item => item.type === 'text')));
    assert.equal(read.structuredContent.annotation.annotationId, marker.id);
    assert.ok(read.content.some(item => item.type === 'image' && item.data.length > 0));
  }
  console.log(JSON.stringify({ verified: true, ...result.structuredContent }, null, 2));
} finally { await client.close(); }
