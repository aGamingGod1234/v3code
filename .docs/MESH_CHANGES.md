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

### `packages/contracts/src/index.ts` (P3 update on top of P1a)

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 â€” device model + sidebar rewrite
- **Reason**: Re-export the new mesh device payload schemas from the
  package root.
- **What changed**:
  - Added: named exports for `HelloPayload` and
    `PresenceUpdatePayload` from `./mesh/device.ts`.
- **Conflict risk on rebase**: low â€” additive index export.
- **Last rebase verified**: 2026-04-19

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

### Phase 2d-persist — mode-aware persistence swap

P2d-persist wires the persistence branch point that P2a, P2b, and
P2b-mig set up but intentionally deferred. The server runtime, CLI
runtime, and auth control-plane now select SQLite for `web` /
`desktop` and the Postgres layer for `server-node`, which means the
26-entry Postgres migration registry from P2b-mig is now actually
reachable during a server-node boot. Desktop and web behavior remain
unchanged on SQLite.

**Modified upstream files:**

### `apps/server/src/server.ts` (P2d-persist update on top of P1b/P1c/P1d)

- **Modified**: 2026-04-19 (P2d-persist)
- **V3 phase**: Phase 2d-persist — mode-aware persistence swap
- **Reason**: Replace the hard-coded SQLite runtime import with the new
  mode-aware selector so server-node boot can construct Postgres.
- **What changed**:
  - Replaced: `layerConfig as SqlitePersistenceLayerLive` import from
    `Sqlite.ts` with `PersistenceLive as SqlitePersistenceLayerLive`
    from `PersistenceSelector.ts`.
  - Left the downstream alias + `PersistenceLayerLive` composition
    unchanged so the diff stays local to the import seam.
- **Conflict risk on rebase**: medium — `server.ts` is a hotspot and
  the import block shifts often.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/cli.ts` (P2d-persist update on top of P2a/P2b)

- **Modified**: 2026-04-19 (P2d-persist)
- **V3 phase**: Phase 2d-persist — mode-aware persistence swap
- **Reason**: Make the CLI's project/auth runtime composition follow the
  active mode instead of always pinning SQLite.
- **What changed**:
  - Replaced: `layerConfig as SqlitePersistenceLayerLive` import from
    `Sqlite.ts` with `PersistenceLive as SqlitePersistenceLayerLive`
    from `PersistenceSelector.ts`.
  - Left the surrounding runtime layer composition untouched.
- **Conflict risk on rebase**: medium — `cli.ts` is a hotspot and
  upstream may continue widening the runtime layer stack.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/auth/Layers/AuthControlPlane.ts`

- **Modified**: 2026-04-19 (P2d-persist)
- **V3 phase**: Phase 2d-persist — mode-aware persistence swap
- **Reason**: Auth storage in server-node mode needs to land on the same
  selected SQL backend as the rest of the runtime.
- **What changed**:
  - Replaced: `layerConfig as SqlitePersistenceLayerLive` import from
    `Sqlite.ts` with `PersistenceLive as SqlitePersistenceLayerLive`
    from `PersistenceSelector.ts`.
  - `AuthStorageLive` keeps the same shape; only the persistence source
    changed.
- **Conflict risk on rebase**: low — narrow import swap in a stable
  file.
- **Last rebase verified**: 2026-04-19

**Modified V3-owned files:**

### `apps/server/src/persistence/Layers/PersistenceSelector.ts`

- **Modified**: 2026-04-19 (P2d-persist) — new V3-owned file.
- **V3 phase**: Phase 2d-persist — mode-aware persistence swap
- **Reason**: Centralize the SQLite/Postgres branch point behind one
  runtime layer so callers can swap from `Sqlite.ts` with a one-line
  import change.
- **What changed**:
  - Added: `resolvePersistenceLive`, which reads `ServerConfig.mode`.
  - Added: `PersistenceLive = Layer.unwrap(resolvePersistenceLive)`.
  - Behavior: `server-node` returns
    `makePostgresPersistenceLive({ connectionUrl })`; `web` and
    `desktop` return `makeSqlitePersistenceLive(config.dbPath)`.
  - Error path mirrors `Postgres.ts`: missing or empty `postgresUrl`
    fails with the existing `PostgresNotConfiguredError`.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/server/src/persistence/Layers/PersistenceSelector.test.ts`

- **Modified**: 2026-04-19 (P2d-persist) — new V3-owned file.
- **V3 phase**: Phase 2d-persist — mode-aware persistence swap
- **Reason**: Pin the three branch outcomes at the selector seam
  without requiring a live Postgres instance.
- **What changed**:
  - Added: `web` and `desktop` cases that build the selector layer,
    resolve `SqlClient`, and execute `SELECT 1`.
  - Added: `server-node` + missing `postgresUrl` case asserting the
    selector fails with `_tag === "PostgresNotConfiguredError"`.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/routes/setup.tsx` (P2d-persist update on top of P2d)

- **Modified**: 2026-04-19 (P2d-persist) — V3-owned file.
- **V3 phase**: Phase 2d-persist — mode-aware persistence swap
- **Reason**: The setup wizard success screen still said the Postgres
  swap was pending even though this phase wires it in.
- **What changed**:
  - Removed: the DoneScreen alert titled
    `Upstream migrations to Postgres are still landing`.
  - Updated: the lead-in copy to say the restart flow enables
    server-node mode with Postgres persistence.
- **Conflict risk on rebase**: low — localized DoneScreen copy change.
- **Last rebase verified**: 2026-04-19

**Test coverage**

- New selector suite: 3 cases.
- Targeted server run (`bun run --cwd apps/server vitest run
--reporter=dot src/identity src/config src/serverMode.test.ts
src/persistence/PostgresMigrations.test.ts
src/persistence/Layers/Postgres.test.ts
src/persistence/Layers/PersistenceSelector.test.ts`) is now
  **66 pass + 1 todo**.

### Phase 3 — device model + sidebar rewrite (initial slice)

This P3 slice lands the first coherent device-aware UI on top of the
P1/P2 identity backend. The server now exposes authenticated V3 device
management routes (`GET /api/v3/devices`, `POST /api/v3/devices/approve`,
`POST /api/v3/devices/remove`) with live presence derived from active
auth sessions, and the web client consumes that through dedicated hooks
for account state, device lists, server mode, banner visibility, and
device-grouped chat chrome.

The sidebar rewrite is intentionally incremental: the legacy project /
thread machinery in `Sidebar.tsx` stays intact, while signed-in account
state, device groups, archived entry points, and the configure-server
banner are layered around it. `DeviceSidebar.tsx` is now the real entry
seam and switches to an explicit `LegacyProjectSidebar.tsx` path when
the user is signed out. Because thread shells still do not expose
`host_device_id`, chat attribution is currently exact only for the
current device; other device groups render real device presence and
approval state but defer deep chat attribution until the thread model
grows host-device metadata.

**Modified upstream files:**

### `apps/server/src/server.ts` (P3 update on top of P2d-persist)

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Register the new device-management HTTP routes so the web
  sidebar/settings surfaces can query and mutate V3 devices.
