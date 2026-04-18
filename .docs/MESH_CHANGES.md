# MESH_CHANGES.md

Log of every V3 modification to upstream T3 Code files. This is the single source of truth for the monthly `upstream-sync/<YYYY-MM>` rebase from `pingdotgg/t3code`. Every PR that touches an inherited file must update its entry here.

CI enforces that any file listed below must have its **Last rebase verified** bumped when modified — see `.github/workflows/upstream-conflict-check.yml`.

## Format

```markdown
### `<relative/path/to/file>`

- **First modified**: <commit sha or PR number> (<YYYY-MM-DD>)
- **V3 phase**: <Phase N: short name>
- **Reason**: <one sentence>
- **What changed**:
  - Added: <symbol / import>
  - Modified: <function: behavior change>
  - Removed: <symbol / N/A>
- **Conflict risk on rebase**: low | medium | high
  - low — V3 code appended at end of file or isolated section
  - medium — V3 edits inside a function upstream edits frequently
  - high — V3 changes a top-level API upstream owns
- **Upstream signals to watch**:
  - file rename: <mitigation>
  - signature change: <mitigation>
- **Last rebase verified**: <YYYY-MM-DD> (t3code <tag>)
```

## Upstream relationship

- **Origin**: `agaminggod1234/v3code`
- **Upstream**: `pingdotgg/t3code` (track **tagged releases only**, not `main`)
- **Cadence**: monthly `upstream-sync/<YYYY-MM>` integration branch → rebase upstream into it → merge to `v3-dev` → release to `main`
- **Hard-fork decision gate**: End of Phase 4 (week 20) — if upstream has diverged in ways that make rebase cost exceed its value, declare V3 independent and stop tracking.

## Known-risk files (from research)

Anticipated high-churn / high-conflict-risk upstream files V3 must modify. Listed for rebase vigilance before any modifications land:

- `apps/server/src/ws.ts` (HIGH — 1091 lines, active upstream development, V3 adds mesh RPC handlers around line 547 and auth hook around line 1066)
- `apps/server/src/bootstrap.ts` (MEDIUM — V3 injects mesh hub startup)
- `apps/server/src/server.ts` (MEDIUM — Layer.mergeAll extended)
- `apps/server/src/serverRuntimeStartup.ts` (MEDIUM — new startup phases)
- `apps/server/src/serverLifecycleEvents.ts` (LOW — new event variants)
- `apps/server/src/auth/Layers/ServerAuth.ts` (MEDIUM — active upstream plan `.plans/18-server-auth-model.md`)
- `apps/server/src/auth/Layers/ServerAuthPolicy.ts` (MEDIUM — same)
- `apps/server/src/config.ts` (MEDIUM — new fields; upstream adds fields regularly)
- `apps/server/src/cli.ts` (MEDIUM)
- `apps/server/src/orchestration/decider.ts` (HIGH — V3 adds `chat.fork`, `chat.end`, cloud-env commands)
- `apps/server/src/orchestration/projector.ts` (HIGH — V3 projects new events)
- `apps/server/src/orchestration/Layers/OrchestrationEngine.ts` (HIGH — post-commit fork hook)
- `apps/server/src/persistence/Migrations.ts` (LOW — append-only)
- `apps/web/src/main.tsx` (MEDIUM — V3 bootstrap wrapper)
- `apps/web/src/components/AppSidebarLayout.tsx` (LOW — swap Sidebar → DeviceSidebar)
- `apps/web/src/components/Sidebar.tsx` (HIGH — 3394 lines; .plans/04 split lands first)
- `apps/web/src/components/ChatView.tsx` (HIGH — 3472 lines; .plans/04 split lands first)
- `apps/web/src/components/chat/MessagesTimeline.tsx` (MEDIUM — PromptAttribution + subagent rows)
- `apps/web/src/rpc/serverState.ts` (LOW — new atoms)
- `apps/web/src/routes/__root.tsx` (MEDIUM — V3 auth gate)
- `apps/web/src/routes/_chat.tsx` (LOW — ConfigureServerBanner injection)
- `apps/desktop/src/main.ts` (MEDIUM — `v3://` scheme, new IPC)
- `apps/desktop/src/preload.ts` (LOW — expose V3 IPC)
- `packages/contracts/src/rpc.ts` (MEDIUM — register mesh.\* RPCs)
- `packages/contracts/src/auth.ts` (MEDIUM — policy/method unions extended)
- `packages/contracts/src/orchestration.ts` (HIGH — new event + command variants)
- `package.json` (MEDIUM — catalog additions, namespace rename)
- `turbo.json` (LOW — globalEnv rename)

## Entries

### Phase 0 codemod (commit 859aabd8)

All 406 files touched by the codemod are implicit entries — see `scripts/upstream-rebase.ts` `RENAME_MAPPINGS` for the canonical list. No per-file entries needed until upstream files receive **hand-written** V3 edits (Phase 1+).

### Phase 1a — identity services (server-only, additive)

All changes below are NEW files in V3-owned subtrees or additive entries in upstream-owned indexes. No upstream files were hand-modified.

**New files (V3-owned — no rebase conflict risk):**

- `packages/contracts/src/identity.ts` — Effect Schema types for `GoogleSub`, `UserId`, `DeviceId`, `DevicePlatform`, `DeviceKind`, `DeviceCapability`, `UserInfo`, `DeviceInfo`, `VerifiedGoogleIdentity`, `GoogleBootstrapInput/Result`.
- `apps/server/src/persistence/Migrations/026_V3UsersDevices.ts` — adds `v3_users`, `v3_devices`, `v3_device_sessions` tables (prefixed `v3_` to keep V3 additions visually separate from upstream tables).
- `apps/server/src/identity/Errors.ts`
- `apps/server/src/identity/tokenEncryption.ts` (+ `.test.ts`) — AES-256-GCM helpers for at-rest encryption of GitHub / provider tokens.
- `apps/server/src/identity/Services/{UserRepository,DeviceRepository,GoogleIdentityService}.ts`
- `apps/server/src/identity/Layers/{UserRepository,DeviceRepository,GoogleIdentityService}.ts` (+ `.test.ts` each)

**Modified upstream files (each needs MESH_CHANGES review on rebase):**

### `packages/contracts/src/index.ts`

- **First modified**: P1a bootstrap (2026-04-18)
- **V3 phase**: Phase 1a — identity services
- **Reason**: Re-export the new V3 `identity` module alongside the existing upstream exports.
- **What changed**:
  - Added: `export * from "./identity.ts";` after the auth re-export.
- **Conflict risk on rebase**: low — append-only addition in a stable index file.
- **Upstream signals to watch**: upstream may reorder or split this index; re-apply V3 line in the new location.
- **Last rebase verified**: 2026-04-18 (t3code v0.0.20 + 2 upstream commits)

### `apps/server/src/persistence/Migrations.ts`

- **First modified**: P1a bootstrap (2026-04-18)
- **V3 phase**: Phase 1a — identity services
- **Reason**: Register migration 026 in the statically-imported migration loader.
- **What changed**:
  - Added: `import Migration0026 from "./Migrations/026_V3UsersDevices.ts";`
  - Added: `[26, "V3UsersDevices", Migration0026],` as the last entry of `migrationEntries`.
- **Conflict risk on rebase**: medium — upstream will keep adding migrations 027, 028, ...; every V3 rebase will need to slot V3 migrations at the tail and renumber if upstream grabs the same id.
- **Upstream signals to watch**: a new upstream migration with id 26 → V3 renumbers to the next free id and updates both the migration filename and the `migrationEntries` entry.
- **Last rebase verified**: 2026-04-18 (t3code v0.0.20 + 2 upstream commits)

### `apps/server/package.json`

- **First modified**: P1a bootstrap (2026-04-18)
- **V3 phase**: Phase 1a — identity services
- **Reason**: Add `jose ^5.10.0` for Google ID-token JWKS verification.
- **What changed**:
  - Added dependency `"jose": "^5.10.0"`.
