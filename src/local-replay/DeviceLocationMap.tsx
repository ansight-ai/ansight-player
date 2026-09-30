import { MapPin } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import type { DeviceLocationPoint } from './types'

const mapboxScriptUrl = 'https://api.mapbox.com/mapbox-gl-js/v3.28.0/mapbox-gl.js'
const mapboxStylesheetUrl = 'https://api.mapbox.com/mapbox-gl-js/v3.28.0/mapbox-gl.css'
const mapboxSearchScriptUrl = 'https://api.mapbox.com/search-js/v1.6.0/web.js'

type MapboxCoordinate = [number, number]

type MapboxMap = {
  addControl(control: unknown, position: string): void
  addLayer(layer: Record<string, unknown>): void
  addSource(id: string, source: Record<string, unknown>): void
  easeTo(options: Record<string, unknown>): void
  fitBounds(bounds: MapboxBounds, options: Record<string, unknown>): void
  getBounds(): { contains(coordinate: MapboxCoordinate): boolean }
  getCenter(): { lat: number, lng: number }
  getSource(id: string): { setData(data: unknown): void } | undefined
  getZoom(): number
  isStyleLoaded(): boolean
  on(event: 'click', callback: (event: MapboxMapEvent) => void): void
  on(event: string, callback: () => void): void
  remove(): void
  resize(): void
  setStyle(style: string): void
  touchZoomRotate: { disableRotation(): void }
}

type MapboxMapEvent = {
  lngLat: { lat: number, lng: number }
}

type MapboxMarker = {
  addTo(map: MapboxMap): MapboxMarker
  remove(): void
  setLngLat(coordinate: MapboxCoordinate): MapboxMarker
}

type MapboxBounds = {
  extend(coordinate: MapboxCoordinate): MapboxBounds
}

type MapboxGl = {
  accessToken: string
  Map: new (options: Record<string, unknown>) => MapboxMap
  Marker: new (options: Record<string, unknown>) => MapboxMarker
  NavigationControl: new (options: Record<string, unknown>) => unknown
  LngLatBounds: new () => MapboxBounds
}

type MapboxSearchBox = HTMLElement & {
  accessToken: string
  mapboxgl: MapboxGl
  marker: boolean
  placeholder: string
  bindMap(map: MapboxMap): void
}

type MapboxSearch = {
  MapboxSearchBox: new () => MapboxSearchBox
}

type MapInstance = {
  map: MapboxMap
  marker: MapboxMarker | null
  route: DeviceLocationPoint[]
  resizeObserver: ResizeObserver
  searchBox: MapboxSearchBox | null
}

let mapboxLoadPromise: Promise<void> | null = null

export function DeviceLocationMap({
  accessToken,
  location,
  onSelect,
  route,
}: {
  accessToken: string
  location: DeviceLocationPoint | null
  onSelect: (location: DeviceLocationPoint) => void
  route: DeviceLocationPoint[]
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const searchElementRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<MapInstance | null>(null)
  const onSelectRef = useRef(onSelect)
  const locationRef = useRef(location)
  const routeRef = useRef(route)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    routeRef.current = route
  }, [route])

  useEffect(() => {
    const mapElement = mapElementRef.current
    const searchElement = searchElementRef.current
    if (!mapElement || !searchElement || !accessToken.startsWith('pk.')) {
      return undefined
    }
    const mapContainer = mapElement
    const searchContainer = searchElement

    let isCancelled = false
    async function initialize() {
      try {
        await loadMapbox()
        if (isCancelled) {
          return
        }

        const mapboxgl = getMapboxGl()
        mapboxgl.accessToken = accessToken
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const initialLocation = locationRef.current
        const map = new mapboxgl.Map({
          container: mapContainer,
          style: resolveMapStyle(isDark),
          projection: 'mercator',
          center: initialLocation ? [initialLocation.longitude, initialLocation.latitude] : [0, 20],
          zoom: initialLocation ? 12 : 1.5,
          clickTolerance: 2,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxPitch: 0,
          attributionControl: true,
        })
        map.touchZoomRotate.disableRotation()
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
        const resizeObserver = new ResizeObserver(() => map.resize())
        resizeObserver.observe(mapContainer)
        const instance: MapInstance = { map, marker: null, route: [], resizeObserver, searchBox: null }
        instanceRef.current = instance
        map.on('style.load', () => applyRoute(instance, mapboxgl))
        map.on('click', (event) => onSelectRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }))
        map.on('dragend', () => {
          const center = map.getCenter()
          onSelectRef.current({ latitude: center.lat, longitude: center.lng })
        })

        const mapboxsearch = getMapboxSearch()
        if (mapboxsearch?.MapboxSearchBox) {
          const searchBox = new mapboxsearch.MapboxSearchBox()
          searchBox.accessToken = accessToken
          searchBox.mapboxgl = mapboxgl
          searchBox.marker = false
          searchBox.placeholder = 'Search for a place'
          searchBox.bindMap(map)
          searchBox.addEventListener('retrieve', (event) => {
            const result = extractSearchResult(event)
            if (result) {
              onSelectRef.current(result)
            }
          })
          searchContainer.replaceChildren(searchBox)
          instance.searchBox = searchBox
        }

        setError(null)
        applyLocation(instance, mapboxgl, initialLocation)
        instance.route = routeRef.current
        applyRoute(instance, mapboxgl)
      } catch (caught) {
        if (!isCancelled) {
          setError(resolveErrorMessage(caught, 'Mapbox failed to initialize.'))
        }
      }
    }

    void initialize()
    return () => {
      isCancelled = true
      const instance = instanceRef.current
      instanceRef.current = null
      if (instance) {
        instance.resizeObserver.disconnect()
        instance.searchBox?.remove()
        instance.marker?.remove()
        instance.map.remove()
      }
    }
  }, [accessToken])

  useEffect(() => {
    const instance = instanceRef.current
    if (instance) {
      applyLocation(instance, getMapboxGl(), location)
    }
  }, [location])

  useEffect(() => {
    const instance = instanceRef.current
    if (instance) {
      instance.route = route
      applyRoute(instance, getMapboxGl())
    }
  }, [route])

  if (!accessToken.startsWith('pk.')) {
    return (
      <div className="local-location-map-placeholder">
        <MapPin aria-hidden="true" />
        <strong>Mapbox is not configured</strong>
        <span>The bundled host is missing its public Mapbox token.</span>
      </div>
    )
  }

  return (
    <div className="local-location-map-shell">
      <div className="local-location-map-search" ref={searchElementRef} />
      <div className="local-location-map" ref={mapElementRef} />
      {error ? <p className="inline-message local-location-map-error">{error}</p> : null}
    </div>
  )
}

