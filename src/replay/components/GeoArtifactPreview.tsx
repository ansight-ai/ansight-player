import { useEffect, useMemo, useState } from 'react'
import { DeviceLocationMap } from '../../local-replay/DeviceLocationMap'
import { geoCoordinates, parseArtifactGeography, type ArtifactGeoData } from './artifactGeography'
import { ArtifactValueTree } from './ArtifactDataPreview'

const emptyRoute: [] = []

export function GeoArtifactPreview({ text }: { text: string }) {
  const [token, setToken] = useState<string>(import.meta.env?.VITE_MAPBOX_ACCESS_TOKEN ?? '')
  const [selected, setSelected] = useState<number | null>(null)
  const parsed = useMemo(() => { try { return { value: parseArtifactGeography(text) } } catch (error) { return { error: String(error) } } }, [text])
  const geography = useMemo<ArtifactGeoData | undefined>(() => parsed.value ? { type: 'FeatureCollection', features: selected === null ? parsed.value.features : parsed.value.features.filter(feature => feature.id === selected) } : undefined, [parsed.value, selected])
  const coordinates = useMemo(() => geography ? geoCoordinates(geography) : [], [geography])
  useEffect(() => {
    if (token) return
    const controller = new AbortController()
    // Reuse the public token already supplied by the local host to DeviceLocationPanel.
    void fetch('api/bootstrap', { signal: controller.signal }).then(async response => {
      if (!response.ok) return
      const bootstrap = await response.json() as { mapboxAccessToken?: string }
      if (bootstrap.mapboxAccessToken?.startsWith('pk.')) setToken(bootstrap.mapboxAccessToken)
    }).catch(() => { /* The cloud player may supply VITE_MAPBOX_ACCESS_TOKEN instead. */ })
    return () => controller.abort()
  }, [token])
  if (!parsed.value || !geography) return <div className="artifact-rich"><p role="alert">{parsed.error}</p><details><summary>View source</summary><pre>{text}</pre></details></div>
  const feature = parsed.value.features.find(feature => feature.id === selected)
  return <div className="artifact-rich artifact-geo-preview">
    <div className="artifact-rich-toolbar"><label>Feature <select value={selected ?? ''} onChange={event => setSelected(event.target.value === '' ? null : Number(event.target.value))}><option value="">All features ({parsed.value.features.length})</option>{parsed.value.features.map(feature => <option key={feature.id} value={feature.id}>{String(feature.properties.name || `Feature ${feature.id + 1}`)} · {feature.geometry?.type ?? 'No geometry'}</option>)}</select></label><span>{coordinates.length.toLocaleString()} coordinates</span></div>
    <DeviceLocationMap accessToken={token} location={null} route={emptyRoute} geography={geography} />
    {feature ? <ArtifactValueTree name="Properties" value={feature.properties} /> : null}
    {!coordinates.length ? <p>No geographic coordinates were found.</p> : null}
  </div>
}