- **What changed**:
  - Added: `listDevicesRouteLayer`, `approveDeviceRouteLayer`, and
    `removeDeviceRouteLayer` imports from `identity/http.ts`.
  - Added: the three routes to `makeRoutesLayer`.
- **Conflict risk on rebase**: medium — `server.ts` route registration
  continues to change upstream.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/components/AppSidebarLayout.tsx`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Switch the layout import seam to the new sidebar entry
  module.
- **What changed**:
  - Replaced: direct `./Sidebar` import with `./sidebar/DeviceSidebar`.
- **Conflict risk on rebase**: low — one-line import seam.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/components/Sidebar.tsx`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Keep the legacy project/thread behaviors while layering in
  the signed-in account bar, device groups, and archived mesh entrypoint.
- **What changed**:
  - Added: `useAccountState()` and `useChatsByDevice()` wiring at the
    top-level sidebar seam.
  - Added: a `mode` prop so the shared project/thread implementation can
    render either mesh chrome or the extracted legacy signed-out path.
  - Added: signed-in account chrome (`SignedInBar`) or signed-out
    `V3SignInButton` at the top of the main sidebar content.
  - Added: device groups above the legacy project list.
  - Added: archived shortcut row at the bottom of the scroll content.
- **Conflict risk on rebase**: high — `Sidebar.tsx` remains a major
  upstream hotspot.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/components/settings/SettingsSidebarNav.tsx`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Add the new devices settings route and surface the same
  account chrome within settings mode.
- **What changed**:
  - Added: `/settings/devices` to `SettingsSectionPath` +
    `SETTINGS_NAV_ITEMS`.
  - Added: signed-in account chrome (or sign-in button) above the
    settings nav items.
- **Conflict risk on rebase**: medium — settings nav is still evolving
  upstream.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/routeTree.gen.ts`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Register `/settings/devices` in the generated TanStack
  router manifest so typed navigation compiles.
- **What changed**:
  - Added: `settings.devices` import, route registration, path/id/fullPath
    unions, and `SettingsRouteChildren` entry.
- **Conflict risk on rebase**: medium — generated file; regenerate if
  upstream route layout shifts.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/routes/__root.tsx`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Remove the temporary top-right sign-in overlay now that
  sign-in lives in the sidebar/account bar.
- **What changed**:
  - Removed: `V3SignInOverlay` and its `V3SignInButton` import.
  - Left the startup nudge + approval toast mounted at the layout root.
- **Conflict risk on rebase**: medium — root layout often changes when
  global chrome moves.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/routes/_chat.tsx`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Inject the configure-server banner at the chat layout seam.
- **What changed**:
  - Added: `ConfigureServerBanner` above the existing shortcut manager +
    outlet.
- **Conflict risk on rebase**: low — localized layout addition.
- **Last rebase verified**: 2026-04-19

**Modified V3-owned files:**

### `packages/contracts/src/identity.ts`

- **Modified**: 2026-04-19 (P3) — V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Define wire schemas for device list / approve / remove
  routes.
- **What changed**:
  - Added: `V3DeviceListResult`, `V3ApproveDeviceInput`,
    `V3ApproveDeviceResult`, `V3RemoveDeviceInput`, and
    `V3RemoveDeviceResult`.
- **Conflict risk on rebase**: low — V3-owned identity contract surface.
- **Last rebase verified**: 2026-04-19

### `packages/contracts/src/mesh/device.ts`

- **Modified**: 2026-04-19 (P3) â€” new V3-owned file.
- **V3 phase**: Phase 3 â€” device model + sidebar rewrite
- **Reason**: Define the mesh device payload schemas called out in the
  Phase 3 plan without coupling them to the auth bootstrap wire types.
- **What changed**:
  - Added: `HelloPayload`.
  - Added: `PresenceUpdatePayload`.
  - Re-exported: `DeviceInfo` for mesh-facing contract consumers.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/server/src/identity/http.ts`

- **Modified**: 2026-04-19 (P3) — V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Add authenticated device-management routes on top of the
  existing Google bootstrap/config routes.
- **What changed**:
  - Added: V3 request-context helpers that authenticate the request,
    resolve the V3 user/device, and gate mutating routes on an already
    approved current device.
  - Added: online-presence derivation by joining active auth sessions to
    `v3_device_sessions`.
  - Added: `listDevicesRouteLayer`, `approveDeviceRouteLayer`, and
    `removeDeviceRouteLayer`.
- **Conflict risk on rebase**: low — V3-owned file.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/components/chat/ConfigureServerBanner.tsx`

- **Modified**: 2026-04-19 (P3) — new V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Surface the Drive App Data "multiple devices but no server
  URL" setup nudge inside chat routes.
- **What changed**:
  - Added: alert banner with setup + dismiss actions.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/components/settings/DevicesSettingsPanel.tsx`

- **Modified**: 2026-04-19 (P3) — new V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Ship the approve/remove UI promised by the earlier pending
  approval toast.
- **What changed**:
  - Added: signed-out empty state with `V3SignInButton`.
  - Added: device list with current-device badge, online/pending badges,
    and approve/remove buttons wired to the new API hooks.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/components/sidebar/{ArchivedSection,ChatItem,DeviceGroup,DeviceSidebar,LegacyProjectSidebar,SignedInBar}.tsx`

- **Modified**: 2026-04-19 (P3) — new V3-owned files.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Break the new mesh sidebar chrome into small reusable pieces
  without trying to rewrite the entire legacy sidebar in one pass.
- **What changed**:
  - Added: account bar component, device-group chrome, chat row renderer,
    archived shortcut row, a `DeviceSidebar` entry module, and an
    explicit `LegacyProjectSidebar` path for signed-out users.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/hooks/{useAccountState,useChatsByDevice,useDevices,useServerMode,useShouldShowConfigureBanner}.ts`

- **Modified**: 2026-04-19 (P3) — new V3-owned files.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Centralize the client-side mesh/account/device state and
  keep UI components thin.
- **What changed**:
  - Added: device query + approve/remove mutations.
  - Added: account-state hook combining sign-in snapshot, drive snapshot,
    live devices, and inferred server mode.
  - Added: banner-visibility hook with 7-day dismissal persistence.
  - Added: current-device chat grouping hook for the sidebar.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/hooks/{useServerMode,useShouldShowConfigureBanner}.test.ts`

- **Modified**: 2026-04-19 (P3) — new V3-owned files.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Pin the new pure client-side decisions that drive the
  sidebar and setup banner.
- **What changed**:
  - Added: server-mode inference tests (desktop vs loopback web vs remote
    server-node).
  - Added: configure-server-banner visibility tests.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/routes/settings.devices.tsx`

- **Modified**: 2026-04-19 (P3) — new V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Register the Devices settings screen in the route tree.
- **What changed**:
  - Added: file route pointing at `DevicesSettingsPanel`.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/v3/ui/DeviceApprovalToast.tsx`

- **Modified**: 2026-04-19 (P3) — V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Connect the pending-approval toast to the new Devices panel.
- **What changed**:
  - Added: toast action that navigates to `/settings/devices`.
  - Updated: top-of-file comment now that the approve UI has shipped.