- **Conflict risk on rebase**: low — dependency-set additions merge cleanly unless upstream reshuffles the dependencies block.
- **Upstream signals to watch**: new upstream deps in alphabetical order may shift line numbers but won't conflict.
- **Last rebase verified**: 2026-04-18 (t3code v0.0.20 + 2 upstream commits)

## Known upstream gaps inherited at fork time (v0.0.20 / 9df3c640)

- `apps/web/src/components/ui/input.tsx:44` — pre-existing `tsc` error on the `style` prop where Base UI's state-callback `CSSProperties` shape doesn't assign to React's native `CSSProperties`. Confirmed present on pristine upstream before any V3 edits. Do NOT patch as part of V3 — either wait for upstream fix or file upstream bug. Current `bun run typecheck` exits non-zero on `@v3tools/web` because of this, but all 7 other packages typecheck clean.
- `apps/server/src/auth/Layers/ServerSecretStore.test.ts > "uses restrictive permissions for the secret directory and files"` — asserts `chmod 0o700`/`0o600` calls were made, but Windows NTFS is a no-op for `chmod` so the recording file-system layer records zero calls on Windows. Platform bug in the test, not in production code. All other secret-store tests pass. Skip on Windows dev boxes; Linux CI passes.
- `apps/server/src/server.test.ts > "subscribeServerConfig streams snapshot then update"` and `"projects.searchEntries errors"` — two of 61 integration tests flake on Windows, reproduced on pristine P1a state before any P1b changes. Not caused by V3 code. Linux CI presumably passes.

### Phase 1b — Google bootstrap route + DeviceApprovalService (additive)

**New files (V3-owned):**

- `apps/server/src/identity/Services/DeviceSessionRepository.ts` (+ `Layers/DeviceSessionRepository.ts` + `.test.ts`) — `v3_device_sessions` table access (link a session to a device, lookup by session id). 3 tests.
- `apps/server/src/identity/Services/DeviceApprovalService.ts` (+ `Layers/DeviceApprovalService.ts` + `.test.ts`) — `registerOrResume` (first-device auto-approve, subsequent devices need approval), `approve`, `remove`, PubSub event stream. 7 tests.
- `apps/server/src/identity/http.ts` — `POST /api/auth/google/bootstrap` route. Verifies ID token, enforces `authorizedEmails` allowlist, upserts user, registers device via approval service, issues browser-session-cookie via existing `SessionCredentialService`, links session ↔ device, returns `GoogleBootstrapResult` with `Set-Cookie`.

**Modified upstream files:**

### `apps/server/src/config.ts`

- **Modified**: 2026-04-18 (P1b)
- **V3 phase**: Phase 1b — Google bootstrap route
- **Reason**: Carry Google OAuth client id and the email allowlist through the runtime config.
- **What changed**:
  - Added to `ServerConfigShape`: `googleClientId: string | undefined`, `authorizedEmails: ReadonlyArray<string>`.
  - Added to `ServerConfig.layerTest` defaults: both fields set to absent / empty.
- **Conflict risk on rebase**: medium — `ServerConfigShape` is a hotspot upstream.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/cli.ts`

- **Modified**: 2026-04-18 (P1b)
- **V3 phase**: Phase 1b — Google bootstrap route
- **Reason**: Load Google config from env (`V3CODE_GOOGLE_CLIENT_ID`, `V3CODE_AUTHORIZED_EMAILS`) and populate `ServerConfigShape`.
- **What changed**:
  - `EnvServerConfig` gains `googleClientId` and `authorizedEmails` entries.
  - `config` struct populates both fields; `parseAuthorizedEmails` helper added.
- **Conflict risk on rebase**: medium.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/server.ts`

- **Modified**: 2026-04-18 (P1b)
- **V3 phase**: Phase 1b — Google bootstrap route
- **Reason**: Wire the V3 identity Live layers into `RuntimeDependenciesLive` and register `googleBootstrapRouteLayer` in `makeRoutesLayer`.
- **What changed**:
  - New `V3IdentityLayerLive` composed from the 5 identity Live layers, provided via `PersistenceLayerLive`.
  - `RuntimeDependenciesLive` adds `Layer.provideMerge(V3IdentityLayerLive)` right after `AuthLayerLive`.
  - `makeRoutesLayer` adds `googleBootstrapRouteLayer`.
- **Conflict risk on rebase**: medium — `RuntimeDependenciesLive` and `makeRoutesLayer` are both hotspots.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/server.test.ts` + `cli.test.ts` + `environment/Layers/ServerEnvironment.test.ts`

- **Modified**: 2026-04-18 (P1b)
- **V3 phase**: Phase 1b — Google bootstrap route
- **Reason**: Existing tests construct `ServerConfigShape` inline; they need the two new fields.
  `server.test.ts` additionally provides the V3 identity Live layers via a new `v3IdentityTestLayer` composition so the test harness can build when `googleBootstrapRouteLayer` is in `makeRoutesLayer`.
- **Conflict risk on rebase**: low for cli/environment (field addition). Medium for server.test.ts (two edits: config literal + layer composition).
- **Last rebase verified**: 2026-04-18

### Phase 1c — UserContextResolver (session → user+device resolver)

**New files (V3-owned):**

- `apps/server/src/identity/Services/UserContextResolver.ts` (+ `Layers/UserContextResolver.ts` + `.test.ts`) — `resolve(sessionId) → Effect<Option<{userId, deviceId}>>`. Walks `auth_sessions → v3_device_sessions → v3_devices`. Returns `None` for classic T3 pairing sessions (no V3 link) or sessions whose device has been soft-removed. 4 tests.

**Modified upstream files (second P1 touch):**

### `apps/server/src/server.ts` (P1c update on top of P1b)

- **Modified**: 2026-04-18 (P1c)
- **V3 phase**: Phase 1c — UserContextResolver
- **Reason**: Add `UserContextResolverLive` to `V3IdentityLayerLive` via `Layer.provide(DeviceSessionRepositoryLive)` (Layer.mergeAll doesn't satisfy intra-merge deps).
- **Conflict risk on rebase**: low — inside V3-owned composition block.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/server.test.ts` (P1c update on top of P1b)

- **Modified**: 2026-04-18 (P1c)
- **V3 phase**: Phase 1c — UserContextResolver
- **Reason**: Mirror `v3IdentityTestLayer` composition.
- **Conflict risk on rebase**: low.
- **Last rebase verified**: 2026-04-18

### Phase 1d — Client-side Google sign-in (renderer + Electron + public config route)

P1d completes the bootstrap loop wired in P1a–P1c by giving the renderer a way
to actually obtain a Google ID token and forward it to the existing
`/api/auth/google/bootstrap` route. Lucas's Q1d-1 answer (top-right always-
visible button + soft startup nudge) is realised by mounting a single overlay
in `__root.tsx`. Q1d-2 is satisfied by leaving `V3CODE_GOOGLE_CLIENT_ID`
unset in dev — the new `GET /api/auth/google/config` route surfaces a
"not configured" state so the button shows but stays disabled until Lucas
provisions the OAuth Client ID via the Google Cloud Console.

**New files (V3-owned — no rebase conflict risk):**

