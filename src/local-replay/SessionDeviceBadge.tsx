import { Desktop, DeviceMobile } from '@phosphor-icons/react'

export function SessionDeviceBadge({
  isSimulatorOrEmulator,
  platform,
}: {
  isSimulatorOrEmulator: boolean
  platform?: string | null
}) {
  const label = isSimulatorOrEmulator
    ? platform?.trim().toLowerCase() === 'android' ? 'Emulator' : 'Simulator'
    : 'Device'
  const description = isSimulatorOrEmulator
    ? `Captured on ${label === 'Emulator' ? 'an emulator' : 'a simulator'}`
    : 'Captured on a physical device'

  return (
    <span aria-label={description} className="local-session-device-badge" role="img" title={description}>
      {isSimulatorOrEmulator ? <Desktop aria-hidden="true" /> : <DeviceMobile aria-hidden="true" />}
      {label}
    </span>
  )
}
