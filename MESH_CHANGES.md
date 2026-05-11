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

### Phase 12 - Orchestrated sessions

The orchestrator plan is implemented against V3's current event-sourced
orchestration stack rather than the older planned `chats` /
`chat_events` router. `session_mode` and `orchestrator_config` live on
projection threads, saved settings carry the reusable config, and
provider output is projected into orchestrator lanes.

New files:

- `.claude/agents/sonnet-assistant.md` - subagent definition for the
  Sonnet assistant role.
- `packages/contracts/src/orchestrator-config.ts` - schema-only
  orchestrator role, subagent, planning, and session-mode contracts with
  provider-specific free-form model/effort/mode fields.
- `packages/agent-harness/package.json` - new workspace package
  manifest.
- `packages/agent-harness/tsconfig.json` - TypeScript config for the
  harness package.
- `packages/agent-harness/src/CLIProcess.ts` - lifecycle wrapper for a
  single CLI child process.
- `packages/agent-harness/src/AgentRouter.ts` - routes tasks to agents
  by role/type.
- `packages/agent-harness/src/OrchestratorSession.ts` - manages the
  orchestrator, implementation, and assistant process set.
- `packages/agent-harness/src/TaskQueue.ts` - in-memory task queue
  state that can be rebuilt from orchestration events.
- `packages/agent-harness/src/index.ts` - harness package exports.
- `apps/server/src/persistence/Migrations/034_OrchestratorSessionMode.ts`
  - SQLite projection-thread migration for `session_mode` and
    `orchestrator_config_json`.
- `apps/server/src/persistence/PostgresMigrations/034_OrchestratorSessionMode.ts`
  - Postgres equivalent of the orchestrator projection-thread
    migration.
- `apps/server/src/orchestration/session.ts` - orchestrated-session
  prompt and turn-input builder for plan/delegate/monitor/review runs.
- `apps/server/src/orchestration/events.ts` - helper that publishes
  orchestrator task and lane fallback events.
- `apps/server/src/orchestration/index.ts` - server orchestration
  module exports.
- `apps/web/src/components/OrchestratedSession/AgentBadge.tsx` - model
  and status pill for orchestrated lanes.
- `apps/web/src/components/OrchestratedSession/AgentLane.tsx` -
  height-bounded agent output lane.
- `apps/web/src/components/OrchestratedSession/TaskQueue.tsx` -
  orchestrator task queue view.
- `apps/web/src/components/OrchestratedSession/index.tsx` - three-panel
  orchestrated chat view.
- `apps/web/src/components/settings/OrchestratorSettings/ProviderPicker.tsx`
  - shared provider/model/effort/mode picker with free-text model
    fallback.
- `apps/web/src/components/settings/OrchestratorSettings/OrchestratorRoles.tsx`
  - per-role orchestrator provider configuration.
- `apps/web/src/components/settings/OrchestratorSettings/SubAgentConfig.tsx`
  - add/remove/edit controls for subagent definitions.
- `apps/web/src/components/settings/OrchestratorSettings/PlanningConfig.tsx`
  - fast-mode and planning-budget settings.
- `apps/web/src/components/settings/OrchestratorSettings/index.tsx` -
  Orchestrator settings page root.
- `apps/web/src/routes/settings.orchestrator.tsx` - settings route for
  orchestrator preferences.

Modified files:

- `packages/contracts/src/index.ts` - exports orchestrator config
  contracts.
- `packages/contracts/src/settings.ts` - stores saved
  `orchestratorConfig` in server settings patches and snapshots.
- `packages/contracts/src/orchestration.ts` - adds `sessionMode`,
  `orchestratorConfig`, orchestrator task events, and agent lane chunk
  events to orchestration commands/read models.
- `apps/server/src/cloud/http.ts` - carries orchestrator fields through
  cloud-mode thread shells.
- `apps/server/src/serverRuntimeStartup.ts` - carries orchestrator
  fields through startup thread projections.
- `apps/server/src/ws.ts` - includes orchestrator thread fields in WS
  shell responses.
