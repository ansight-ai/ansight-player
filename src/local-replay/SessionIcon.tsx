import { AndroidLogo, AppleLogo, AppWindow, Check, WindowsLogo, type Icon } from '@phosphor-icons/react'

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

  return (
    <span className="local-session-icon-wrapper">
      <span aria-hidden="true" className="local-session-icon">
        <FallbackIcon />
        {appIconUrl ? (
          <img
            alt=""
            onError={(event) => { event.currentTarget.hidden = true }}
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