- `apps/desktop/src/v3GoogleAuthFlow.ts` (+ `.test.ts`) — pure factory `createV3GoogleAuthFlow({ openExternal, fetch })`. Generates state + PKCE S256, opens the system browser, awaits the matching `v3://auth/google/callback` deep link via `handleDeepLink(url)`, exchanges the code at `https://oauth2.googleapis.com/token`, returns `{ idToken }`. `getSharedV3GoogleAuthFlow()` lazily wires Electron's `shell` so the test exercises the factory without a vitest electron mock. 7 tests cover the success path, empty client id, state mismatch, scheme/path filtering, explicit Google `error` param, token-endpoint failure, and supersede-by-new-flow cancellation.
- `apps/web/src/v3/auth/deviceId.ts` (+ `.test.ts`) — `resolveDeviceId()` reads `localStorage["v3.device-id"]`, mints a UUID v4 via `crypto.randomUUID()` if absent or malformed, returns the branded `DeviceId`. 4 tests cover mint-on-empty, idempotency, regeneration on malformed entry, and graceful behaviour when storage `setItem` throws.
- `apps/web/src/v3/auth/signInState.ts` (+ `.test.ts`) — non-sensitive client store: `recordV3SignedIn`, `clearV3SignedIn`, `useV3SignInSnapshot`, `dismissStartupNudge`, `dismissStartupNudgePermanently`, `shouldShowStartupNudge`. Snapshot carries `{ email, displayName, avatarUrl, pendingApproval }`. Cross-tab updates via `storage` event. 9 tests cover snapshot lifecycle, 7-day soft-dismissal window, permanent dismissal, and malformed-entry tolerance.
- `apps/web/src/v3/auth/googleSignIn.ts` — orchestrator. `fetchGoogleClientConfig()` hits the new server route. `startV3GoogleSignIn()` requires Electron in P1d (browser-only flow deferred to P7), invokes `desktopBridge.openV3GoogleSignIn`, POSTs id_token + device metadata to `/api/auth/google/bootstrap`, decodes the result via the `GoogleBootstrapResult` schema, and writes the snapshot. Throws a `V3SignInError` carrying a discriminated `code`.
- `apps/web/src/v3/ui/SignInButton.tsx` — three states: signed-in chip with email + local sign-out, configured-and-signed-out primary button, "not configured" disabled affordance with tooltip explaining the operator hasn't set `V3CODE_GOOGLE_CLIENT_ID`.
- `apps/web/src/v3/ui/StartupSignInNudge.tsx` — fires a single dismissible info toast on first authenticated mount when sign-in is configured but this device hasn't signed in yet. Auto-dismisses for 7 days on first show.
- `apps/web/src/v3/ui/DeviceApprovalToast.tsx` — fires a warning toast when the snapshot reports `pendingApproval: true`. P3 wires the WS push that clears it.

**Modified upstream files:**

### `packages/contracts/src/identity.ts` (V3-owned, additive)

- **Modified**: 2026-04-18 (P1d) — V3-owned file; no rebase risk.
- **What changed**: added `GoogleClientPublicConfig = Schema.Struct({ available: Boolean, clientId: NullOr(TrimmedNonEmptyString) })`. Used by both the new server route and the renderer.

### `apps/server/src/identity/http.ts` (V3-owned, additive)

- **Modified**: 2026-04-18 (P1d) — V3-owned file; no rebase risk.
- **What changed**: appended `googleConfigRouteLayer` exporting `GET /api/auth/google/config`. Reads `ServerConfig.googleClientId`; returns `{ available, clientId }`. Public, unauthenticated — the Client ID is intentionally not a secret (installed-app PKCE).

### `apps/server/src/server.ts` (P1d update on top of P1b/P1c)

- **Modified**: 2026-04-18 (P1d)
- **V3 phase**: Phase 1d — client Google sign-in
- **Reason**: Register the public `googleConfigRouteLayer` alongside the bootstrap route.
- **What changed**:
  - Added `googleConfigRouteLayer` to the existing `./identity/http.ts` import.
  - Inserted into `makeRoutesLayer` immediately after `googleBootstrapRouteLayer`.
- **Conflict risk on rebase**: medium — `makeRoutesLayer` is a hotspot. Both V3 entries sit together so a rename/move conflict surfaces in one location.
- **Last rebase verified**: 2026-04-18

### `packages/contracts/src/ipc.ts`

- **Modified**: 2026-04-18 (P1d)
- **V3 phase**: Phase 1d — client Google sign-in
- **Reason**: Expose the renderer-facing `openV3GoogleSignIn` method that drives the Electron-side OAuth flow.
- **What changed**:
  - Added one method to `DesktopBridge`: `openV3GoogleSignIn(input: { clientId: string }): Promise<{ idToken: string }>`. Resolves with the Google id_token; rejects on cancel/timeout/network/misconfiguration.
- **Conflict risk on rebase**: low — DesktopBridge is V3-friendly (additive method on an interface). Watch for upstream renaming the bridge.
- **Last rebase verified**: 2026-04-18

### `apps/desktop/src/preload.ts`

- **Modified**: 2026-04-18 (P1d)
- **V3 phase**: Phase 1d — client Google sign-in
- **Reason**: Wire the new bridge method into the renderer.
- **What changed**:
  - Added channel constant `V3_OPEN_GOOGLE_SIGNIN_CHANNEL = "desktop:v3-open-google-signin"`.
  - Added one method to the `contextBridge.exposeInMainWorld("desktopBridge", …)` object: `openV3GoogleSignIn: (input) => ipcRenderer.invoke(V3_OPEN_GOOGLE_SIGNIN_CHANNEL, input)`.
- **Conflict risk on rebase**: low — append-only.
- **Last rebase verified**: 2026-04-18

### `apps/desktop/src/main.ts`

- **Modified**: 2026-04-18 (P1d)
- **V3 phase**: Phase 1d — client Google sign-in
- **Reason**: Drive the OAuth deep-link flow from the main process: register `v3` as a default protocol handler, acquire the single-instance lock so OS-spawned callback processes forward to the running V3, listen for `open-url` (macOS) / `second-instance` (Win/Linux), and expose the IPC entry point.
- **What changed**:
  - Added imports: `getSharedV3GoogleAuthFlow` from `./v3GoogleAuthFlow.ts`.
  - Added channel constants `V3_OPEN_GOOGLE_SIGNIN_CHANNEL` and `V3_DEEP_LINK_SCHEME` near the existing channel constants.
  - Inserted module-level setup after the constants: `app.setAsDefaultProtocolClient("v3", …)` (with execPath + script path in dev), `app.requestSingleInstanceLock()` (quits the second instance), helpers `isV3DeepLink`/`findV3DeepLinkInArgv`.
  - Added `ipcMain.handle(V3_OPEN_GOOGLE_SIGNIN_CHANNEL, …)` inside `registerIpcHandlers()` between the server-exposure and pick-folder handlers — validates shape and delegates to `getSharedV3GoogleAuthFlow().start({ clientId })`.
  - Inside the `app.whenReady().then(…)` block, attached `app.on("second-instance", …)` and `app.on("open-url", …)` listeners that forward `v3://…` URLs into `getSharedV3GoogleAuthFlow().handleDeepLink` and surface the existing window via `revealWindow`.
- **Conflict risk on rebase**: medium — main.ts is large and upstream rearranges init ordering. The V3 changes cluster in three places (constants, IPC handler block, whenReady listeners) and reuse existing helpers (`revealWindow`, `mainWindow`, `BrowserWindow.getAllWindows`).
- **Behaviour change for upstream-aware rebase**: V3 now requires a single-instance lock for OAuth deep-link forwarding to work. T3 today does not call `requestSingleInstanceLock`; if upstream adds its own single-instance handling, merge the two.
- **Last rebase verified**: 2026-04-18

### `apps/web/src/routes/__root.tsx`

- **Modified**: 2026-04-18 (P1d)
- **V3 phase**: Phase 1d — client Google sign-in
- **Reason**: Mount the V3 sign-in surfaces inside the existing authenticated layout so they appear in every route after the auth gate resolves. Lucas Q1d-1 answer: top-right corner, always visible.
- **What changed**:
  - Added imports: `V3SignInButton`, `V3StartupSignInNudge`, `V3DeviceApprovalToast` from `../v3/ui/*`.
  - Added an inline `V3SignInOverlay` wrapper that pins the button to `fixed top-2 right-2 z-50` so it sits above the existing layout chrome without consuming layout space.
  - Inside `RootRouteView`'s authenticated branch, mounted `<V3SignInOverlay />`, `<V3StartupSignInNudge />`, and `<V3DeviceApprovalToast />` as sibling tail nodes inside the `AnchoredToastProvider`.
