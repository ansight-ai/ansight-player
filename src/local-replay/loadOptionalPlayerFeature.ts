import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'

// Optional bundles share the renderer's React instance, including JSX runtime identity.
if (typeof window !== 'undefined') Object.assign(window, { __ansightPlayerReact: React, __ansightPlayerJsx: JsxRuntime })

type OptionalPanelModule = { default: Record<string, unknown> }
const modules = new Map<string, Promise<OptionalPanelModule>>()

export async function loadOptionalPlayerFeature<T>(feature: string): Promise<T> {
  const response = await fetch('api/bootstrap', { cache: 'no-store' })
  if (!response.ok) throw new Error('Unable to load optional feature metadata.')
  const bootstrap = await response.json() as { extensionUi?: Record<string, string> }
  const entry = bootstrap.extensionUi?.[feature]
  if (!entry) throw new Error('This feature requires the optional cloud extension.')
  const url = new URL(entry, window.location.href)
  if (url.origin !== window.location.origin) throw new Error('Optional features must be served by this host.')
  let pending = modules.get(url.href)
  if (!pending) {
    pending = import(/* @vite-ignore */ url.href) as Promise<OptionalPanelModule>
    modules.set(url.href, pending)
    void pending.catch(() => modules.delete(url.href))
  }
  const module = await pending
  const result = module.default[feature]
  if (!result) throw new Error('The installed extension does not provide this feature.')
  return result as T
}
