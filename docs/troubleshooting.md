# V3 Code — Troubleshooting

Start here when V3 is misbehaving. Items grouped by the surface where
you notice the problem. If something isn't covered, open an issue with
the `journalctl -u v3-code` output (server node) or the browser devtools
console (client).

---

## Install / first-run

### "Can't reach your server node" right after sign-in

- Confirm the server URL stored in Drive App Data matches what's
  actually listening: _Settings → Server Node → Reset_ and paste the
  URL manually.
- On the server node:
  - `systemctl status v3-code` — is the service up?
  - `curl -I https://<url>/.well-known/t3/environment` — does the
    public URL resolve to the server? If it 502s, your reverse proxy
    (Caddy/Nginx/Cloudflare Tunnel) isn't pointed right.
- If you run Cloudflare Tunnel, make sure `cloudflared` is serving
  the tunnel created during setup and not a leftover old one.

### "This server node is not configured for your account" (HTTP 403)

Your email is not in `[auth].authorized_emails`. Edit
`~/.v3-code-server/config.toml` on the server node, add your Google
email (lowercase), restart the service.

### Desktop app won't launch on Windows because of SmartScreen

Windows doesn't trust fresh signing yet. Right-click the installer →
_Properties_ → _Unblock_, or the `winget` install path avoids it.

---

## Authentication

### Google sign-in loops back to the landing page

Almost always a mismatched OAuth redirect URI. The server's
`[server].public_url` must be registered as an authorized redirect
URI in the Google Cloud Console for that OAuth client. Both
`https://v3.example.com/auth/google/callback` and the Electron
loopback URIs need to be listed.

### "GitHub session expired"

A 401 from GitHub invalidated the stored token. _Settings →
Connections → Reconnect GitHub_. If it keeps failing, confirm the
`github_client_id` / `github_client_secret` in `config.toml` match the
OAuth app you're authorising.

### Device doesn't show up on the other devices

New devices need an approval click from an already-approved online
device (spec §3.3). If no approved device is online, the new device
auto-approves itself — so if this is your _first_ device on a brand
new server node, just sign in and it bootstraps.

Stuck pending? On an approved device, _Settings → Devices → Approve_.

---

## Chat sync

### Chats load but events stop arriving mid-stream

The WebSocket dropped. Reconnection uses the spec §5.1 backoff curve
(1, 2, 4, 8, 16, 30, 30 s). After `WS_RECONNECT_MAX_ATTEMPTS` failures
the banner switches to "exhausted" — _Retry now_ forces a fresh cycle.

If reconnection lands you on a different chat's view, your local
cache is behind; _Settings → Cache → Clear chat cache_ rebuilds from
server state.

### "Can't send. <Device> is offline"

V3 v1 does not queue cross-device prompts while the host is offline
(spec §6.4). Open the chat on the host device directly, or fork it to
the device you're on: right-click the chat → _Send to… → This device_.

### Fork button is disabled

Forking is only allowed on non-running chats (spec §6.6). Wait for the
current turn to finish, or use "End chat" first.

---

## Cloud env

### "Cloud environment unavailable"

Docker daemon is unreachable on the server node. Check:

```bash
systemctl status docker
docker info
```

The admin panel at `/admin → Containers` surfaces the last Docker error
it saw.

### Container keeps getting killed after a few minutes

You're hitting a resource limit. Spec §7.2 defaults:

- 2 CPU cores
- 4 GB RAM hard cap
- 20 GB disk
- 30 days max runtime

Bump the matching `[cloud_env]` key in `config.toml` (operators only —
make sure your host has the headroom). Follow up with
`systemctl restart v3-code`.

### Preview URL returns 502

The preview proxy expects the agent to be serving HTTP inside the
container on the port it declared. Confirm the process is running (`docker exec v3-chat-<id> ss -ltnp`)
and that it binds to `0.0.0.0`, not `127.0.0.1`.

---

## Android

Phase 9 shipped the Android app through the Play Store's internal
testing channel. If you're not seeing push notifications:

- Make sure the Firebase service account credentials are configured on
  your server node (`V3CODE_FCM_SERVICE_ACCOUNT_FILE` or the matching
  TOML).
- The device must have registered its FCM token with the server
  (happens automatically on first sign-in; check _Settings → Devices →
  This device_ for the registration timestamp).
- `adb logcat | grep -i firebase` tells you if the OS is actually
  handing the message to the app.

---

## Running the dev loop

### `bun run dev` hangs forever on the first run

Likely a stale `node_modules`. `bun run clean && bun install && bun run build`.
If Vitest keeps reporting `ERR_MODULE_NOT_FOUND` for files you can see
on disk, it's usually the same thing.

### `bun run typecheck` green but runtime says a field is missing

The `satisfies ServerConfigShape` helpers need every key present.
Grep for `cloudEnvContainerMaxRuntimeHours` — the full config fixture
sits next to it in every test that builds one by hand.

### `bun run test` is slow and CI is faster

Turbo caches per-package. On CI the remote cache hits; locally you can
re-enable cache with `TURBO_REMOTE_CACHE_SIGNATURE_KEY` and a local
cache dir. Per-test reruns should use `bun run vitest run <file>` from
inside the app's directory.

---

## Known flakes (not real bugs)

- **Server tests on Windows** occasionally report `EBADF: bad file
descriptor, close` in `cli-config.test.ts`. These pass cleanly on
  CI and on re-run; it's a transient Windows file-handle race in the
  bootstrap-fd fixture path, not a V3 regression.
- **Lint warnings in `.claude/worktrees/*`** are from stale Claude
  worktree clones — the main tree is clean (0 errors). Delete the
  worktrees if the noise bothers you.

---

## Reporting something new

File an issue at
[github.com/aGamingGod1234/v3code/issues](https://github.com/aGamingGod1234/v3code/issues)
with:

1. V3 version (`v3code --version` or _Settings → About_).
2. What you tried, what you expected, what actually happened.
3. Relevant logs:
   - Server: last ~100 lines of `journalctl -u v3-code`.
   - Desktop: _Help → Show logs_.
   - Mobile: `adb logcat *:S v3code:V`.
4. Whether it reproduces after `bun run clean && bun install`.
