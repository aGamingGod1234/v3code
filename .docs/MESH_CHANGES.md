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