- **Conflict risk on rebase**: medium — `__root.tsx` is on the known-risk list and upstream actively edits the authenticated branch's children. The V3 mounts are tail siblings so they survive most upstream churn unless the provider tree reshuffles.
- **Last rebase verified**: 2026-04-18

**Test coverage**

- Server identity suite: still 38/38 (no new tests landed there in P1d — the new `googleConfigRouteLayer` is intentionally minimal and exercised end-to-end by the renderer flow).
- Desktop: +7 tests in `apps/desktop/src/v3GoogleAuthFlow.test.ts`.
- Web: +13 tests across `apps/web/src/v3/auth/{deviceId,signInState}.test.ts`.

### Phase 2a — Server-node mode foundations: RuntimeMode literal + config.toml loader

P2a is the first slice of Phase 2 (master plan budgets 5 weeks total for P2).
Goal: introduce the `server-node` `RuntimeMode` literal, surface a
`~/.v3-code-server/config.toml` loader, and wire detection precedence + the
two field overrides P2a touches (`[server]` host/port and `[auth]`
google-client-id/authorized-emails). Postgres (P2b), Drive App Data (P2c),
the setup wizard (P2d), the cloudflared installer (P2e), Fly/Railway deploy
templates (P2f), the admin panel (P2g), and presence RPCs (P2h) all land in
later sub-phases — but the TOML schema validates every section now so those
phases just consume parsed values.

Detection precedence (master plan §4): CLI flag > env var > bootstrap envelope >
presence of `~/.v3-code-server/config.toml` > default. Field-level precedence in
server-node mode: CLI flag > env var > bootstrap envelope > TOML field >
built-in default. Single-device users without a config.toml see zero behaviour
change.

**New files (V3-owned — no rebase conflict risk):**

- `apps/server/src/serverMode.ts` (+ `.test.ts`) — pure helpers: `resolveServerNodeConfigPath()` (env override + home-dir default), `hasServerNodeConfig()` (FS existence check), `resolveServerMode()` (precedence pure function). 9 tests cover each level of precedence + the env-override path.
- `apps/server/src/config/serverNodeConfig.ts` — Schema mirroring the master plan §10.4 TOML surface (`[server]`, `[auth]`, `[database]`, `[cloud_env]`, `[limits]`). Top-level + every section is `optional` so partial files are valid.
- `apps/server/src/config/tomlLoader.ts` (+ `.test.ts`) — `loadServerNodeConfig(path)` reads + parses (`smol-toml`) + Schema-decodes. Returns `Option.none()` when the file is absent; surfaces `ServerNodeConfigError` with discriminated `reason: "read" | "parse" | "schema"` otherwise. 7 tests cover absence, minimal config, full master-plan example, parse failure, schema mismatch, port range check, empty file.

**Modified upstream files:**

### `apps/server/src/config.ts` (P2a update on top of P1b)

- **Modified**: 2026-04-18 (P2a)
- **V3 phase**: Phase 2a — server-node mode foundations
- **Reason**: Extend the `RuntimeMode` Schema literal with `"server-node"` so the existing `Config.schema(RuntimeMode, "V3CODE_MODE")` + CLI choice flag accept it without bespoke parsing.
- **What changed**:
  - `RuntimeMode = Schema.Literals(["web", "desktop"])` → `Schema.Literals(["web", "desktop", "server-node"])`.
- **Conflict risk on rebase**: low — single-line widening, additive.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/cli.ts` (P2a update)

- **Modified**: 2026-04-18 (P2a)
- **V3 phase**: Phase 2a — server-node mode foundations
- **Reason**: Wire `serverMode.resolveServerMode` (precedence) + `loadServerNodeConfig` (TOML parse) into `resolveServerConfig`. Apply TOML field overrides for port/host/googleClientId/authorizedEmails when mode resolves to server-node.
- **What changed**:
  - Imports added for `loadServerNodeConfig`, `ServerNodeConfig`, and the three serverMode helpers.
  - Existing inline `Option.firstSomeOf` mode-resolution block replaced by a call to `resolveServerMode` that takes the existing CLI/env/bootstrap signals plus `hasConfigToml`.
  - When `mode === "server-node" && hasConfigToml`, the TOML file is loaded and `tomlConfig` becomes the lowest-precedence layer in the per-field merges below.
  - Port + host gain a fourth `Option.fromUndefinedOr(tomlConfig?.server?.bind_port|bind_host)` precedence entry.
  - `googleClientId` falls back to `tomlConfig?.auth?.google_client_id` when env is unset.
  - `authorizedEmails` falls back to `tomlConfig?.auth?.authorized_emails` (mapped through the same trim+lowercase normalization as the env path).
- **Conflict risk on rebase**: medium — `resolveServerConfig` is a hotspot and upstream may add new fields with their own precedence. The TOML override block is concentrated near the existing precedence chains so a rebase reads as a small, contiguous diff.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/auth/utils.ts` (P2a update)

- **Modified**: 2026-04-18 (P2a)
- **V3 phase**: Phase 2a — server-node mode foundations
- **Reason**: Widen the `mode` parameter on `resolveSessionCookieName` to accept the new `"server-node"` literal. The function falls through the non-desktop branch as before, so server-node shares the cookie strategy with `web` (one cookie per origin).
- **What changed**:
  - Parameter `readonly mode: "web" | "desktop"` → `readonly mode: "web" | "desktop" | "server-node"`.
