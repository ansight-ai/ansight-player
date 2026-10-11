# Ansight Replay — local MCP Apps MVP

A screenshot scrubber rendered by an MCP Apps host. It uses Ansight's frame,
touch and annotation contracts, with a compact UI for chat and the Ansight orange
brand. Saving an annotation writes to the local recording through the same API
as the full Ansight viewer. Recordings are not uploaded to Ansight Cloud.

## Build and run

Requires Node.js 24+, the Ansight CLI, and a running Ansight host containing a
recorded capture with screenshots. `ANSIGHT_BIN` can override the CLI executable;
otherwise the server tries `~/.local/bin/ansight`, then `ansight` on PATH.

```sh
npm ci
npm run build
npm test
npm run test:live -- <session-id>
npm run preview
```

The preview prints a temporary loopback URL. It uses the official MCP Apps host
bridge and the exact widget HTML served to ChatGPT. The preview's “Ask about this
moment” displays the message locally; it does not send a chat message.

## Connect to a local Codex / ChatGPT desktop host

Configure the immutable server path in `dist/build.json` as a STDIO MCP server
with `node` as the command and its absolute installed path as the argument.
The build writes `dist/releases/<build>/server.mjs` with its matching widget
assets. Use that path for installed builds so an update changes the MCP connection
configuration, and keep that release directory intact. Alternatively install this folder
as a local plugin; `.mcp.json` resolves the bundled server from the plugin root.
Start a new chat after installation so the new tools are available, then ask:

> Show my latest Ansight replay inside the chat.

The installed host must support MCP Apps UI resources and tool calls from the
widget. A successful standalone preview or MCP protocol test does not by itself
verify rendering in the installed ChatGPT client.

After an update, a fresh chat's `show_replay` response must include the matching
`viewerBuild` from `dist/build.json` and `touchCount`. A response listing only
screenshots and markers is the old server. Reload the plugin's MCP connection
before testing again; an existing rendered card does not update in place. Each
build uses a distinct UI resource URI to prevent reuse of the old widget.
Verify the installed entrypoint with
`npm run test:live -- <session-id> <absolute-installed-server-path>`.

## Tools and data flow

- `list_replays`: lightweight local session discovery with search and pagination.
- `show_replay`: UI resource + concise model-visible metadata; frame index,
  annotations, and initial screenshot live in UI-only `_meta`.
- `get_replay_frames`: UI-only batches of up to six screenshots. The server
  checks membership in the selected recording, resolves the host via the CLI,
  and reads only loopback frame routes. Redirects are rejected.
- `refresh_replay_annotations`: reload native annotations, including edits from
  the full viewer, without losing the selected position.
- `create_replay_annotation`: UI-only write tool. Creates a native point or
  rectangle annotation after Save, then reads the persisted record back. It
  cannot overwrite an existing annotation with different content.
- `read_replay_annotation`: gives the model the saved annotation and its actual
  screenshot when the user asks ChatGPT to act on it.

The widget has no direct network access. Frames travel through the MCP bridge
and a bounded browser cache. Seeking updates model-visible timestamp and frame
IDs. `show_replay` does not give the model screenshot pixels;
`read_replay_annotation` explicitly returns the saved annotation and screenshot.

## Annotations

Choose **Annotate screenshot**, click for a point or drag a rectangle, and enter
a comment and optional status. This matches Ansight's gesture and data model:
numeric geometry kinds, normalized frame coordinates, exact frame timestamp,
annotation/capture group ID, label from the first comment line, and remaining
lines in notes. No visual-tree target is invented.

**Save annotation** persists the annotation in the recording. **Save & ask
ChatGPT** also sends an explicit follow-up in the current chat. Selecting an
existing marker exposes **Ask ChatGPT to act**. The preview logs that message
locally; actual delivery requires an MCP Apps chat host.

## Distribution

This is a local desktop beta. Recipients need Node.js 24+, the Ansight CLI, and
their own running local host. The developer install on this machine points to
an absolute runtime path and is not itself a shareable release.

For a desktop release, package `.codex-plugin/`, `.mcp.json`, `assets/`,
`dist/build.json`, the release directory it identifies, and a runtime package with the pinned
`sharp` dependency. Install Sharp on the recipient's platform; do not copy this
Mac's native `node_modules` to other operating systems. Configure the recipient's
Node executable and immutable installed server path. Put that package in a Git-backed
plugin marketplace or distribute it through a local installer. The source
`.mcp.json` uses a plugin-root-relative server path; the developer install uses
an absolute path for predictable local testing.

Codex supports Git marketplace registration with
`codex plugin marketplace add owner/repo`, followed by
`codex plugin add ansight-replay@marketplace-name`. A release repository must
include its marketplace catalog and built runtime, since this source checkout
ignores `dist/`. Do not publish the recordings or local host URLs with the plugin.

For public ChatGPT directory distribution, replace local STDIO/loopback access
with a hosted HTTPS MCP endpoint and authenticated access to permitted Ansight
recordings, then submit the plugin package for review. That remote adapter and
release packaging are not implemented by this local MVP.

Official guidance: [plugin packaging](https://developers.openai.com/plugins/build/plugins)
and [submission](https://developers.openai.com/plugins/deploy/submission).

## External annotations and the same chat

An event integration can expose `annotation.created`, filtered by session ID.
The user subscribes in the chat and gives instructions for handling new feedback;
the server stores the subscription, sends signed events with stable IDs, and
deduplicates delivery. Ignore agent-created updates to prevent feedback loops.

[MCP Events](https://developers.openai.com/plugins/build/mcp-events) currently
supports Work chats on ChatGPT web and desktop Work with Cloud selected. Events
arrive in the subscribed chat. This local STDIO plugin does not implement those
webhooks. A thread heartbeat could periodically check for new annotation IDs
locally. Neither event delivery nor a scheduled monitor has been configured.

## MVP boundaries

The timeline retains screenshot timing; it is not an encoded video. The capture is
a snapshot taken when `show_replay` runs. Reload to pick up later capture changes.
Includes a scrubber, previous/next screenshot and touch, marker jumps,
fullscreen, a full-detail replay link, recorded touch rings and swipe trails,
and native point/rectangle annotation creation. Touch overlays are on by default
and use capture time, including held contacts and a 1.6-second release fade.
There are no play/pause or speed controls.
Does not include logs, editing/deleting existing annotations, audio, cloud sharing,
or public ChatGPT web connectivity. A remote deployment needs authentication and
an explicit recording access design; this server is intentionally local-only.

UI data survives only as long as the recording remains on the local host. Images
are capped at 32 MiB at source. Large frames are resized and compressed in memory
for the widget, with a 2 MiB display limit; originals stay untouched. Captures
are capped at 10,000 screenshots for this MVP. At most 10,000 touch samples are
loaded; partial touch evidence is explicitly labelled and links to the full viewer.
Private recording data is never written into the source tree or build output.