- **Conflict risk on rebase**: low — localized V3-owned file.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/v3/ui/SignInButton.tsx`

- **Modified**: 2026-04-19 (P3) — V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Update the component comment now that sign-in lives in the
  sidebar rather than the temporary root overlay.
- **What changed**:
  - Updated: top-of-file docs to describe the sidebar-mounted usage.
- **Conflict risk on rebase**: low — comment-only V3-owned change.
- **Last rebase verified**: 2026-04-19

**Test coverage**

- New web hook tests: +4 (`useShouldShowConfigureBanner.test.ts`) +3
  (`useServerMode.test.ts`).
- `bun run --cwd apps/server typecheck` passes.
- `bun run --cwd packages/contracts typecheck` passes.
- `bun run --cwd apps/web typecheck` still fails only on the two
  pre-existing web issues in `src/components/ui/input.tsx` and
  `src/v3/auth/googleSignIn.ts`.

### Phase 3 — mesh state + draft host-device plumbing

This follow-up P3 slice fills in the client-side state seams that the
initial sidebar rewrite deliberately deferred. The web app now mirrors
derived mesh state into shared atoms (`serverMode`, `userSession`, and a
device snapshot) at the authenticated root, and new draft sessions carry
an optional `hostDeviceId` so future server/thread wiring can attribute
cross-device chat history without another draft-store rewrite.

**Modified upstream files:**

### `apps/web/src/components/ChatView.tsx`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Stamp pull-request and worktree draft sessions with the
  current mesh device when the user is signed in.
- **What changed**:
  - Added: `useMeshCurrentDeviceId()` wiring.
  - Updated: `openOrReuseProjectDraftThread()` to preserve existing host
    attribution and backfill missing `hostDeviceId` values on reused
    drafts.
- **Conflict risk on rebase**: high — `ChatView.tsx` remains a large
  upstream hotspot.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/composerDraftStore.ts`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Extend draft-session metadata with optional host-device
  attribution ahead of the server-side thread migration.
- **What changed**:
  - Added: optional persisted + hydrated `hostDeviceId` support on draft
    sessions.
  - Updated: draft creation, normalization, hydration, equality checks,
    and mutable context updates to preserve host-device attribution.
- **Conflict risk on rebase**: medium — core store file, but the change
  is localized to draft-session metadata.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/composerDraftStore.test.ts`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Lock the new draft host-device metadata into store
  behavior.
- **What changed**:
  - Added: coverage that `setProjectDraftThreadId()` stores
    `hostDeviceId`.
  - Added: coverage that `setDraftThreadContext()` preserves
    `hostDeviceId` across unrelated context edits.
- **Conflict risk on rebase**: low — test-only file.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/hooks/useDevices.ts`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Prevent stale cached device data from leaking through after
  sign-out while the new mesh snapshot bootstrap mirrors device state.
- **What changed**:
  - Updated: derived return values now collapse to an empty device
    snapshot when the user is signed out.
- **Conflict risk on rebase**: low — localized derived-state tweak.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/hooks/useHandleNewThread.ts`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Carry host-device attribution through the main "new draft
  thread" flow, not just the pull-request shortcut path.
- **What changed**:
  - Added: `useMeshCurrentDeviceId()` wiring.
  - Updated: new and reused logical-project draft sessions now preserve
    or backfill `hostDeviceId` alongside existing branch/worktree/env
    context.
- **Conflict risk on rebase**: medium — shared new-thread hook.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/routes/__root.tsx`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Bootstrap the new mesh/client derived state at the
  authenticated app root.
- **What changed**:
  - Added: `MeshStateBootstrap`, mounted next to the existing
    `ServerStateBootstrap`.
  - Added: `useMeshSubscriptions()` import/wiring.
- **Conflict risk on rebase**: medium — root layout still changes when
  global bootstraps move.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/rpc/serverState.test.ts`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Cover the new shared atoms that mirror client-derived
  server mode and user-session state.
- **What changed**:
  - Added: a reset/get/set test for `serverModeAtom` and
    `userSessionAtom`.
- **Conflict risk on rebase**: low — test-only file.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/rpc/serverState.ts`

- **Modified**: 2026-04-19 (P3)
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Expose the shared state atoms the plan called out for
  derived server mode and user-session UI state.
- **What changed**:
  - Added: `serverModeAtom` + `userSessionAtom`.
  - Added: get/set/use helpers and test reset handling for both atoms.
- **Conflict risk on rebase**: low — additive atom surface.
- **Last rebase verified**: 2026-04-19

**Modified V3-owned files:**

### `apps/web/src/rpc/meshState.ts`

- **Modified**: 2026-04-19 (P3) — new V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Centralize the mesh device snapshot in the same atom-based
  state layer as server config.
- **What changed**:
  - Added: `MeshDeviceSnapshot` type, getter/setter/reset helpers, and
    React hooks for the current device id and full snapshot.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/rpc/meshState.test.ts`

- **Modified**: 2026-04-19 (P3) — new V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Cover the new mesh device atom state.
- **What changed**:
  - Added: set/get/reset coverage for the mesh device snapshot.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

### `apps/web/src/rpc/meshSubscriptions.ts`

- **Modified**: 2026-04-19 (P3) — new V3-owned file.
- **V3 phase**: Phase 3 — device model + sidebar rewrite
- **Reason**: Mirror existing hook-derived mesh/account state into the
  shared atom layer from a single root bootstrap.
- **What changed**:
  - Added: `useMeshSubscriptions()` hook that publishes server mode,
    user-session state, and mesh device snapshots.
  - Added: signed-out reset behavior so device state clears cleanly when
    the Google session disappears.
- **Conflict risk on rebase**: none (V3-owned).
- **Last rebase verified**: 2026-04-19

**Test coverage**

- New web tests: +1 (`rpc/serverState.test.ts`) +1 (`rpc/meshState.test.ts`) +2
  (`composerDraftStore.test.ts`).
- `bun run --cwd apps/web test src/rpc/serverState.test.ts src/rpc/meshState.test.ts src/composerDraftStore.test.ts src/hooks/useShouldShowConfigureBanner.test.ts src/hooks/useServerMode.test.ts`
  passes (**77 tests**).
- `bun run --cwd apps/web typecheck` still fails only on the two
  pre-existing web issues in `src/components/ui/input.tsx` and
  `src/v3/auth/googleSignIn.ts`.

### Phase 4 — chat sync v1 (event store + subscribe/publish)

This P4 slice wires the previously-added mesh contracts into the live
server/runtime graph, switches thread-detail subscriptions over to the
mesh chat stream with cursor-based gap detection, and finally carries
`hostDeviceId` through the web store so device-grouped chat attribution
is driven by projected thread metadata instead of the current-device
fallback.

**Modified upstream files:**

### `apps/server/src/server.ts` (P4 update on top of P3)

- **Modified**: 2026-04-19 (P4)
- **V3 phase**: Phase 4 — chat sync v1
- **Reason**: Provide the mesh runtime layers so websocket mesh RPCs can
  resolve their services at runtime.
- **What changed**:
  - Added: mesh layer imports (`ChatSubscriptionManagerLive`,
    `PresenceBroadcasterLive`, `DeviceRegistryLive`,
    `MeshEventIngestionLive`, `MeshPublisherLive`).
  - Added: `MeshLayerLive` composition and merged it into
    `RuntimeDependenciesLive`.
- **Conflict risk on rebase**: medium — `server.ts` remains a hotspot for
  runtime layer wiring.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`

