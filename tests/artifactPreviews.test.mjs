import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync, zipSync } from 'fflate'
import { resolveArtifactFormat } from '../src/replay/components/artifactFormats.ts'
import { parseJsonLines, parseDelimitedRecords } from '../src/replay/components/artifactRecords.ts'
import { parseArtifactConfig } from '../src/replay/components/artifactConfig.ts'
import { parseArtifactArchive, safeArchivePath } from '../src/replay/components/artifactArchives.ts'
import { parseArtifactHar } from '../src/replay/components/artifactHar.ts'
import { parseArtifactProfiles } from '../src/replay/components/artifactProfiles.ts'
import { geoCoordinates, parseArtifactGeography } from '../src/replay/components/artifactGeography.ts'
import { DOMParser } from '@xmldom/xmldom'

const bytes = value => new TextEncoder().encode(value)

test('specific artifact types take precedence over structured MIME suffixes and parameters', () => {
  for (const [name, mime, format] of [
    ['scene.gltf', 'model/gltf+json', 'model3d'], ['shape.svg', 'image/svg+xml', 'image'],
    ['events.ndjson', 'application/json', 'jsonl'], ['data', 'application/x-ndjson; charset=utf-8', 'jsonl'],
    ['table', 'text/tab-separated-values; charset=utf-8', 'tsv'], ['requests.har', 'application/json', 'har'],
    ['route', 'application/gpx+xml', 'geo'], ['map.geojson', 'application/json', 'geo'],
    ['route.kml', 'application/xml', 'geo'], ['report.htm', 'text/plain', 'html'],
    ['config', 'application/yaml', 'yaml'], ['config.toml', 'text/plain', 'toml'],
    ['capture.speedscope.json', 'application/json', 'profile'], ['capture.cpuprofile', '', 'profile'],
    ['capture.pftrace', '', 'perfetto'], ['runtime.nettrace', '', 'nettrace'],
    ['bundle.tgz', '', 'archive'], ['document', 'application/pdf; version=1.7', 'pdf'],
  ]) assert.equal(resolveArtifactFormat(name, mime), format, name)
  assert.equal(resolveArtifactFormat('data.json', '', '{"log":{"entries":[]}}'), 'har')
  assert.equal(resolveArtifactFormat('data.json', '', '[{"ph":"X","ts":1}]'), 'profile')
  assert.equal(resolveArtifactFormat('data.json', '', '{"type":"Point","coordinates":[1,2]}'), 'geo')
})

test('JSON Lines preserves malformed records, original line numbers, scalars, and record separators', () => {
  const result = parseJsonLines('\uFEFF{"a":1}\n\ninvalid\n[1,2]\n\x1e{"b":2}\nnull\n')
  assert.deepEqual(result.records.map(record => record.line), [1, 3, 4, 5, 6])
  assert.deepEqual(result.columns, ['a', 'value', 'b'])
  assert.match(result.records[1].error, /JSON|Unexpected/)
  assert.equal(result.records[4].value, null)
})

test('delimited records support quoted newlines, escaped quotes, duplicate headers, extra columns, and CRLF', () => {
  const result = parseDelimitedRecords('id\tid\r\n1\t"hello\n""world"""\r\n2\tb\textra\r\n', '\t')
  assert.deepEqual(result.columns, ['id', 'id (2)', 'Column 3'])
  assert.equal(result.records[0].value['id (2)'], 'hello\n"world"')
  assert.equal(result.records[1].value['Column 3'], 'extra')
  assert.equal(result.warnings.length, 1)
  assert.throws(() => parseDelimitedRecords('a,b\n"unfinished', ','), /Unterminated/)
  assert.throws(() => parseDelimitedRecords('a\n"ok"oops', ','), /closing quote/)
})

test('YAML handles multiple documents, aliases, circular references, and validation errors', () => {
  const result = parseArtifactConfig('a: &x {enabled: true}\nb: *x\n---\n- one\n- two\n', 'yaml')
  assert.deepEqual(result.value, [{ a: { enabled: true }, b: { enabled: true } }, ['one', 'two']])
  assert.deepEqual(parseArtifactConfig('a: &x {self: *x}', 'yaml').value, { a: { self: '[Circular YAML alias]' } })
  assert.throws(() => parseArtifactConfig('a: 1\na: 2', 'yaml'), /unique/)
})

