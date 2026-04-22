# V3 Code — Self-host on your own machine

For when the machine that'll host your server node is something you
already own — a Mini PC, a home server, the desktop you leave on
overnight, a Raspberry Pi 5. Spec §10.1.

For a fresh VPS rental, follow [deploy-vps.md](./deploy-vps.md)
instead. For one-click Fly.io/Railway, see [deploy-cloud.md](./deploy-cloud.md).

---

## When self-host makes sense

- You already own always-on hardware you trust.
- You don't want to pay a cloud provider for server time.
- You care about your data staying on hardware you control.

Cost breakdown: electricity + a domain name. Cloudflare Tunnel is
free, Let's Encrypt is free, V3 is free.

## When it doesn't

- The machine sleeps or restarts on you. Your other devices will
  lose mesh sync every time it goes down.
- Your ISP blocks inbound connections and you don't want to use
  Cloudflare Tunnel. V3 expects a reachable public URL.
- You don't want to run Docker. Cloud env chats require Docker; you
  can disable them in `config.toml` (`[cloud_env] enabled = false`),
  but the Cloud device won't appear in the sidebar.

---

## Setup wizard (recommended)

V3 ships a setup wizard in the desktop app that automates most of
this. On a machine that runs V3 Code already:

1. _Settings → Server Node → Set up server on this machine_.
2. The wizard checks Docker is running, asks which public URL
   strategy to use (Cloudflare Tunnel, your own reverse proxy,
   Tailnet-only), and picks a data directory (default:
   `~/v3-code-server/`).
3. Postgres is started via a bundled Docker Compose stanza.
4. If you pick Cloudflare Tunnel, the wizard asks for the domain you
   want and uses `cloudflared` to register + install the tunnel as a
   service.
5. Wizard writes the final URL to Drive App Data so other devices
   auto-discover it.

After step 5 you're done — open V3 on your phone or laptop, sign in
with the same Google account, and your new server node shows up.

---

## Manual setup

Skip the wizard if you want to tweak everything by hand. This works
on Linux / macOS / Windows (WSL2) as long as Docker is available.

### 1. Install runtimes

Need Node.js 22 LTS, Bun, and Docker. Platform specifics live in
[deploy-vps.md](./deploy-vps.md).

### 2. Create the data directory

```bash
mkdir -p ~/v3-code-server
cd ~/v3-code-server
```

### 3. Start Postgres

The simplest path is a single-container Postgres via Docker Compose.
Create `~/v3-code-server/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: v3
      POSTGRES_PASSWORD: pick-a-strong-one
      POSTGRES_DB: v3
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
```

```bash
docker compose up -d postgres
```

### 4. Clone V3 + build

```bash
git clone https://github.com/aGamingGod1234/v3code.git
cd v3code
bun install
bun run build
```

### 5. Write `~/.v3-code-server/config.toml`

Template:

```toml
[server]
public_url = "https://v3.example.com"
bind_host = "127.0.0.1"
bind_port = 8080

[auth]
google_client_id = "xxx.apps.googleusercontent.com"
google_client_secret = "GOCSPX-xxx"
github_client_id = "Iv1.xxx"
github_client_secret = "ghcs_xxx"
authorized_emails = ["you@example.com"]

[database]
postgres_url = "postgres://v3:pick-a-strong-one@127.0.0.1:5432/v3"
encryption_key = "<openssl rand -base64 32>"

[cloud_env]
enabled = true
docker_socket = "/var/run/docker.sock"
base_image = "ghcr.io/v3-code/cloud-env:latest"
max_containers = 4
container_cpu_limit = 2
container_memory_mb = 4096
container_disk_gb = 20
container_max_runtime_hours = 720

[limits]
max_devices_per_user = 20
max_chats_per_user = 10000
max_event_log_size_mb = 100000
```

`chmod 600 ~/.v3-code-server/config.toml` so it's not world-readable.

### 6. Expose a public URL

**Cloudflare Tunnel (recommended)** — no inbound ports, free on any
Cloudflare account. The canonical walkthrough is in
[deploy-vps.md §9](./deploy-vps.md#9-tls-and-public-url).

**Existing reverse proxy** — if you already run Caddy, Nginx, or
Traefik, add a vhost that forwards `v3.example.com` to `127.0.0.1:8080`
with WebSocket upgrade headers enabled.

**Local-only (Tailnet)** — bind to a Tailscale IP, set
`[server].public_url` to e.g. `http://<tailnet-name>.ts.net:8080`. No
TLS cert needed inside your tailnet.

### 7. Run the server

As a systemd service (Linux): follow [deploy-vps.md §8](./deploy-vps.md#8-systemd-service).
Quick-and-dirty (any platform):

```bash
V3CODE_MODE=server-node \
V3CODE_CONFIG=~/.v3-code-server/config.toml \
V3CODE_NO_BROWSER=1 \
V3CODE_STARTUP_PRESENTATION=headless \
bun run apps/server/src/bin.ts
```

When the server prints `server ready on http://127.0.0.1:8080`, you're
done. Open the V3 desktop app on the same or another machine, sign in,
and it'll auto-connect.

---

## Operating it

- **Watch the logs**: `journalctl -u v3-code -f` (Linux systemd) or
  `tail -f ~/v3-code-server/logs/server.log`.
- **Admin panel**: `https://v3.example.com/admin` — WS sessions, Cloud
  containers, Postgres stats, event log size per chat, Docker daemon
  health.
- **Back up Postgres**: `pg_dump v3 | gzip > backup.sql.gz`. Run it
  nightly if you care about chat history across disk failures.
- **Rotate TLS**: Cloudflare Tunnel handles it; if you roll your own
  cert, Caddy auto-renews Let's Encrypt.
- **Upgrade V3**: `git pull && bun install && bun run build` +
  `systemctl restart v3-code`.

Troubleshooting is in [troubleshooting.md](./troubleshooting.md).
