# Contributing to V3 Code

V3 Code is a spec-driven fork of [T3 Code](https://github.com/pingdotgg/t3code).
The spec is [V3_CODE_SPEC.md](./V3_CODE_SPEC.md); contributions are
evaluated against it. If your change aligns with the spec, read this
doc and go.

Bug reports are always welcome, even without a PR. File them at
[github.com/aGamingGod1234/v3code/issues](https://github.com/aGamingGod1234/v3code/issues).

---

## What we're most likely to accept

- Bug fixes with a tight repro.
- Reliability + performance fixes on the mesh layer (spec §5).
- Accessibility fixes in the web/mobile UI.
- Cloud env hardening (resource limit enforcement, `previewProxy`
  correctness, GitHub token rotation).
- Spec-aligned documentation in `docs/`.
- Test coverage for anything in `apps/server/src/mesh` or
  `apps/server/src/cloud`.

## What we're least likely to accept

- Large PRs without a prior issue. Open the issue first.
- Scope creep (new providers, alternate auth methods, new deploy
  targets) without a spec update.
- Stylistic rewrites of working code.
- Dependency churn that doesn't pull its weight.
- Anything that slows the single-device experience to help the mesh
  layer — single-device-first is a spec guarantee.

---

## Before you start

Please open or comment on an issue first for anything non-trivial. That
gives both sides a chance to catch scope/approach problems before a PR
is written. "Non-trivial" = more than ~30 lines changed or anything
that touches a protocol boundary.

If you want to work on something on the roadmap, grab a Phase X slice
from the spec and say so in the issue.

---

## Workflow

1. Fork, branch, and clone.
2. Install tools: `mise install` (optional), `bun install`.
3. Build once: `bun run build`.
4. Make your change. Respect the project conventions:
   - TypeScript strict mode, no `any`.
   - Effect-TS style on the server. Don't introduce ad-hoc Promises in
     `apps/server/src/*` — wrap them in `Effect.fn` or a service.
   - React Hooks on the client. Prefer `useAtomValue` over `useState`
     for shared state (see `apps/web/src/rpc/atomRegistry.ts`).
   - `packages/contracts` is **schema only** — no runtime logic.
   - Use explicit subpath exports for `@v3tools/shared` (no barrel
     `index.ts`).
5. Run the gate before pushing:

   ```bash
   bun run fmt:check
   bun run lint
   bun run typecheck
   bun run test        # uses `turbo run test`, NOT `bun test`
   ```

6. Open a PR against `main`. Tests must pass on CI. PRs are labelled
   automatically with `size:*` (diff size) and `vouch:*` (external
   reviewer trust).

---

## PR guidelines

- **Title**: conventional commit style (`fix(mesh): …`,
  `feat(cloud-env): …`, `docs(vps): …`). Keep it under 70 chars.
- **Body**: what changed, why it changed, how you tested it. Include a
  before/after if the change touches UI (screenshot for layout
  changes, short clip for motion / transitions).
- **Scope**: one logical change per PR. Mixed PRs get sent back for
  splitting.
- **Tests**: any new behaviour needs a test. A bug fix needs a test
  that would have caught it.
- **Docs**: any protocol or config change must update the relevant
  file under `docs/`, and if it touches the WS wire, also
  [MESH_CHANGES.md](./MESH_CHANGES.md).

---

## Security-sensitive changes

Anything in `apps/server/src/auth/` or `apps/server/src/identity/`,
anything that touches session cookies, GitHub tokens, or the Drive App
Data schema, gets extra scrutiny. Do:

- Document the threat you're protecting against.
- Prove you handled the error paths (malformed input, expired token,
  revoked scope).
- Keep secrets out of logs. Structured logging is set up so you can
  attach `{ tokenHash }` instead of a raw token.

Don't:

- Weaken `authorized_emails` enforcement "just for dev".
- Skip encryption-at-rest for new secret material.
- Store credentials client-side outside the OS keychain / IndexedDB.

---

## Style quick reference

- Run `bun run fmt` before committing. CI enforces it via `oxfmt --check`.
- `oxlint` is the linter. Warnings in `.claude/worktrees/*` are
  pre-existing stale-worktree noise — the main tree is clean (0 errors).
- Imports are sorted by a rule set in `.oxlintrc.json`.
- No commented-out code. If it's useful, it lives in git history.

---

## Final word

V3 Code is small and opinionated. If a PR feels like a fight, it's
probably out of scope — open an issue to discuss before burning more
time on it. The maintainers reserve the right to close PRs that ignore
this doc.

Discord: [discord.gg/jn4EGJjrvv](https://discord.gg/jn4EGJjrvv).
