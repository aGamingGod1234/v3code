# V3 Code — Master Implementation Plan

**Source spec:** `C:\Users\lucas\Downloads\V3_CODE_SPEC.md` (v0.1, 2026-04-18)
**Fork target:** `pingdotgg/t3code` → `agaminggod1234/v3code`
**Working copy:** `C:\Users\lucas\Desktop\Projects\V3 code`
**Plan authored:** 2026-04-18, synthesized from 10 parallel Opus 4.7 research/exploration agents.

This plan **supersedes** the spec wherever the existing T3 Code codebase has already solved a concern or where the research invalidated a spec assumption. The spec remains the product north star; this file is the engineering execution blueprint.

**Decisions locked by Lucas on 2026-04-18 (all 4 critical Qs):**

- Q1 → **Server-authoritative seq** (D2)
- Q2 → **Extend existing ServerAuth, skip Better Auth** (D3)
- Q3 → **`@effect/sql-pg` for Postgres, no Drizzle** (D5)
- Q4 → **Server-encrypted creds, inject per container via tmpfs** (D7)

Detailed per-domain reports (written by the 10 sub-agents) live at:

- Server infra — `c-users-lucas-downloads-v3-code-spec-md-dynamic-boole-agent-a375a2df916f9b242.md`
- Subagent viewer — `c-users-lucas-downloads-v3-code-spec-md-dynamic-boole-agent-a35410c827e647780.md`
- Browser/preview — `c-users-lucas-downloads-v3-code-spec-md-dynamic-boole-agent-a48dbce23e3954289.md`
- Cloud env Docker — `c-users-lucas-downloads-v3-code-spec-md-dynamic-boole-agent-a7ce9d5dbb59723e9.md`
- Monorepo + roadmap — `c-users-lucas-downloads-v3-code-spec-md-dynamic-boole-agent-aae840e12a357a183.md`
- (Auth, Data model, Sync protocol, Chat lifecycle, UI reports are inlined below in §6–§11.)

---

## 1. Context

**Why:** Lucas wants T3 Code (a single-device coding-agent GUI) to become a personal self-hosted multi-device mesh: one server node per user (home PC / Fly / Railway / VPS), mesh sync across their Desktop, Laptop, Mini PC, Phone, and a Cloud env, with Google Sign-In as identity and GitHub OAuth for Cloud-env repo access. Target ship: 7–9 months.

**What's already in the V3 code directory (critical findings from agents):**

- **It's a pristine source extraction, NOT yet a git fork** — no `.git` dir. Phase 0 must start with a real fork + `upstream` remote.
- T3 Code is deep **Effect-TS** with Effect 4.0 beta: `@effect/platform-node`, `@effect/platform-bun`, `@effect/sql-sqlite-bun`, `@effect/vitest`, `effect/unstable/rpc`.
- The server is **Effect RPC over WebSocket**, not envelope-WS. Files: `apps/server/src/ws.ts` (1091 lines), `apps/server/src/server.ts`, `apps/server/src/serverRuntimeStartup.ts` (readiness barrier), `apps/server/src/serverLifecycleEvents.ts` (lifecycle pubsub), `apps/web/src/rpc/{wsTransport,protocol,wsRpcClient,wsConnectionState,transportError}.ts`.
- **Auth scaffolding is already 70% of the V3 spec.** `apps/server/src/auth/{Services,Layers}/` contains `ServerAuth`, `ServerAuthPolicy`, `BootstrapCredentialService`, `SessionCredentialService`, `ServerSecretStore`, HMAC-signed tokens with 30-day rotation, pairing credential flow, Electron `safeStorage` client persistence, pairing URL with `#token=…` handoff. `.plans/18-server-auth-model.md` is partially landed.
- **Event sourcing exists.** `OrchestrationEngine` writes `orchestration_events` with `(aggregate_kind, stream_id, stream_version)` unique constraint — V3's per-chat `seq` maps directly to `stream_version` on `thread` streams. 25 migrations already shipped. `.plans/14-server-authoritative-event-sourcing-cleanup.md` + `.plans/spec-1-1-cutover-plan.md` land stream-version enforcement as "next work".
- **Reconnection w/ exponential backoff already implemented** in `apps/web/src/rpc/wsConnectionState.ts` (schedule 1s→64s, 7 retries). `WsTransport.subscribe` auto-resubscribes on reconnect via `onResubscribe` callbacks.
- **Multi-environment already modeled** via `ExecutionEnvironment` / `KnownEnvironment` / `AccessEndpoint` in `.docs/remote-architecture.md` and `packages/client-runtime`. Each T3 server is a first-class env; V3 devices are the next layer up.
- **`collab_agent_tool_call`** already in `ToolLifecycleItemType` (`packages/contracts/src/providerRuntime.ts:108`) — subagent plumbing is half-wired.
- **`browser_use` capability** declared in `packages/contracts/src/ipc.ts` but no consumer — placeholder.
- **Draft-thread pattern** (`apps/web/src/hooks/useHandleNewThread.ts:117`) has client-generated `draftId + threadId` — the exact idempotency V3's `client_chat_id` needs.
- **Claude adapter is partially landed** (`apps/server/src/provider/Layers/ClaudeAdapter.ts`, `@anthropic-ai/claude-agent-sdk@0.2.111` in deps). Server is no longer strictly Codex-first. `.plans/17-claude-agent.md` is in progress.
- **Sidebar** is a single 3394-line file (`apps/web/src/components/Sidebar.tsx`); **ChatView** is a 3472-line file. `.plans/04-split-chatview-component.md` is a pre-V3 refactor that V3 must execute to keep PRs reviewable.
- No Postgres, no Docker/dockerode, no Drizzle, no Better Auth, no googleapis, no Capacitor, no `deploy/` directory — those are all fresh V3 work.

**Outcome:** V3 is ~60% additive extension of T3's existing architecture and ~40% new code (mesh hub, Cloud env, mobile app, landing). The spec's proposals for `packages/mesh-contracts`, `packages/mesh-client`, `packages/mesh-server`, a `WireMessage` envelope, Better Auth, and Drizzle ORM are **all revised below** based on codebase reality.

---

## 2. Headline design decisions (delta from spec)