- **Modified**: 2026-04-19 (P4)
- **V3 phase**: Phase 4 — chat sync v1
- **Reason**: Expose mesh snapshots cheaply enough for chat replay /
  reconnect paths.
- **What changed**:
  - Added: `hostDeviceId` / `lastStreamVersion` reads on projected thread
    rows.
  - Added: `getThreadMeshSnapshot()` that reuses projection-state rows to
    compute `snapshotSequence` instead of materializing the full read
    model.
- **Conflict risk on rebase**: medium — upstream continues to evolve the
  projection query file and its SQL row shapes.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/environmentApi.ts`

- **Modified**: 2026-04-19 (P4)
- **V3 phase**: Phase 4 — chat sync v1
- **Reason**: Route thread-mutating user commands through the new mesh
  publish path without changing every callsite in the UI.
- **What changed**:
  - Added: `dispatchCommand` wrapper that sends `thread.*` commands via
    `mesh.publishEvent` and leaves `project.*` commands on the legacy
    orchestration RPC.
- **Conflict risk on rebase**: medium — small file, but it sits on a
  core API seam upstream also touches.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/environments/runtime/service.ts`

- **Modified**: 2026-04-19 (P4)
- **V3 phase**: Phase 4 — chat sync v1
- **Reason**: Make thread-detail subscriptions replayable and resilient to
  dropped mesh events.
- **What changed**:
  - Replaced: `orchestration.subscribeThread` with `mesh.subscribeChat`
    for retained thread-detail subscriptions.
  - Added: per-subscription mesh cursor tracking plus restart-on-gap
    behavior driven by the new pure gap-detection helper.
- **Conflict risk on rebase**: medium — active runtime-connection file
  with cached-subscription logic.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/rpc/wsRpcClient.ts`

- **Modified**: 2026-04-19 (P4)
- **V3 phase**: Phase 4 — chat sync v1
- **Reason**: Surface the mesh RPC methods to the web runtime.
- **What changed**:
  - Added: `mesh.publishEvent`, `mesh.subscribeChat`, and
    `mesh.subscribePresence` client methods.
- **Conflict risk on rebase**: medium — RPC client surface tends to grow
  upstream as new subscriptions are added.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/store.ts`

- **Modified**: 2026-04-19 (P4)
- **V3 phase**: Phase 4 — chat sync v1
- **Reason**: Preserve projected thread host-device attribution all the
  way through shell/detail snapshots and event application.
- **What changed**:
  - Added: `hostDeviceId` to mapped thread, thread-shell, and sidebar
    summary state.
  - Updated: thread equality and `thread.created` /
    `thread.meta-updated` application paths to keep host attribution in
    sync.
- **Conflict risk on rebase**: high — `store.ts` is a core upstream
  hotspot.
- **Last rebase verified**: 2026-04-19

**Modified V3-owned files:**

- `apps/server/src/mesh/Layers/ChatSubscriptionManager.ts` — fixes the
  replay/live race by buffering live events while replay runs, and makes
  the thread→subscriber reverse index refcount-safe.
- `apps/server/src/mesh/Layers/DeviceRegistry.ts` — stops trying to
  self-provide `PresenceBroadcaster` so the service can be composed
  cleanly from `server.ts`.
- `apps/server/src/mesh/meshWsHandlers.ts` — eagerly resolves
  `MeshPublisher` when mesh handlers are built so live orchestration
  events are mirrored into chat subscriptions.
- `apps/web/src/hooks/useChatsByDevice.ts` — groups chats by the
  projected `hostDeviceId` instead of pinning everything to the current
  device.
- `apps/web/src/environmentApi.test.ts` — pins mesh publish routing for
  thread commands.
- `apps/web/src/mesh/gapDetection.ts` + `.test.ts` — pure cursor-based
  gap detection used by reconnect handling.

## Phase 6 — Fork chat (2026-04-19)

P6 lands the `chat.fork` command, the `thread.forked` event, the SQL
event-log copy that preserves source `stream_version`, the
`mesh.forkChat` RPC, and a minimal source-side fork dialog in
`ChatHeader`. Server invariants reject fork while the source thread has
a `running`/`starting` provider session or a streaming message
in-flight; the UI also disables the action when the orchestration
session is live.

**New V3-owned files (no rebase risk):**

- `apps/server/src/persistence/Migrations/029_ProjectionThreadsForkLineage.ts`
  adds `parent_chat_id`, `parent_device_id`,
  `forked_from_stream_version`, `forked_at` columns + index on
  `projection_threads`.
- `apps/server/src/orchestration/decider.fork.test.ts` 5 unit tests
  for `validateChatForkCommand` (source missing, running, starting,
  target collision, happy path).
- `apps/web/src/components/chat/ForkChatButton.tsx` header trigger +
  modal dialog for picking the new title; disables when the
  orchestration session is `running`/`starting`.

**Modified upstream files:**

### `packages/contracts/src/orchestration.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Add the `chat.fork` command + `thread.forked` event so
  forking a chat is first-class in the orchestration domain.
- **What changed**:
  - Added: `ChatForkCommand` exported struct (sourceThreadId,
    targetThreadId, optional targetProjectId, targetDeviceId,
    targetTitle, targetBranch, targetWorktreePath, sourceDeviceId).
  - Added: `chat.fork` to `DispatchableClientOrchestrationCommand` and
    `ClientOrchestrationCommand` unions.
  - Added: `thread.forked` to `OrchestrationEventType` literal union,
    `ThreadForkedPayload` struct, and the matching `OrchestrationEvent`
    discriminated-union variant.
- **Conflict risk on rebase**: high — `OrchestrationEventType` and the
  `OrchestrationEvent` union are upstream hotspots; new entries appended
  at the tail to minimize collisions.
- **Last rebase verified**: 2026-04-19

### `packages/contracts/src/rpc.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Register the new `mesh.forkChat` WebSocket RPC.
- **What changed**:
  - Added: `MeshForkChatInput` and `MeshForkChatResult` imports from
    `mesh/chat.ts`.
  - Added: `WsMeshForkChatRpc` Rpc.make declaration.
  - Added: `WsMeshForkChatRpc` entry in the `WsRpcGroup.make` call.
- **Conflict risk on rebase**: medium — appended at the tail of the
  mesh RPC block.
- **Last rebase verified**: 2026-04-19

### `packages/contracts/src/mesh/chat.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Surface the new `mesh.forkChat` method id, input/output
  schemas, and rpc-schema entry.
- **What changed**:
  - Added: `ProjectId`, `DeviceId`, `ChatForkCommand` imports.
  - Added: `forkChat` to `MESH_WS_METHODS`.
  - Added: `MeshForkChatInput` and `MeshForkChatResult` schemas plus the
    matching `MeshRpcSchemas.forkChat` entry.
