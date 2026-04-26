# V3 Code — One-click cloud deploy

When you want your server node to live somewhere other than hardware
you own. Spec §10.2.

V3 ships three cloud templates today:

| Target               | Cloud env chats?                  | Best for                                                                        |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| **Fly.io**           | ✅ (Docker-in-Docker Machine)     | Users with no home server who want the full mesh + Cloud env                    |
| **Railway**          | ⚠️ (needs a separate Docker host) | Users who want the simplest setup and don't care about Cloud env                |
| **Cloudflare Pages** | ❌ (static SPA only)              | Hosting only the cloud-mode web bundle — you still need a server node somewhere |

For self-host on your own machine, see [deploy-self.md](./deploy-self.md).
For a fresh rented VPS, see [deploy-vps.md](./deploy-vps.md).

---

## Prerequisites (common to all targets)

- A **Google Cloud OAuth 2.0 Web application** client ID + secret.
  Authorize your target's public URL as a redirect URI under
  `/auth/google/callback`.
- Optional but recommended: a **GitHub OAuth App** (client ID +
  secret). Needed for Cloud env chats to commit/push/PR.
- The email address you want V3 to accept sign-ins from — this lands
  in `[auth].authorized_emails`.
- A domain name you control if you want a pretty URL. All three
  targets give you a default `*.fly.dev` / `*.up.railway.app` /
  `*.pages.dev` you can start with.

---

## Fly.io

The full-fat option. Fly Machines run Docker-in-Docker so Cloud env
chats work without external plumbing.

### Walkthrough

Full walkthrough lives in
[deploy/flyio/README.md](../deploy/flyio/README.md). Short version:

```bash
cp deploy/flyio/fly.toml fly.toml
fly launch --no-deploy --name v3-<your-handle> --region iad

# Set secrets
fly secrets set \
  V3CODE_GOOGLE_CLIENT_ID=<...> \
  V3CODE_GOOGLE_CLIENT_SECRET=<...> \
  V3CODE_GITHUB_CLIENT_ID=<...> \
  V3CODE_GITHUB_CLIENT_SECRET=<...> \
  V3CODE_AUTHORIZED_EMAILS=you@example.com \
  V3CODE_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Attach Postgres
fly postgres create --name v3-<your-handle>-db
fly postgres attach v3-<your-handle>-db

fly deploy
```

The template sizes the Machine at 8 GB / 4 vCPU so Cloud env chats
(spec §7.2 caps a container at 4 GB) have room alongside the server +
Postgres. Shrink it via `fly scale memory 2048` if you disable Cloud
env.

### What you get

- Public URL: `https://v3-<your-handle>.fly.dev` (or custom domain via
  `fly certs`).
- Postgres 16 attached.
- Docker-in-Docker Machine for Cloud env chats.
- WebSocket upgrades handled automatically by the Fly proxy.

### Cost rough-guide

Fly's Machine pricing + Postgres pricing adds up to roughly $15–30/mo
for a single-user deployment that sees 1–2 concurrent Cloud env chats.
Lower if you scale to zero when idle (see `auto_stop_machines` in
`fly.toml`).

---

## Railway

Lighter-weight. No Docker-in-Docker. Cloud env chats won't work
without a separate Docker host, which V3 does not configure for you on
Railway.

### Walkthrough

Full walkthrough in [deploy/railway/README.md](../deploy/railway/README.md).
Short version:

```bash
railway login
railway link
railway add --database postgres
railway variables set \
  V3CODE_MODE=server-node \
  V3CODE_GOOGLE_CLIENT_ID=<...> \
  V3CODE_GOOGLE_CLIENT_SECRET=<...> \
  V3CODE_AUTHORIZED_EMAILS=you@example.com \
  V3CODE_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
railway up
```

The `DATABASE_URL` that Railway injects is read automatically.

### Caveats

- Cloud env chats will fall through to "not available" because there's
  no Docker socket reachable from a Railway container.
- Good fit if you only ever host chats on physical devices (desktop,
  laptop, phone) and use the server node purely as a sync hub.

---

## Cloudflare Pages (web bundle only)

Pages is **not** a server-node deploy target. It hosts the
"cloud-mode" web bundle — the React SPA that talks to a server node
somewhere else — behind a Cloudflare-edge CDN.

Useful if:

- Your server node is on a Tailnet-only URL and you want a public
  web entry point without re-exposing the server.
- You want to run `app.example.com` on Pages for the UI and
  `v3.example.com` on Fly.io/VPS for the server, with separate TLS
  terminations.

Full walkthrough in
[deploy/cloudflare-pages/README.md](../deploy/cloudflare-pages/README.md).
Short version:

```bash
bun install
bun run build:web-cloud

cd deploy/cloudflare-pages
wrangler pages deploy ../../apps/web/dist-cloud \
  --project-name v3-cloud-app \
  --branch main
```

Configure the Pages project's environment variables with the URL of
your V3 server node (`VITE_V3_SERVER_URL`). The SPA makes all calls to
that origin over HTTPS + WSS.

### Not yet supported

- **Cloudflare Workers + D1 + R2 + Containers** as a full server-node
  target. The Containers public beta landed in 2026 but we haven't
  shipped the template — tracked in TODO.md / open issues. For now
  Cloudflare Pages handles the static web path only.

---

## After deploying

1. Point a domain at the public URL (or use the default host).
2. Register redirect URIs with Google OAuth.
3. Sign in on a client device — the first one auto-approves (spec
   §3.3). Subsequent devices need an approval click from a device
   that's already online.
4. Write the server URL to Drive App Data — the sign-in flow does
   this automatically.

Monitor the server node with `/admin` and the troubleshooting guide at
[troubleshooting.md](./troubleshooting.md).