test('TOML handles arrays of tables and dates and reports malformed input', () => {
  const value = parseArtifactConfig('date = 2026-10-18T01:00:00Z\n[[servers]]\nname = "one"\n[[servers]]\nname = "two"', 'toml').value
  assert.equal(value.servers[1].name, 'two')
  assert.equal(value.date, '2026-10-18T01:00:00.000Z')
  assert.throws(() => parseArtifactConfig('value = [', 'toml'))
})

test('ZIP previews preserve binary members and reject traversal, truncation, and excessive expansion', () => {
  const zipped = zipSync({ 'nested/data.json': bytes('{"ok":true}'), 'image.bin': new Uint8Array([0, 255, 12]) })
  const result = parseArtifactArchive(zipped, 'capture.zip')
  assert.equal(result.members[0].path, 'nested/data.json')
  assert.deepEqual(result.members[1].bytes, new Uint8Array([0, 255, 12]))
  assert.throws(() => parseArtifactArchive(zipped.slice(0, -10), 'capture.zip'), /incomplete/)
  assert.throws(() => parseArtifactArchive(zipSync({ '../escape': bytes('x') }), 'capture.zip'), /Unsafe/)
  assert.throws(() => parseArtifactArchive(zipSync({ bomb: new Uint8Array(33 * 1024 * 1024) }), 'capture.zip'), /32 MiB/)
  for (const path of ['/absolute', 'C:\\absolute', '..\\parent', 'safe/../escape']) assert.throws(() => safeArchivePath(path))
})

