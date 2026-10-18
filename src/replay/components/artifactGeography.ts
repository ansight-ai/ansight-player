export interface GeoGeometry { type: string; coordinates?: unknown; geometries?: GeoGeometry[] }
export interface GeoFeature { type: 'Feature'; id: number; properties: Record<string, unknown>; geometry: GeoGeometry | null }
export interface ArtifactGeoData { type: 'FeatureCollection'; features: GeoFeature[] }
export interface GeoCoordinate { longitude: number; latitude: number }

export function parseArtifactGeography(text: string): ArtifactGeoData {
  if (text.length > 16 * 1024 * 1024) throw new Error('Geographic preview is limited to 16 MiB.')
  let features: Omit<GeoFeature, 'id'>[]
  if (text.trimStart().startsWith('<')) features = parseXmlGeography(text)
  else {
    const data = JSON.parse(text)
    features = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [{ type: 'Feature', properties: {}, geometry: data }]
  }
  if (!Array.isArray(features) || features.length > 5000) throw new Error('Expected a geographic file containing at most 5,000 features.')
  const result: ArtifactGeoData = { type: 'FeatureCollection', features: features.map((feature, id) => ({ type: 'Feature', id, properties: feature.properties && typeof feature.properties === 'object' ? feature.properties : {}, geometry: feature.geometry })) }
  geoCoordinates(result) // Validate geometry before passing it to Mapbox.
  return result
}

export function geoCoordinates(data: ArtifactGeoData): GeoCoordinate[] {
  const points: GeoCoordinate[] = []
  function position(value: unknown) {
    if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== 'number' || typeof value[1] !== 'number'
      || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error('Invalid longitude/latitude. Geographic coordinates must use WGS84 degrees.')
    if (points.length >= 200_000) throw new Error('Geographic file exceeds 200,000 coordinates.')
    points.push({ longitude: value[0], latitude: value[1] })
  }
  function coordinates(value: unknown, nesting: number) {
    if (!nesting) { position(value); return }
    if (!Array.isArray(value)) throw new Error('Invalid geometry coordinate array.')
    value.forEach(child => coordinates(child, nesting - 1))
  }
  function geometry(value: GeoGeometry | null, depth = 0) {
    if (!value) return
    if (depth > 16) throw new Error('Geometry collections exceed 16 nesting levels.')
    if (value.type === 'GeometryCollection') {
      if (!Array.isArray(value.geometries)) throw new Error('Invalid geometry collection.')
      value.geometries.forEach(child => geometry(child, depth + 1)); return
    }
    const nesting = ({ Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 } as Record<string, number>)[value.type]
    if (nesting === undefined) throw new Error(`Unsupported geometry type: ${value.type}`)
    coordinates(value.coordinates, nesting)
  }
  data.features.forEach(feature => geometry(feature.geometry))
  return points
}

function parseXmlGeography(text: string): Omit<GeoFeature, 'id'>[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('DTD and entity declarations are not supported in geographic files.')
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid GPX/KML XML.')
  const root = document.documentElement.localName
  const descendants = (element: Document | Element, name: string) => Array.from(element.getElementsByTagNameNS('*', name))
  const children = (element: Element) => Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1)
  const childText = (element: Element, name: string) => children(element).find(child => child.localName === name)?.textContent?.trim() ?? ''
  const feature = (geometry: GeoGeometry, properties: Record<string, unknown> = {}): Omit<GeoFeature, 'id'> => ({ type: 'Feature', properties, geometry })
  if (root === 'gpx') {
    const point = (element: Element) => {
      if (!element.hasAttribute('lon') || !element.hasAttribute('lat')) throw new Error('GPX point is missing latitude or longitude.')
      return [Number(element.getAttribute('lon')), Number(element.getAttribute('lat'))]
    }
    const properties = (element: Element) => Object.fromEntries(['name', 'desc', 'ele', 'time'].map(name => [name, childText(element, name)]).filter(([, value]) => value))
    return [
      ...descendants(document, 'wpt').map(element => feature({ type: 'Point', coordinates: point(element) }, properties(element))),
      ...descendants(document, 'rte').map(element => feature({ type: 'LineString', coordinates: descendants(element, 'rtept').map(point) }, properties(element))),
      ...descendants(document, 'trk').map(element => feature({ type: 'MultiLineString', coordinates: descendants(element, 'trkseg').map(segment => descendants(segment, 'trkpt').map(point)) }, properties(element))),
    ]
  }
  if (root !== 'kml') throw new Error('Expected a GPX or KML document.')
  function geometry(element: Element): GeoGeometry | null {
    const positions = (target: Element) => (descendants(target, 'coordinates')[0]?.textContent ?? '').trim().split(/\s+/).filter(Boolean).map(value => value.split(',').map(Number))
    if (element.localName === 'Point') return { type: 'Point', coordinates: positions(element)[0] }
    if (element.localName === 'LineString') return { type: 'LineString', coordinates: positions(element) }
    if (element.localName === 'Polygon') return { type: 'Polygon', coordinates: descendants(element, 'LinearRing').map(positions) }
    if (element.localName === 'Track') return { type: 'LineString', coordinates: descendants(element, 'coord').map(value => value.textContent?.trim().split(/\s+/).map(Number)) }
    if (element.localName === 'MultiGeometry' || element.localName === 'MultiTrack') return { type: 'GeometryCollection', geometries: children(element).map(geometry).filter((value): value is GeoGeometry => !!value) }
    return null
  }
  return descendants(document, 'Placemark').map(element => ({
    type: 'Feature',
    properties: { name: childText(element, 'name'), description: childText(element, 'description'), ...Object.fromEntries(descendants(element, 'Data').map(data => [data.getAttribute('name') ?? 'value', childText(data, 'value')])) },
    geometry: children(element).map(geometry).find(value => value !== null) ?? null,
  }))
}
