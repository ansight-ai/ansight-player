import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { zipSync } from 'fflate'
import { FileContentPreview } from '../../src/replay/components/LiveSessionFileExplorer'
import type { SessionLiveFileContent } from '../../src/replay/sessionViewerData'
import '../../src/index.css'
import '../../src/App.css'

const encode = (text: string) => new TextEncoder().encode(text)
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
const gpx = '<gpx><wpt lon="151.21" lat="-33.86"><name>Sydney</name></wpt><trk><name>Harbour walk</name><trkseg><trkpt lon="151.21" lat="-33.86"/><trkpt lon="151.215" lat="-33.855"/></trkseg></trk></gpx>'
const fixtures: Record<string, SessionLiveFileContent> = {
  'JSON Lines': { fileName: 'events.jsonl', text: Array.from({ length: 205 }, (_, index) => index === 3 ? 'invalid JSON line' : JSON.stringify({ event: index, name: `Event ${index}`, nested: { ok: true } })).join('\n') },
  TSV: { fileName: 'data.tsv', text: 'id\tname\tstate\n1\tAlice\tactive\n2\t"Bob\nSmith"\tpending' },
  ZIP: { fileName: 'bundle.zip', base64: toBase64(zipSync({ 'events.jsonl': encode('{"event":"first"}\n{"event":"second"}'), 'config.yaml': encode('feature:\n  enabled: true\n  retries: 3'), 'route.gpx': encode(gpx), 'report.html': encode('<h1>Captured report</h1><p>Archive member preview.</p>') })) },
  HAR: { fileName: 'network.har', text: JSON.stringify({ log: { entries: [0, 1, 2].map(index => ({ startedDateTime: new Date(1_700_000_000_000 + index * 100).toISOString(), time: 120 + index * 30, request: { method: index ? 'GET' : 'POST', url: `https://example.test/api/${index}`, headers: [{ name: 'Content-Type', value: 'application/json' }], postData: { text: '{"request":true}' } }, response: { status: index === 2 ? 500 : 200, headers: [{ name: 'Content-Type', value: 'application/json' }], content: { text: '{"response":true}', mimeType: 'application/json', size: 17 } }, timings: { dns: 10, connect: 20, wait: 50, receive: 40 } })) } }) },
  Profile: { fileName: 'capture.speedscope.json', text: JSON.stringify({ shared: { frames: [{ name: 'Application.run' }, { name: 'loadItems' }, { name: 'renderList' }, { name: 'syncQueue' }] }, profiles: [{ type: 'sampled', name: 'Main thread', unit: 'milliseconds', startValue: 0, endValue: 100, samples: [[0, 1], [0, 2], [0, 3]], weights: [20, 50, 30] }] }) },
  HTML: { fileName: 'report.html', text: '<!doctype html><html><head><style>body{font:16px system-ui;padding:30px;color:#203046}h1{color:#ea6840}td{padding:12px;border-bottom:1px solid #ddd}</style><script>parent.document.body.innerHTML="UNSAFE"</script></head><body><h1>Test report</h1><p>3 checks passed</p><table><tr><td>Login</td><td>Pass</td></tr><tr><td>Sync</td><td>Pass</td></tr><tr><td>Checkout</td><td>Pass</td></tr></table><img src="https://example.test/tracker"><a href="https://example.test">External link should be inert</a></body></html>' },
  YAML: { fileName: 'settings.yaml', text: 'application:\n  name: Example\n  enabled: true\n  services:\n    - sync\n    - notifications\n' },
  TOML: { fileName: 'settings.toml', text: 'name = "Example"\nenabled = true\n[database]\nhost = "localhost"\nports = [5432, 5433]\n' },
  GeoJSON: { fileName: 'route.geojson', text: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Harbour' }, geometry: { type: 'Point', coordinates: [151.21, -33.86] } }, { type: 'Feature', properties: { name: 'Walk' }, geometry: { type: 'LineString', coordinates: [[151.21, -33.86], [151.215, -33.855]] } }] }) },
  GPX: { fileName: 'route.gpx', text: gpx },
  KML: { fileName: 'area.kml', text: '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Harbour area</name><Polygon><outerBoundaryIs><LinearRing><coordinates>151.20,-33.86 151.22,-33.86 151.22,-33.85 151.20,-33.86</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>' },
  'Invalid YAML': { fileName: 'invalid.yaml', text: 'a: 1\na: 2' },
  'Host error': { fileName: 'capture.nettrace', isSuccess: false, message: 'Trace conversion requires dotnet-trace on the host.' },
}

function FixturePage() {
  const [name, setName] = useState('JSON Lines')
  return <main className="session-viewer-dashboard" style={{ maxWidth: 1200, margin: '30px auto', padding: 20 }}><h1>Artifact preview fixtures</h1>
    <label>Fixture <select value={name} onChange={event => setName(event.target.value)}>{Object.keys(fixtures).map(name => <option key={name}>{name}</option>)}</select></label>
    <FileContentPreview entry={null} content={fixtures[name]} key={name} />
  </main>
}

const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!)
if (import.meta.hot) import.meta.hot.data.root = root
root.render(<FixturePage />)
