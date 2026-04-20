# V3 Code — Railway deploy template

A lighter-weight deploy target than Fly.io: Railway builds with
Nixpacks (or Docker if you keep `railway.json`'s
`builder: "DOCKERFILE"`), ships Postgres as a separate managed
service, and gives you a TLS endpoint for free. No Docker-in-Docker,
though — P8 Cloud env chats on Railway require a separate runner.

Think of this template as "server-node without Cloud env." Your
devices can all connect, chats sync, and the cloud web bundle serves
from `/app/*`; Cloud env chats will fall through to "not available"
until you bolt on your own Docker host.

## Prereqs

- Railway account + `railway login`
- Google OAuth web-application client + secret
- (optional) GitHub OAuth App credentials — needed before P8

## One-click via template (after you publish this repo as a template)

If the `v3code` repo on GitHub is wired up as a Railway template, the
shortest path is:

```
railway new --template <your-template-slug>
```

## From scratch

```bash
cd /path/to/V3-code
railway init v3-<your-handle>
railway up            # first deploy
railway add postgres  # provisions a managed Postgres service
```

## Environment

Copy from your favourite password manager into Railway's
"Variables" panel (or run `railway variables set`):

```
V3CODE_MODE=server-node
V3CODE_HOST=0.0.0.0
V3CODE_PORT=8080
V3CODE_STARTUP_PRESENTATION=headless
V3CODE_NO_BROWSER=1
V3CODE_GOOGLE_CLIENT_ID=...
V3CODE_GOOGLE_CLIENT_SECRET=...
V3CODE_AUTHORIZED_EMAILS=you@example.com
V3CODE_SERVER_PUBLIC_URL=https://<railway-subdomain>.up.railway.app
V3CODE_GITHUB_CLIENT_ID=...
V3CODE_GITHUB_CLIENT_SECRET=...
```

Railway auto-wires `DATABASE_URL` once you add the Postgres plugin;
V3CODE_POSTGRES_URL is mirrored from it in the Dockerfile entrypoint.

## Custom domain

```bash
railway domain
```

Follow the CNAME instructions. Update `V3CODE_SERVER_PUBLIC_URL` +
the Google / GitHub OAuth redirect URIs to match.

## Known limitations on Railway

- No Docker-in-Docker, so P8 Cloud env chats cannot run here directly.
  Pair this deploy with a separate Docker host (another Railway
  service running Docker, or a Fly Machine dedicated to cloud-env
  containers) once P8 ships.
- Railway's free tier sleeps idle apps after 24h — upgrade to the
  Developer plan if you want the mesh always-on.
