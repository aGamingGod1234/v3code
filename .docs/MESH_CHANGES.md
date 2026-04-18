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

## Entries

(None yet. Phase 0 hasn't modified upstream files.)

---

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
- `packages/contracts/src/rpc.ts` (MEDIUM — register mesh.* RPCs)
- `packages/contracts/src/auth.ts` (MEDIUM — policy/method unions extended)
- `packages/contracts/src/orchestration.ts` (HIGH — new event + command variants)
- `package.json` (MEDIUM — catalog additions, namespace rename)
- `turbo.json` (LOW — globalEnv rename)
