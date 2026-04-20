# V3 Code — Cloud-mode deploy on Cloudflare Pages

This template hosts the **V3 cloud-mode web bundle** (`apps/web` built
with `VITE_V3_CLOUD_MODE=1`) on Cloudflare Pages at a domain you own.
The bundle is a static SPA; every dynamic call (WebSocket RPC,
`/api/*` fetches, `/attachments/*`) goes to your V3 server-node, which
must already be reachable at the public URL configured in its
`config.toml` (`[server] public_url`).

The server-node's own `/app/*` route can already serve the same bundle
directly. This Pages template is the deploy path for operators who
want the cloud bundle on a separate hostname (e.g. `app.v3.example.com`)
so the Electron and mobile clients can pin the server-node behind a
different TLS boundary.

## Prerequisites

- A Cloudflare account with Pages access.
- [`wrangler`](https://developers.cloudflare.com/workers/wrangler/install-and-update/) 3.x installed.
- A V3 server-node already running at a public URL that the Cloudflare
  Page can reach over HTTPS.

## Build

From the monorepo root:

```bash
bun install
bun run build:web-cloud
```

The bundle lands in `apps/web/dist-cloud/`.

## Deploy

```bash
cd deploy/cloudflare-pages
wrangler pages deploy ../../apps/web/dist-cloud \
  --project-name v3-cloud-app \
  --branch main
```

On first deploy Wrangler prompts for the Cloudflare account +
project. Subsequent deploys skip the prompt if the CLI is
authenticated.

## Runtime configuration

The bundle reads the V3 server origin from the `VITE_HTTP_URL` /
`VITE_WS_URL` that were baked in at build time. To point a
Pages-hosted bundle at a different server-node, rebuild with:

```bash
VITE_HTTP_URL=https://v3.agaminggod.com \
VITE_WS_URL=wss://v3.agaminggod.com/ws \
bun run build:web-cloud
```

If your server-node is behind Cloudflare Tunnel (most V3 self-hosts),
the Pages deployment and the server can share the same apex domain
and you can skip `VITE_HTTP_URL` / `VITE_WS_URL` entirely — the bundle
falls back to relative paths.

## Routing fallback

Pages serves `index.html` for unknown paths by default, which is
exactly what a TanStack Router SPA needs. `public/_redirects` adds a
belt-and-braces rule so deep-link refreshes don't 404 even if an
ingress strips the default behaviour.

## Limitations

- Any feature that assumes an Electron bridge (system-tray, node-pty
  terminal, `v3://` deep links) is **hidden** in cloud-mode. The
  browser still interacts with terminals / worktrees, but only
  through a remote host device.
- Google sign-in uses the server-hosted `/api/auth/google/authorize`
  redirect flow; the Cloudflare Page needs to point at a V3 server
  node that has `google_client_secret` configured.
- The GitHub repo picker currently takes a user-supplied PAT stored
  in `localStorage`; the user-owned GitHub App flow lands in P8 and
  will replace the PAT path.