function applyLocation(instance: MapInstance, mapboxgl: MapboxGl, location: DeviceLocationPoint | null) {
  if (!location) {
    instance.marker?.remove()
    instance.marker = null
    return
  }

  const coordinate: MapboxCoordinate = [location.longitude, location.latitude]
  if (!instance.marker) {
    instance.marker = new mapboxgl.Marker({ color: '#ff725e' }).setLngLat(coordinate).addTo(instance.map)
  } else {
    instance.marker.setLngLat(coordinate)
  }

  if (!instance.map.getBounds().contains(coordinate)) {
    instance.map.easeTo({ center: coordinate, zoom: Math.max(instance.map.getZoom(), 12) })
  }
}

function applyRoute(instance: MapInstance, mapboxgl: MapboxGl) {
  if (!instance.map.isStyleLoaded()) {
    return
  }

  const data = {
    type: 'FeatureCollection',
    features: instance.route.length < 2 ? [] : [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: instance.route.map((point) => [point.longitude, point.latitude]),
      },
    }],
  }
  const source = instance.map.getSource('ansight-device-route')
  if (source) {
    source.setData(data)
  } else {
    instance.map.addSource('ansight-device-route', { type: 'geojson', data })
    instance.map.addLayer({
      id: 'ansight-device-route-line',
      type: 'line',
      source: 'ansight-device-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ff725e', 'line-width': 4, 'line-opacity': 0.9 },
    })
  }

  if (instance.route.length > 1) {
    const bounds = new mapboxgl.LngLatBounds()
    instance.route.forEach((point) => bounds.extend([point.longitude, point.latitude]))
    instance.map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 })
  }
}

function extractSearchResult(event: Event): DeviceLocationPoint | null {
  const detail = (event as CustomEvent).detail
  const feature = detail?.features?.[0] ?? detail?.feature ?? detail
  const coordinates = feature?.geometry?.coordinates ?? feature?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null
  }

  const longitude = Number(coordinates[0])
  const latitude = Number(coordinates[1])
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
}

function resolveMapStyle(isDark: boolean): string {
  return isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
}

function getMapboxGl(): MapboxGl {
  const value = (window as Window & { mapboxgl?: MapboxGl }).mapboxgl
  if (!value) {
    throw new Error('Mapbox GL JS did not load.')
  }
  return value
}

function getMapboxSearch(): MapboxSearch | null {
  return (window as Window & { mapboxsearch?: MapboxSearch }).mapboxsearch ?? null
}

function loadMapbox(): Promise<void> {
  mapboxLoadPromise ??= Promise.all([
    loadStylesheet(mapboxStylesheetUrl),
    loadScript(mapboxScriptUrl, () => Boolean((window as Window & { mapboxgl?: MapboxGl }).mapboxgl)),
  ]).then(() => loadScript(
    mapboxSearchScriptUrl,
    () => Boolean((window as Window & { mapboxsearch?: MapboxSearch }).mapboxsearch),
  ))
  return mapboxLoadPromise
}

function loadStylesheet(url: string): Promise<void> {
  if (document.querySelector(`link[href="${url}"]`)) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.addEventListener('load', () => resolve(), { once: true })
    link.addEventListener('error', () => reject(new Error(`Unable to load ${url}.`)), { once: true })
    document.head.append(link)
  })
}

function loadScript(url: string, isLoaded: () => boolean): Promise<void> {
  if (isLoaded()) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`)
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error(`Unable to load ${url}.`)), { once: true })
    if (!existing) {
      script.src = url
      document.head.append(script)
    }
  })
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
