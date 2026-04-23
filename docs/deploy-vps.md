# V3 Code — Manual VPS Deployment

This guide walks through running a V3 server node on a DIY virtual private
server (Hetzner, DigitalOcean, Linode, OVH, Oracle Cloud Free Tier, your
dusty Mini PC — anywhere Ubuntu runs). It maps to §10.3 of
`V3_CODE_SPEC.md`.

V3 Code works single-device without any of this. Only follow this guide
when you want the multi-device mesh, which means hosting a server node
your other machines can reach.

---

## 1. Pick a box

Minimum spec for a personal deployment:

| Resource | Lower bound  | Why                                                                           |
| -------- | ------------ | ----------------------------------------------------------------------------- |
| CPU      | 2 vCPU       | Server + Postgres + ≥1 Cloud container = 2 cores busy under load              |
| RAM      | 4 GB         | Per-container cap is 4 GB; bump to 8 GB if you want ≥2 concurrent Cloud chats |
| Disk     | 40 GB        | 20 GB per container is the default hard cap; leave headroom for images + logs |
| Network  | 10 Mbit/s up | Event streaming is small, but `git push` bursts benefit from more             |

Tested distros: Ubuntu 24.04 LTS ("Noble Numbat") and Debian 12. Anything
newer with systemd + cgroups v2 should work.

---

## 2. Install base packages

```bash
sudo apt update
sudo apt install -y curl git ca-certificates gnupg lsb-release ufw
```

