import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(`${root}/dist`, { recursive: true });
const widget = await build({ absWorkingDir: root, entryPoints: ['web/app.tsx'], bundle: true, write: false,
  outfile: 'dist/widget.js', format: 'iife', minify: true, jsx: 'automatic',
  loader: { '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' } });
const script = widget.outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('</script', '<\\/script');
const css = widget.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
const fingerprint = createHash('sha256').update(html);
for (const file of ['src/server.mjs', 'src/backend.mjs', 'package-lock.json']) fingerprint.update(await readFile(`${root}/${file}`));
const viewerBuild = fingerprint.digest('hex').slice(0, 16);
await writeFile(`${root}/dist/widget.html`, html);
await build({ absWorkingDir: root, entryPoints: ['src/server.mjs'], outfile: 'dist/server.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'node24', external: ['sharp'],
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  define: { ANSIGHT_REPLAY_BUILD_ID: JSON.stringify(viewerBuild) } });
await build({ absWorkingDir: root, entryPoints: ['web/preview.ts'], outfile: 'dist/preview.js', bundle: true, format: 'iife', minify: true });
await copyFile(`${root}/web/preview.html`, `${root}/dist/preview.html`);
// Install this immutable entrypoint, rather than replacing files behind a running
// STDIO connection with an unchanged command. All its UI assets travel together.
const release = `dist/releases/${viewerBuild}`;
await mkdir(`${root}/${release}`, { recursive: true });
for (const file of ['server.mjs', 'widget.html', 'preview.js', 'preview.html']) {
  await copyFile(`${root}/dist/${file}`, `${root}/${release}/${file}`);
}
await writeFile(`${root}/dist/build.json`, JSON.stringify({ viewerBuild, server: `${release}/server.mjs`, resourceUri: `ui://ansight/replay/${viewerBuild}/widget.html` }, null, 2) + '\n');
console.log(`Built replay ${viewerBuild} (${Math.round(Buffer.byteLength(script) / 1024)} KiB JS). Installed entrypoint: ${release}/server.mjs`);
