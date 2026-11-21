import { Laptop, DeviceMobile } from '../icons'

export function SessionDeviceBadge({
  isSimulatorOrEmulator,
  platform,
}: {
  isSimulatorOrEmulator: boolean
  platform?: string | null
}) {
  const label = isSimulatorOrEmulator
    ? platform?.trim().toLowerCase() === 'android' ? 'Emu' : 'Sim'
    : 'Dev'
  const description = isSimulatorOrEmulator
    ? `Captured on ${label === 'Emu' ? 'an emulator' : 'a simulator'}`
    : 'Captured on a physical device'

  return (
    <span aria-label={description} className="local-session-device-badge" role="img" title={description}>
      {isSimulatorOrEmulator ? <Laptop aria-hidden="true" /> : <DeviceMobile aria-hidden="true" />}
      {label}
    </span>
  )
}
