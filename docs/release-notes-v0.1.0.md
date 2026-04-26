# V3 Code v0.1.0 — release notes (draft)

**Draft release notes.** Replace this file with the final changelog
once the `v0.1.0` tag is cut; keep it as a template for later
releases.

---

## The short version

V3 Code v0.1.0 is the first public cut of V3 Code — a self-hosted,
multi-device coding-agent GUI forked from
[T3 Code](https://github.com/pingdotgg/t3code). Run it single-device
and it behaves exactly like T3 Code. Flip on server-node mode and
your desktop, laptop, phone, and on-server Docker sandboxes all sync
through a WebSocket mesh you host yourself.

Beta-grade. Single-device inherits T3 Code's maturity; mesh layer is
stabilising. Read [docs/troubleshooting.md](./troubleshooting.md)
before filing anything.

---

## What's in the box

### Multi-device mesh (Phases 1–6)

- Google sign-in on desktop (loopback PKCE) and web (hosted flow).
  Server-node-side ID token verification against Google JWKS. Drive
  App Data auto-discovery of the server URL.
- GitHub OAuth with encrypted-at-rest token storage (AES-256-GCM).
  Desktop runs the consent UI in the user's system browser via a
  loopback callback (matches Google sign-in), not inside the Electron
  window; web/cloud-mode keeps the server-hosted redirect flow.
- Device approval with bootstrap rule: first device auto-approves;
  subsequent new devices need sign-off from an already-connected
  device. When two or more devices sign in on the same Google
  account without a published server URL, the Devices settings
  panel prompts the user to run the server-node setup wizard and
  walks them through it step-by-step.
- WebSocket mesh with gap-fill replay, spec-§5.1 backoff curve
  (1-2-4-8-16-30 s), and session-based presence.
- Cross-device prompt forwarding with offline-host rejection +
  "Can't send. {name} is offline. [Open on another device]" action.
- Chat fork across devices, preserving event lineage.

### Cloud env (Phase 8)

- Ubuntu 24.04 + Node 22 + Python 3.12 + uv + Claude/Codex CLIs +
  ripgrep/fd/bat/jq, published to `ghcr.io/v3-code/cloud-env:latest`
  on every tagged release.
- Container manager with per-chat `v3-chat-{id}` naming, 60-second
  resource monitor loop enforcing §7.2 caps (2 CPU, 4 GB RAM, 20 GB
  disk, 720 h max runtime).
- Preview reverse-proxy for in-container dev servers.
- Ephemeral GitHub credentials minted per chat.

### Web cloud mode + admin panel (Phases 7 + 8)

- `VITE_V3_CLOUD_MODE=1` build served at `/app/*` on every server
  node; optionally published as a Cloudflare Pages site at a
  separate hostname.
- `/admin` panel with WS session list, container state, D1/Postgres
  stats, event log size per chat, Docker daemon health, log viewer,
  "kill all Cloud containers" button.

### Android (Phase 9)

- Capacitor 6 wrap of the cloud-mode web bundle, shipped through the
  Play Store internal testing channel.
- FCM push for chat-response-while-backgrounded, device approval
  requested, Cloud container killed events. Token registration is
  now wired end-to-end (was a Phase 9 gap, fixed in the v0.1.0
  push).
- Foreground service + notification while a chat is actively
  streaming.

### Deploy templates (spec §10)

- Self-host on your own machine ([docs/deploy-self.md](./deploy-self.md)).
- Manual VPS install ([docs/deploy-vps.md](./deploy-vps.md)).
- One-click Fly.io ([deploy/flyio/](../deploy/flyio/)).
- Railway template ([deploy/railway/](../deploy/railway/)).
- Cloudflare Pages (cloud-mode web bundle only)
  ([deploy/cloudflare-pages/](../deploy/cloudflare-pages/)).
- Cloudflare Workers + D1 + R2 + Containers (experimental, spec
  §10.2c) ([deploy/cloudflare-workers/](../deploy/cloudflare-workers/)).

---

## Spec-compliance fixes in this release

- Reconnect backoff clamps at 30 s (was 64 s).
- Cloud env prune cadence tightened to 60 s (was 5 min).
- `[limits].max_devices_per_user` + `max_chats_per_user` enforced
  with typed errors and HTTP 409 on over-limit device registrations.
- Proactive Google ID-token refresh scheduler; long-lived tabs no
  longer drop back to the sign-in dialog at ~1 h.
- Offline-host toast now carries an "Open on another device" action
  that opens the fork dialog on the active chat.

---

## Known gaps

- Cloudflare Containers public beta: the Worker template ships today
  but `previewProxy` + container lifecycle adapters are behind a
  feature flag until the beta API surface goes GA.
- No queueing across host disconnects. Spec §6.4 flags this as
  explicitly-not-in-V1. Revisit post-launch once we have telemetry on
  how often users hit offline hosts.
- Server-node export/import (spec §14.7) — not yet built. If you
  outgrow your Mini PC you can't seamlessly migrate to a VPS.
- iOS build. Android is in Play Store internal testing; iOS waits on
  the Capacitor iOS target landing.

---

## Upgrading

No upgrades — this is the first public cut. Subsequent releases will
follow the Phase schedule in [V3_CODE_SPEC.md §13](../V3_CODE_SPEC.md).

---

## Credits

V3 Code is forked from [T3 Code](https://github.com/pingdotgg/t3code)
by T3 Tools Inc. (MIT). Both copyrights are retained. Thanks to the
T3 team for the upstream work that makes this fork possible.