- **Conflict risk on rebase**: low — V3-owned subtree.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/persistence/Migrations.ts` (P6 update on top of P5)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Register migration 029.
- **What changed**:
  - Added: import of `Migration0029` from
    `./Migrations/029_ProjectionThreadsForkLineage.ts`.
  - Added: `[29, "ProjectionThreadsForkLineage", Migration0029]` entry
    in `migrationEntries`.
- **Conflict risk on rebase**: medium — append-only, but upstream may
  claim ID 29; renumber if so.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/orchestration/decider.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Add a `chat.fork` switch case (returns invariant error so
  callers route through the engine) and export
  `validateChatForkCommand` for the engine + tests.
- **What changed**:
  - Added: `ThreadId` import.
  - Added: `requireThreadAbsent` import (alphabetised with the other
    invariants).
  - Added: `case "chat.fork":` in `decideOrchestrationCommand` that
    fails with an invariant error instructing the engine to handle the
    command directly.
  - Added: `ChatForkValidationResult` interface plus
    `validateChatForkCommand` exported helper that re-validates source
    presence, target absence, target project, no running session, and no
    streaming message in-flight.
- **Conflict risk on rebase**: high — switch over upstream
  `OrchestrationCommand` union; new case appended near the tail.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/orchestration/projector.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Project the new `thread.forked` event into the in-memory
  read model (no-op beyond schema validation; the copied source events
  already build the target thread row).
- **What changed**:
  - Added: `ThreadForkedPayload` import alongside the other payloads.
  - Added: `case "thread.forked":` that decodes the payload and returns
    the snapshot unchanged (lineage lives on the projection_threads row,
    not the in-memory model).
- **Conflict risk on rebase**: high — switch over upstream event types;
  new case appended near the tail.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/orchestration/Schemas.ts` (P6 update on top of P0)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Re-export `ThreadForkedPayload` so the projector can
  decode it through the server-internal alias surface.
- **What changed**:
  - Added: `ThreadForkedPayload as ContractsThreadForkedPayloadSchema`
    import.
  - Added: `ThreadForkedPayload` re-export.
- **Conflict risk on rebase**: low — V3 entries appended.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/orchestration/Layers/OrchestrationEngine.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Fork has special transactional semantics — the SQL copy
  plus the appended `thread.forked` event must commit atomically and
  bypass the decider/append loop. The engine intercepts `chat.fork`
  before the standard path.
- **What changed**:
  - Added: `validateChatForkCommand` import.
  - Added: `chat.fork` arm in `commandToAggregateRef` (uses
    `targetThreadId`).
  - Refactored: `processEnvelope` body into `processStandardEnvelope`
    plus a new `processForkEnvelope` helper. The fork helper validates
    against the in-memory read model, opens a SQL transaction, calls
    `eventStore.forkThreadEvents`, then re-projects the new target
    thread's events through the projection pipeline + in-memory read
    model so subscribers see the forked chat.
- **Conflict risk on rebase**: high — engine `processEnvelope` is the
  central event dispatch loop and tends to be edited upstream.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Persist fork lineage on the target's projection_threads
  row when `thread.forked` arrives.
- **What changed**:
  - Added: `case "thread.forked":` that calls
    `projectionThreadRepository.setForkLineage` with parent chat id,
    parent device id, and source stream version, then refreshes the
    row's `lastStreamVersion` + `updatedAt`.
- **Conflict risk on rebase**: high — projection pipeline is a hotspot.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/persistence/Services/OrchestrationEventStore.ts` (P6 update on top of T3 baseline)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Declare the new `forkThreadEvents` operation on the
  service shape so the engine can call it through DI.
- **What changed**:
  - Added: type imports (`CommandId`, `DeviceId`, `ThreadId`).
  - Added: `ForkThreadEventsInput` and `ForkThreadEventsResult`
    interfaces.
  - Added: `forkThreadEvents` method on
    `OrchestrationEventStoreShape`.
- **Conflict risk on rebase**: medium — service shape is V3-extended;
  new entries appended.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/persistence/Layers/OrchestrationEventStore.ts` (P6 update on top of T3 baseline)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Implement `forkThreadEvents`: read the source thread's
  rows in a single ordered query, rewrite each event's
  `payload.threadId` (and optionally project / title / branch / worktree
  / host device on `thread.created` / `thread.meta-updated`), tag
  `metadata.forkedFromChatId`, and append a trailing `thread.forked`
  event at `max_stream_version + 1`. Caller wraps the call in a SQL
  transaction.
- **What changed**:
  - Added: `ForkThreadEventsInput` / `ForkThreadEventsResult` imports.
  - Added: `ForkRewrittenRow` interface,
    `ForkRewrittenRowRequestSchema` schema, and
    `rewritePayloadForFork` / `rewriteEventForFork` pure helpers.
  - Added: `readThreadAllRowsForFork` (inclusive-cursor variant of
    `readThreadStream` for fork copies).
  - Added: `insertForkRewrittenRow` (per-row copy via SqlSchema.void).
  - Added: `insertForkTrailingEventRow` (returns the new
    `thread.forked` event row for in-memory projection).
  - Added: `forkThreadEvents` shape implementation; returned from the
    layer's service shape.
- **Conflict risk on rebase**: medium — appended below existing
  helpers; the existing append/read paths are untouched.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/persistence/Services/ProjectionThreads.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Expose fork lineage as an orthogonal column-level concept
  (set/get) without mutating the public `ProjectionThread` schema (which
  the snapshot query and event store both depend on).
- **What changed**:
  - Added: `ProjectionThreadForkLineage` schema +
    `SetForkLineageInput` / `GetForkLineageInput` schemas.
  - Added: `setForkLineage` / `getForkLineage` methods on
    `ProjectionThreadRepositoryShape`.
- **Conflict risk on rebase**: low — V3-extended interface.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/persistence/Layers/ProjectionThreads.ts` (P6 update on top of P4)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Implement the new `setForkLineage` / `getForkLineage`
  methods against the migration-029 columns. The existing
  upsert/getById/listByProjectId continue to ignore the fork columns so
  unrelated callers stay unchanged.
- **What changed**:
  - Added: `Struct` import + `GetForkLineageInput`,
    `ProjectionThreadForkLineage`, and `SetForkLineageInput` imports.
  - Added: `ForkLineageDbRow` schema alias.
  - Added: `setForkLineageRow` (UPDATE) and `getForkLineageRow`
    (SELECT WHERE NOT NULL) SqlSchema queries.
  - Added: `setForkLineage` / `getForkLineage` shape implementations
    in the returned service.
- **Conflict risk on rebase**: low — appended.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/persistence/Layers/OrchestrationEventStore.test.ts` (P6 update on top of T3 baseline)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Cover the new `forkThreadEvents` round-trip.
- **What changed**:
  - Added: `DEFAULT_PROVIDER_INTERACTION_MODE`, `MessageId`, and
    `ThreadId` imports.
  - Added: `forkThreadEvents copies the source stream and appends
thread.forked` test asserting copied event count, highest source
    stream version, the new `thread.forked` event, payload threadId
    rewrites, and source-stream non-mutation.
