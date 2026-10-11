import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const widget = await build({ absWorkingDir: root, entryPoints: ['src/chat-replay/app.tsx'],
  bundle: true, write: false, outfile: 'dist/local/chat-replay.js', format: 'iife',
  minify: true, jsx: 'automatic', loader: { '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' } });
const script = widget.outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('</script', '<\\/script');
const css = widget.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
await mkdir(`${root}/dist/local`, { recursive: true });
await writeFile(`${root}/dist/local/chat-replay.html`,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`);
console.log('Built the embedded Ansight chat replay.');
