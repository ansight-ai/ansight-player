import { CircleNotch, MapPin, Play, Stop, UploadSimple, X } from '@phosphor-icons/react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { DeviceLocationMap } from './DeviceLocationMap'
import type {
  DeviceLocationPoint,
  HostDeviceDescriptor,
  HostDeviceInventory,
  LocationPlaybackSnapshot,
  OperationResponse,
} from './types'

const recordedTimingMode = 0
const fixedSpeedMode = 1

export function DeviceLocationPanel({
  mapboxAccessToken,
  onClose,
}: {
  mapboxAccessToken: string
  onClose: () => void
}) {
  const [devices, setDevices] = useState<HostDeviceDescriptor[]>([])
  const [selectedDeviceKey, setSelectedDeviceKey] = useState('')
  const [latitude, setLatitude] = useState('-33.8688')
  const [longitude, setLongitude] = useState('151.2093')
  const [routeFile, setRouteFile] = useState<File | null>(null)
  const [routePoints, setRoutePoints] = useState<DeviceLocationPoint[]>([])
  const [mode, setMode] = useState(recordedTimingMode)
  const [playbackSpeedMultiplier, setPlaybackSpeedMultiplier] = useState('1')
  const [fixedSpeedKph, setFixedSpeedKph] = useState('30')
  const [loop, setLoop] = useState(false)
  const [playback, setPlayback] = useState<LocationPlaybackSnapshot | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function refreshDevices() {
      try {
        const inventory = await fetchJson<HostDeviceInventory>('api/devices')
        if (!isMounted) {
          return
        }

        const available = inventory.devices.filter((device) => device.isAvailable)
        setDevices(available)
        setSelectedDeviceKey((current) => {
          if (current && available.some((device) => createDeviceKey(device) === current)) {
            return current
          }

          const preferred = available.find((device) => device.isBooted) ?? available[0]
          return preferred ? createDeviceKey(preferred) : ''
        })
        if (inventory.warnings.length > 0 && available.length === 0) {
          setMessage(inventory.warnings.join(' '))
        }
      } catch (error) {
        if (isMounted) {
          setMessage(resolveErrorMessage(error, 'Unable to list simulator devices.'))
        }
      }
    }

    void refreshDevices()
    const interval = window.setInterval(() => void refreshDevices(), 5000)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    async function refreshPlayback() {
      try {
        const next = await fetchJson<LocationPlaybackSnapshot>('api/location/playback')
        if (isMounted) {
          setPlayback(next)
        }
      } catch {
        // The next successful poll restores the status without interrupting the controls.
      }
    }

    void refreshPlayback()
    const interval = window.setInterval(() => void refreshPlayback(), 1000)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [])

  const selectedDevice = useMemo(
    () => devices.find((device) => createDeviceKey(device) === selectedDeviceKey) ?? null,
    [devices, selectedDeviceKey],
  )
  const selectedLocation = useMemo<DeviceLocationPoint | null>(() => {
    if (playback?.isPlaying && playback.currentLocation) {
      return playback.currentLocation
    }

    const parsedLatitude = Number(latitude)
    const parsedLongitude = Number(longitude)
    return isValidCoordinate(parsedLatitude, parsedLongitude)
      ? { latitude: parsedLatitude, longitude: parsedLongitude }
      : null
  }, [latitude, longitude, playback])

  function handleMapLocationSelected(location: DeviceLocationPoint) {
    setLatitude(formatCoordinate(location.latitude))
    setLongitude(formatCoordinate(location.longitude))
    if (selectedDevice && !playback?.isPlaying) {
      void setDeviceLocation(selectedDevice, location)
    }
  }

  async function handleRouteFileSelected(file: File | null) {
    setRouteFile(file)
    setRoutePoints([])
    if (!file) {
      return
    }

    try {
      const points = parseRoutePoints(await file.text())
      setRoutePoints(points)
      setMessage(points.length > 0
        ? `Loaded ${points.length.toLocaleString()} route points.`
        : 'The selected route does not contain any coordinates.')
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to preview the selected route.'))
    }
  }

  async function handleSetLocation(event: FormEvent) {
    event.preventDefault()
    if (!selectedDevice) {
      setMessage('Select an available simulator or emulator first.')
      return
    }

    await setDeviceLocation(selectedDevice, {
      latitude: Number(latitude),
      longitude: Number(longitude),
    })
  }

  async function setDeviceLocation(device: HostDeviceDescriptor, location: DeviceLocationPoint) {
    await runOperation(async () => postJson<OperationResponse>('api/location/set', {
      platform: device.platform,
      deviceIdentifier: device.identifier,
      latitude: location.latitude,
      longitude: location.longitude,
    }))
  }

  async function handleClearLocation() {
    if (!selectedDevice) {
      setMessage('Select an available simulator or emulator first.')
      return
    }

    await runOperation(async () => postJson<OperationResponse>('api/location/clear', {
      platform: selectedDevice.platform,
      deviceIdentifier: selectedDevice.identifier,
    }))
  }

  async function handleStartRoute(event: FormEvent) {
    event.preventDefault()
    if (!selectedDevice || !routeFile) {
      setMessage('Select a simulator and a GPX or KML route first.')
      return
    }

    const routeContent = await routeFile.text()
    await runOperation(async () => postJson<{ isSuccess: boolean, message: string, snapshot: LocationPlaybackSnapshot }>(
      'api/location/route',
      {
        platform: selectedDevice.platform,
        deviceIdentifier: selectedDevice.identifier,
        sourceFileName: routeFile.name,
        routeContent,
        mode,
        playbackSpeedMultiplier: Number(playbackSpeedMultiplier),
        fixedSpeedKph: Number(fixedSpeedKph),
        loop,
      },
    ))
  }

  async function handleStopRoute() {
    await runOperation(() => postJson<OperationResponse>('api/location/route/stop', {}))
  }

  async function runOperation(operation: () => Promise<OperationResponse>) {
    setIsBusy(true)
    setMessage(null)
    try {
      const result = await operation()
      setMessage(result.message)
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'The location operation failed.'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="local-location-backdrop" role="presentation">
      <section aria-label="Simulator location" className="local-location-panel" role="dialog">
        <header>
          <div>
            <p className="eyebrow">Simulator control</p>
            <h2>Location replay</h2>
          </div>
          <button aria-label="Close location controls" className="local-icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>

        <label className="local-control-field">
          <span>Target device</span>
          <select onChange={(event) => setSelectedDeviceKey(event.target.value)} value={selectedDeviceKey}>
            {devices.length === 0 ? <option value="">No available devices</option> : null}
            {devices.map((device) => (
              <option key={createDeviceKey(device)} value={createDeviceKey(device)}>
                {device.name} · {device.platform}{device.isBooted ? ' · booted' : ''}
              </option>
            ))}
          </select>
        </label>

        <DeviceLocationMap
          accessToken={mapboxAccessToken}
          location={selectedLocation}
          onSelect={handleMapLocationSelected}
          route={routePoints}
        />

        <form className="local-location-section" onSubmit={(event) => void handleSetLocation(event)}>
          <div>
            <h3>Set a coordinate</h3>
            <p>Immediately place the selected simulator at a latitude and longitude.</p>
          </div>
          <div className="local-coordinate-grid">
            <label className="local-control-field">
              <span>Latitude</span>
              <input max="90" min="-90" onChange={(event) => setLatitude(event.target.value)} required step="any" type="number" value={latitude} />
            </label>
            <label className="local-control-field">
              <span>Longitude</span>
              <input max="180" min="-180" onChange={(event) => setLongitude(event.target.value)} required step="any" type="number" value={longitude} />
            </label>
          </div>
          <div className="local-location-actions">
            <button className="button button--primary button--compact" disabled={isBusy || !selectedDevice} type="submit">
              {isBusy ? <CircleNotch className="spin" aria-hidden="true" /> : <MapPin aria-hidden="true" />}
              Set location
            </button>
            <button className="button button--secondary button--compact" disabled={isBusy || !selectedDevice} onClick={() => void handleClearLocation()} type="button">
              Clear override
            </button>
          </div>
        </form>

        <form className="local-location-section" onSubmit={(event) => void handleStartRoute(event)}>
          <div>
            <h3>Replay GPX or KML</h3>
            <p>Stream a recorded route into the selected simulator.</p>
          </div>
          <label className="local-route-picker">
            <UploadSimple aria-hidden="true" />
            <span>{routeFile?.name || 'Choose a .gpx or .kml route'}</span>
            <input accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml" onChange={(event) => void handleRouteFileSelected(event.target.files?.[0] ?? null)} type="file" />
          </label>
          <div className="local-route-grid">
            <label className="local-control-field">
              <span>Playback</span>
              <select onChange={(event) => setMode(Number(event.target.value))} value={mode}>
                <option value={recordedTimingMode}>Recorded timing</option>
                <option value={fixedSpeedMode}>Fixed speed</option>
              </select>
            </label>
            {mode === recordedTimingMode ? (
              <label className="local-control-field">
                <span>Speed multiplier</span>
                <input max="100" min="0.1" onChange={(event) => setPlaybackSpeedMultiplier(event.target.value)} required step="0.1" type="number" value={playbackSpeedMultiplier} />
              </label>
            ) : (
              <label className="local-control-field">
                <span>Speed (km/h)</span>
                <input max="500" min="0.5" onChange={(event) => setFixedSpeedKph(event.target.value)} required step="0.5" type="number" value={fixedSpeedKph} />
              </label>
            )}
          </div>
          <label className="local-checkbox-field">
            <input checked={loop} onChange={(event) => setLoop(event.target.checked)} type="checkbox" />
            Loop route until stopped
          </label>
          <div className="local-location-actions">
            <button className="button button--primary button--compact" disabled={isBusy || !selectedDevice || !routeFile} type="submit">
              {isBusy ? <CircleNotch className="spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
              Start replay
            </button>
            <button className="button button--secondary button--compact" disabled={isBusy || !playback?.isPlaying} onClick={() => void handleStopRoute()} type="button">
              <Stop aria-hidden="true" />
              Stop
            </button>
          </div>
        </form>

        {playback ? (
          <div className={playback.isPlaying ? 'local-playback-status local-playback-status--live' : 'local-playback-status'}>
            <span>{playback.isPlaying ? <i /> : null}{playback.status}</span>
            <strong>{playback.sourceFileName || 'No active route'}</strong>
            <small>
              {playback.pointCount > 0
                ? `Point ${Math.min(playback.currentPointIndex + 1, playback.pointCount)} of ${playback.pointCount} · ${(playback.distanceMeters / 1000).toFixed(2)} km`
                : playback.message}
            </small>
          </div>
        ) : null}
        {message ? <p className="inline-message local-location-message">{message}</p> : null}
      </section>
    </div>
  )
}

function createDeviceKey(device: HostDeviceDescriptor): string {
  return `${device.platform}:${device.identifier}`
}

function formatCoordinate(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, '')
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
}