function tar(entries) {
  const chunks = []
  for (const entry of entries) {
    const body = bytes(entry.body), header = new Uint8Array(512)
    header.set(bytes(entry.name), 0)
    header.set(bytes(body.length.toString(8).padStart(11, '0') + '\0'), 124)
    header.fill(32, 148, 156); header[156] = (entry.type || '0').charCodeAt(0)
    header.set(bytes('ustar\0'), 257)
    header.set(bytes(header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 '), 148)
    const padded = new Uint8Array(Math.ceil(body.length / 512) * 512); padded.set(body)
    chunks.push(header, padded)
  }
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 1024))
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

test('TAR and compressed TAR list members without following links and validate checksums', () => {
  const archive = tar([{ name: 'a.txt', body: 'hello' }, { name: 'link', type: '2', body: '' }])
  for (const [data, name] of [[archive, 'capture.tar'], [gzipSync(archive), 'capture.tgz']]) {
    const result = parseArtifactArchive(data, name)
    assert.equal(new TextDecoder().decode(result.members[0].bytes), 'hello')
    assert.equal(result.members[1].bytes, undefined)
    assert.match(result.members[1].note, /never followed/)
  }
  archive[0] ^= 1
  assert.throws(() => parseArtifactArchive(archive, 'capture.tar'), /checksum/)
})

test('GZIP exposes its decoded payload as a previewable member', () => {
  const result = parseArtifactArchive(gzipSync(bytes('a\tb\n1\t2')), 'table.tsv.gz')
  assert.equal(result.members[0].path, 'table.tsv')
  assert.equal(new TextDecoder().decode(result.members[0].bytes), 'a\tb\n1\t2')
})

test('HAR decodes captured bodies and normalizes absent and unknown timing values', () => {
  const result = parseArtifactHar(JSON.stringify({ log: { entries: [{ startedDateTime: '2026-10-18T01:00:00Z', time: 50, request: { method: 'POST', url: 'https://example.test', headers: [{ name: 'x-test', value: '1' }], postData: { text: 'body' } }, response: { status: 200, content: { mimeType: 'text/plain', encoding: 'base64', text: btoa('result') } }, timings: { dns: -1, wait: 30 } }] } }))
  assert.equal(result.requests[0].responseBody, 'result')
  assert.equal(result.requests[0].requestBody, 'body')
  assert.deepEqual(result.requests[0].timings, [{ name: 'wait', value: '30 ms' }])
  assert.equal(result.end - result.start, 50)
  assert.throws(() => parseArtifactHar('{"entries":[]}'), /log.entries/)
})

test('Speedscope supports weighted samples and evented stacks with meaningful errors', () => {
  const sampled = { shared: { frames: [{ name: 'root' }, { name: 'child' }] }, profiles: [{ type: 'sampled', unit: 'milliseconds', startValue: 0, endValue: 5, samples: [[0, 1], [0]], weights: [2, 3] }] }
  const profile = parseArtifactProfiles(JSON.stringify(sampled)).profiles[0]
  assert.deepEqual(profile.spans, [{ frame: 0, start: 0, end: 2, depth: 0 }, { frame: 1, start: 0, end: 2, depth: 1 }, { frame: 0, start: 2, end: 5, depth: 0 }])
  const evented = { shared: sampled.shared, profiles: [{ type: 'evented', startValue: 0, endValue: 10, events: [{ type: 'O', frame: 0, at: 0 }, { type: 'O', frame: 1, at: 2 }, { type: 'C', frame: 1, at: 3 }, { type: 'C', frame: 0, at: 10 }] }] }
  assert.equal(parseArtifactProfiles(JSON.stringify(evented)).profiles[0].spans[0].depth, 1)
  evented.profiles[0].events[2].frame = 0
  assert.throws(() => parseArtifactProfiles(JSON.stringify(evented)), /mismatched/)
})

test('Chrome CPU profiles reconstruct stack parents and reject cyclic nodes', () => {
  const value = { nodes: [{ id: 1, callFrame: { functionName: 'root' }, children: [2] }, { id: 2, callFrame: { functionName: 'child' } }], startTime: 100, endTime: 110, samples: [2], timeDeltas: [10] }
  const result = parseArtifactProfiles(JSON.stringify(value)).profiles[0]
  assert.equal(result.frames[result.spans[1].frame].name, 'child')
  assert.equal(result.spans[1].start, 100)
  value.nodes[1].children = [1]
  assert.throws(() => parseArtifactProfiles(JSON.stringify(value)), /cyclic/)
})

test('Chrome trace imports separate threads, complete intervals, begin/end pairs and warns on skipped events', () => {
  const result = parseArtifactProfiles(JSON.stringify({ traceEvents: [
    { ph: 'B', pid: 1, tid: 1, ts: 0, name: 'parent' }, { ph: 'X', pid: 1, tid: 1, ts: 1, dur: 2, name: 'child' },
    { ph: 'E', pid: 1, tid: 1, ts: 4 }, { ph: 'X', pid: 1, tid: 2, ts: 1, dur: 1, name: 'worker' }, { ph: 'C', ts: 2 },
  ] }))
  assert.equal(result.profiles.length, 2)
  assert.deepEqual(result.profiles[0].spans.map(span => span.depth), [0, 1])
  assert.equal(result.warnings.length, 1)
})

test('GeoJSON preserves polygons, properties and geometry collections with coordinate validation', () => {
  const result = parseArtifactGeography(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'route' }, geometry: { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [151, -33] }, { type: 'LineString', coordinates: [[151, -33], [152, -34]] }] } }] }))
  assert.equal(result.features[0].properties.name, 'route')
  assert.equal(geoCoordinates(result).length, 3)
  assert.throws(() => parseArtifactGeography('{"type":"Point","coordinates":[0,200]}'), /Invalid longitude/)
})

test('GPX and namespaced KML preserve routes, polygons, properties and reject entities', () => {
  globalThis.DOMParser = DOMParser
  const gpx = parseArtifactGeography('<gpx xmlns="http://www.topografix.com/GPX/1/1"><wpt lon="151" lat="-33"><name>Start</name></wpt><trk><name>Walk</name><trkseg><trkpt lon="151" lat="-33"/><trkpt lon="152" lat="-34"/></trkseg><trkseg><trkpt lon="153" lat="-35"/></trkseg></trk></gpx>')
  assert.equal(gpx.features[0].properties.name, 'Start')
  assert.equal(gpx.features[1].geometry.type, 'MultiLineString')
  assert.equal(gpx.features[1].geometry.coordinates.length, 2)
  const kml = parseArtifactGeography('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Area</name><Polygon><outerBoundaryIs><LinearRing><coordinates>1,2 3,4 1,2</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>1,2 2,3 1,2</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark></Document></kml>')
  assert.equal(kml.features[0].properties.name, 'Area')
  assert.equal(kml.features[0].geometry.coordinates.length, 2)
  assert.throws(() => parseArtifactGeography('<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx>&x;</gpx>'), /entity/)
  assert.throws(() => parseArtifactGeography('<gpx><wpt lat="1"/></gpx>'), /missing/)
})
