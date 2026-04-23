# V3 Code

V3 Code is a self-hosted, multi-device coding-agent GUI built on top of
[T3 Code](https://github.com/pingdotgg/t3code). It turns T3 Code's
single-device experience into a mesh: your desktop, laptop, phone, and
a cloud sandbox all share the same chats through a server node you host
yourself.

- **Works offline, single-device, no account** — pure T3 Code
  experience, free, nothing touches anyone else's infra.
- **Multi-device is opt-in** — flip on "server node" mode on one of your
  machines (or deploy one to Fly.io / Railway / a VPS) and the rest of
  your devices auto-discover it through your Google account.
- **Cloud env chats** — ephemeral Docker containers on your server node,
  linked to your GitHub repos. Git clone, git push, `gh pr create`, all
  inside a per-chat sandbox.
- **You own the data and the infra** — there is no hosted V3 service.

The design doc is [V3_CODE_SPEC.md](./V3_CODE_SPEC.md). The shorter
architecture summary lives in [docs/architecture.md](./docs/architecture.md).

> [!WARNING]
> V3 Code is **beta**. The single-device experience inherits T3 Code's
> maturity, but the mesh layer (Phase 4+) is still stabilising. Don't
> expose a server node to the open internet without reading
> [docs/deploy-vps.md](./docs/deploy-vps.md) first.

---

## Install

V3 Code ships as an Electron desktop app + an Android build + a web
bundle. Pick the path that matches what you want.

### Single-device (default, no account)

Install the desktop app from [GitHub Releases](https://github.com/aGamingGod1234/v3code/releases).

#### Windows

```bash
winget install aGamingGod1234.V3Code
```

#### macOS

```bash
brew install --cask v3code
```

#### Linux (AppImage)

Grab the `.AppImage` from the latest release, `chmod +x`, run.

#### Android

V3 Code for Android is distributed through the Play Store internal
testing channel. See [docs/troubleshooting.md](./docs/troubleshooting.md#android)
for how to enroll.

### Run without installing

```bash
bunx @v3tools/v3 --help
```

Launches the server + web UI at `http://localhost:3773`. Single-device
mode; no Google sign-in required.

### Providers

Install and authenticate at least one coding agent before using V3:

- **Codex** — [Codex CLI](https://github.com/openai/codex), then `codex login`.
- **Claude Code** — install Claude Code, then `claude auth login`.

---

## Multi-device quickstart

1. Pick a machine to run the server node on. Options:
   - **Self-host** on a Mini PC / home server → [docs/deploy-self.md](./docs/deploy-self.md)
   - **One-click Fly.io / Railway** → [docs/deploy-cloud.md](./docs/deploy-cloud.md)
   - **Manual VPS** → [docs/deploy-vps.md](./docs/deploy-vps.md)
2. Start V3 on the server node in `server-node` mode and complete the
   setup wizard. It will:
   - verify Docker is running,
   - start Postgres,
   - expose the node publicly via Cloudflare Tunnel (or a URL you
     provide), and
   - write the final URL to your Google Drive App Data.
3. Sign in to V3 on your other devices with the same Google account.
   They discover the server URL from Drive App Data and show up in the
   sidebar as online devices.
4. Start a chat; pick any host device (or `Cloud`) from the new-chat
   dialog.

The sync protocol, message taxonomy, and event log are documented in
[docs/api-reference.md](./docs/api-reference.md).

---

## Repo layout

```
v3-code/
├── apps/
│   ├── desktop/          Electron shell (inherited from T3)
│   ├── server/           Effect-TS backend + mesh hub
│   ├── web/              React SPA + cloud-mode bundle
│   ├── mobile/           Capacitor 6 Android wrap
│   ├── cloud-env-image/  Dockerfile for per-chat containers
│   └── marketing/        v3code.com (Astro)
├── packages/
│   ├── contracts/        Shared Effect Schemas (T3 + V3 mesh)
│   ├── shared/           Utilities (git, net, paths, …)
│   ├── client-runtime/   Browser + mobile mesh client
│   └── effect-acp/       ACP transport bridge
├── deploy/               Fly.io, Railway, Cloudflare Pages templates
├── docs/                 Deploy, architecture, API, troubleshooting
└── V3_CODE_SPEC.md       Source of truth
```

Every cross-file mesh change is documented in [MESH_CHANGES.md](./MESH_CHANGES.md)
so rebasing against upstream T3 Code stays mechanical.

---

## Development

```bash
# Optional: install dev tools via mise.
mise install

bun install
bun run build
bun run dev       # server + web + desktop in parallel
```

Per-app dev scripts: `bun run dev:server`, `bun run dev:web`,
`bun run dev:desktop`, `bun run dev:marketing`.

Quality gates (all must pass before a PR merges):

```bash
bun run fmt:check
bun run lint
bun run typecheck
bun run test
```

Release engineering notes live in [docs/release.md](./docs/release.md).
Observability is in [docs/observability.md](./docs/observability.md).

---

## Contributing

V3 is accepting small, spec-aligned contributions — see
[CONTRIBUTING.md](./CONTRIBUTING.md) for the short version.

Bug reports and reproduction steps are always welcome at
[GitHub Issues](https://github.com/aGamingGod1234/v3code/issues).

Discord: [discord.gg/jn4EGJjrvv](https://discord.gg/jn4EGJjrvv).

---

## License

MIT. See [LICENSE](./LICENSE). V3 Code is a fork of
[T3 Code](https://github.com/pingdotgg/t3code) by T3 Tools Inc.; both
copyrights are retained.