- **Conflict risk on rebase**: low — appended after the existing tests.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/orchestration/Layers/OrchestrationEngine.test.ts` (P6 update on top of T3 baseline)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Three existing engine tests build mock event stores; they
  now need to satisfy the extended `OrchestrationEventStoreShape`.
- **What changed**:
  - Added: `forkThreadEvents` stub to each of the three mock stores
    (returns a `PersistenceSqlError` since none of the existing tests
    exercise the fork path).
- **Conflict risk on rebase**: low — additive.
- **Last rebase verified**: 2026-04-19

### `apps/server/src/mesh/meshWsHandlers.ts` (P6 update on top of P5)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Wire the new `mesh.forkChat` RPC handler. The handler
  stamps the source device id from the authenticated session, dispatches
  the `chat.fork` command through the engine, and reads back the target
  thread shell to populate the result payload.
- **What changed**:
  - Added: `ChatForkCommand` and `ProjectId` type imports.
  - Added: `OrchestrationEngineService` import + yield in the handler
    factory.
  - Added: `[MESH_WS_METHODS.forkChat]` handler entry.
- **Conflict risk on rebase**: low — V3-owned subtree.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/hooks/useThreadActions.ts` (P6 update on top of T3 baseline)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Add a `forkThread` hook method that dispatches `chat.fork`
  via the existing `orchestration.dispatchCommand` path (server engine
  intercepts) and navigates to the new thread on success.
- **What changed**:
  - Added: `forkThread` callback returning the new
    `ScopedThreadRef | null` (null on validation/dispatch failure with a
    user-visible error toast).
  - Added: `forkThread` to the returned hook surface.
- **Conflict risk on rebase**: medium — `useThreadActions` is upstream
  but additive.
- **Last rebase verified**: 2026-04-19

### `apps/web/src/components/chat/ChatHeader.tsx` (P6 update on top of P0 split)

- **Modified**: 2026-04-19 (P6)
- **V3 phase**: Phase 6 — fork chat
- **Reason**: Inject the new `ForkChatButton` into the header action
  cluster.
- **What changed**:
  - Added: `ForkChatButton` import.
  - Added: `<ForkChatButton threadRef={...} />` rendered after
    `GitActionsControl`.
- **Conflict risk on rebase**: medium — header action cluster is
  upstream-touched but the addition is additive.
- **Last rebase verified**: 2026-04-19

## Phase 7 — Web app cloud mode (2026-04-20)

P7 delivers the cloud-mode variant of `apps/web`: a `VITE_V3_CLOUD_MODE`
build flag, an `/app/*` static route on the server node that serves the
variant bundle, a browser-hosted Google sign-in redirect flow, a
GitHubRepoBrowser component for the "no local filesystem" case, and a
Cloudflare Pages deploy template for operators who want the bundle on
its own hostname. All deliverables are additive; the legacy Electron +
pairing flow is untouched.

**New files (V3-owned — no rebase conflict risk):**

- `apps/web/src/build-flags.ts` (+ `.test.ts`) — `IS_CLOUD_MODE`,
  `IS_HOST_CAPABLE_BUILD`, `CLOUD_MODE_BASE_PATH` constants fed from
  `import.meta.env.VITE_V3_CLOUD_MODE`.
- `apps/web/src/v3/cloudMode.ts` — `useIsCloudMode` / `isCloudBrowser`
  helpers for downstream consumers.
- `apps/web/src/v3/ui/CloudSignInBootstrap.tsx` — one-shot component
  mounted in `__root.tsx` that consumes the post-callback cookies left
  by `/api/auth/google/callback` and forwards the Drive access token
  into `captureDriveAppDataSnapshot`.
- `apps/web/src/components/cloudMode/{GitHubRepoBrowser.tsx,githubApi.ts,githubApi.test.ts,githubTokenStore.ts,githubTokenStore.test.ts,index.ts}` —
  GitHub repo picker used when cloud-mode users need to supply a
  working directory without a local filesystem.
- `apps/server/src/identity/browserGoogleOAuth.ts` (+ `.test.ts`) —
  PKCE + HMAC-signed envelope utilities for the browser OAuth flow,
  plus `buildGoogleAuthorizeUrl` / `exchangeAuthorizationCode` /
  `sanitizeReturnTo` helpers.
- `deploy/cloudflare-pages/{README.md,wrangler.toml}` — Cloudflare
  Pages deploy template for the cloud-mode bundle.
- `scripts/build-web-cloud.ts` — cross-platform helper that sets
  `VITE_V3_CLOUD_MODE=1` and runs `vite build --outDir dist-cloud`.
- `apps/web/public/_redirects` — SPA fallback rules for
  Cloudflare Pages / Netlify. Static content so no rebase risk.

**Modified upstream files (each needs MESH_CHANGES review on rebase):**

### `apps/web/vite.config.ts`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Teach the bundler about the `VITE_V3_CLOUD_MODE` flag so
  `apps/web/src/build-flags.ts` can dead-code-eliminate Electron-only
  branches, and set `base` to `/app/` when the flag is on so the
  assets render correctly under the server-node's `/app/*` route.
- **What changed**:
  - Added: `cloudModeRaw` / `isCloudMode` / `cloudModeBase` /
    `baseForBuild` at the top of the module.
  - Added: `"import.meta.env.VITE_V3_CLOUD_MODE"` +
    `"import.meta.env.VITE_V3_CLOUD_MODE_BASE"` entries under
    `define`.
  - Added: top-level `base: baseForBuild`.
- **Conflict risk on rebase**: low — additions are at module top and
  inside the existing `define`/config objects. Upstream keeps vite
  config mostly static.
- **Last rebase verified**: 2026-04-20

### `apps/web/package.json`

- **Modified**: 2026-04-20 (P7) — no change. (The `build:cloud` script
  lives at the monorepo root as `build:web-cloud` so upstream's
  `apps/web/package.json` is left alone; rebase risk stays at zero.)
- **Last rebase verified**: 2026-04-20

### `apps/web/src/vite-env.d.ts`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Type the new `VITE_V3_CLOUD_MODE` env var so TS consumers
  of `import.meta.env.VITE_V3_CLOUD_MODE` compile cleanly.
- **What changed**:
  - Added: `readonly VITE_V3_CLOUD_MODE: string;` on
    `ImportMetaEnv`.
- **Conflict risk on rebase**: low — interface member addition.
- **Last rebase verified**: 2026-04-20

### `apps/web/src/main.tsx`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Strip the `/app` base prefix from `window.location`
  before TanStack Router reads it, so deep-link refreshes on a cloud
  bundle land on the right route. The router itself never sees the
  base path — the static server route returns `index.html` for SPA
  fallbacks under `/app/*`.
- **What changed**:
  - Added: import of `CLOUD_MODE_BASE_PATH` + `IS_CLOUD_MODE` from
    `./build-flags`.
  - Added: pre-router URL rewrite block that calls
    `window.history.replaceState` when the path starts with
    `CLOUD_MODE_BASE_PATH`.
  - Modified: comment on the `history` constant to describe the new
    browser-history path in cloud mode.
- **Conflict risk on rebase**: low — additive block above the existing
  `history` constant.
- **Last rebase verified**: 2026-04-20

### `apps/web/src/routes/__root.tsx`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Mount the new `V3CloudSignInBootstrap` so browser
  sessions pick up the cookies that `/api/auth/google/callback` drops
  on redirect-back.
- **What changed**:
  - Added: `import { V3CloudSignInBootstrap } from "../v3/ui/CloudSignInBootstrap";`
  - Added: `<V3CloudSignInBootstrap />` inside the authenticated
    layout alongside `V3StartupSignInNudge`.