- **Conflict risk on rebase**: low — additive type widening.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/cli-config.test.ts` (P2a fix-forward of a P1b oversight)

- **Modified**: 2026-04-18 (P2a)
- **V3 phase**: Phase 2a — server-node mode foundations (incidental fix of a P1b regression)
- **Reason**: P1b updated `cli.test.ts`, `server.test.ts`, and `environment/Layers/ServerEnvironment.test.ts` to include the new `googleClientId`/`authorizedEmails` fields on inline `ServerConfigShape` objects but missed `cli-config.test.ts`. That oversight broke 7 of 8 tests in this file once P1b shipped. P2a adds the two missing fields to every `expect(resolved).toEqual({…})` block.
- **What changed**:
  - Added `googleClientId: undefined, authorizedEmails: []` after each `logWebSocketEvents` entry in the toEqual blocks (10 occurrences via replace_all).
- **Conflict risk on rebase**: low — additive object-literal entries.
- **Status on Windows**: 5 of 8 tests now pass. The 3 still-failing tests (`preserves explicit false CLI boolean flags…`, `uses bootstrap envelope values…`, `applies flag then env precedence…`) hit a pre-existing Windows EBADF on the bootstrap-fd code path, identical failure as before P2a per a `git stash`-driven baseline check. Tracked under "Known upstream gaps inherited at fork time" below — Linux CI is presumed clean.
- **Last rebase verified**: 2026-04-18

### `package.json` + `apps/server/package.json` (P2a update)

- **Modified**: 2026-04-18 (P2a)
- **What changed**:
  - Root `workspaces.catalog` gains `"smol-toml": "^1.3.1"` (alphabetical position).
  - `apps/server/package.json` adds `"smol-toml": "catalog:"` to dependencies.
- **Conflict risk on rebase**: low — catalog additions merge cleanly unless upstream restructures.
- **Last rebase verified**: 2026-04-18

**Known Windows test flake (added to the inherited gaps inventory)**

- `apps/server/src/cli-config.test.ts > "preserves explicit false CLI boolean flags over env and bootstrap values"`, `"uses bootstrap envelope values as fallbacks when flags and env are absent"`, `"applies flag then env precedence over bootstrap envelope values"` — three Windows-only EBADF failures on bootstrap-fd handling. Reproduced on pristine pre-P2a state. Linux CI presumed clean. Not caused by P2a.

**Test coverage**

- Server identity suite: still 38/38 (P1d unchanged).
- New server suite: +16 tests (`serverMode.test.ts` 9 + `config/tomlLoader.test.ts` 7).

### Phase 2b — Postgres persistence layer + V3 identity baseline migration

Second slice of Phase 2. Adds `@effect/sql-pg` to the stack, creates the
Postgres-flavored V3 identity baseline migration, and wires a
`postgresUrl` field through config so future sub-phases can construct a
real Postgres layer from `[database].postgres_url` in the server-node
config.toml.

**Scope boundary**: The layer factory + migration scaffolding land here,
but `server.ts` / `bootstrap.ts` are NOT swapped. Server startup still
unconditionally provides the SQLite layer because the upstream T3 tables
(orchestration_events, projection_threads, auth_sessions, …) have not
been ported to Postgres. Running Postgres as the only backend today
would break every orchestration/auth service. Porting those 25 SQLite
migrations to Postgres is scoped as a later P2 slice.

**New files (V3-owned — no rebase conflict risk):**

- `apps/server/src/persistence/PostgresMigrations/001_V3IdentityBaseline.ts` — mirrors SQLite migration `026_V3UsersDevices.ts` in Postgres syntax (`BYTEA` for binary, `BOOLEAN` for the approved flag, partial index on `v3_devices` where `removed_at IS NULL`). Timestamps stay `TEXT` (ISO-8601) so `Schema.DateTimeUtcFromString` decodes identically on both backends. `v3_device_sessions.session_id` does NOT reference `auth_sessions` yet — that table has not been ported; FK lands in a follow-up migration once the upstream tables reach Postgres.
- `apps/server/src/persistence/PostgresMigrations.ts` (+ `.test.ts`) — migration runner paralleling `Migrations.ts` for SQLite but with an independent id sequence. Exports `postgresMigrationEntries`, `makePostgresMigrationLoader`, `runPostgresMigrations`, `PostgresMigrationsLive`. 4 tests assert registry shape + constructor safety.
- `apps/server/src/persistence/Layers/Postgres.ts` (+ `.test.ts`) — `makePostgresPersistenceLive({ connectionUrl, applicationName?, spanAttributes? })` factory wrapping `PgClient.layer` + `PostgresMigrationsLive`. `resolvePostgresPersistenceLive` Effect reads `ServerConfig` and fails with `PostgresNotConfiguredError` when `postgresUrl` is undefined. `layerConfig` wraps the resolver for layer-style composition (mirrors Sqlite.ts shape). 5 tests + 1 `.todo` placeholder for the real-Postgres integration test (lands in P2d with the setup-wizard smoke test).

**Modified upstream files:**

### `apps/server/src/config.ts` (P2b update on top of P2a)

- **Modified**: 2026-04-18 (P2b)
- **V3 phase**: Phase 2b — Postgres persistence layer
- **Reason**: Carry the Postgres connection URL through the runtime config so the server-node layer can consume it.
- **What changed**:
  - Added to `ServerConfigShape`: `postgresUrl: string | undefined`.
  - Added to `ServerConfig.layerTest` defaults: `postgresUrl: undefined`.
- **Conflict risk on rebase**: medium — `ServerConfigShape` is an upstream hotspot. Sits next to the P1b-era `googleClientId`/`authorizedEmails` additions.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/cli.ts` (P2b update on top of P2a)

- **Modified**: 2026-04-18 (P2b)
- **V3 phase**: Phase 2b — Postgres persistence layer
- **Reason**: Resolve `postgresUrl` from env (`V3CODE_POSTGRES_URL`) or TOML (`[database].postgres_url`) and stamp it onto the final `ServerConfigShape`.
- **What changed**:
  - `EnvServerConfig` adds `postgresUrl: Config.string("V3CODE_POSTGRES_URL")`.
  - Final config literal adds `postgresUrl: env.postgresUrl ?? tomlConfig?.database?.postgres_url`.
- **Conflict risk on rebase**: low — additive.
- **Last rebase verified**: 2026-04-18

### `apps/server/src/cli.test.ts` + `cli-config.test.ts` + `environment/Layers/ServerEnvironment.test.ts` + `server.test.ts` (P2b update)

- **Modified**: 2026-04-18 (P2b)
- **V3 phase**: Phase 2b — Postgres persistence layer
- **Reason**: Every inline `ServerConfigShape` literal now requires `postgresUrl` to satisfy the widened type. Added `postgresUrl: undefined` to each test fixture.
- **Conflict risk on rebase**: low.
- **Last rebase verified**: 2026-04-18

### `package.json` + `apps/server/package.json` (P2b update)

- **Modified**: 2026-04-18 (P2b)
- **What changed**:
  - Root `workspaces.catalog` gains `"@effect/sql-pg": "4.0.0-beta.45"` (alongside existing `@effect/sql-sqlite-bun`).
  - `apps/server/package.json` dependencies adds `"@effect/sql-pg": "catalog:"`.
- **Conflict risk on rebase**: low — catalog additions merge cleanly unless upstream restructures.
- **Last rebase verified**: 2026-04-18

**Test coverage**

- Identity suite: still 38/38 (unchanged).
- P2a suite: still 16/16 (unchanged).
- New P2b suite: +8 tests (5 `persistence/Layers/Postgres.test.ts` + 4 `persistence/PostgresMigrations.test.ts`) + 1 `.todo` placeholder.
- Full targeted run: 62 pass + 1 todo across 11 files.

### Phase 2c — Drive App Data client (renderer-side discovery)

P2c wires the cross-device server-URL discovery path promised by spec
§3.4: on Google sign-in the renderer now reads (and, when a server node
is already advertised, appends itself to) a small `v3_config.json` blob
in the user's per-app Drive `appDataFolder`. Everything is client-side
— the V3 server never sees the Drive access token. The Electron PKCE
flow is widened to request the `drive.appdata` scope and to surface the
`access_token` to the renderer alongside the `id_token`.

Per Lucas's P2c sub-decisions:

- **Q2c-1 (scope timing)**: added `drive.appdata` to the existing
  Google consent step so there is a single, narrow prompt. The scope
  grants access only to V3's own Drive folder, not the user's files.
- **Q2c-2 (quota behaviour)**: Drive failures (including quota
  exhaustion) log and continue. The renderer caches the last good
  snapshot in `localStorage.v3.drive-app-data-snapshot` and tags the
  failure reason so P3 can surface a targeted remediation.

Ground-rule carryovers from the continuation-prompt §5.4 that shape
implementation:

- Reads are unconditional; writes are gated on `server_url` already
  being set. A first-time single-device sign-in never writes to Drive
  — the server-node setup wizard (P2d) will seed the blob instead.
- Device list entries are idempotent by `device_id`; duplicate
  sign-ins from the same device do not re-trigger writes.

**New files (V3-owned — no rebase conflict risk):**

- `packages/client-runtime/src/drive/schema.ts` — Effect `Schema.Struct`
  definitions for `DriveDeviceEntry`, `V3DriveConfigPayload`, and the
  outer `V3DriveConfig`. `server_url`, `server_version_installed`, and
  `setup_at` are `Schema.optional` because the blob is populated
  incrementally across phases (P2c reads; P2d writes server metadata).
  `device_list` is required once the blob exists.
- `packages/client-runtime/src/drive/appDataClient.ts` — pure `fetch`
  wrapper over Drive v3 REST: `findFileId` → `readFileById` → `read`
  returns `V3DriveConfig | null`; `write` multipart-creates or
  `PATCH`es; `readOrInit` returns an empty synthesised config without
  writing; `appendDevice` reads-or-inits, appends de-duped by
  `device_id`, and writes. All methods accept an explicit
  `accessToken` and an optional `fetch` dep for tests. Errors surface
  as a discriminated `V3DriveClientError` tagged with
  `"unauthorized" | "quota-exhausted" | "network" | "malformed" |
"unexpected-status"`. Quota detection sniffs the body for
  `storageQuotaExceeded` to distinguish it from a plain 403.