| #   | Decision                                                                                                                                                                                                                                                                         | Supersedes spec                                        | Rationale                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Keep Effect RPC as the WS wire.** Spec's `WireMessage<T>` envelope becomes a documentation façade in `packages/contracts/src/mesh/` only.                                                                                                                                      | §5.2 envelope                                          | Effect RPC already gives us id/type/ref/timestamp/payload, error channels, streams, and ack semantics. Rebuilding envelope = reinventing.                                                                                                     |
| D2  | **Server-authoritative per-chat seq.** Host devices send `client_event_id` (idempotency key); server assigns monotonic `stream_version` on persistence.                                                                                                                          | §5.2 "seq assigned by host device"                     | Cloud-env chats don't have a host device. Network partitions break host-assigned seq. Today's `OrchestrationEngine` already serializes commands through a queue and assigns monotonic sequence — use this. **Locked Q1 ✓**                    |
| D3  | **Keep T3's existing `ServerAuth` + bootstrap/session split. NO Better Auth.** Add `GoogleIdentityService` + `GitHubIdentityService` Effect Layers on top.                                                                                                                       | §11.2 "Auth: Better Auth"                              | Better Auth is Fetch-handler-based and fights Effect layers. T3's existing auth solves 70% of V3 section 3 already. Saves 2–3 weeks. **Locked Q2 ✓**                                                                                          |
| D4  | **Extend `orchestration_events` aggregate space** with new `chat`-scoped events; don't create a parallel `chat_events` table.                                                                                                                                                    | §4.1 separate `chat_events` table                      | Existing projection pipeline, receipt bus, command reactor, PubSub fan-out all flow through `orchestration_events`. Duplicating = double write path. T3's `stream_version` ≡ V3's per-chat seq.                                               |
| D5  | **Keep `@effect/sql-*` for BOTH SQLite (client) and Postgres (server-node).** Add `@effect/sql-pg` layer. NO Drizzle.                                                                                                                                                            | §11.2 "Drizzle ORM"                                    | Every existing service, migration, and test harness is Effect-SQL native. Drizzle would require `Effect.tryPromise` wrappers everywhere plus a second migration runner. Effect SQL + Postgres is a layer swap, not a rewrite. **Locked Q3 ✓** |
| D6  | **Merge `mesh-contracts` into `packages/contracts/src/mesh/*`.** Merge `mesh-client` into `packages/client-runtime/src/mesh/*`. Put `mesh-server` at `apps/server/src/mesh/` as an internal module, not a published package.                                                     | §12.0–12.1 three new packages                          | `contracts` + `client-runtime` already exist with the right shape. A separate `mesh-server` would need circular imports into `ProviderService`/`OrchestrationEngine`.                                                                         |
| D7  | **Server node holds the Claude & Codex credentials** (from user running `claude setup-token` / `codex login` during setup wizard) and injects them into each Cloud container via tmpfs-mounted secret files (not raw env vars).                                                  | §7.1 "pre-authed via passed-through creds" (ambiguous) | Only viable option given spec 7.1's "every chat gets its own ephemeral container". Pure server-side SDK (skip container) violates the isolation guarantee. **Locked Q4 ✓**                                                                    |
| D8  | **User-owned GitHub App** (not OAuth App, not a shared Lucas App). Server mints 1-hour installation tokens and refreshes every 45 min via internal WS.                                                                                                                           | §3.2 "GitHub OAuth"                                    | Fine-grained PAT mint API does not exist. GitHub App installation tokens are the only programmable short-lived-token path in 2026. User registers their own App in Phase 1 setup flow.                                                        |
| D9  | **`ContainerManager` Effect Layer with two backends:** `DockerContainerManager` (self-host default) and `FlyMachineManager` (Fly.io one-click deploy, one Machine per chat).                                                                                                     | §7 Docker only                                         | DinD on Fly is unreliable; Machines-as-containers is the supported model. Strategy pattern keeps both accessible via one interface.                                                                                                           |
| D10 | **Defer Cloudflare Containers deploy target past v1.** Ship Fly/Railway/VPS + self-host. Cloudflare Containers deploy in v1.1.                                                                                                                                                   | §1.2, §10.2                                            | Beta in 2026. Durable-Object-pinned WS hub is real architectural work. Spec §14.1 already soft-flags this.                                                                                                                                    |
| D11 | **Defer `chat_events` wire envelope to Postgres only in server-node mode.** Single-device mode stays on SQLite unchanged. Client SQLite gets additive ALTERs (`remote_id`, `host_device_id`, `last_synced_seq`, `is_local`) + new tables `remote_devices`, `remote_chat_events`. | §4 SQLite→Postgres                                     | Zero-change upgrade path for existing T3 users who don't opt into mesh.                                                                                                                                                                       |
| D12 | **Primary subagent UI: collapsible inline `SubagentCard`; secondary: Agents tab in `RightPanelSheet`.** Data model already ~60% wired via `collab_agent_tool_call`.                                                                                                              | §2.5 list only                                         | Cline-style inline card + Kilo-style side-panel is the converged best-of-2026 pattern; extends existing `MessagesTimeline` logic.                                                                                                             |
| D13 | **Primary preview UI: `<iframe sandbox>` pane for physical-device chats; path-based reverse proxy (`/preview/{chat_id}/*`) on v3-server for Cloud env.** Defer `WebContentsView`, per-chat subdomains, and Playwright-as-agent-tool to v1.1.                                     | §10.4 Phase 10 vague                                   | Electron official guidance is iframe-first. Playwright agent tool adds outbound-HTTP surface not in scope yet.                                                                                                                                |
| D14 | **Rename `@t3tools/*` → `@v3tools/*`, `T3CODE_*` → `V3CODE_*`, `~/.t3` → `~/.v3code` on Phase 0 day 1** via codemod, locking a rename mapping into `scripts/upstream-rebase.ts`.                                                                                                 | §7 naming                                              | 1 dev-day now avoids accumulating rebase friction for 8 months.                                                                                                                                                                               |
| D15 | **Phase 4 chat sync: 8 weeks, not 6.** Phase 8 Cloud env: 6 weeks, not 4. Phase 9 Android: 5 weeks, not 3, starting in parallel at week 23. Total: **8.5 months**, inside the 7–9 month window.                                                                                  | §13                                                    | Agent consensus: spec is optimistic on sync, Docker, and Android FCM reliability.                                                                                                                                                             |

---

## 3. Target architecture (reconciled)

```
┌──────────── Google Drive App Data (per user, ~5KB JSON) ──────────────┐
│  { server_url, server_version, device_list[], setup_at, ... }         │
└──────────────┬────────────────────────────────────────────────────────┘
               │ client read on sign-in
               │
 ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
 │Desktop  │  │Laptop   │  │Phone    │  │Browser  │
 │(Electron│  │(Electron│  │(Capa    │  │(web    │
 │ + local │  │ + local │  │citor 6) │  │ cloud- │
 │ v3-srv) │  │ v3-srv) │  │         │  │  mode) │
 └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
      │            │            │            │
      └────────────┴────────────┴────────────┘
                   │  wss://  Effect RPC
                   │  (session cookie OR ws-token)
                   │
      ┌────────────▼──────────────┐
      │   V3 SERVER NODE          │ (mode = "server-node")
      │  ┌─────────────────────┐  │
      │  │ Effect-TS core:     │  │  Same runtime as T3 today:
      │  │  - ServerAuth       │  │    ws.ts + serverRuntimeStartup
      │  │    + GoogleIdentity │  │    + ServerLifecycleEvents
      │  │    + GitHubIdentity │  │    + PubSub fan-out
      │  │  - OrchestrationEng.│  │
      │  │  - ProviderService  │  │  NEW for V3:
      │  │  - NEW: MeshHub     │  │    mesh/ContainerManager
      │  │  - NEW: DeviceReg.  │  │    mesh/DeviceRegistry
      │  │  - NEW: Presence    │  │    mesh/ChatSubMgr
      │  │  - NEW: ChatSubMgr  │  │    drive/AppDataClient (for desktop host)
      │  │  - NEW: Container   │  │
      │  │    Manager          │  │
      │  │  - NEW: PromptRouter│  │
      │  └──────────┬──────────┘  │
      │             │             │
      │  ┌──────────▼──────────┐  │
      │  │ Postgres 16 (or     │  │  Existing T3 SQLite still used in
      │  │  SQLite in single-  │  │  single-device mode (unchanged).
      │  │  device mode)       │  │  Schema extended via new migrations
      │  │ orchestration_events│  │  (chat aggregate, devices table, etc.)
      │  │ projection_*        │  │
      │  │ users / devices /   │  │
      │  │ device_sessions /   │  │
      │  │ user_preferences    │  │
      │  │ auth_sessions (T3)  │  │
      │  └─────────────────────┘  │
      │                           │
      │  ┌─────────────────────┐  │
      │  │ Docker (self-host)  │  │  OR Fly Machines, OR skip (Railway)
      │  │  one container per  │  │
      │  │  Cloud-env chat     │  │
      │  │  - git clone        │  │
      │  │  - claude/codex CLI │  │
      │  │  - in-container     │  │
      │  │    sync worker      │  │
      │  │    (WS back to hub) │  │
      │  └─────────────────────┘  │
      │                           │
      │  ┌─────────────────────┐  │
      │  │ cloudflared         │  │  Or nginx/caddy, or Tailscale Funnel
      │  │ (tunnel to public)  │  │
      │  └─────────────────────┘  │
      └───────────────────────────┘
```

Single-device / no-account users get the **same** runtime minus Postgres, Docker, GoogleIdentityService, mesh hub — all disabled by runtime mode flag.

---

## 4. Runtime modes