function parseRoutePoints(content: string): DeviceLocationPoint[] {
  const document = new DOMParser().parseFromString(content, 'application/xml')
  if (document.querySelector('parsererror')) {
    throw new Error('The selected GPX or KML file is not valid XML.')
  }

  const gpxPoints = Array.from(document.querySelectorAll('trkpt, rtept, wpt'))
    .map((element) => createPoint(element.getAttribute('lat'), element.getAttribute('lon')))
    .filter(isLocationPoint)
  if (gpxPoints.length > 0) {
    return gpxPoints
  }

  const kmlPoints = Array.from(document.getElementsByTagNameNS('*', 'coordinates'))
    .flatMap((element) => parseKmlCoordinates(element.textContent ?? ''))
  const gxPoints = Array.from(document.getElementsByTagNameNS('*', 'coord'))
    .map((element) => {
      const [longitude, latitude] = (element.textContent ?? '').trim().split(/\s+/)
      return createPoint(latitude, longitude)
    })
    .filter(isLocationPoint)
  return [...kmlPoints, ...gxPoints]
}

function parseKmlCoordinates(value: string): DeviceLocationPoint[] {
  return value.trim().split(/\s+/)
    .map((coordinate) => {
      const [longitude, latitude] = coordinate.split(',')
      return createPoint(latitude, longitude)
    })
    .filter(isLocationPoint)
}

function createPoint(latitudeValue: string | null | undefined, longitudeValue: string | null | undefined): DeviceLocationPoint | null {
  const latitude = Number(latitudeValue)
  const longitude = Number(longitudeValue)
  return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null
}

function isLocationPoint(value: DeviceLocationPoint | null): value is DeviceLocationPoint {
  return value !== null
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
  return await response.json() as T
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
  return await response.json() as T
}

async function readResponseError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = await response.json() as { message?: string }
    return body.message || `The local host returned HTTP ${response.status}.`
  }

  return (await response.text()).trim() || `The local host returned HTTP ${response.status}.`
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