- `packages/client-runtime/src/drive/index.ts` — barrel; also reached
  from the package root entry.
- `packages/client-runtime/src/drive/appDataClient.test.ts` — 13 cases
  covering missing-blob / populated-blob / malformed / auth / quota /
  network paths, plus multipart upload shape, PATCH update, and
  `appendDevice` idempotency + bootstrap.
- `apps/web/src/v3/auth/driveAppData.ts` — renderer glue:
  `captureDriveAppDataSnapshot` reads (and optionally appends) via the
  client-runtime helper, log-and-ignores any `V3DriveClientError`, and
  writes a discriminated `V3DriveAppDataSnapshot` to
  `localStorage.v3.drive-app-data-snapshot`. Exports a cold read
  helper `getV3DriveAppDataSnapshot` for P3 to consume.
- `apps/web/src/v3/auth/driveAppData.test.ts` — 6 cases pinning the
  no-blob, server-absent, already-listed, appends-new, read-failure,
  and append-failure paths with a stub Drive client.

**Modified upstream files:**

### `packages/contracts/src/ipc.ts` (P2c update on top of P1d)

- **Modified**: 2026-04-19 (P2c)
- **V3 phase**: Phase 2c — Drive App Data client
- **Reason**: The renderer now needs a Google OAuth access token (scoped
  to `drive.appdata`) to drive the Drive REST client. The desktop
  bridge already owns the PKCE handshake, so the cleanest seam is to
  return both tokens from `openV3GoogleSignIn`.
- **What changed**:
  - Modified: `DesktopBridge.openV3GoogleSignIn` return type from
    `Promise<{ idToken: string }>` to
    `Promise<{ idToken: string; accessToken: string }>`.
  - Updated the surrounding doc-comment to describe both fields and
    reference the Drive App Data use case.
- **Conflict risk on rebase**: low — V3-owned addition next to unrelated
  upstream methods.
- **Upstream signals to watch**: upstream rarely touches the V3 block.
  If they add a new method above `openV3GoogleSignIn`, re-anchor the
  diff with the surrounding comment as a marker.
- **Last rebase verified**: 2026-04-19 (t3code v0.0.20 + 2 upstream commits)

### `apps/desktop/src/v3GoogleAuthFlow.ts` (P2c update on top of P1d)

- **Modified**: 2026-04-19 (P2c) — V3-owned file, but logged here for
  the shared pattern.
- **V3 phase**: Phase 2c — Drive App Data client
- **Reason**: Widen the OAuth scope to include `drive.appdata` and
  propagate the returned `access_token` to the renderer so it can call
  the Drive REST API.
- **What changed**:
  - Modified: `buildAuthUrl.scope` now requests
    `openid email profile https://www.googleapis.com/auth/drive.appdata`.
  - Renamed: `exchangeCodeForIdToken` → `exchangeCodeForTokens`; now
    returns `{ idToken, accessToken }` and asserts both fields are
    non-empty strings on the token response.
  - Modified: `V3GoogleAuthFlow.start` return type + `PendingFlow`
    internal resolve signature both carry the `TokenExchangeResult`.
- **Conflict risk on rebase**: low — V3-owned file.
- **Last rebase verified**: 2026-04-19

### `apps/desktop/src/v3GoogleAuthFlow.test.ts` (P2c update on top of P1d)

