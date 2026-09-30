import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

function omitCloudOnlyDynamicChunks(): Plugin {
  return {
    name: 'omit-cloud-only-dynamic-chunks',
    generateBundle(_options, bundle) {
      const entry = bundle['session-replay.js']
      if (!entry || entry.type !== 'chunk') {
        throw new Error('The local replay entry chunk was not generated.')
      }

      const retainedChunks = new Set<string>(['session-replay.js'])
      const pendingImports = [...entry.imports]
      while (pendingImports.length > 0) {
        const fileName = pendingImports.pop()
        if (!fileName || retainedChunks.has(fileName)) continue
        const imported = bundle[fileName]
        if (!imported || imported.type !== 'chunk') continue

        retainedChunks.add(fileName)
        pendingImports.push(...imported.imports)
      }

      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk' || fileName === 'session-replay.js') continue
        const isReplayEditorEntry = Object.keys(item.modules).some(
          (moduleId) => moduleId.endsWith('/local-replay/TaskExtractionPanel.tsx')
            || moduleId.endsWith('/local-replay/TraceSourceCodeEditor.tsx'),
        )
        if (!isReplayEditorEntry) continue
        retainedChunks.add(fileName)
        pendingImports.push(...item.imports, ...item.dynamicImports)
      }

      while (pendingImports.length > 0) {
        const fileName = pendingImports.pop()
        if (!fileName || retainedChunks.has(fileName)) continue
        const imported = bundle[fileName]
        if (!imported || imported.type !== 'chunk') continue
        retainedChunks.add(fileName)
        pendingImports.push(...imported.imports, ...imported.dynamicImports)
      }

      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type === 'chunk' && !retainedChunks.has(fileName)) {
          delete bundle[fileName]
        }
      }
    },
  }
}

// `npm run dev` hot-reloads this UI in front of a running `ansight host run`,
// forwarding the host-owned routes to its explorer URL.
const explorerUrl = new URL(process.env.ANSIGHT_EXPLORER_URL ?? 'http://127.0.0.1:47231/ansight/')
const explorerPath = explorerUrl.pathname.endsWith('/') ? explorerUrl.pathname : `${explorerUrl.pathname}/`
const explorerHostProxy: ProxyOptions = {
  target: explorerUrl.origin,
  changeOrigin: true,
  rewrite: (path) => explorerPath + path.slice(1),
  // The host rejects POSTs from other origins, so only this page's own requests take the host's origin.
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyRequest, request) => {
      if (request.headers.origin === `http://${request.headers.host}`) proxyRequest.setHeader('origin', explorerUrl.origin)
    })
  },
}

function serveReplayShellAtRoot(): Plugin {
  return {
    name: 'serve-replay-shell-at-root',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (url.pathname === '/' || url.pathname === '/index.html') {
          request.url = `/session-replay.html${url.search}`
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), omitCloudOnlyDynamicChunks(), serveReplayShellAtRoot()],
  publicDir: false,
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api/': explorerHostProxy,
      '/frames/': explorerHostProxy,
    },
  },
  worker: {
    format: 'es',
    rolldownOptions: {
      output: {
        assetFileNames: 'session-replay-worker-[name]-[hash][extname]',
        chunkFileNames: 'session-replay-worker-[name]-[hash].js',
        entryFileNames: 'session-replay-worker-[name]-[hash].js',
      },
    },
  },
  build: {
    cssCodeSplit: true,
    emptyOutDir: true,
    outDir: fileURLToPath(new URL('./dist/local', import.meta.url)),
    rollupOptions: {
      input: fileURLToPath(new URL('./session-replay.html', import.meta.url)),
      output: {
        assetFileNames: (assetInfo) => assetInfo.names.some((name) => name === 'session-replay.css')
          ? 'session-replay.css'
          : 'session-replay-[name]-[hash][extname]',
        chunkFileNames: 'session-replay-[name]-[hash].js',
        entryFileNames: 'session-replay.js',
      },
    },
  },
})
