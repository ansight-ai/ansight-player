import { useState } from 'react'
import { AndroidLogo, AppleLogo, AppWindow, Check, WindowsLogo, type Icon } from '../icons'

export function SessionIcon({
  appIconUrl,
  fallbackIcon: FallbackIcon = AppWindow,
  platform,
  selectionTick = false,
}: {
  appIconUrl?: string | null
  fallbackIcon?: Icon
  platform?: string | null
  selectionTick?: boolean
}) {
  const badge = resolvePlatformBadge(platform)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const hasImage = Boolean(appIconUrl && appIconUrl !== failedUrl)

  return (
    <span className="local-session-icon-wrapper">
      <span aria-hidden="true" className="local-session-icon">
        {!hasImage ? <FallbackIcon /> : null}
        {hasImage && appIconUrl ? (
          <img
            alt=""
            onError={() => setFailedUrl(appIconUrl)}
            onLoad={(event) => fitAppIcon(event.currentTarget)}
            src={appIconUrl}
          />
        ) : null}
      </span>
      {badge ? (
        <span
          aria-label={`Captured on ${badge.label}`}
          className={`local-session-platform-badge local-session-platform-badge--${badge.key}`}
          role="img"
          title={`Captured on ${badge.label}`}
        >
          <badge.icon aria-hidden="true" weight="fill" />
        </span>
      ) : null}
      {selectionTick ? <span aria-hidden="true" className="local-session-selection-tick"><Check weight="bold" /></span> : null}
    </span>
  )
}

function resolvePlatformBadge(platform?: string | null): { key: string; label: string; icon: Icon } | null {
  switch (platform?.trim().toLowerCase()) {
    case 'android':
      return { key: 'android', label: 'Android', icon: AndroidLogo }
    case 'ios':
    case 'ipados':
      return { key: 'ios', label: 'iOS', icon: AppleLogo }
    case 'macos':
    case 'maccatalyst':
      return { key: 'macos', label: 'macOS', icon: AppleLogo }
    case 'windows':
      return { key: 'windows', label: 'Windows', icon: WindowsLogo }
    default:
      return null
  }
}

// Adaptive Android icons can include transparent padding around the artwork.
// Fit that artwork to the tile without changing the captured asset.
const appIconTransforms = new Map<string, string>()
function fitAppIcon(image: HTMLImageElement) {
  const cached = appIconTransforms.get(image.src)
  if (cached) { image.style.transform = cached; return }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(image, 0, 0, 128, 128)
    const { data } = context.getImageData(0, 0, 128, 128)
    let left = 128, top = 128, right = -1, bottom = -1
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        if (data[(y * 128 + x) * 4 + 3] < 24) continue
        left = Math.min(left, x); right = Math.max(right, x)
        top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
    }
    if (right < left || bottom < top) return
    const scale = Math.min(4, Math.max(128 / (right - left + 1), 128 / (bottom - top + 1)))
    const x = 50 - (left + right + 1) / 256 * 100
    const y = 50 - (top + bottom + 1) / 256 * 100
    const transform = `scale(${scale}) translate(${x}%, ${y}%)`
    if (appIconTransforms.size >= 256) appIconTransforms.clear()
    appIconTransforms.set(image.src, transform)
    image.style.transform = transform
  } catch {
    // Cross-origin icons still render normally when pixel access is unavailable.
  }
}