- **Conflict risk on rebase**: low — one import + one tag.
- **Last rebase verified**: 2026-04-20

### `apps/web/src/routes/pair.tsx`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Loopback pairing is a single-device flow; in cloud mode
  the user must sign in via Google, so we redirect `/pair` → `/` so
  the `V3SignInButton` + nudge surface drives the flow instead.
- **What changed**:
  - Added: `import { IS_CLOUD_MODE } from "../build-flags";`
  - Added: `if (IS_CLOUD_MODE) throw redirect({ to: "/", replace: true });`
    inside `beforeLoad`.
- **Conflict risk on rebase**: low — additive `if` branch.
- **Last rebase verified**: 2026-04-20

### `apps/web/src/v3/auth/googleSignIn.ts`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Add the browser (cloud-mode) sign-in path. `startV3GoogleSignIn`
  now branches on `IS_CLOUD_MODE` and navigates the browser to the
  server-hosted `/api/auth/google/authorize` redirect. Adds
  `startV3GoogleSignInBrowser`, `consumeBrowserSignInCookies`, and
  `consumeBrowserDriveAccessToken` helpers.
- **What changed**:
  - Added: `IS_CLOUD_MODE` import.
  - Added: cloud-mode branch at the top of `startV3GoogleSignIn`.
  - Added: `startV3GoogleSignInBrowser`, `consumeBrowserSignInCookies`,
    `consumeBrowserDriveAccessToken`, and helper cookie accessors.
  - Modified: top-of-file comment to document the browser flow.
- **Conflict risk on rebase**: low — V3-owned module; P1d already
  introduced this file.
- **Last rebase verified**: 2026-04-20

### `apps/server/src/config.ts`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Add `googleClientSecret`, `serverPublicUrl`, and
  `cloudModeStaticDir` fields on `ServerConfigShape` so the browser
  OAuth flow + `/app/*` static route have the data they need. Add a
  `resolveCloudModeStaticDir` Effect that mirrors `resolveStaticDir`
  for the new bundle.
- **What changed**:
  - Added: three new fields on `ServerConfigShape`.
  - Added: three `undefined` defaults in `ServerConfig.layerTest`.
  - Added: exported `resolveCloudModeStaticDir` Effect.
- **Conflict risk on rebase**: medium — `ServerConfigShape` is a
  hotspot. Upstream additions in the same shape need to be merged
  around these three fields.
- **Last rebase verified**: 2026-04-20

### `apps/server/src/cli.ts`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Wire the three new config fields through the CLI's
  env-var + TOML precedence resolver so both desktop-mode and
  server-node operators can enable browser sign-in / cloud hosting.
- **What changed**:
  - Added: `resolveCloudModeStaticDir` import from `./config.ts`.
  - Added: `googleClientSecret`, `serverPublicUrl`, and
    `cloudModeStaticDir` entries in `EnvServerConfig`.
  - Added: `resolvedCloudStaticDir` branch inside `resolveServerConfig`
    that prefers the env override and falls back to the resolver.
  - Added: `googleClientSecret`, `serverPublicUrl`, and
    `cloudModeStaticDir` into the returned `ServerConfigShape`.
- **Conflict risk on rebase**: medium — the Env/Config assembly block
  gets touched by upstream regularly, but the additions are purely
  additive.
- **Last rebase verified**: 2026-04-20

### `apps/server/src/http.ts`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Serve the cloud-mode bundle at `/app/*` with SPA fallback
  to `index.html`, separate from the legacy `staticAndDevRouteLayer`
  at `*`. Cache-controls tune TTLs for hashed assets vs `index.html`
  so a redeploy propagates immediately.
- **What changed**:
  - Added: `cloudModeStaticRouteLayer` exported alongside the existing
    static routes.
  - Added: internal `CLOUD_MODE_PATH_PREFIX` + `decodeCloudModeRelativePath`
    helpers.
- **Conflict risk on rebase**: medium — upstream static/dev route is
  in the same file but the new layer is additive and registered
  _before_ the `*` catch-all in `server.ts`.
- **Last rebase verified**: 2026-04-20

### `apps/server/src/server.ts`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Register the two new OAuth routes and the
  `cloudModeStaticRouteLayer` in `makeRoutesLayer`.
- **What changed**:
  - Added: `cloudModeStaticRouteLayer` import from `./http.ts`.
  - Added: `googleAuthorizeRouteLayer` + `googleCallbackRouteLayer`
    imports from `./identity/http.ts`.
  - Added: all three layers into `Layer.mergeAll(...)`.
- **Conflict risk on rebase**: low — additive imports + list
  extension.
- **Last rebase verified**: 2026-04-20

### `apps/server/src/identity/http.ts`

- **Modified**: 2026-04-20 (P7)
- **V3 phase**: Phase 7 — web app cloud mode
- **Reason**: Add the two browser-mode Google sign-in routes:
  `GET /api/auth/google/authorize` + `GET /api/auth/google/callback`.
  Both share the existing `DeviceApprovalService` / `UserRepository` /
  `SessionCredentialService` machinery so the resulting session looks
  identical to the desktop bootstrap.
- **What changed**:
  - Added: imports for `DeviceCapability`, `DeviceId`, `DeviceKind`,
    `DevicePlatform`, `ServerSecretStore`, and every helper from
    `./browserGoogleOAuth.ts`.
  - Added: constants for the short-lived OAuth flow secret and the
    user-input length caps.
  - Added: `pickRequestOrigin`, `extractQueryParam`, `decodeList`,
    `truncate`, `flowVerificationToAuthError`,
    `googleTokenExchangeToAuthError` helpers.
  - Added: `googleAuthorizeRouteLayer` and `googleCallbackRouteLayer`
    exported at the bottom of the module.
- **Conflict risk on rebase**: low — V3-owned file; appended at EOF.
- **Last rebase verified**: 2026-04-20

## Phase 7 — known gaps / deferred

- **Runtime TLS bridging on the redirect URI.** The cloud flow
  computes `redirectUri` from `serverPublicUrl` (with request origin
  fallback). The operator must keep the Google Cloud Console's
  registered redirect URI in sync; the wizard surfaces this as a
  callout in P2d.
- **GitHub App flow.** `GitHubRepoBrowser` currently uses a PAT stored
  in `localStorage`. P8 replaces it with the server-node-mediated
  installation-token flow (D8), at which point the PAT path in
  `githubTokenStore.ts` can be deleted.
- **Drive App Data refresh.** The browser consumes a one-time Drive
  access token delivered on the callback cookie. Refreshing the token
  in long-lived cloud-mode sessions is deferred to P7.1 (out of
  scope). Users who lose the token just see the "configure server"
  banner reappear on next sign-in.

## Phase 6 follow-up — Cross-device fork lineage (2026-04-20)

Landed in commit `8d81ce76` on top of the original P6 fork-chat
shipped earlier. Closes the "fork to another device" gap in spec
§6.6.

**New files (V3-owned):**

- `apps/server/src/persistence/Migrations/029_ProjectionThreadsForkLineage.ts`
  - Postgres mirror — adds `parent_chat_id`, `parent_device_id`,
    `forked_from_stream_version`, `forked_at` columns + index.
