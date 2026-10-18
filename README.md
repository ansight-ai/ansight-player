# Ansight player

The independent source repository for the shared React session viewer and the
account-free local host UI. First-party source uses PolyForm Shield 1.0.0;
see LICENSE and NOTICE. Third-party licences remain with their dependencies.

## Build and test

Requires Node.js 24 or later.

```sh
npm ci
npm test
npm run build
npm run pack:release
```

The build produces two outputs:

- `dist/library`: importable JavaScript, TypeScript declarations and component assets.
- `dist/local`: the complete local HTML/JavaScript/CSS application and self-contained
  `chat-replay.html` widget embedded by the CLI host.

The versioned `@ansight/player` package contains both compiled outputs, TypeScript
declarations and licence notices. Its exports use `dist/library`; `src/` stays in
this repository and is excluded from release packages.
React and React DOM are peer dependencies so an embedding application shares its
own React instance. The player has no dependency on the SDK, CLI source, cloud
repository, Supabase client or cloud credentials.

## In-chat replay

`src/chat-replay` contains the compact viewer used by `ansight mcp serve`.
It builds with the normal player release. The CLI implements the MCP server,
recording access, image loading, and native annotation persistence in C#.
There is no standalone replay plugin or JavaScript server to deploy.

The embedded viewer keeps just the session title, screen, compact scrubber,
screenshot stepping, elapsed time, expand, Attach this moment, and Open full replay.
Recorded touches stay visible automatically. Saved annotations appear in a list below the controls,
with their text and timestamps; selecting one seeks to that moment. Refresh
annotations reloads notes saved in the full player without moving the playhead.
Saved annotation geometry remains visible on the screen. Annotation editing and
other inspection actions live in the full player.

Attach this moment adds the selected session, timestamp, screenshot reference, and
nearby annotation to the chat context. Opening a replay, scrubbing, stepping through
screenshots, and selecting or refreshing annotations do not attach context
automatically.

Open full replay calls the local MCP backend to open the selected session in the
default browser, using the resident host's current address. The backend accepts
only a session ID, verifies it exists locally, and reports browser launch errors
back to the widget.

The in-chat, local-host and cloud players share the same touch renderer: orange
rings with white outlines and center dots, swipe trails, and a 1.6-second expanding
fade after release. Contacts remain visible during recorded holds, and separate
fingers and repeated taps retain their own markers when scrubbing.

Run `npm run test:chat-replay` for touch coordinate, gesture, and scrubber checks.
The CLI repository owns backend tests and the packaged MCP smoke test.

## Applications and adapters

The CLI consumes the packaged `dist/local` assets. Cloud applications import
`SessionViewerPage` and configure a `CloudPlayerAdapter` once at application startup.
The adapter owns identity, session loading, cloud AI, attachments and session
management. The player includes service contracts and presentation helpers;
private cloud transport, authentication and database/storage implementations stay
with the embedding application.

A local viewer supplies its `SessionViewerSource` and requires no cloud adapter
or account. Cloud operations fail explicitly if no adapter is configured.

## Apple Pencil and stylus replay

The session viewer reads optional pen details from the existing touch stream.
Apple Pencil and Android stylus events use distinct markers; eraser input is
pink and hover is a dashed outline. For contact, normalized force or pressure
changes marker size. Altitude or tilt changes its shape, and azimuth or
orientation rotates it with a direction dot. Hover over a marker to inspect
the reported values. Ordinary finger touches and recordings without pen
details use the shared orange rings and trails.