Create a dedicated user (don't run as root):

```bash
sudo adduser --system --group --home /opt/v3code v3code
sudo usermod -aG docker v3code  # added after Docker installs (step 4)
```

---

## 3. Install Node.js 22 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # v22.x
```

Bun is required for the monorepo build:

```bash
curl -fsSL https://bun.sh/install | bash
sudo mv ~/.bun/bin/bun /usr/local/bin/bun
```

---

## 4. Install Docker Engine

The server node talks to the Docker daemon for Cloud env containers
(§7.1). Using Docker Desktop on a VPS is not supported; install the
engine packages directly.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker v3code
```

Pull the Cloud env base image so the first chat start doesn't timeout:

```bash
sudo -u v3code docker pull ghcr.io/v3-code/cloud-env:latest
```

---

## 5. Install Postgres 16

```bash
sudo apt install -y postgresql-16 postgresql-contrib-16
sudo -u postgres psql -c "CREATE ROLE v3 WITH LOGIN PASSWORD 'pick-a-strong-one';"
sudo -u postgres psql -c "CREATE DATABASE v3 OWNER v3;"
sudo -u postgres psql -c "ALTER ROLE v3 CREATEDB;"  # tests use temp DBs
```

Postgres listens on `127.0.0.1:5432` by default — keep it that way.

Connection URL for `config.toml`:
`postgres://v3:pick-a-strong-one@127.0.0.1:5432/v3`.

---

## 6. Clone, build, install V3 Code

```bash
sudo -u v3code bash <<'EOF'
cd /opt/v3code
git clone https://github.com/aGamingGod1234/v3code.git repo
cd repo
bun install
bun run build
EOF
```

Build artefacts land in `apps/server/dist`.

---

## 7. Configure the server node

Create `/opt/v3code/config.toml`:

```toml
[server]
public_url = "https://v3.example.com"
bind_host = "127.0.0.1"
bind_port = 8080

[auth]
google_client_id = "xxxxxxxxxxxx.apps.googleusercontent.com"
google_client_secret = "GOCSPX-xxxxxxxxxx"
github_client_id = "Iv1.xxxxxxxxxx"
github_client_secret = "ghcs_xxxxxxxxxx"
authorized_emails = ["you@example.com"]

[database]
postgres_url = "postgres://v3:pick-a-strong-one@127.0.0.1:5432/v3"
# Generate once with: `openssl rand -base64 32`
encryption_key = "<32-byte base64>"

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

Lock it down: `sudo chmod 600 /opt/v3code/config.toml && sudo chown v3code:v3code /opt/v3code/config.toml`.

Register your Google OAuth client (console.cloud.google.com → APIs &
Services → Credentials) with redirect URIs that include
`https://v3.example.com/auth/google/callback`. Repeat for GitHub
(github.com/settings/developers).

---

## 8. systemd service

Create `/etc/systemd/system/v3-code.service`:

```ini
[Unit]
Description=V3 Code server node
After=network-online.target postgresql.service docker.service
Wants=network-online.target postgresql.service docker.service

[Service]
Type=simple
User=v3code
Group=v3code
WorkingDirectory=/opt/v3code/repo
Environment=V3CODE_MODE=server-node
Environment=V3CODE_CONFIG=/opt/v3code/config.toml
Environment=V3CODE_STARTUP_PRESENTATION=headless
Environment=V3CODE_NO_BROWSER=1
ExecStart=/usr/local/bin/bun run apps/server/src/bin.ts
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

# Harden
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/v3code /var/log/v3code /var/run/docker.sock
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now v3-code.service
sudo journalctl -u v3-code -f
```

---

## 9. TLS and public URL

Option A — **Cloudflare Tunnel** (recommended, zero port exposure):

```bash
sudo mkdir -p /etc/cloudflared
cd /etc/cloudflared
sudo wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
sudo cloudflared tunnel login
sudo cloudflared tunnel create v3code
sudo cloudflared tunnel route dns v3code v3.example.com
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: v3code
credentials-file: /etc/cloudflared/<tunnel-id>.json

ingress:
  - hostname: v3.example.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

```bash
sudo cloudflared service install
```

Option B — **Caddy + Let's Encrypt** (if you want a normal open port):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  sudo gpg --dearmor -o /usr/share/keyrings/caddy.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
v3.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

Option C — **Nginx + certbot** is supported but more hand-holding; see
the Nginx docs for reverse proxy + WebSocket upgrade headers. The
required pass-through is:

```
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 3600s;
```

---

## 10. Firewall

Only open what you actually need. Most deployments need nothing if you
use Cloudflare Tunnel.

```bash
sudo ufw allow OpenSSH
# open 80/443 only if you chose Caddy/Nginx
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Postgres stays bound to `127.0.0.1` — never expose it publicly.

---

## 11. Register the server URL with your devices

1. Open V3 Code on your desktop, sign in with the Google account listed
   in `authorized_emails`.
2. The first sign-in will auto-discover `https://v3.example.com` from
   your Google Drive App Data if you've already set it up elsewhere;
   otherwise use _Settings → Server Node → Configure_ and paste the URL.
3. Other devices sign in the same way — their first handshake needs
   approval from any already-connected device (spec §3.3). If no
   approved device is online, the first one bootstraps itself.

---

## 12. Monitoring basics

- Server logs: `journalctl -u v3-code -f` (structured JSON, grep-able).
- Docker container usage: `docker stats` (the prune loop in
  `CloudLifecycleLive` enforces §7.4 limits every 60 s).
- Postgres health:
  `sudo -u postgres psql -d v3 -c "SELECT pg_size_pretty(pg_database_size('v3'));"`
- Disk pressure: `df -h /opt/v3code /var/lib/docker`.
- Admin panel: visit `https://v3.example.com/admin` after sign-in. It
  surfaces the event log size, active WS sessions, and Docker state so
  you usually don't need the CLI.

---

## 13. Upgrades

```bash
sudo -u v3code bash <<'EOF'
cd /opt/v3code/repo
git pull
bun install
bun run build
EOF
sudo systemctl restart v3-code
```

Back up Postgres before major version bumps:

```bash
sudo -u postgres pg_dump v3 | gzip > /opt/v3code/backups/v3-$(date +%F).sql.gz
```

---

## 14. Troubleshooting

| Symptom                                          | First thing to check                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| "Can't reach your server node" in the client     | `systemctl status v3-code`, then `curl -I https://v3.example.com/.well-known/t3/environment`                |
| Cloud env chat fails to start                    | `docker ps -a`, then `journalctl -u v3-code \| grep cloud`                                                  |
| "GitHub session expired"                         | Visit _Settings → Connections → Reconnect GitHub_; the server dropped the token after a 401                 |
| Postgres migration errors on boot                | Make sure the `v3` role has CREATE on its own DB; run `psql v3 -c "\dt"` to inspect                         |
| Device approval never shows up on another device | Both devices must be signed in; the approval stream only reaches currently-connected WS clients (spec §3.3) |

Open an issue at
[github.com/aGamingGod1234/v3code/issues](https://github.com/aGamingGod1234/v3code/issues)
with `journalctl` output if something is stuck — don't just force-reset.