- `apps/web/src/components/chat/ForkAcceptDialog.tsx` — target-side
  banner inviting the user to pick a local folder via
  `localApi.dialogs.pickFolder`.

**Modified upstream / V3-shared files:**

- `packages/contracts/src/orchestration.ts` — `OrchestrationThread` +
  `OrchestrationThreadShell` gain `forkLineage?`; `ChatForkCommand`
  gains optional `targetDeviceId`.
- `packages/contracts/src/mesh/chat.ts` — `MeshPromptStreamItem`
  becomes a discriminated union with a new `fork_ready` variant.
  `MeshForkChatResult` now carries real `copiedEventCount`,
  `forkedFromStreamVersion`, `hostedOnDeviceId`.
- `apps/server/src/mesh/meshWsHandlers.ts` — post-commit reads the
  forked event stream, pushes a `fork_ready` stream item to the
  target session's outbox when the target is another device.
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
  — new `listThreadForkLineageRows` + `getThreadForkLineageRowById`
  queries joined into snapshot / shell / detail paths.
- `apps/web/src/hooks/useThreadActions.ts` — `forkThread` accepts
  `targetDeviceId` and routes through `mesh.forkChat`; non-local
  targets toast instead of navigating.
- `apps/web/src/components/chat/ForkChatButton.tsx` — target-device
  picker sorted current → online → name.
- `apps/web/src/environments/runtime/service.ts`,
  `apps/web/src/rpc/wsRpcClient.ts`,
  `apps/web/src/environmentApi.ts` — `mesh.forkChat` RPC wiring +
  `fork_ready` handler that renders a "Open chat" toast.
- `apps/web/src/store.ts`, `apps/web/src/types.ts`,
  `packages/contracts/src/ipc.ts` —
  `ThreadForkLineage` mirrored into client state.

## Phase 1e — GitHub identity (2026-04-20)

Closes the "GitHub connect" exit gate on master-plan P1 (§6) that
shipped only Google in P1a–P1d. Required by P8 for GitHub App
installation tokens on Cloud env containers; also replaces the
browser-stored PAT path in the P7 GitHubRepoBrowser.

**New files (V3-owned):**

- `packages/contracts/src/identity.ts` — adds `GitHubOAuthScope`,
  `GitHubUserSummary`, `GitHubClientPublicConfig`,
  `GitHubConnectionStatus`, `GitHubDisconnectResult`.
- `apps/server/src/identity/browserGitHubOAuth.ts` (+ `.test.ts`)
  — HMAC-signed flow envelope + authorize-URL builder +
  redirect-uri / return-to sanitisers. 17 tests.
- `apps/server/src/identity/Services/GitHubIdentityService.ts` +
  `apps/server/src/identity/Layers/GitHubIdentityService.ts`
  (+ `.test.ts`) — `exchangeCode` + `fetchUser`, plus a
  `not-configured` stub Live layer. 8 tests.
- `apps/server/src/persistence/Migrations/030_V3UserGitHubScopes.ts`
  - Postgres mirror — adds `github_scopes` + `github_connected_at`
    columns to `v3_users` (token + iv + auth_tag + username columns
    already existed from migration 026).
- `apps/web/src/v3/auth/connectGitHub.ts` — renderer-side helpers
  (`fetchGitHubClientConfig`, `fetchGitHubConnectionStatus`,
  `startConnectGitHub`, `disconnectGitHub`).
- `apps/web/src/v3/ui/ConnectGitHubButton.tsx` — three-state
  affordance rendered in Settings → Devices → Integrations.

**Modified upstream / V3-shared files:**

- `apps/server/src/identity/Errors.ts` — adds `GitHubIdentityError`
  with reasons `not-configured | invalid-state | token-exchange |
profile-fetch | user-cancelled | unknown`.
- `apps/server/src/identity/Services/UserRepository.ts` +
  `Layers/UserRepository.ts` — adds `setGitHubToken`,
  `clearGitHubToken`, `getGitHubToken` (encrypted at rest via the
  existing `tokenEncryption.ts` AES-256-GCM helpers; ciphertext +
  authTag packed together so the existing two-BLOB-column storage
  holds everything).
- `apps/server/src/identity/http.ts` — five routes: `/config`,
  `/status`, `/authorize`, `/callback`, `/disconnect`.
- `apps/server/src/config.ts` — `githubClientId`,
  `githubClientSecret`, `githubOauthScopes` (default
  `"read:user repo"`) fields.
- `apps/server/src/cli.ts` — env-var + TOML wiring for the three
  new config fields.
- `apps/server/src/server.ts` — `V3IdentityLayerLive` merges
  `GitHubIdentityServiceLive`; `makeRoutesLayer` picks up the five
  GitHub routes.
- `apps/server/src/persistence/Migrations.ts` +
  `persistence/PostgresMigrations.ts` +
  `PostgresMigrations.test.ts` — migration 030 registration and
  test fixture update.
- `apps/web/src/components/settings/DevicesSettingsPanel.tsx` —
  new "Integrations" section hosting `<V3ConnectGitHubButton />`.

**Config / test fixtures:**

`cli.test.ts`, `cli-config.test.ts`, `server.test.ts`,
`environment/Layers/ServerEnvironment.test.ts`,
`persistence/Layers/Postgres.test.ts` — all extended with the three
new `ServerConfigShape` fields.

## Phase 2e — Deploy templates (2026-04-20)

Adds the Fly.io + Railway templates master plan §10.2 queued. Kept
alongside the P7 Cloudflare Pages template.

**New files (V3-owned):**

- `deploy/flyio/{README.md,fly.toml,Dockerfile}` — server-node on
  Fly with managed Postgres attached. Bun-based multi-stage image,
  WebSocket-aware health check at `/.well-known/t3/environment`.
- `deploy/railway/{README.md,railway.json,Dockerfile}` — Railway
  mirror, minus Docker-in-Docker (so P8 Cloud env chats require a
  separate Docker host).

No upstream files touched.

## Phase 2g — Admin panel (2026-04-20)

Master plan §10.5 admin panel finally ships. Read-only in P2g; the
destructive actions (kill container, rotate secrets, pg_dump
backup) land in P8 + P11.

**New files (V3-owned):**

- `packages/contracts/src/admin.ts` — `AdminServerInfo`,
  `AdminActiveSession`, `AdminEventLogRow`, `AdminLogsResponse`,
  `AdminContainerInfo`, `AdminSummaryResponse`.
- `apps/server/src/admin/http.ts` — five `GET /api/v3/admin/*`
  routes backed by the existing `SessionCredentialService`,
  `DeviceRepository`, `UserRepository`, and orchestration event
  store. Every route requires `mode === "server-node"` + an
  authenticated + approved V3 device.
- `apps/web/src/routes/admin.tsx` — four-tab SPA (Overview,
  Sessions, Event log, Containers, Logs) with refresh buttons +
  graceful 403 / 404 handling so non-server-node operators see a
  friendly banner instead of a broken page.

**Modified upstream files:**

- `packages/contracts/src/index.ts` — re-exports `./admin.ts`.
- `apps/server/src/server.ts` — imports + mergeAll for the five
  admin route layers.
- `apps/web/src/routeTree.gen.ts` — regenerated by the TanStack
  Router plugin to include `/admin` (no hand-edits).
