# V3 Code — Architecture overview

This is the short, reader-friendly tour of V3. The load-bearing
definitions live in [V3_CODE_SPEC.md](../V3_CODE_SPEC.md); this doc
points to the interesting files and explains the shape, not the
specifics.

---

## What V3 Code is

V3 Code is a fork of [T3 Code](https://github.com/pingdotgg/t3code). T3
is a local, single-device web GUI that brokers Codex and Claude
coding-agent sessions over a WebSocket. V3 keeps all of that and adds
a **mesh**: any number of client devices talk to a server node the user
runs themselves, so chats sync across desktops, laptops, phones, and an
on-server Docker sandbox ("Cloud env").

Two deployment shapes are supported from the same code base:

1. **Single-device / desktop**: the Electron shell spawns the server
   in-process, SQLite holds state, nothing leaves the machine. This is
   what you get if you never sign in with Google.
2. **Server-node**: the server runs standalone (on a Mini PC, a VPS, or
   Fly.io/Railway), Postgres holds state, client devices authenticate
   with Google and discover the URL through Drive App Data. The
   `server-node` runtime mode is selected by CLI flag / env /
   `~/.v3-code-server/config.toml` presence — see
   [serverMode.ts](../apps/server/src/serverMode.ts).

---

## Runtime layout

```
apps/
├── server/            Effect-TS backend. HTTP + WebSocket + orchestration.
├── web/               React SPA. Compiled twice — bundled with the server
│                      for desktop, and as a "cloud-mode" bundle for
│                      remote hosting (VITE_V3_CLOUD_MODE=1).
├── desktop/           Electron shell. Bundles the server as a child process.
├── mobile/            Capacitor 6 wrap of apps/web for Android.
├── cloud-env-image/   Dockerfile for the per-chat Cloud env container.
└── marketing/         Astro static site (v3code.com).

packages/
├── contracts/         Effect Schemas for every protocol boundary.
├── shared/            Pure utilities (paths, git, net, logging).
├── client-runtime/    Browser/mobile mesh client + Drive App Data client.
└── effect-acp/        ACP (Agent Client Protocol) transport bridge.
```

The monorepo is Bun + Turbo. Build graph is declared in `turbo.json`;
quality gates run with `bun run fmt:check`, `bun run lint`,
`bun run typecheck`, `bun run test`.

---

## Identity and discovery

Spec §3 is the authoritative version. Short form:

- **Google Sign-In** carries identity. Desktop uses a loopback PKCE
  flow; browser/cloud-mode uses the hosted web flow. Tokens go to the
  OS keychain (desktop) or IndexedDB (web). Scopes: `openid profile
email` + `https://www.googleapis.com/auth/drive.appdata`.
- **Drive App Data** stores the server URL and a list of devices under
  `v3_config`. On sign-in, the client reads this to find its server
  node. If absent, the UI walks the user through first-time setup.
- **GitHub OAuth** lives on the server node only. The token is
  encrypted at rest with AES-256-GCM
  ([tokenEncryption.ts](../apps/server/src/identity/tokenEncryption.ts))
  and never leaves the server — Cloud env chats request ephemeral
  per-container git credentials through
  [GitHubAppAuth.ts](../apps/server/src/cloud/GitHubAppAuth.ts).
- **Device approval** uses a bootstrap rule: first device auto-approves;
  subsequent new devices require an approval signal from an already
  online, approved device ([DeviceApprovalService.ts](../apps/server/src/identity/Layers/DeviceApprovalService.ts)).

---

## The mesh protocol

Every client device maintains a single persistent WebSocket to the
server node. Messages use Effect-RPC over that WebSocket — the wire
format, envelope, and error model are defined in
[packages/contracts/src/mesh/](../packages/contracts/src/mesh/) and
fully described in [api-reference.md](./api-reference.md).

The operational guarantees:

- **Ordering**: every chat has a monotonic `seq`; the server stores
  `(chat_id, seq)` unique. Clients gap-fill on reconnect by asking for
  `fromStreamVersionExclusive`.
- **Reconnection**: clients back off with the curve `1s, 2s, 4s, 8s,
16s, 30s, 30s` (spec §5.1). Code:
  [wsConnectionState.ts](../apps/web/src/rpc/wsConnectionState.ts).
- **Presence**: tied to WebSocket liveness. Every open session counts
  toward a device being online; the last session to close flips it
  offline and broadcasts a `presence_update` to other user devices.
  Code: [DeviceRegistry.ts](../apps/server/src/mesh/Layers/DeviceRegistry.ts).
- **Routing**: prompts from non-host viewers get forwarded to the host
  device via `send_prompt_forward`. Offline hosts reject with
  `device_offline` (spec §6.4, §9.1); V3 never queues across disconnects
  in v1.

The orchestration layer (event store, projection tables, turn
lifecycle) is the T3 Code inheritance; V3 adds the `chat_events` mesh
stream as a fan-out sink on top.

---

## Cloud env

Cloud env is a "virtual" device per user that's really Docker
containers running on the server node. Spec §7 is the full story.

Flow:

1. User picks "Cloud" as the host for a new chat + a GitHub repo/branch.
2. Server node calls
   [ContainerManager.ts](../apps/server/src/cloud/Layers/ContainerManager.ts)
   to launch `v3-chat-{chat_id}` from `ghcr.io/v3-code/cloud-env:latest`
   (built from [apps/cloud-env-image/Dockerfile](../apps/cloud-env-image/Dockerfile)).
3. Server injects an ephemeral GitHub token and pipes `git clone` +
   `claude`/`codex` CLIs into the container.
4. A background loop (`CloudLifecycleLive`, 60 s cadence) enforces the
   §7.2 runtime caps (CPU, RAM, disk, max runtime hours) and reaps
   violators.

Cloud containers hold no persistent state. The user's GitHub repo is
the storage medium; anything uncommitted dies with the container.

---

## Data model

The server stores:

- Identity: `v3_users`, `v3_devices`, `v3_device_sessions`.
- Orchestration: `orchestration_events`, `orchestration_command_receipts`,
  projections (`projection_threads`, `projection_thread_messages`, …).
- V3 extensions: thread shells carry `host_device_id`, `fork_lineage`,
  `remote_id`, `last_synced_seq`, and mesh sync metadata.

Both SQLite (desktop) and Postgres (server-node) migrations are in
[apps/server/src/persistence/](../apps/server/src/persistence/). They
share the same projection code via a persistence-layer selector.

The client SQLite cache mirrors the server with a thin `remote_*`
namespace for events the device doesn't host; see
[client-runtime](../packages/client-runtime/src/).

---

## Deployment shapes

- **Desktop (single-device)**: Electron spawns the server, SQLite,
  localhost only. No Google sign-in. No mesh code paths activate.
- **Server-node, self-host**: systemd + Docker + Postgres on your own
  machine. TLS via Cloudflare Tunnel (recommended) or Caddy / Nginx.
  See [deploy-vps.md](./deploy-vps.md) and [deploy-self.md](./deploy-self.md).
- **Server-node, Fly.io / Railway**: one-click templates in
  `deploy/flyio/` and `deploy/railway/`. Walkthroughs in
  [deploy-cloud.md](./deploy-cloud.md).
- **Web (cloud-mode)**: the server node serves `/app/*` from the
  `VITE_V3_CLOUD_MODE=1` build. Optionally published to Cloudflare
  Pages at a separate hostname; see
  [deploy/cloudflare-pages/README.md](../deploy/cloudflare-pages/README.md).

---

## Observability + release

Tracing, logs, and OTLP export are documented in
[observability.md](./observability.md). Release mechanics (versioning,
desktop artifact builds, smoke tests, update server) are in
[release.md](./release.md).

When you're debugging something user-facing, start with
[troubleshooting.md](./troubleshooting.md).