- **Modified**: 2026-04-19 (P2c) — V3-owned file.
- **V3 phase**: Phase 2c — Drive App Data client
- **Reason**: Reflect the new `access_token` field in the token response
  stub, assert the happy-path result shape, assert the scope includes
  `drive.appdata`, and add a negative case for a response missing
  `access_token`.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/v3/auth/googleSignIn.ts` (P2c update on top of P1d)

- **Modified**: 2026-04-19 (P2c) — V3-owned file.
- **V3 phase**: Phase 2c — Drive App Data client
- **Reason**: After a successful bootstrap, hand the Drive helper this
  device's `{ device_id, name, added_at }` entry plus the access token
  and surface the resulting snapshot on `V3SignInResult.driveSnapshot`.
- **What changed**:
  - Added: `driveSnapshot: V3DriveAppDataSnapshot | null` on
    `V3SignInResult`.
  - Added: `captureDriveAppDataSnapshot` call immediately after
    `recordV3SignedIn`, wrapped in a defensive `.catch` that logs and
    yields `null` — sign-in must never fail because of Drive.
- **Conflict risk on rebase**: low — V3-owned file; existing callers
  (`SignInButton.tsx`, `StartupSignInNudge.tsx`) use only `snapshot`
  and `needsApproval` so the new field is additive.
- **Last rebase verified**: 2026-04-19

### `packages/client-runtime/package.json` (P2c update)

- **Modified**: 2026-04-19 (P2c)
- **V3 phase**: Phase 2c — Drive App Data client
- **Reason**: The Drive client uses `Schema.decodeUnknownSync` for blob
  validation, so `effect` becomes a direct (non-transitive) dependency.
- **What changed**:
  - Added dependency `"effect": "catalog:"`.
- **Conflict risk on rebase**: low — additive.
- **Last rebase verified**: 2026-04-19

### `packages/client-runtime/src/index.ts` (P2c update)

- **Modified**: 2026-04-19 (P2c) — V3-owned file.
- **V3 phase**: Phase 2c — Drive App Data client
- **Reason**: Re-export the new `drive/*` module from the package root.
- **What changed**:
  - Added: `export * from "./drive/index.ts";`.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/localApi.test.ts` + `apps/web/src/components/settings/SettingsPanels.browser.tsx` (P2c cleanup)

- **Modified**: 2026-04-19 (P2c)
- **V3 phase**: Phase 2c — Drive App Data client
- **Reason**: Both files build a `DesktopBridge` mock for tests. P1d
  added `openV3GoogleSignIn` to the contract but these two mocks were
  missed, which left `bun run --cwd apps/web typecheck` flagging extra
  errors beyond the documented `input.tsx` baseline. P2c's widening of
  the return shape to `{ idToken, accessToken }` means we need to
  touch these mocks anyway; adding a stable no-op stub here restores
  the "only input.tsx fails" baseline and keeps future rebases quiet.
- **What changed**:
  - Added: `openV3GoogleSignIn: async () => ({ idToken: "mock-id-token", accessToken: "mock-access-token" })` in `localApi.test.ts`.
  - Added: a `vi.fn()`-backed equivalent in `SettingsPanels.browser.tsx`.
- **Conflict risk on rebase**: low — one-line inserts at the end of
  each mock factory.
- **Last rebase verified**: 2026-04-19

**Test coverage**

- Identity suite: still 38/38 (unchanged).
- P2a suite: still 16/16 (unchanged).
- P2b suite: still 8/8 + 1 `.todo` (unchanged).
- New P2c suite: +15 (`packages/client-runtime/src/drive/appDataClient.test.ts`) + 6 (`apps/web/src/v3/auth/driveAppData.test.ts`). Desktop P1d suite grows from 7 → 8 cases (one new negative: Google token endpoint omits `access_token`). client-runtime targeted run is now 2 files / 20 pass (knownEnvironment 5 + appDataClient 15).
- `bun run --cwd apps/server vitest run --reporter=dot src/identity src/config src/serverMode.test.ts src/persistence/PostgresMigrations.test.ts src/persistence/Layers/Postgres.test.ts` still shows 62 pass + 1 todo — no server-side behaviour changed in P2c.

### Phase 2d — Server-node setup wizard (renderer + Electron IPC + queued Drive publish)

P2d is the operator-facing half of server-node mode. A renderer-hosted
wizard at `/setup` walks through six steps (overview → pre-flight →
exposure → data directory → auth → review → done) and writes
`~/.v3-code-server/config.toml` via Electron IPC. The wizard queues its
server URL + device entry into `localStorage.v3.pending-drive-publish`
so the next successful Google sign-in promotes it into Drive App Data
through the P2c client (sign-in is where access tokens live; the
wizard never handles one itself). The mode resolver already picks up
the written config on the next server launch via `serverMode.ts`.

**Scoped out of P2d (explicitly queued as follow-on sub-phases)**:

- **P2b-mig** — port upstream T3 migrations 001–025 to Postgres.
  Required before server-node mode can actually boot against Postgres.
  For now, server.ts still unconditionally provides SQLite; the
  wizard's done screen calls this out.
- **P2d-persist** — the mode-aware persistence swap in `server.ts` /
  `bootstrap.ts`. Blocked by P2b-mig.
- **P2d-cf** — cloudflared automation beyond the detection probe
  (download binary + service install across Windows/macOS/Linux).
- **Wizard entry point in the sidebar** — parked for P3's sidebar
  rewrite, which already owns the signed-in nav surface.

Per Lucas's P2d sub-decisions (2026-04-19):

- **Q2d-1 (scope)**: full — wizard UI + IPC + Drive queue + mode
  branch point in one commit; persistence swap deferred to P2b-mig
  prerequisite.
- **Q2d-2 (host)**: in-app React route at `/setup`; Electron IPC for
  privileged ops. (No separate BrowserWindow.)
- **Q2d-3 (cloudflared)**: detect + link to install docs; no
  automation.
- **Q2d-4 (post-wizard)**: success screen with restart instructions;
  no auto-restart of the desktop shell.

**New files (V3-owned — no rebase conflict risk):**

- `apps/desktop/src/v3SetupWizard.ts` (+ `.test.ts`) — main-process IPC
  registration plus pure `probeDockerWith`, `probePortWith`,
  `probeCloudflaredWith`, `probePathsWith`,
  `writeServerNodeConfigWith`, `extractVersion`,
  `resolveServerNodeConfigPath`, and `generateEncryptionKey` helpers.
  Uses `node:child_process.spawn` (no shell, fixed arg vector) for
  subprocess probes. Re-registers seven IPC channels under the
  `desktop:v3-wizard-*` prefix. 17 tests covering version parsing,
  each probe's success/missing/error branches, path resolution with
  `V3CODE_SERVER_CONFIG_PATH` override, and the TOML write path.
- `apps/web/src/routes/setup.tsx` — `/setup` route with all six wizard
  screens inlined (Overview, Preflight, Exposure, DataDirectory, Auth,
  Review, Done). Uses the existing `Alert`/`Button`/`Input`/`Label`/
  `Textarea` primitives. Electron-only — the route renders a
  `BrowserNotSupportedScreen` fallback when `window.desktopBridge?.v3Wizard`
  is undefined. Drive publish is queued into
  `localStorage.v3.pending-drive-publish` (exported constant
  `V3_PENDING_DRIVE_PUBLISH_KEY` so P3 and future sign-in code can
  consume it).
- `apps/web/src/v3/setup/state.ts` (+ `.test.ts`) — pure reducer
  - `V3SetupWizardState` type, `isPreflightReady` / `isExposureReady`
    / `isAuthReady` gating helpers. 11 tests pinning step transitions,
    preflight readiness with Docker + port + paths populated, and the
    32-char encryption-key requirement.
- `apps/web/src/v3/setup/tomlBuilder.ts` (+ `.test.ts`) — hand-rolled
  TOML emitter matching `apps/server/src/config/serverNodeConfig.ts`.
  Skips empty sections, lowercases/de-dupes authorized emails, emits a
  commented header by default. 5 tests covering minimal document,
  email normalization, section suppression, escape rules, and header
  behavior.

**Modified upstream files:**

### `packages/contracts/src/ipc.ts` (P2d update on top of P2c)

- **Modified**: 2026-04-19 (P2d)
- **V3 phase**: Phase 2d — server-node setup wizard
- **Reason**: The wizard UI in `apps/web` needs privileged Electron
  operations (Docker probe, port probe, config.toml write) that have to
  be exposed through the bridge. Kept under a single `v3Wizard` nested
  object so the `DesktopBridge` flat surface does not balloon and the
  renderer can pass the whole namespace as a dependency.
- **What changed**:
  - Added: `V3WizardProbeStatus`, `V3WizardDockerProbeResult`,
    `V3WizardPortProbeResult`, `V3WizardCloudflaredProbeResult`,
    `V3WizardPathsProbeResult`, `V3WizardWriteConfigInput`,
    `V3WizardWriteConfigResult` type exports.
  - Added: `DesktopBridge.v3Wizard` namespace with `probeDocker`,
    `probePort`, `probeCloudflared`, `probePaths`, `pickDataDirectory`,
    `writeServerNodeConfig`, `generateEncryptionKey`.
- **Conflict risk on rebase**: low — all additions are V3-owned and
  appear alongside the existing P1d/P2c openV3GoogleSignIn block.
- **Last rebase verified**: 2026-04-19

### `apps/desktop/src/main.ts` (P2d update)

- **Modified**: 2026-04-19 (P2d)
- **V3 phase**: Phase 2d — server-node setup wizard
- **Reason**: Register the wizard IPC handlers on window creation. The
  implementation lives in `v3SetupWizard.ts`; main.ts just wires
  Electron's `ipcMain` + a dialog-driven folder picker.
- **What changed**:
  - Added: `import { registerV3SetupWizardIpc } from "./v3SetupWizard.ts"`.
  - Added: a single `registerV3SetupWizardIpc({ ipcMain, pickDataDirectory })`
    call next to the existing V3 Google sign-in handler.
- **Conflict risk on rebase**: low — V3 block in the IPC registration
  section stays isolated. If upstream reflows `ipcMain` setup, re-anchor
  on the existing V3 Google sign-in handler above.
- **Last rebase verified**: 2026-04-19

### `apps/desktop/src/preload.ts` (P2d update)

- **Modified**: 2026-04-19 (P2d)
- **V3 phase**: Phase 2d — server-node setup wizard
- **Reason**: Expose the seven wizard IPC channels on the
  `window.desktopBridge.v3Wizard` namespace so the renderer sees the
  same shape advertised by `DesktopBridge` in contracts.
- **What changed**:
  - Added: seven `V3_WIZARD_*_CHANNEL` constants.
  - Added: `v3Wizard` object literal on the `contextBridge.exposeInMainWorld`
    payload mapping each method to `ipcRenderer.invoke(...)`.
- **Conflict risk on rebase**: low — the invocation block at the bottom
  of `preload.ts` is additive.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/routeTree.gen.ts` (P2d update)

- **Modified**: 2026-04-19 (P2d)
- **V3 phase**: Phase 2d — server-node setup wizard
- **Reason**: TanStack Router's auto-generated route tree does not yet
  know about the new `/setup` route. Re-running the generator via
  `vite build` will overwrite this file; the edits here are verbatim
  the output the generator would produce, so the next regenerate is a
  no-op.
- **What changed**:
  - Added: `SetupRouteImport` and `SetupRoute` references parallel to
    `SettingsRoute`. The route is a top-level sibling of `/settings`.
  - Added: `/setup` entries in `FileRoutesByFullPath`, `FileRoutesByTo`,
    `FileRoutesById`, `FileRouteTypes` (full paths / to / id),
    `RootRouteChildren`, and the `FileRoutesByPath` declaration block.
- **Conflict risk on rebase**: medium — any upstream regenerate
  clobbers these edits. The file has `@ts-nocheck` on top so the
  generator is authoritative; re-run `vite build` on rebase.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/localApi.test.ts` + `apps/web/src/components/settings/SettingsPanels.browser.tsx` (P2d update)

- **Modified**: 2026-04-19 (P2d)
- **V3 phase**: Phase 2d — server-node setup wizard
- **Reason**: `DesktopBridge` widened with the `v3Wizard` namespace, so
  both test mocks need the new members or typecheck regresses. Same
  "restore the documented input.tsx-only web-typecheck baseline" story
  as the P2c mock fix.
- **What changed**:
  - Added: a stubbed `v3Wizard` object on the `makeDesktopBridge`
    / settings mock factory with no-op return values for every method.
- **Conflict risk on rebase**: low — one-field additions.
- **Last rebase verified**: 2026-04-19

**Test coverage**

- Identity suite: still 38/38 (unchanged).
- P2a suite: still 16/16 (unchanged).
- P2b suite: still 8/8 + 1 `.todo` (unchanged).
- P2c suites: still 15 (client-runtime appDataClient) + 6 (web
  driveAppData) (unchanged).
- New P2d suite: +17 (`apps/desktop/src/v3SetupWizard.test.ts`) + 16
  (`apps/web/src/v3/setup/*.test.ts`, split 11 state + 5 tomlBuilder).
- `bun run --cwd apps/server vitest run --reporter=dot src/identity src/config src/serverMode.test.ts src/persistence/PostgresMigrations.test.ts src/persistence/Layers/Postgres.test.ts` still shows 62 pass + 1 todo — no server-side behaviour changed in P2d either.
- Desktop vitest full suite still 8/8 + 17 new = 25; web v3 suite is
  now 19 (auth) + 16 (setup) = 35.

### Phase 2b-mig — Port upstream T3 migrations 001–025 to Postgres

P2b-mig is the persistence prerequisite for P2d-persist (the mode-aware
swap that wires server-node mode to the Postgres layer). Before this
slice, `PostgresMigrations.ts` only registered the V3 identity baseline
(`001_V3IdentityBaseline`), so booting the server in server-node mode
against Postgres would leave 25 upstream-owned tables
(`orchestration_events`, `projection_*`, `auth_*`, etc.) unconditionally
missing. Every Postgres startup would fail the moment an upstream
service tried to `SELECT ... FROM orchestration_events`.

P2b-mig writes Postgres ports for every upstream migration, keeping the
SQLite history canonical: the SQLite migration registry still runs on
desktop + web modes unchanged, and the Postgres registry replays the
same semantic steps in order so the two schemas stay congruent.

**Sequencing**: `V3IdentityBaseline` keeps id `1` in Postgres, and
upstream SQLite migrations `001..025` become Postgres migrations
`002..026` respectively. A fresh V3 server-node deployment therefore
runs 26 migrations in order, matching what a fresh SQLite deployment
produces modulo the V3 tables at the head.

**Dialect deltas applied**:

- `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`
  (affects migrations 002, 006). Postgres sequences preserve the
  monotonic-never-reused contract that AUTOINCREMENT promises.
- `INTEGER NOT NULL` used as a boolean (`is_streaming`,
  `pending_approval_count`, `has_actionable_proposed_plan`) stays
  `INTEGER` in Postgres so existing queries comparing to `0` / `1`
  literals keep working. Switching to `BOOLEAN` would also require
  touching every SQL consumer, which is out of scope for a schema
  port.
- `PRAGMA table_info(...)` existence checks (migrations 017, 021, 022, 023) are dropped in favor of native `ADD COLUMN IF NOT EXISTS`
  (Postgres 9.6+).
- SQLite `json_extract` / `json_set` / `json_type` / `json_patch`
  based data migrations (011, 016, 024, 025) are preserved as
  explicit no-ops in Postgres. Fresh server-node deployments have
  empty projection tables so the backfills would match zero rows; the
  sequence is kept intact so a future legacy-replay importer can slot
  the real jsonb-based logic in without renumbering.

**New files (V3-owned):**

- `apps/server/src/persistence/PostgresMigrations/002_OrchestrationEvents.ts`
- `…/003_OrchestrationCommandReceipts.ts`
- `…/004_CheckpointDiffBlobs.ts`
- `…/005_ProviderSessionRuntime.ts`
- `…/006_Projections.ts`
- `…/007_ProjectionThreadSessionRuntimeModeColumns.ts`
- `…/008_ProjectionThreadMessageAttachments.ts`
- `…/009_ProjectionThreadActivitySequence.ts`
- `…/010_ProviderSessionRuntimeMode.ts` (no-op; mirrors SQLite 009)
- `…/011_ProjectionThreadsRuntimeMode.ts`
- `…/012_OrchestrationThreadCreatedRuntimeMode.ts` (no-op; SQLite data
  migration)
- `…/013_ProjectionThreadsInteractionMode.ts`
- `…/014_ProjectionThreadProposedPlans.ts`
- `…/015_ProjectionThreadProposedPlanImplementation.ts`
- `…/016_ProjectionTurnsSourceProposedPlan.ts`
- `…/017_CanonicalizeModelSelections.ts` (no-op; SQLite data migration)
- `…/018_ProjectionThreadsArchivedAt.ts`
- `…/019_ProjectionThreadsArchivedAtIndex.ts`
- `…/020_ProjectionSnapshotLookupIndexes.ts`
- `…/021_AuthAccessManagement.ts` (upstream auth tables — required
  before V3IdentityBaseline's `v3_device_sessions.session_id` gains a
  FK in a follow-up)
- `…/022_AuthSessionClientMetadata.ts`
- `…/023_AuthSessionLastConnectedAt.ts`
- `…/024_ProjectionThreadShellSummary.ts`
- `…/025_BackfillProjectionThreadShellSummary.ts` (no-op; SQLite data
  migration)
- `…/026_CleanupInvalidProjectionPendingApprovals.ts` (no-op; SQLite
  data migration)

**Modified V3-owned files:**

### `apps/server/src/persistence/PostgresMigrations.ts`

- **Modified**: 2026-04-19 (P2b-mig)
- **V3 phase**: Phase 2b-mig — upstream migrations to Postgres
- **Reason**: Register the 25 new port files alongside
  `V3IdentityBaseline`.
- **What changed**:
  - Added: 25 imports for `Migration0002..Migration0026`.
  - Added: 25 entries at ids 2..26 in `postgresMigrationEntries`.
  - Expanded the top-of-file doc comment to describe the layout.
- **Conflict risk on rebase**: none (V3-owned file).
- **Last rebase verified**: 2026-04-19

### `apps/server/src/persistence/PostgresMigrations.test.ts`

- **Modified**: 2026-04-19 (P2b-mig) — V3-owned file.
- **V3 phase**: Phase 2b-mig — upstream migrations to Postgres
- **Reason**: Registry length changed from 1 to 26, and the port name
  sequence is worth asserting so a future upstream migration addition
  is caught at test time.
- **What changed**:
  - Added: `UPSTREAM_PORT_NAMES` constant.
  - Added: `"registers the 25 upstream-port migrations as ids 2-26
after P2b-mig"` assertion.
  - Loosened: the old `expect(postgresMigrationEntries).toHaveLength(1)`
    check to pin the length via the new `UPSTREAM_PORT_NAMES.length + 1`
    computation.
- **Last rebase verified**: 2026-04-19

**Deferred to P2d-persist**

P2b-mig only ships the migration sources; it does NOT flip server.ts to
provide the Postgres layer in server-node mode. That flip lands in
P2d-persist and is what actually executes these migrations at startup.
Tests in this phase only exercise the registry + loader constructors —
a real end-to-end run against a live Postgres instance still lives
behind the existing `.todo` placeholder in
`apps/server/src/persistence/Layers/Postgres.test.ts`.

**Test coverage**

- Identity suite: still 38/38.
- P2a / P2b / P2c / P2d suites: unchanged (no server-side behaviour
  changed in P2b-mig — just migration sources + registry).
- `PostgresMigrations.test.ts` grows from 4 → 5 cases (adds the
  "upstream ports are ids 2-26" assertion).
- `Postgres.test.ts` unchanged at 5 + 1 `.todo`.
- Targeted server run (`bun run --cwd apps/server vitest run
--reporter=dot src/identity src/config src/serverMode.test.ts
src/persistence/PostgresMigrations.test.ts
src/persistence/Layers/Postgres.test.ts`) is now **63 pass + 1 todo**
  (62 before + 1 new).
