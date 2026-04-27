# V3 Code — Cloudflare Workers + D1 + R2 + Containers deploy

Spec §10.2c. Serverless deployment target for V3 Code's server-node,
using Cloudflare primitives end-to-end:

- **Workers** → the HTTP + WebSocket hub (`apps/server`).
- **Durable Objects** → per-session WebSocket state (mesh presence +
  chat PubSub).
- **D1** → the Postgres replacement. The V3 persistence layer's SQL
  dialect is SQLite-compatible via `@effect/sql-sqlite-*`, so a D1
  database satisfies the same migration set.
- **R2** → attachment + worktree blob storage (where the self-host
  build uses `~/v3-code-server/attachments`).
- **Containers (public beta, 2026-Q1)** → Cloud env chats. Each chat
  spins up a Containers instance from the V3 `cloud-env` image.

This template is **experimental**. The Cloudflare Containers public
beta launched in 2026 and the primitive surface is still
stabilising — expect breaking changes before v1.0. For a stable
deploy target today, see [deploy/flyio/](../flyio/) or
[docs/deploy-vps.md](../../docs/deploy-vps.md).

---

## What this template gives you

| File                            | Purpose                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| `wrangler.toml`                 | Worker bindings for D1, R2, Containers, Durable Objects.            |
| `migrations/0001_v3_schema.sql` | D1 bootstrap migration (mirrors the server-node Postgres baseline). |
| `container.Dockerfile`          | Cloud env container image reference.                                |
| `entrypoint.ts`                 | Worker entry that forwards requests into the V3 server bundle.      |
| `scripts/deploy.sh`             | One-shot create D1 DB, R2 bucket, deploy Worker.                    |

---

## Prerequisites

- Cloudflare account with Workers Paid, Containers, D1, R2 all enabled.
- `wrangler` 3.x: `npm install -g wrangler` then `wrangler login`.
- A Google OAuth 2.0 Web application client ID + secret authorised
  for your Worker's public URL.
- A GitHub OAuth App (optional but required for Cloud env chats).

---

## One-shot deploy

From the monorepo root:

```bash
bun install
bun run build
bash deploy/cloudflare-workers/scripts/deploy.sh
```

The script:

1. Creates a D1 database named `v3-server` (if absent).
2. Applies `migrations/0001_v3_schema.sql`.
3. Creates an R2 bucket named `v3-attachments` (if absent).
4. Deploys the Worker with Durable Object + Containers bindings.
5. Prints the Worker URL — register it as an authorised redirect URI
   with Google / GitHub.

Secrets go through `wrangler secret put`:

```bash
wrangler secret put V3CODE_GOOGLE_CLIENT_ID
wrangler secret put V3CODE_GOOGLE_CLIENT_SECRET
wrangler secret put V3CODE_GITHUB_CLIENT_ID
wrangler secret put V3CODE_GITHUB_CLIENT_SECRET
wrangler secret put V3CODE_AUTHORIZED_EMAILS
wrangler secret put V3CODE_TOKEN_ENCRYPTION_KEY   # openssl rand -base64 32
```

---

## Caveats and trade-offs

- **Durable Object WS limits**: Cloudflare caps WebSocket messages per
  DO instance; the spec §5 mesh stays well under this, but long event
  replays over `mesh.subscribeChat` may hit the per-message 1 MB ceiling.
  The server clamps chunk sizes conservatively.
- **D1 vs Postgres**: the V3 persistence layer treats D1 the same as
  the desktop SQLite file, which means the `SQLite` migration series
  applies as-is. JSONB columns collapse to TEXT with JSON validation
  at read time. Expect a small per-query overhead vs. Postgres.
- **R2 for attachments**: attachments are fetched through the Worker
  itself (`/attachments/*`) so browsers never see R2 URLs. This
  preserves the spec §3.2 "GitHub token never leaves the server"
  invariant because attachments are per-user, signed-in-only.
- **Containers runtime**: the `cloud-env` image must be published to a
  registry Cloudflare can pull from (GHCR with a read-only token
  works; see
  [.github/workflows/publish-cloud-env.yml](../../.github/workflows/publish-cloud-env.yml)).
  Container cold starts run 6-12 s on the beta; spec §7.2 gives 3-8 s
  so users will see a slightly longer "Starting Cloud environment…"
  spinner than on Fly Machines.
- **Cost shape**: Workers Paid ($5/mo) + Containers per-invocation
  billing + D1 reads/writes. For a single-user deployment that sees
  1-2 Cloud env chats per day this lands around $7-10/mo; scale your
  own math for heavier use.

---

## Updates and rollback

```bash
wrangler deploy                            # redeploy Worker
wrangler d1 migrations apply v3-server     # apply new SQL migrations
wrangler deploy --env rollback             # pin to prior version
```

Track prior deploys via `wrangler deployments list`. Worker code is
immutable once deployed; rollback is a matter of pointing the route
at an older deployment.

---

## Known gaps

- **Not yet wired**: Containers lifecycle callbacks into the server
  bundle. Today the container manager assumes a Docker-daemon socket;
  a thin adapter for the Containers API sits behind a feature flag.
- **Not yet wired**: the `previewProxy` path rewrites (`/preview/:id/*`)
  need a Durable Object hop because Workers can't long-poll a
  container directly. This is pending the Cloudflare Containers
  `exec` surface landing GA.

Until those land, Cloud env chats started from a Cloudflare Workers
deployment will show "Cloud environment unavailable" and fall through
to physical-device hosts. Every other V3 flow works end-to-end on
this template.