The player preserves device-reported fields without inventing values when a
pen or digitizer does not provide them. Estimated Apple Pencil corrections
remain in session data but do not draw an extra marker. See the
[touch-input guide](https://www.ansight.ai/docs/local-player/session-replay-and-review)
for capture and replay behavior.

The CLI pins the `@ansight/player` release archive in `vendor/` and records its
integrity in the lockfile. Build and pack here before updating that archive.
Every npm release uses a new package version; never replace the contents of
an already published version. The cloud portal pins its own archive dependency.

For local development, build this repository and use the publisher's
`build --player-source`, or set `ANSIGHT_PLAYER_REPOSITORY` when preparing CLI
assets. Neither workflow copies player source or release archives into the CLI.

## Local UI development

```sh
npm run dev
```

The development server proxies `/api/` and `/frames/` to a running local host.
Set `ANSIGHT_EXPLORER_URL` to use a non-default host address. Builds stay in this
repository; embedding or installing them is the consuming application’s job.

## Optional local-host features

Account, remote-runner, team-sharing and cloud-analysis panels are supplied by the host's private extension. Public compatibility components delegate to `OptionalPlayerPanel`; bootstrap metadata identifies the installed same-origin bundle. The loader imports it only when the user selects that feature. Public local playback and capture inspection work without it.

## Connectivity evidence

The shared Connectivity tab works with local application-event records and cloud segmented captures. Optional `SessionViewerSource.loadConnectivity` and `SessionViewerDataServices.loadSessionConnectivity` return a `ConnectivityWindow`. Cloud providers should use `loadConnectivityWindow` from `@ansight/player/replay/connectivity`, resolving segment paths against the authenticated capture manifest. Failed downloads must reject; do not report them as unavailable connections.

The view uses the common playhead, shows measurement provenance and age, distinguishes unknown gaps from disconnections, and separates quality sources, transports, and units. Unchanged quality readings use a compact summary with measurement counts, the visible time window, an explicit age relative to the playhead, and a jump to the actual reading. A carried value is labelled as such. Charts appear when values vary, with labelled axes, selectable measurement markers and stepped lines that break at gaps or missing measurements. OS link quality is explicitly described as a broad category, not a signal-strength, latency or transfer-speed measurement. The tab remains available for captures without connectivity observations and explains when evidence is missing. Recorded unknown states and observation gaps remain visible.

The tab shows a compact connection status, relevant flags, and plain-language history. Missing quality fields are hidden; captured signal strength, OS link quality, and upstream/downstream link estimates appear with their measurement age and charts around the playhead. Technical details retain normal/unknown flags, provenance, capabilities, raw data and collector observations. Connectivity does not add a separate lane beneath the main playback timeline. Unknown quality is never inferred from an available connection. Tooltips include values, units, measurement time, source, and age at observation.

Live simulator controls include a Network panel beside Location. It uses the resident host's `api/network/{capabilities,set,get,reset}` JSON POST routes for presets, custom rates/delay, blocking/stalling, optional destination ports, traffic counters, and a bounded automatic reset. Closing the panel keeps its lease active and shows a compact countdown with Open and Reset controls. Explicit Reset, expiry, or host/target exit ends conditioning; a browser refresh can recover the lease from session storage. Host expiry still applies if the browser closes. Conditioning does not change recorded OS radio strength or link quality.

The Network panel opens with profile cards and an auto-reset selector. Advanced reveals sliders, exact numeric values, transfer behavior, and TCP ports. Switching views preserves custom settings; choosing a profile only takes effect after Apply/Update. Rate sliders cover the full supported range with an unlimited stop, while numeric inputs retain exact kbps values.

## Passive network measurements

Connectivity shows a rolling 60-second summary of completed requests at the replay
playhead: response latency p50/p95 by server, median upload/download transfer rates,
measurement counts, and failures. Recent requests seek to their completion time;
the Network tab exposes individual DNS, connection, TLS, latency and byte metrics.
The cloud player loads archived network records on demand through its existing
storage adapter, with six concurrent downloads at most.

These measurements use the optional network-record `performance` object emitted
by Apple native network capture. They cover the final transaction after redirects
and retries. Rates use transferred body bytes and measured transfer intervals,
not retained content or Content-Length. Older captures and other collectors keep
request durations but show missing latency/rates explicitly. Per-transfer averages
are not bandwidth capacity or an aggregate live throughput chart. Idle windows
remain unknown. No active probes or speed tests are run.

## Diagnostic artifact previews

The shared file preview recognizes formats by filename and MIME type, including
MIME parameters. Well-known JSON shapes also select HAR, profile, or map views.
The local host and cloud adapters preserve the source for these previews.

| Formats | Preview |
| --- | --- |
| JSONL / NDJSON, CSV, TSV | Filterable, paged records with row inspection and malformed-line diagnostics. |
| ZIP, TAR, GZIP, TGZ | Member browser with nested previews and downloads; links are never followed or extracted to disk. |
| HAR | Request list, waterfall, headers, timings, query parameters, and captured bodies. |
| Chrome CPU profiles, Speedscope, Chrome/Perfetto JSON traces | Flamechart with track selection, zoom, function highlighting, and inclusive timing totals. |
| Native Perfetto traces | Explicit **Open trace in Perfetto** action sends the trace to the Perfetto web app in a new tab for browser-side processing. |
| .nettrace | The local host converts with an installed `dotnet-trace` executable; cloud playback explains how to convert to Speedscope. |
| HTML / HTM | Sandboxed static report with scripts, navigation, forms, and external resources disabled. Self-contained HTML and inline images/styles work. |
| GeoJSON, GPX, KML | The existing `DeviceLocationMap` Mapbox implementation, with feature selection, properties, and bounds fitted to the geometry. |
| YAML, TOML | Syntax validation and expandable structured navigation, with source available. |

Map previews reuse the local host's public Mapbox token. Cloud consumers can set
`VITE_MAPBOX_ACCESS_TOKEN` to their public Mapbox token at build time. Geographic
coordinates must use WGS84 longitude/latitude. The parser supports points, lines,
polygons, geometry collections, GPX routes/tracks, and KML placemarks.

Record, configuration, profile, and archive parsing runs in a worker with a
30-second timeout. Archive limits are 64 MiB compressed, 128 MiB expanded,
32 MiB per previewable member, and 2,000 entries; nested browsing stops after two
archive levels. Encrypted and multi-volume ZIP files are unsupported. Native
trace handoff is bounded to 64 MiB; local .nettrace conversion allows 256 MiB
input, 32 MiB output, and 60 seconds. The inline trace view covers synchronous
spans and reports omitted async/counter events. Use Perfetto for full trace
analysis. HTML previews do not execute JavaScript-dependent report applications.

Run `node --test tests/artifactPreviews.test.mjs` for the parser checks. With the
development server running, open `/tests/fixtures/artifact-previews.html` for
interactive fixtures. Packaged consumers receive these features when their
pinned player archive is updated through the normal release workflow.
