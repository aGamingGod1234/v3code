# MESH_CHANGES — Fork delta vs upstream T3 Code

V3 Code is a fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code).
This file lists every meaningful change V3 made on top of T3, organised
by area. It is intentionally high-level — use it as a map when
rebasing against a new T3 tag. The spec that drives most of this lives
at [V3_CODE_SPEC.md](./V3_CODE_SPEC.md).

When in doubt, `git log --grep='feat(v3)'` is the definitive history.

---

## New packages

| Package                              | Status   | Purpose                                                                                                                    |
| ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/mesh/*`      | **new**  | WS message schemas (`chat`, `device`, `push`). See [api-reference.md](./docs/api-reference.md).                            |
| `packages/client-runtime`            | **new**  | Browser + mobile mesh client. Wraps the WS RPC client and Drive App Data client; consumed by `apps/web` and `apps/mobile`. |
| `packages/contracts/src/cloud.ts`    | **new**  | Cloud env types (container lifecycle, GitHub state).                                                                       |
| `packages/contracts/src/identity.ts` | **new**  | `DeviceInfo`, `UserId`, `DeviceKind`, capability enum, device approval stream events.                                      |
| `packages/contracts/src/admin.ts`    | **new**  | Admin-panel payload schemas.                                                                                               |
| `packages/effect-acp`                | vendored | Agent Client Protocol transport over Effect Streams. Not V3-specific but pulled in fresh.                                  |

---

## New server subtrees

All under `apps/server/src/`:

| Directory                                                           | Status | Purpose                                                                                                              |
| ------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `auth/`                                                             | new    | Session credential service, bootstrap credentials, server secret store.                                              |
| `identity/`                                                         | new    | Google + GitHub OAuth flows, device approval state machine, FCM push config, user context resolver.                  |
| `mesh/`                                                             | new    | WebSocket handlers for mesh RPC, chat subscription manager, presence broadcaster, prompt router.                     |
| `cloud/`                                                            | new    | Cloud env container manager + lifecycle, GitHub App auth, preview proxy, HTTP admin routes.                          |
| `admin/`                                                            | new    | `/admin` HTTP routes for the server-node admin panel.                                                                |
| `config/`                                                           | new    | `~/.v3-code-server/config.toml` loader + schema.                                                                     |
| `persistence/PostgresMigrations/*`                                  | new    | Postgres equivalents of the upstream SQLite migrations + V3-specific migrations (identity, mesh sync, fork lineage). |
| `serverMode.ts`, `serverRuntimeStartup.ts`, `serverRuntimeState.ts` | new    | Runtime mode detection (`web` / `desktop` / `server-node`) and startup sequencing.                                   |

---

## Modified upstream files

Organised by phase from the spec §13 roadmap.

### Phase 0 — Foundation

- `package.json`, `turbo.json`, all app-level `package.json` — renamed from `@t3*` scope to `@v3tools`.
- `apps/desktop/src/*` — rebranded window chrome, new menu items (Settings → Server Node, Devices).

### Phase 1 — Identity

- `apps/desktop/src/v3GoogleAuthFlow.ts` — Electron-side Google PKCE flow.
- `apps/server/src/bootstrap.ts` — reads a bootstrap envelope from an
  FD so Electron can hand V3 a session without writing secrets to disk.
- `apps/server/src/http.ts` — mounts the `/auth/google/*` and
  `/auth/github/*` routes.
- `apps/web/src/main.tsx` — wires the V3 sign-in overlay.

### Phase 2 — Server-node mode + Drive discovery

- `apps/server/src/cli.ts` — `--mode server-node` flag, config.toml
  precedence, new env vars (`V3CODE_GOOGLE_*`, `V3CODE_GITHUB_*`,
  `V3CODE_CLOUD_ENV_*`, `V3CODE_MAX_*`).
- `apps/server/src/config.ts` — `RuntimeMode` union + `ServerConfigShape`
  extensions for the spec §10.4 config keys.
- `packages/client-runtime/src/drive/` — Drive App Data read/write,
  retries with exponential backoff, manual override fallback.

### Phase 3 — Sidebar rewrite + presence

- `apps/web/src/components/sidebar/DeviceSidebar.tsx` and friends
  (`DeviceGroup`, `ChatItem`, `SignedInBar`, `ArchivedSection`,
  `LegacyProjectSidebar`).
- `apps/web/src/components/chat/ConfigureServerBanner.tsx` — banner
  shown when 2+ devices exist in Drive App Data but no server is
  configured.
- `apps/web/src/hooks/useShouldShowConfigureBanner.ts` — the banner's
  visibility state machine.

### Phase 4–5 — Chat sync + cross-device prompts

- `apps/server/src/mesh/meshWsHandlers.ts` — all RPC handlers.
- `apps/server/src/mesh/Layers/ChatSubscriptionManager.ts` — per-chat
  PubSub with replay from `OrchestrationEventStore`.
- `apps/server/src/mesh/Layers/PromptRouter.ts` — routes remote-viewer
  `send_prompt` calls to the host device.
- `apps/web/src/components/ChatView.tsx` — remote-host awareness
  (disabled input, send toast, `RemoteHostBanner`).

### Phase 6 — Fork chat

- `packages/contracts/src/orchestration.ts` — `ChatForkCommand`,
  `thread.forked` event.
- `apps/server/src/mesh/Services/ChatSubscriptionManager.ts` — fork
  copies event log with `parent_chat_id` / `parent_device_id`.
- `apps/web/src/components/chat/ForkChatButton.tsx`,
  `ForkAcceptDialog.tsx` — UX.

### Phase 7 — Web cloud-mode

- `scripts/build-web-cloud.ts` — `VITE_V3_CLOUD_MODE=1` build.
- `apps/server/src/http.ts` — serves the cloud bundle at `/app/*`.
- `deploy/cloudflare-pages/` — optional hosted Pages target.

### Phase 8 — Cloud env

- `apps/cloud-env-image/Dockerfile` — Ubuntu 24.04 + Node 22 + Python
  3.12 + uv + Claude/Codex CLIs + ripgrep/fd/bat/jq.
- `apps/server/src/cloud/Services/ContainerManager.ts` — dockerode
  wrapper for launch / stop / prune / stats.
- `apps/server/src/cloud/Layers/CloudLifecycle.ts` — the 60 s
  container-monitor loop (spec §7.4).
- `apps/server/src/cloud/GitHubAppAuth.ts` — ephemeral per-container
  git credential minting.
- `apps/web/src/components/cloudMode/CloudChatCreateDialog.tsx` and
  `GitHubRepoBrowser.tsx` — new-chat wizard for Cloud env.

### Phase 9 — Android

- `apps/mobile/` — entire Capacitor 6 wrap of `apps/web`.
- `apps/server/src/identity/Services/FcmPushConfigRepository.ts` —
  FCM service-account state.
- `apps/server/src/mesh/Services/FcmPushService.ts` — fan-out to
  registered devices.
- `apps/server/src/identity/Services/DevicePushTokenRepository.ts` —
  token registration.

### Phase 10 — Polish (subagent UI, preview, element inspector)

- `apps/web/src/components/*Subagent*` — subagent chat rendering.
- `apps/server/src/preview/*` and `apps/server/src/cloud/previewProxy.ts`
  — reverse-proxy into Cloud env dev servers.
- Element inspector wiring in `ChatView.tsx` + `apps/web/src/environments/`.

### Phase 11 — Release hardening (you are here)

- `README.md` rewrite to V3.
- `LICENSE` — dual copyright (T3 + V3 fork).
- `apps/marketing/*` — rebranded Astro landing + download pages,
  repo URL switched to `aGamingGod1234/v3code`.
- `docs/architecture.md`, `docs/api-reference.md`,
  `docs/troubleshooting.md`, `docs/deploy-self.md`,
  `docs/deploy-cloud.md`, `docs/deploy-vps.md` — spec §12 doc set.

---

## Deleted / replaced upstream behaviour

- T3 Code's single-flat-thread-list sidebar is replaced with
  `DeviceSidebar` (fallback `LegacyProjectSidebar` when not signed in).
- Default auth is a bearer-token cookie issued by T3; V3's
  `server-node` mode replaces that with a Google-verified session.
  The T3 bearer path is preserved verbatim for `web` / `desktop`.
- Upstream's single-process desktop flow still works; V3 adds a
  `server-node` mode that runs the same code standalone.

---

## Rebase strategy

When upstream T3 ships a new tag:

1. `git fetch t3 && git log main..t3/main` — read the upstream delta.
2. Walk this file section-by-section; any upstream file listed above
   may have merge conflicts in known places.
3. After the merge, run `bun run build && bun run typecheck && bun run test`.
4. Smoke-test: fresh desktop sign-in, server-node sign-in from a second
   device, Cloud env chat create.

Spec §14 flags known compat edges (T3 Code upstream drift, multi-account
on same device, server-node migration export/import).
