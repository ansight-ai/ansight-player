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
- `dist/local`: the complete local HTML/JavaScript/CSS application embedded by the CLI host.

The versioned `@ansight/player` package contains both compiled outputs, TypeScript
declarations and licence notices. Its exports use `dist/library`; `src/` stays in
this repository and is excluded from release packages.
React and React DOM are peer dependencies so an embedding application shares its
own React instance. The player has no dependency on the SDK, CLI source, cloud
repository, Supabase client or cloud credentials.

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
details retain their existing markers.

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