- `apps/server/src/orchestration/decider.ts` - accepts orchestrator task
  and lane chunk commands and emits projection activity.
- `apps/server/src/orchestration/projector.ts` - projects session mode
  and orchestrator config onto thread read models.
- `apps/server/src/orchestration/Layers/MeshEventIngestion.ts` -
  imports remote orchestrator thread metadata and events.
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` -
  includes orchestrator thread fields in projection writes.
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts` -
  exposes orchestrator fields from projection snapshots.
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` -
  routes orchestrated turns through the orchestration prompt wrapper and
  emits active-provider fallback lane events.
- `apps/server/src/persistence/Migrations.ts` - registers migration 034.
- `apps/server/src/persistence/PostgresMigrations.ts` - registers
  Postgres migration 034.
- `apps/server/src/persistence/Layers/ProjectionThreads.ts` - persists
  projection-thread `session_mode` and serialized
  `orchestrator_config_json`.
- `apps/server/src/persistence/Services/ProjectionThreads.ts` - adds
  orchestrator fields to projection thread rows and schemas.
- `apps/server/src/orchestration/commandInvariants.test.ts` - updates
  command invariant fixtures for thread session mode/config.
- `apps/server/src/orchestration/Layers/OrchestrationEngine.test.ts` -
  updates orchestration fixtures for thread session mode/config.
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts`
  - updates snapshot fixtures for thread session mode/config.
- `apps/server/src/persistence/Layers/ProjectionRepositories.test.ts` -
  covers persisted orchestrator projection fields.
- `apps/server/src/provider/Layers/ProviderSessionReaper.test.ts` -
  updates provider-reaper fixtures for thread session mode/config.
- `apps/server/src/server.test.ts` - updates server shell fixtures for
  thread session mode/config.
- `apps/web/src/types.ts` - exposes orchestrator session mode/config in
  web thread types.
- `apps/web/src/store.ts` - persists orchestrator config in settings
  state and keeps thread settings in sync.
- `apps/web/src/routeTree.gen.ts` - generated route tree for
  `/settings/orchestrator`.
- `apps/web/src/components/ChatView.logic.ts` - carries selected
  session mode/config through local draft bootstrap logic.
- `apps/web/src/components/ChatView.tsx` - detects orchestrated threads,
  renders the orchestrated session layout, and persists session mode
  before turns.
- `apps/web/src/components/chat/ChatComposer.tsx` - forwards session
  mode selection to send logic.
- `apps/web/src/components/chat/ProviderModelPicker.tsx` - adds the
  Orchestrator provider option and sets `session_mode: orchestrated`.
- `apps/web/src/components/settings/settingsNavigation.ts` - adds the
  Orchestrator settings navigation entry.
- `apps/web/src/components/settings/settingsSearch.ts` - indexes
  Orchestrator settings fields.
- `apps/web/src/components/ChatView.logic.test.ts` - updates draft
  thread expectations for orchestrator fields.
- `apps/web/src/components/CommandPalette.logic.test.ts` - updates
  thread fixtures for orchestrator fields.
- `apps/web/src/components/Sidebar.logic.test.ts` - updates sidebar
  thread fixtures for orchestrator fields.
- `apps/web/src/components/ChatView.browser.tsx` - updates browser
  fixtures for orchestrator fields.
- `apps/web/src/components/KeybindingsToast.browser.tsx` - updates
  browser fixtures for orchestrator fields.
- `apps/web/src/environments/runtime/service.threadSubscriptions.test.ts`
  - updates subscription fixtures for orchestrator fields.
- `apps/web/src/store.test.ts` - covers settings/thread state with
  orchestrator config fields.
- `apps/web/src/lib/threadSort.test.ts` - updates thread-sort fixtures
  for orchestrator fields.
- `apps/web/src/worktreeCleanup.test.ts` - updates cleanup fixtures for
  orchestrator fields.
- `bun.lock` - includes the new workspace package after `bun install`.
- `MESH_CHANGES.md` - documents the orchestrator feature delta.
- `PROJECT_LOG.md` - records the implementation and verification pass.

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
