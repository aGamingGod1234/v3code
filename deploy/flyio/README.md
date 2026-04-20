# V3 Code — Fly.io deploy template

This template ships V3 Code as a **server-node** on Fly.io. Your devices
connect to this server node (via Google sign-in + Drive App Data
discovery) and the server node itself hosts:

- The Effect-TS HTTP + WebSocket server (`apps/server`)
- Postgres 16 (Fly Postgres cluster)
- The cloud-mode web bundle at `/app/*`
- (Post-P8) Docker-in-Docker for Cloud env chats on Fly Machines

## What you need before you start

- A Fly.io account with billing set up
- [`flyctl`](https://fly.io/docs/flyctl/install/) installed + `fly auth login`
- A Google Cloud OAuth 2.0 **Web application** client id + secret
- (Optional) A GitHub OAuth App (P1e) client id + secret — needed
  before P8 so Cloud env containers can mint ephemeral git tokens
- The email address you want V3 to accept sign-ins from

## Step 1 — Clone + launch

From the monorepo root:

```bash
cp deploy/flyio/fly.toml fly.toml
fly launch --no-deploy --name v3-<your-handle> --region <nearest region>
```

Remove the `fly.toml` copy after `fly launch` creates its own; the
template is only needed to seed `[build]`, `[env]`, and `[[services]]`
sections that Fly's launcher doesn't auto-detect.

## Step 2 — Attach Postgres

```bash
fly postgres create --name v3-<your-handle>-db --region <region>
fly postgres attach --app v3-<your-handle> v3-<your-handle>-db
```

The attach writes `DATABASE_URL` into your app's secrets; V3 picks it
up as `V3CODE_POSTGRES_URL` via the `[env]` alias in `fly.toml`.

## Step 3 — Secrets

```bash
fly secrets set \
  V3CODE_GOOGLE_CLIENT_ID=... \
  V3CODE_GOOGLE_CLIENT_SECRET=... \
  V3CODE_AUTHORIZED_EMAILS="you@example.com" \
  V3CODE_SERVER_PUBLIC_URL="https://v3-<your-handle>.fly.dev" \
  V3CODE_GITHUB_CLIENT_ID=... \
  V3CODE_GITHUB_CLIENT_SECRET=...
```

`V3CODE_GITHUB_*` are optional until P8 Cloud env ships; if you skip
them, the GitHub repo browser in cloud mode will just fall back to
the PAT-pasting flow.

## Step 4 — Deploy

```bash
fly deploy
```

The Dockerfile in this directory builds the server + cloud web bundle
in-image so the runtime container starts with everything preloaded. A
first deploy on a cold build takes 5–10 minutes.

## Step 5 — Point your domain

Add a CNAME from `v3.<your-domain>` to `v3-<your-handle>.fly.dev` and
update `V3CODE_SERVER_PUBLIC_URL` to the new origin:

```bash
fly certs create v3.<your-domain>
fly secrets set V3CODE_SERVER_PUBLIC_URL="https://v3.<your-domain>"
```

Register `https://v3.<your-domain>/api/auth/google/callback` as an
authorized redirect URI in Google Cloud Console for your OAuth client.

If you connected GitHub, register
`https://v3.<your-domain>/api/auth/github/callback` in your GitHub
OAuth app settings.

## Step 6 — Verify

From any signed-out device:

1. Open `https://v3.<your-domain>/app/`
2. Click **Sign in with Google**
3. You should land back on the cloud bundle signed in
4. In Settings → Devices → Integrations, click **Connect GitHub**

## Limits

Default machine size (`shared-cpu-2x @ 2GB`) is fine for a personal V3
server. Bump memory in `fly.toml` if you run Cloud env chats on Fly
Machines after P8.

Fly Postgres on a `shared-cpu-1x @ 256MB` plan is enough for
personal use. Scale if event-log volume grows.

## Teardown

```bash
fly apps destroy v3-<your-handle>
fly postgres destroy v3-<your-handle>-db
```