Introduce a third `RuntimeMode` literal (extending today's `"web" | "desktop"`):

```ts
type RuntimeMode = "web" | "desktop" | "server-node";
```

Detection precedence (in `apps/server/src/config.ts` `resolveServerConfig`):

1. CLI flag `--server-node`
2. Env var `V3CODE_MODE=server-node`
3. Presence of `~/.v3-code-server/config.toml`
4. Fall through to today's `"web" | "desktop"` detection

Per-mode behaviour matrix:

| Concern              | `desktop` (single-device)       | `web` (pairing)                         | `server-node` (mesh)               |
| -------------------- | ------------------------------- | --------------------------------------- | ---------------------------------- |
| DB                   | SQLite `~/.v3code/state.sqlite` | SQLite                                  | Postgres 16 (via `@effect/sql-pg`) |
| Auth policy          | `desktop-managed-local`         | `loopback-browser` / `remote-reachable` | **NEW** `v3-google-managed`        |
| Google sign-in       | Disabled                        | Disabled                                | Required                           |
| GitHub sign-in       | N/A                             | N/A                                     | Optional (Cloud env only)          |
| Drive App Data       | Disabled                        | Disabled                                | Read/write on sign-in              |
| Docker / Cloud env   | Disabled                        | Disabled                                | Enabled                            |
| Admin panel `/admin` | Hidden                          | Hidden                                  | Exposed                            |
| Public bind          | Loopback                        | Loopback / per config                   | 0.0.0.0 behind TLS                 |
| WS subscriptions     | Local-only                      | Pairing-scoped                          | User-scoped, mesh-wide             |
| Device approval      | Automatic (bootstrap)           | Existing pairing                        | Spec §3.3 approval flow            |

When Lucas's desktop is promoted to server-node: the Electron shell stops spawning its embedded backend and becomes a **local client** of the server-node process. No dual-backend. This is the critical decision baked into the wizard: installing server-node mode on a machine that's already running Desktop means reconfiguring that Desktop to talk to the new server as a viewer/host, not running two parallel stacks.

---

## 5. Tech stack additions (final)

| Concern                | Pick                                 | Package                                                                                                                                                            | Rationale                                                                                                            |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Postgres client        | `@effect/sql-pg`                     | `@effect/sql-pg@4.0.0-beta.45` (catalog)                                                                                                                           | Same API family as existing `@effect/sql-sqlite-bun`. No wrapping.                                                   |
| Google ID token verify | `jose`                               | `jose@^5`                                                                                                                                                          | JWKS fetch + verify. Small. No `google-auth-library` bloat.                                                          |
| Drive App Data client  | `fetch`                              | Built-in                                                                                                                                                           | Drive REST is 4 endpoints — no `googleapis` Node package. Keep it client-side.                                       |
| GitHub App             | `@octokit/app` + `@octokit/auth-app` | `@octokit/app@^15`, `@octokit/auth-app@^7`                                                                                                                         | Installation token mint, 1-hour scope, refresh.                                                                      |
| Docker                 | `dockerode`                          | `dockerode@^4.0.4` + `@types/dockerode@^3.3.35`                                                                                                                    | Spec pick; Effect wrapper is trivial.                                                                                |
| Fly API client         | `@fly/fly-api` or bare `fetch`       | bare `fetch`                                                                                                                                                       | Fly Machines REST is small. No official TS client; keep deps tight.                                                  |
| TOML (config.toml)     | `smol-toml`                          | `smol-toml@^1.3.1`                                                                                                                                                 | Fastest Bun-compatible parser.                                                                                       |
| AES-256-GCM            | Node `node:crypto`                   | Built-in                                                                                                                                                           | GitHub-token encryption. No new dep. Key via existing `ServerSecretStore.getOrCreateRandom("v3-token-enc-key", 32)`. |
| Capacitor 6            | `@capacitor/*`                       | `@capacitor/core@^6`, `@capacitor/android`, `@capacitor/preferences`, `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/keyboard` | Android + iOS-deferred. Spec pick.                                                                                   |
| FCM push (mobile)      | `@capacitor-firebase/messaging`      | `@capacitor-firebase/messaging@^6`                                                                                                                                 | Works with Capacitor 6.                                                                                              |
| FCM push (server send) | `firebase-admin`                     | `firebase-admin@^13`                                                                                                                                               | Service account uploaded by user in admin panel.                                                                     |
| cloudflared binary     | Downloaded on demand                 | N/A                                                                                                                                                                | Setup wizard downloads platform binary to `~/.v3code/bin/cloudflared`.                                               |

**Do NOT add:** Better Auth (D3), Drizzle + drizzle-kit (D5), `keytar` (Electron `safeStorage` already in use), `pino` (existing Effect logging + OTLP is in place), `googleapis` as a server dep (only needed client-side if at all), `@octokit/rest` beyond the App flow.

Catalog addition:

```json
// package.json → workspaces.catalog
"@effect/sql-pg": "4.0.0-beta.45",
"jose": "^5.10.0",
"dockerode": "^4.0.4",
"@types/dockerode": "^3.3.35",
"@octokit/app": "^15.1.0",
"@octokit/auth-app": "^7.1.0",
"smol-toml": "^1.3.1",
"@capacitor/core": "^6.2.0",
"@capacitor/android": "^6.2.0",
"firebase-admin": "^13.0.1"
```

---

## 6. Revised 12-phase roadmap (8.5 months)

| Phase                                                    | Weeks            | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Parallel tracks                                                                   | Exit gate                                                                                                                                |
| -------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------- |
| **P0. Foundation**                                       | 1–2              | `git init` + real fork from `pingdotgg/t3code` + `upstream` remote. `MESH_CHANGES.md`. `scripts/upstream-rebase.ts`. `.github/workflows/upstream-conflict-check.yml`. Codemod `@t3tools`→`@v3tools`, `T3CODE_`→`V3CODE_`, `~/.t3`→`~/.v3code`. Read `.docs/*` + `.plans/*`. Validate `bun fmt                                                                                                                                                                                                                                                                                                                                                                                                                    | lint                                                                              | typecheck                                                                                                                                | run test`on all 3 devices. CF Tunnel smoke over existing T3 pairing. Commit`V3_CODE_SPEC.md`+ this plan to repo. Also: execute`.plans/04-split-chatview-component.md` refactor so later V3 UI edits land in small files. | Rename codemod + docs reading in parallel | All 4 gate cmds pass on 3 devices, CF tunnel smoke works, ChatView split merged |
| **P1. Google + GitHub identity on existing ServerAuth**  | 3–5              | `apps/server/src/identity/{Google,GitHub}IdentityService` Effect services. New `AuthenticatedSession.userId/deviceId` fields. Migration `026_V3UsersDevices` (SQLite in single-device; deferred to `028` or similar in Postgres in server-node mode). `/api/auth/google/bootstrap` + `/api/auth/google/refresh` + `/api/v3/devices/{approve,remove}` routes. `AES-256-GCM` helper for GitHub token encryption (key from `ServerSecretStore`). Electron `v3://auth/google/callback` scheme (GitHub uses HTTPS callback on server). Sign-in UI + GitHub connect button at top of web/desktop.                                                                                                                      | Contracts work parallel to server.                                                | Google sign-in works; GitHub connect completes; V3 session issued via existing `SessionCredentialService`.                               |
| **P2. Server-node mode + Drive App Data + setup wizard** | 6–10             | Runtime mode detection, `config.toml` loader via `smol-toml`. `@effect/sql-pg` layer + `PostgresMigrations/001_InitSchema.ts` (all tables in §7 below). Self-host wizard (6 screens) including cloudflared service install. In-app one-click deploy scaffolding for Fly.io (primary) + Railway (mesh-only). `drive/appDataClient.ts` (client-side, fetch-only). Admin panel route `/admin` behind `useServerMode()==="server-node"` guard. Presence over extended `SessionCredentialService.streamChanges`. `hello`/`heartbeat`/`presence_update` mapped onto Effect RPC streams.                                                                                                                                | Admin panel UI parallel with backend config.                                      | Lucas's Mini PC runs as server-node with public URL; Desktop + Laptop auto-discover via Drive App Data and show presence.                |
| **P3. Device model + sidebar rewrite**                   | 11–12            | `packages/contracts/src/mesh/device.ts` (DeviceInfo, HelloPayload, PresenceUpdatePayload). New `DeviceSidebar.tsx` component tree (SignedInBar, DeviceGroup, ChatItem, ArchivedSection) replacing signed-in branch of the split `Sidebar.tsx`; signed-out branch keeps legacy `LegacyProjectSidebar.tsx`. `useDevices`/`useChatsByDevice`/`useShouldShowConfigureBanner`/`useServerMode` hooks. `ConfigureServerBanner` in `_chat.tsx`. Device approval toast + Settings → Devices panel.                                                                                                                                                                                                                        | Sidebar rewrite parallel with device registration backend. Phase 4 design starts. | All 3 devices appear in sidebar with correct presence, approval flow works.                                                              |
| **P4. Chat sync v1 — event store + subscribe/publish**   | 13–20            | Extend `orchestration_events.aggregate_kind` with `chat` (or, cleaner, keep using `thread` and just stamp `host_device_id` + promote stream_version to mesh seq — **recommended**). `ChatSubscriptionManager` Effect Layer with `subscribersByThread` reverse index + per-device outbox queues. `mesh.subscribeChat` RPC (replaces spec `subscribe`), `mesh.publishEvent` RPC with server-assigned seq (Q1). Gap detection client-side (`apps/web/src/mesh/gapDetection.ts` — pure, unit-tested). Reconnect state machine tweaks. `MeshPublisher` that mirrors local `OrchestrationEvent`s to the hub. Client cache `remote_chat_events` for offline viewing. Perf gate: 1000-event replay <500ms, gap-fill <2s. | Server event-store extension (w13–15) parallel with client subscriber (w13–16).   | Desktop hosts, Laptop views live; airplane-mode 30s test passes; perf gates green.                                                       |
| **P5. Cross-device prompts**                             | 21–22            | `mesh.sendPrompt` RPC + `PromptRouter`: hub looks up host's live WS session, forwards as `send_prompt_forward` over host's outbox. Host's new `MeshInboundHandler` re-dispatches as ordinary `thread.turn.start` command → everything else works unchanged. `PromptAttribution` badge in `MessagesTimeline`. Offline-host input disabled. `client_msg_id` idempotency via `OrchestrationCommandReceiptRepository`.                                                                                                                                                                                                                                                                                               | UI badge parallel with router.                                                    | Phone types prompt; Desktop executes; Phone sees streaming response.                                                                     |
| **P6. Fork chat**                                        | 23–24            | `chat.fork` command. Post-commit SQL hook in `OrchestrationEngine.processEnvelope` copies events to new `stream_id` preserving `stream_version` (Q4), rewrites `threadId` in payload, adds `metadata.forkedFromChatId`. Two-phase UI: source picks device, target device sees `fork_ready` banner and picks local path. Restriction: disabled when `thread.session.status === "running"` or pending approvals > 0.                                                                                                                                                                                                                                                                                               | **P9 Android track starts in parallel** — WS protocol is now stable.              | Fork Desktop chat to Laptop; Laptop continues from full history.                                                                         |
| **P7. Web app cloud mode**                               | 25–27            | `VITE_V3_CLOUD_MODE` build flag — variant of `apps/web` that assumes no local fs/backend. Served from server node at `/app`. GitHub repo browser for file picker. Optional Cloudflare Pages deploy from user's server-node's domain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Cloud-mode web parallel with desktop polish. P9 continues.                        | Phone browser hits `https://v3.agaminggod.com` and sees all chats live.                                                                  |
| **P8. Cloud env (Docker)**                               | 28–33            | `apps/cloud-env-image/Dockerfile` (`ubuntu:24.04` + Node 22 + Python 3.12 + Claude Code CLI + Codex CLI + node-pty + tini as PID 1 + rootless agent user). `ContainerManager` Effect service (2 impls: `DockerContainerManager` + `FlyMachineManager`). `container-monitor` cgroup-watcher kills over-limit containers. `cloudEnv/GitHubAppAuth.ts` mints 1-hour installation tokens per container. Tmpfs-mounted secret files inject Claude + Codex creds. Preview tunneling: path-based `/preview/{chat_id}/*` reverse proxy. GHCR publish workflow. Resource limits w/ ext4-quota probe + admin warning. Spec §14.5 Cloud-fork UX ("fs state won't transfer" warning).                                        | Image build parallel with server Docker code. P9 continues.                       | Create Cloud chat, Claude commits+pushes, container cleans up; preview pane renders a Next.js dev server.                                |
| **P9. Android app + FCM**                                | 23–34 (parallel) | `apps/mobile/` Capacitor 6 wrap of web-cloud-mode. FCM for backgrounded push (chat done, approval needed, container killed). Android foreground service + notification only during live streaming. Play Store internal test. AAB CI workflow. FCM fallback path for Android 14+ background WS unreliability (FCM-data-only wake signal).                                                                                                                                                                                                                                                                                                                                                                         | Runs parallel to P6–P8 on a dedicated track.                                      | Pixel runs V3, signs in, receives FCM notifications.                                                                                     |
| **P10. Subagent UI + polish**                            | 34–35            | `SubagentCard.tsx` inline in `MessagesTimeline` (primary UI) with Devin-style live status. `AgentsTab` in `RightPanelSheet` (secondary power view). Extend `providerRuntime.ts` with 4 new subagent event types. Polish, edge cases, Windows + macOS artifact smoke.                                                                                                                                                                                                                                                                                                                                                                                                                                             | Polish parallel with bug-fix sprint.                                              | All 3 devices + Cloud + phone stable for 7 days of real use. Subagent tree renders correctly for Claude Task tool + Codex nested agents. |
| **P11. Public launch prep**                              | 36–37            | Rename `apps/marketing` → `apps/landing`, refresh v3code.com content. Docs site at docs.v3code.com (Astro Starlight, reuse landing infra). `deploy/{flyio,railway,vps}/` templates. Deploy `ghcr.io/agaminggod1234/{v3-code-server,v3-cloud-env}:latest`. README polish. Video demos. MIT license retained; attribution to T3 Code preserved. npm publish `v3` CLI. **Defer: Cloudflare deploy target, iOS, Playwright agent tool, WebContentsView preview upgrade, wildcard-subdomain preview, multi-user-per-server.**                                                                                                                                                                                         | All phases; docs writing has been happening from P6 onward.                       | Non-Lucas external tester follows docs → Fly.io deploy → multi-device.                                                                   |

---

## 7. Data model (detailed)

### 7.1 Server-node Postgres schema (new migrations in `apps/server/src/persistence/PostgresMigrations/`)

**001_InitSchema.ts** (refined from spec §4.1 with fixes per Agent 5):

```sql
-- users: one row per Google account (V1 = 1 row per node)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub TEXT UNIQUE NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  github_access_token_enc BYTEA,
  github_token_enc_iv BYTEA,
  github_app_installation_id BIGINT,  -- user-owned GitHub App
  github_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- devices
CREATE TABLE devices (
  id UUID PRIMARY KEY,  -- client-generated
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows','macos','linux','android','ios','web')),
  kind TEXT NOT NULL CHECK (kind IN ('desktop','laptop','server','phone','tablet','browser','cloud')),
  capabilities JSONB NOT NULL DEFAULT '[]',
  approved BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ
);
CREATE INDEX idx_devices_user_active ON devices(user_id, approved) WHERE removed_at IS NULL;

-- device sessions (link T3 auth_sessions → device)
CREATE TABLE device_sessions (
  session_id TEXT PRIMARY KEY REFERENCES auth_sessions(session_id),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  client_ip INET,
  user_agent TEXT,
  last_heartbeat_at TIMESTAMPTZ
);
CREATE INDEX idx_device_sessions_heartbeat ON device_sessions(last_heartbeat_at) WHERE last_heartbeat_at IS NOT NULL;

-- chats (extension of orchestration-threads model; host_device_id + cloud fields are V3-specific)
ALTER TABLE projection_threads
  ADD COLUMN host_device_id UUID REFERENCES devices(id) ON DELETE RESTRICT,
  ADD COLUMN client_chat_id TEXT,  -- idempotency from CreateChatPayload
  ADD COLUMN parent_chat_id UUID REFERENCES projection_threads(thread_id) ON DELETE SET NULL,
  ADD COLUMN parent_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  ADD COLUMN github_repo TEXT,
  ADD COLUMN github_branch TEXT,
  ADD COLUMN container_id TEXT,
  ADD COLUMN provider TEXT CHECK (provider IN ('claude_code','codex')),
  ADD COLUMN ended_at TIMESTAMPTZ;
CREATE UNIQUE INDEX idx_projection_threads_client_chat_id ON projection_threads(client_chat_id) WHERE client_chat_id IS NOT NULL;
CREATE INDEX idx_projection_threads_host_device ON projection_threads(host_device_id);

-- orchestration_events stays as-is; stream_version (already planned) = per-chat seq
-- Hash partition by stream_id for scale:
-- (Already partitioned in v1? If not, create 16 hash partitions here.)

-- pending_prompts (scaffold, unused in v1)
CREATE TABLE pending_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
  from_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  client_msg_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','canceled')),
  UNIQUE (chat_id, client_msg_id)
);

-- user_preferences (synced across devices)
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark',
  font_family TEXT,
  font_size INT NOT NULL DEFAULT 14,
  default_provider TEXT NOT NULL DEFAULT 'claude_code' CHECK (default_provider IN ('claude_code','codex')),
  keybindings JSONB NOT NULL DEFAULT '{}',
  editor_settings JSONB NOT NULL DEFAULT '{}',
  revision BIGINT NOT NULL DEFAULT 0,  -- monotonic for LWW sync
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Key fixes vs spec:

- `client_chat_id` present (spec's `CreateChatPayload` had it but the table didn't store it).
- `ON DELETE SET NULL` (not CASCADE) for events' `actor_device_id` — preserve history on device removal.
- Composite PK `(stream_id, stream_version)` on `orchestration_events` — kill redundant UUID lookup.
- `devices.removed_at` soft-delete.
- `user_preferences.revision` for conflict-free sync.

### 7.2 Client SQLite evolution (migrations `026` onward in existing T3 path)

```sql
-- 026: sync columns on projection_threads (additive)
ALTER TABLE projection_threads ADD COLUMN remote_id TEXT;
ALTER TABLE projection_threads ADD COLUMN host_device_id TEXT;
ALTER TABLE projection_threads ADD COLUMN last_synced_seq INTEGER DEFAULT 0;
ALTER TABLE projection_threads ADD COLUMN is_local INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_projection_threads_remote ON projection_threads(remote_id) WHERE remote_id IS NOT NULL;

-- 027: remote_devices
CREATE TABLE remote_devices (
  device_id TEXT PRIMARY KEY, name TEXT, platform TEXT, kind TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]', online INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 028: remote_chat_events (write-through cache for chats hosted elsewhere)
CREATE TABLE remote_chat_events (
  chat_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL,
  payload_json TEXT NOT NULL, actor_device_id TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (chat_id, seq)
);
```

No Drizzle. Migrations continue through existing `apps/server/src/persistence/Migrations.ts` record.

### 7.3 Drive App Data schema

Stored in `appDataFolder/v3_config.json` (~5 KB):

```json
{
  "v3_config": {
    "server_url": "https://v3.agaminggod.com",
    "server_version_installed": "0.1.0",
    "setup_at": "2026-04-18T10:00:00Z",
    "device_list": [{ "device_id": "...", "name": "Desktop", "added_at": "..." }]
  }
}
```

Access via pure `fetch` client in `packages/client-runtime/src/drive/appDataClient.ts`. Fallback: localStorage cache + manual URL entry in Settings → Server Node.

---

## 8. Sync protocol (Effect RPC on Effect RPC)

Landing files (all new):

- `packages/contracts/src/mesh/hello.ts` — `HelloPayload`, `HelloAckPayload`, `WsMeshHelloRpc`
- `packages/contracts/src/mesh/heartbeat.ts`
- `packages/contracts/src/mesh/subscription.ts` — `SubscribePayload{chat_id, since_seq?}`, `WsMeshSubscribeChatRpc` (stream)
- `packages/contracts/src/mesh/publish.ts` — `PublishEventPayload{chat_id, client_event_id, event_type, payload}`, `PublishEventAck{seq}` (D2 — server returns assigned seq)
- `packages/contracts/src/mesh/chat.ts` — `ChatInfo`, `ChatEventPayload`, `ChatEventType` (union of extended orchestration event kinds)
- `packages/contracts/src/mesh/device.ts` — DeviceInfo, device events
- `packages/contracts/src/mesh/presence.ts`
- `packages/contracts/src/mesh/preferences.ts`
- `packages/contracts/src/mesh/outbox.ts` — `OutboxMessage` union for `send_prompt_forward`, `prompt_delivered`, `prompt_rejected`, `gh_token_invalid`
- `packages/contracts/src/mesh/errors.ts`

Every RPC is added to `WsRpcGroup` in `packages/contracts/src/rpc.ts` alongside today's orchestration/auth/terminal/git RPCs.

### Key flows (reconciled)

**Connection establishment:**

```
Client         Server
  │              │
  ├── WS open, cookie/wsToken ─►
  │  (existing T3 auth at ws.ts:1066-1087 extended with UserContextResolver)
  │              │
  │◄── connection_established  ── via subscribeServerLifecycle ──
  │  { server_version, user_id, user_email, server_mode }
  │              │
  ├── mesh.hello { device_id, device_name, platform, kind, capabilities, app_version } ─►
  │              │
  │◄── hello_ack { devices[], chats[], preferences } ──
  │              │
  │    (loop)    │
  ├── heartbeat every 15s ─►
  │◄── heartbeat_ack { server_time } ──
  │              │
  ├── mesh.subscribeChat { chat_id, since_seq } ─► (stream open)
  │◄── chat_event events replay then live ──
```

**Cross-device prompt routing:**

1. Viewer sends `mesh.sendPrompt { chat_id, content, client_msg_id }`
2. Hub's `PromptRouter`: `liveSessions.get(chat.host_device_id)`. If offline → `prompt_rejected{device_offline}`.
3. Online → enqueue into host's outbox (part of `ChatSubscriptionManager`).
4. Host's `subscribeMyOutbox` stream receives `send_prompt_forward{chat_id, content, client_msg_id, actor_device_id}`.
5. Host's `MeshInboundHandler` dispatches ordinary `thread.turn.start` command with `commandId = "forward:" + client_msg_id` (idempotent via `OrchestrationCommandReceipt`).
6. From here, identical to user typing locally — same provider call, events stream to all subscribers.
7. `prompt_delivered{client_msg_id}` fires when host's outbox stream consumes the message.

**Fork chat SQL (post-commit hook in `OrchestrationEngine.processEnvelope`):**

```sql
BEGIN;
  INSERT INTO projection_threads(...)  SELECT ... FROM source with new ids;
  INSERT INTO orchestration_events(event_id, aggregate_kind, stream_id, stream_version, ...)
    SELECT gen_random_uuid(), 'thread', $newChatId, stream_version, ...,
           json_replace(payload_json, '$.threadId', $newChatId),
           json_set(metadata_json, '$.forkedFromChatId', $sourceChatId)
    FROM orchestration_events
    WHERE aggregate_kind='thread' AND stream_id=$sourceChatId
    ORDER BY sequence;
  -- Replay projections via ProjectionPipeline.projectEvent
  INSERT INTO orchestration_events(..., event_type='thread.forked', ...)
    VALUES (gen_random_uuid(), 'thread', $newChatId, max_sv+1, ...);
COMMIT;
```

Preserves stream_version (V3 "seq") per Q4; fresh event_ids to satisfy unique constraint. Idempotent via `commandId` in `CommandReceiptRepository`.

---

## 9. Cloud env (Docker)

`apps/cloud-env-image/Dockerfile`:

```dockerfile
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y curl git build-essential python3.12 python3-pip tini ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && npm install -g @anthropic-ai/claude-code @openai/codex-cli \
    && useradd -m -s /bin/bash agent
USER agent
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--", "/v3/entrypoint.sh"]
```

`entrypoint.sh`:

1. Read mounted secret file at `/run/secrets/v3-creds` (tmpfs, `640 root:agent`) containing `CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_API_KEY`, `V3_GITHUB_INSTALL_TOKEN`, `V3_MESH_URL`, `V3_CHAT_ID`, `V3_DEVICE_ID`.
2. Set `gitconfig` with ephemeral GitHub token via credential helper (no env vars with token).
3. `git clone $V3_GITHUB_REPO -b $V3_GITHUB_BRANCH`.
4. Start bundled `v3-sync-worker` (from `packages/client-runtime`) — connects to hub via WS using token.
5. Start Claude Code / Codex process cwd=/workspace/$REPO_NAME.
6. Agent handshake to hub; hub fires `thread.cloud-env.ready` event.

`ContainerManager` Effect Layer (`apps/server/src/cloud/ContainerManager.ts`):

- `startChatContainer(chatId, repo, branch, provider) → Effect<ContainerHandle, ContainerError>` — pull image, create, start, wait-for-ready with 15s timeout.
- `stopChatContainer(chatId) → Effect<void>` — SIGTERM, 10s grace, `rm`.
- `list() → Effect<ContainerInfo[]>` for admin panel.
- Resource limits via `HostConfig`: `CpuCount: 2`, `Memory: 4294967296`, `StorageOpt: { size: "20G" }` (with ext4-quota probe + admin warning if unsupported).
- Network: custom `v3-bridge` network, `--cap-drop=ALL`, `host.docker.internal:host-gateway` for container→hub WS.

Preview tunneling v1: path-based reverse proxy at `/preview/{chat_id}/*` on v3-server → container's `:3000` (dev-server-detected port). Authed via existing session cookie. Docs warn about SPA base-path (Next.js `basePath=/preview/{chat_id}`, Vite `base`). Wildcard-subdomain mode deferred to v1.1.

---

## 10. UI

### 10.1 Sidebar rewrite (after P0 split of `Sidebar.tsx`)

New files in `apps/web/src/components/sidebar/`:

- `DeviceSidebar.tsx` — top-level, switches on `useIsMeshSignedIn()`
- `LegacyProjectSidebar.tsx` — extracted signed-out path (file-move, zero logic change)
- `SignedInBar.tsx` — email + Google/GitHub chip
- `DeviceGroup.tsx` — collapsible per-device section with chats
- `ChatItem.tsx` — reuses `resolveThreadRowClassName`, `resolveThreadStatusPill` from existing `Sidebar.logic.ts`
- `ArchivedSection.tsx` — collapsed at bottom

Context menus use existing `readLocalApi().contextMenu.show(...)` pattern. Device icons from lucide: `MonitorIcon`, `LaptopIcon`, `ServerIcon` (Mini PC), `SmartphoneIcon`, `CloudIcon`, `GlobeIcon` (browser tab). Collapse state persisted in `uiStateStore.ts`.

### 10.2 Chat view additions (edit `apps/web/src/components/ChatView.tsx` around line 3247 after P0 split)

- `RemoteChatBanner.tsx` — above ProviderStatusBanner when `chat.host_device_id !== thisDevice.id`
- `CloudEnvStatusIndicator.tsx` — container info + End Chat button
- `PromptAttribution.tsx` — "via Phone · 2m ago" badge inside `MessagesTimeline` user-message render

### 10.3 Configure-server banner

`apps/web/src/components/chat/ConfigureServerBanner.tsx` injected in `routes/_chat.tsx` ChatRouteLayout. Visible when `isSignedIn && !serverUrl && deviceList.length >= 2 && !dismissedLast7Days`.

### 10.4 Settings extensions

Extend `SETTINGS_NAV_ITEMS` in `components/settings/SettingsSidebarNav.tsx` with:

- Account (`settings.account.tsx` → `AccountSettingsPanel`)
- Server Node (`settings.server.tsx`)
- Devices (`settings.devices.tsx`)
- Preferences (synced; `settings.preferences.tsx`)
- Local (per-device; `settings.local.tsx`)

`useSettings.ts` already splits via `SERVER_SETTINGS_KEYS`; add `DEVICE_SETTINGS_KEYS` for the per-device-but-synced tier.

### 10.5 Admin panel

New routes under `apps/web/src/routes/admin/`:

- `admin.tsx` (layout, guarded by `useServerMode()==="server-node"`)
- `admin.connections.tsx` (active WS sessions from `SubscriptionManager`)
- `admin.containers.tsx` (list, kill, "kill all" emergency button)
- `admin.postgres.tsx` (sizes, row counts via pre-baked RPC queries)
- `admin.event-log.tsx` (size per chat)
- `admin.docker.tsx` (daemon health)
- `admin.logs.tsx` (tail server log; virtualized via existing `@legendapp/list`)
- `admin.backup.tsx` (create/restore pg_dump + encrypted Drive upload)

All admin data flows through named RPC methods (never raw SQL from client).

### 10.6 Subagent UI (P10)

Primary: `SubagentCard.tsx` inline at parent `Agent` tool_use position. Three states (running/completed/error), Devin-style live status header, Cline-style per-subagent stats (tool count, duration, tokens). Expand → recursively rendered nested `MessagesTimeline`.

Secondary: `AgentsTab.tsx` in `RightPanelSheet` (Kilo-style two-column tree + detail).

Data model: event model already ~60% wired via existing `collab_agent_tool_call` type + Claude SDK's `parent_tool_use_id`. Four new event types to add to `ProviderRuntimeEventType`: `subagent.started`, `subagent.progress`, `subagent.completed`, `subagent.failed`.

### 10.7 Browser / preview (P10 or earlier)

Primary v1: collapsible `PreviewPane` beside `ChatView` with `<iframe sandbox="allow-scripts allow-same-origin allow-forms">`. Agent signals port via log line (`localhost:3000`) — new `apps/server/src/preview/portSniffer.ts` watches child-process stdout + `netstat`.

`ElementInspector` overlay serializes clicked DOM → agent context (Cursor/Windsurf pattern). `WebContentsView` migration deferred.

Cloud env preview: path-based `/preview/{chat_id}/*` reverse proxy (see §9).

Playwright-as-agent-tool deferred to v1.1 — `browser_use` capability declared but unused in v1.

### 10.8 Mobile app (P9)

`apps/mobile/` Capacitor 6 wrap of `apps/web` cloud-mode build. Key plugins: `@capacitor/preferences` (replaces localStorage), `@capacitor-firebase/messaging` (FCM), `@capacitor/app` (lifecycle), `@capacitor/keyboard`. FCM used both for wake (backgrounded app) and for streaming notifications (foreground service + notification during live turn). Android-only in v1; iOS deferred.

---

## 11. Server infrastructure per deploy target

| Target      | Server + DB                                                | Cloud env runtime                                  | Public URL                                                       | Status             |
| ----------- | ---------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| Personal PC | v3-server + Postgres-in-Compose + Docker daemon            | `dockerode`                                        | cloudflared (named tunnel, token-install) + CF Access email gate | **v1 primary**     |
| VPS         | Same as Personal PC + systemd                              | `dockerode`                                        | cloudflared or caddy+Let's Encrypt                               | **v1**             |
| Fly.io      | v3-server Machine + unmanaged Postgres Machine (~$3.50/mo) | `FlyMachineManager` — one Machine per chat         | Fly's public hostname                                            | **v1**             |
| Railway     | v3-server + Railway Postgres                               | **Disabled** — show "Cloud env unavailable" banner | Railway-provided                                                 | **v1 (mesh-only)** |
| Cloudflare  | D1 or Hyperdrive+Neon                                      | Cloudflare Containers (beta)                       | Workers                                                          | **Deferred v1.1**  |

Auth libraries + secrets:

- Google: `jose` JWKS verify in `apps/server/src/identity/Layers/GoogleIdentityService.ts`; 10-min JWKS cache. `iss`/`aud`/`email_verified` checks. Email allowlist via `V3CODE_AUTHORIZED_EMAILS` env var or `[auth].authorized_emails` in config.toml.
- GitHub App (not OAuth App): user creates their own App during Phase 1 setup wizard; installation token minted per container via `@octokit/auth-app`, 1-hour scope, refresh every 45 min via internal WS message.
- AES-256-GCM for token-at-rest via `node:crypto` + `ServerSecretStore.getOrCreateRandom("v3-token-enc-key", 32)`.
- Electron `safeStorage` (already in use at `apps/desktop/src/clientPersistence.ts`) handles client-side session token storage — no `keytar`.
- WS auth: V3 mesh reuses existing Effect RPC session-token pattern. Subprotocol header on upgrade → existing `serverAuth.authenticateWebSocketUpgrade`.

Backup/restore: admin panel button → `pg_dump -Fc` → Argon2id-derived AES-GCM → encrypted blob to user's Drive main folder (not App Data, too large). Reference implementation: `pg_drive_backup`. Restore from fresh install via Settings → Server Node → Restore.

---

## 12. Monorepo + upstream drift

Final monorepo tree (§2 of Agent 10's report). Key deltas vs spec §12:

- `packages/mesh-contracts` → folded into `packages/contracts/src/mesh/`
- `packages/mesh-client` → folded into `packages/client-runtime/src/mesh/` + `packages/client-runtime/src/drive/`
- `packages/mesh-server` → folded into `apps/server/src/mesh/`
- `apps/marketing` → rename to `apps/landing` in P11
- New: `apps/mobile/`, `apps/cloud-env-image/`, `deploy/{flyio,railway,vps}/`

Upstream drift playbook (`.docs/MESH_CHANGES.md`, monthly integration branch + `scripts/upstream-rebase.ts` codemod + weekly `upstream-conflict-check.yml` dry-rebase). Track tagged releases only (`v0.0.25`, not `main`). Hard fork decision gate at end of P4.

CI workflows to add: `release-cloud-env.yml`, `release-mobile.yml`, `release-landing.yml`, `upstream-conflict-check.yml`. Existing `ci.yml` + `release.yml` (desktop auto-updater already wired).

Branding + namespace rename codemod (P0 day 1):

- `@t3tools` → `@v3tools`
- `T3CODE_` → `V3CODE_`
- `~/.t3` → `~/.v3code`
- Electron `t3://` scheme → add `v3://` alongside (don't remove `t3://` yet — it's used for static file serving in packaged builds)
- npm binary `t3` → `v3`
- `productName: "T3 Code"` → `"V3 Code"`

---

## 13. Critical files to create (master list)

### P0 foundation

- `MESH_CHANGES.md`
- `scripts/upstream-rebase.ts`
- `.github/workflows/upstream-conflict-check.yml`

### P1 auth

- `apps/server/src/identity/Services/{GoogleIdentity,GitHubIdentity,UserRepository,DeviceRepository,DeviceApproval,UserContextResolver}.ts`
- `apps/server/src/identity/Layers/*` (live impls)
- `apps/server/src/identity/tokenEncryption.ts`
- `apps/server/src/identity/http.ts`
- `apps/server/src/persistence/Migrations/026_V3UsersDevices.ts` (SQLite variant; Postgres variant `PostgresMigrations/002_Identity.ts`)
- `packages/contracts/src/identity.ts`
- `packages/contracts/src/mesh/{hello,heartbeat,device,presence,preferences,subscription,publish,chat,outbox,errors}.ts`
- `apps/web/src/v3/auth/{googleSignIn,githubConnect,deviceId,tokenStore}.ts`
- `apps/web/src/v3/ui/{DeviceApprovalToast,DeviceList}.tsx`
- `apps/desktop/src/v3GoogleAuthFlow.ts` (`v3://` scheme handler)

### P2 server-node + wizard

- `apps/server/src/persistence/Layers/Postgres.ts` (Effect SQL pg adapter)
- `apps/server/src/persistence/PostgresMigrations/*`
- `apps/server/src/config/tomlLoader.ts` (smol-toml)
- `apps/server/src/serverMode.ts` (runtime-mode detection)
- `apps/server/src/cloudflared/Installer.ts` (download + service install)
- `apps/desktop/src/wizard/*` (setup wizard React multi-step form + IPC)
- `apps/web/src/routes/setup/*` (wizard routes)
- `apps/web/src/routes/admin.tsx` + `admin.*.tsx` routes
- `apps/web/src/components/admin/*`
- `packages/client-runtime/src/drive/appDataClient.ts` + `schema.ts`
- `deploy/flyio/{fly.toml,Dockerfile,bootstrap.sh}`
- `deploy/railway/{railway.json,nixpacks.toml}`

### P3 sidebar + devices

- `apps/web/src/components/sidebar/{DeviceSidebar,LegacyProjectSidebar,SignedInBar,DeviceGroup,ChatItem,ArchivedSection}.tsx`
- `apps/web/src/components/chat/ConfigureServerBanner.tsx`
- `apps/web/src/hooks/{useDevices,useChatsByDevice,useShouldShowConfigureBanner,useServerMode,useAccountState}.ts`
- `apps/web/src/rpc/meshState.ts` + `meshSubscriptions.ts`

### P4 sync

- `apps/server/src/mesh/Services/{ChatSubscriptionManager,DeviceRegistry,PresenceBroadcaster,MeshPublisher}.ts`
- `apps/server/src/mesh/Layers/*`
- `apps/server/src/mesh/meshWsHandlers.ts`
- `apps/server/src/orchestration/Layers/MeshEventIngestion.ts`
- `apps/server/src/persistence/Migrations/029_StreamVersionEnforcement.ts` (if not already landed upstream)
- `apps/server/src/persistence/Migrations/030_ProjectionThreadsHostDeviceId.ts`
- `apps/web/src/mesh/{subscriptionManager,heartbeat,gapDetection}.ts`
- `apps/web/src/rpc/meshRpcClient.ts`

### P5 cross-device prompts

- `apps/server/src/mesh/PromptRouter.ts`
- `apps/server/src/mesh/MeshInboundHandler.ts`
- `apps/web/src/components/chat/PromptAttribution.tsx`

### P6 fork

- `apps/server/src/mesh/ForkCoordinator.ts`
- `apps/web/src/components/chat/{ForkChatDialog,ForkAcceptDialog}.tsx`
- New `chat.fork` / `thread.prepare-worktree` cases in decider

### P7 web cloud mode

- `apps/web/src/build-flags.ts` + `vite.config.ts` flag
- `apps/web/src/components/cloudMode/GitHubRepoBrowser.tsx`

### P8 Cloud env

- `apps/cloud-env-image/{Dockerfile,entrypoint.sh,src/agent-worker/*}`
- `.github/workflows/release-cloud-env.yml`
- `apps/server/src/cloud/{ContainerManager,DockerContainerManager,FlyMachineManager,ContainerMonitor,PreviewProxy}.ts`
- `apps/server/src/cloud/GitHubAppAuth.ts`
- `apps/web/src/components/chat/CloudEnvStatusIndicator.tsx`
- `apps/web/src/components/chat/CloudRepoPicker.tsx`

### P9 mobile

- `apps/mobile/{package.json,capacitor.config.ts,android/*,src/platform.ts}`
- `.github/workflows/release-mobile.yml`
- `apps/server/src/mesh/FcmPushService.ts` (firebase-admin)
- Admin panel page to upload Firebase service account JSON

### P10 subagent UI + preview

- `apps/web/src/components/chat/{SubagentCard,SubagentInlineStatus,SubagentSummaryChip}.tsx`
- `apps/web/src/components/chat/SubagentTree.tsx`
- `apps/web/src/components/RightPanelSheet/AgentsTab.tsx`
- `apps/web/src/components/chat/PreviewPane.tsx`
- `apps/web/src/components/chat/ElementInspector.tsx`
- `apps/server/src/preview/portSniffer.ts`
- Extend `packages/contracts/src/providerRuntime.ts` with 4 new subagent event types

### P11 launch

- `docs/{architecture,deploy-self,deploy-cloud,deploy-vps,api-reference,troubleshooting,security,keybindings}.md`
- `docs/site/*` (Astro Starlight)
- Rename `apps/marketing` → `apps/landing`, refresh content
- `scripts/gen-api-docs.ts` (generate `docs/api-reference.md` from `packages/contracts/src/mesh/*` schemas)
- `deploy/vps/{setup.sh,systemd/*,nginx/*,caddy/*}`
- `.github/workflows/release-landing.yml`, `release-docs.yml`

---

## 14. Critical files to modify (master list)

- `apps/server/src/config.ts` — `RuntimeMode` extended, Google/GitHub/authorized_emails config, `serverPublicUrl`
- `apps/server/src/cli.ts` — new env vars wired, new `v3 setup` / `v3 auth` / `v3 admin` subcommands
- `apps/server/src/bootstrap.ts` — branch on mode, provide Postgres layer in server-node mode, wire MeshHub layer
- `apps/server/src/ws.ts` (lines 1066-1087) — inject `UserContextResolver`, register all `mesh.*` RPCs in `WsRpcGroup.of({...})`
- `apps/server/src/server.ts` — register new Layers in mergeAll
- `apps/server/src/serverRuntimeStartup.ts` — new startup phase `mesh.devices.bootstrap`, publish `device-registry-ready` lifecycle event
- `apps/server/src/serverLifecycleEvents.ts` — new event variants
- `apps/server/src/auth/Services/ServerAuth.ts` — `AuthenticatedSession` gains optional `userId/deviceId/deviceKind`
- `apps/server/src/auth/Layers/ServerAuth.ts` — new `exchangeGoogleIdToken` method
- `apps/server/src/auth/Layers/ServerAuthPolicy.ts` — new `v3-google-managed` policy branch
- `packages/contracts/src/auth.ts` — extend `ServerAuthPolicy` + `ServerAuthBootstrapMethod` literal unions
- `packages/contracts/src/rpc.ts` — register `WsMesh*Rpc`s
- `packages/contracts/src/server.ts` — new `ServerLifecycleStreamEvent` variants
- `packages/contracts/src/orchestration.ts` — new V3 event variants (`thread.forked`, `thread.cloud-env.starting/ready`, `thread.container.killed`, `thread.ended`)
- `apps/server/src/orchestration/decider.ts` — new command cases (`chat.fork`, `chat.end`, `thread.cloud-env.start`, `thread.prepare-worktree`, etc.)
- `apps/server/src/orchestration/projector.ts` — project new events
- `apps/server/src/persistence/Layers/OrchestrationEventStore.ts` — `copyChatEvents(sourceStreamId, targetStreamId)` for fork
- `apps/desktop/src/main.ts` — `app.setAsDefaultProtocolClient("v3")`, `open-url` + `second-instance` listeners, new IPC channels
- `apps/desktop/src/preload.ts` — expose V3 IPC
- `apps/web/src/main.tsx` — resolve V3 bootstrap (policy → Google sign-in → Drive App Data → mount router)
- `apps/web/src/components/AppSidebarLayout.tsx` — swap to `DeviceSidebar`
- `apps/web/src/components/Sidebar.tsx` — extract signed-out path to `LegacyProjectSidebar.tsx` (pure file-move)
- `apps/web/src/components/ChatView.tsx` (after P0 split) — inject banners around line 3247
- `apps/web/src/components/chat/MessagesTimeline.tsx` — extend `MessagesTimelineRow` union with `subagent` kind; user-message render adds `PromptAttribution`
- `apps/web/src/rpc/serverState.ts` — add `serverModeAtom`, `userSessionAtom`
- `apps/web/src/routes/_chat.tsx` — inject `ConfigureServerBanner`
- `apps/web/src/hooks/useHandleNewThread.ts` — extend `DraftThreadState` with `hostDeviceId`
- `apps/web/src/rpc/wsConnectionState.ts` — (optional) align max delay with spec
- `apps/web/src/components/settings/SettingsSidebarNav.tsx` — extend `SETTINGS_NAV_ITEMS`
- `package.json` — catalog additions per §5, workspaces update
- `turbo.json` — rename globalEnv `T3CODE_*` → `V3CODE_*`, add mobile/cloud-env tasks

Every file in this list MUST get an entry in `.docs/MESH_CHANGES.md` when first touched.

---

## 15. Verification plan

**Per-phase gate commands (from `AGENTS.md`, non-negotiable):**

- `bun fmt` (oxfmt)
- `bun lint` (oxlint)
- `bun typecheck` (turbo)
- `bun run test` (Vitest — NEVER `bun test`)
- `bun run --cwd apps/web test:browser`
- `bun run test:desktop-smoke`

**Phase-specific integration tests:**

- P1: `apps/server/src/identity/*.test.ts` (Google JWKS mock, GitHub App token round-trip, AES-GCM round-trip, device approval state machine). `apps/server/src/ws.v3.test.ts` smoke.
- P2: `DriveAppDataClient.test.ts`. Wizard E2E via Playwright on all 3 OSes. Mock `cloudflared` binary mode.
- P4: Cross-device fixture — 3 in-process WS clients + server. 1000-event replay perf test. Gap-fill test. Concurrent `publish_event` ordering test.
- P5: Prompt-routing round-trip test (viewer→hub→host→back). Host-offline rejection test.
- P6: Fork SQL determinism test (replay fork → identical projections). Non-running-chat restriction test.
- P8: Container lifecycle test via `testcontainers-node` or real dockerode. Resource-limit enforcement test. Token-injection round-trip test. Preview proxy test.
- P9: Real-device Android testing on Pixel 7+ (Lucas's device). FCM wake tests.
- P10: Subagent event-tree reconstruction test.

**End-to-end acceptance (P11):**
Lucas can:

1. Install V3 Desktop on a fresh machine, sign in with Google, configure server on Mini PC, sign in from Laptop, see presence.
2. Start a chat on Desktop, observe it live from Laptop, send a prompt from Laptop that executes on Desktop.
3. Fork that chat from Desktop to Laptop, continue on Laptop.
4. Create a Cloud chat for an `agaminggod1234/*` repo, have Claude commit & push, end the chat.
5. Close Laptop for an hour, reconnect, see all gap events replayed.
6. Install V3 on Android via Play Store internal testing, receive FCM notification when Desktop finishes a turn.
7. (Non-Lucas external tester) Follow `docs/deploy-self.md` and reproduce steps 1–6.

Performance gates:

- 1000-event replay <500ms (P4)
- Reconnect gap-fill <2s (P4)
- Cloud container start <10s (P8)
- WS schema decode <1ms p99

---

## 16. Top risks ranked

1. **Seq-authority spec conflict** (D2). Must resolve (Q1) before P4. Host-assigned seq doesn't work for Cloud env and breaks under host crashes.
2. **Sidebar.tsx + ChatView.tsx monolithic refactor.** Must land in P0 via `.plans/04` before V3 edits pile up. Skipping risks unreviewable diffs forever.
3. **ext4 disk quota silent failure on Docker** (P8). `--storage-opt size=` no-ops on ext4 without xfs+pquota or btrfs/zfs. Setup wizard MUST probe and warn.
4. **Cloudflare Tunnel requires user-owned domain.** Quick Tunnels give ephemeral hostnames that break Drive App Data `server_url`. Wizard asks "do you own a domain?" as Q1.
5. **Postgres install burden on home-PC users.** Keep SQLite fallback for no-Cloud-env users. Only require Postgres when Cloud env or multi-device opted in.
6. **Android background WS + FCM on Android 14+.** Budget 5 weeks for P9 with FCM-data-only fallback path.
7. **T3 upstream drift.** Monthly integration branch cadence + weekly dry-rebase. Plan hard-fork decision at end of P4.
8. **Mesh-publisher lag** — events appended on host but not yet flushed to hub, viewer subscribes and misses. Solution: `MeshPublisher` inside same Effect scope as `OrchestrationEngine.processEnvelope` (sync publish on commit success); SQLite outbox backup for retry.
9. **Provider-process-vs-event-log divergence.** Inherited risk; write a kill-child-mid-stream integration test to verify convergence.
10. **Effect 4.0-beta churn.** Lock `catalog.effect`; advance only in dedicated sprints.

---

## 17. Open questions for Lucas

Blocking questions collected by agents that need Lucas's call before P4 (at latest):

**Q1 (CRITICAL, pre-P4).** Seq authority: **server-authoritative** (my recommendation, D2) vs literal host-assigned (spec §5.2)? Server-auth via `stream_version` fits existing engine, handles Cloud env cleanly, survives host crashes. Host-assigned is what spec literally says.

**Q2 (CRITICAL, pre-P1).** **Skip Better Auth** (D3) and build Google/GitHub on top of existing `ServerAuth` (saves 2–3 weeks, no auth stack duplication), vs follow spec literally?

**Q3 (pre-P2).** **Effect SQL for Postgres** (D5, `@effect/sql-pg`, no wrappers), vs spec's Drizzle ORM (requires `Effect.tryPromise` everywhere + second migration runner)?

**Q4 (pre-P8).** **Server-side Claude+Codex credentials** (D7, user enters during setup wizard, injected into containers via tmpfs secret mount), vs re-login per container (safer but adds 30–60s startup)?

Other decisions we can resolve during their phase (non-blocking for plan approval):

- Namespace rename `@t3tools` → `@v3tools` on P0 day 1 (D14) — cost: ~1 dev-day, benefit: prevents drift pain
- `chat_events` as new aggregate vs `thread` aggregate extension (lean toward the latter, simpler)
- Postgres partitioning strategy (hash-16 on `stream_id` recommended for the `100 GB` target ceiling)
- Custom `v3://` scheme for Google OAuth Electron flow (vs loopback server fallback on Linux DEs)
- Cloud-env Claude/Codex credential re-provisioning on token rotation
- Whether desktop machine becoming a server-node shuts down its embedded backend entirely (recommended: yes, no dual backend)

These are tracked in per-domain plan files (agent reports) for reference during implementation.

---

## 18. What's explicitly deferred past v1 (post-launch v1.1+)

- Cloudflare Containers deploy target
- Fly Machines container runtime (if user wants Fly.io-deployed V3 to also run Cloud env on same platform; workaround: use Docker on a sibling Fly Machine)
- iOS app
- Multi-user per server node (family / team)
- E2E encryption for cloud-deployed server nodes
- Server node export/import migration tool
- Auto-commit rules for Cloud env
- Chat templates / saved prompts
- Voice input
- Screen sharing between devices
- Playwright as an agent-accessible tool (`browser_use` capability stays declared-but-unused)
- `WebContentsView` upgrade for preview pane
- Wildcard-subdomain preview (auth cookie and CORS friendly)
- Cloud env deep features: build caching, per-user shared volumes, warm-start pools

---

## 19. Process / rules from existing T3 codebase (non-negotiable)

- `bun fmt`, `bun lint`, `bun typecheck` must pass before any task is considered complete (AGENTS.md).
- Use `bun run test`, NEVER `bun test` (AGENTS.md).
- Effect-TS layer composition only — no global singletons, no service-locator patterns.
- `packages/contracts` is schema-only — no runtime logic.
- `packages/shared` uses explicit subpath exports — no barrel index.
- Every upstream-file modification must appear in `MESH_CHANGES.md` with a `Last rebase verified` date.
- Commit messages follow existing convention; reference phase (`P4:` prefix).
- No new external service dependencies without explicit Lucas approval (cost / privacy posture).
- MIT license + attribution to T3 Code retained everywhere.
