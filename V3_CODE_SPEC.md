# V3 Code: Full Technical Specification

**Version:** 0.1 (2026-04-18)
**Author:** Lucas (aGamingGod)
**Based on:** T3 Code by pingdotgg (MIT)
**Target ship date:** 7-9 months from project start

---

## 0. Executive Summary

V3 Code is a fork of T3 Code that turns it from a single-device coding agent GUI into a self-hosted multi-device mesh. You download V3, use it single-device for free with no account, and optionally opt into multi-device by setting up your own server node (one of your own machines or a cloud provider you pay for). Your server node holds all your sync state, runs your Cloud env, and talks to Google Drive App Data so new devices auto-discover it when you sign in with the same Google account. Nothing touches Lucas's infrastructure.

**Key guarantees:**

1. Works offline, single-device, no account: pure T3 Code experience
2. Multi-device is opt-in via self-hosted server node
3. User owns their data and their infra
4. One-click deploy options available for users who don't want to self-host on their own machine
5. Google Sign-In is the identity layer; GitHub is for repo access in Cloud env

**What V3 explicitly is NOT:**

- Not a hosted service run by Lucas
- Not a replacement for local T3 Code usage
- Not a multi-user system per server node (one server node = one Google account)

---

## 1. Architecture

### 1.1 Component diagram (user's personal setup)

```
┌──────────────────────────────────────────────────────────────┐
│              GOOGLE DRIVE APP DATA (per user)                 │
│        stores: { server_url, device_list, preferences }      │
└────────────────────────┬──────────────────────────────────────┘
                         │ read/write on sign-in
                         │
┌────────┐   ┌────────┐  │  ┌────────┐   ┌────────┐
│Desktop │   │Laptop  │  │  │ Phone  │   │Browser │
│V3 app  │   │V3 app  │  │  │V3 app  │   │V3 web  │
└───┬────┘   └───┬────┘  │  └───┬────┘   └───┬────┘
    │            │       │      │            │
    │            │       │      │            │
    └────────────┴───────┴──────┴────────────┘
                 │
         wss:// (WebSocket)
         authenticated via Google ID token
                 │
    ┌────────────▼─────────────┐
    │     SERVER NODE          │  <- user's own machine OR cloud deploy
    │ ┌──────────────────────┐ │
    │ │   V3 server (Node)   │ │     Publicly accessible via:
    │ │   - auth             │ │     - Cloudflare Tunnel (self-host)
    │ │   - WS hub           │ │     - Fly.io / Railway / VPS (cloud)
    │ │   - event store      │ │
    │ └──────────┬───────────┘ │
    │            │             │
    │ ┌──────────▼───────────┐ │
    │ │   Postgres (local)   │ │
    │ │   users/devices/     │ │
    │ │   chats/events       │ │
    │ └──────────────────────┘ │
    │                          │
    │ ┌──────────────────────┐ │
    │ │  Docker daemon       │ │
    │ │   (Cloud env pool)   │ │
    │ │   ephemeral per-chat │ │
    │ └──────────────────────┘ │
    └──────────────────────────┘
```

### 1.2 Deployment topologies

Users pick one at server-node setup time:

| Mode | Description | Best for |
|---|---|---|
| **Personal machine** | User installs V3 in "server-node mode" on a home PC/Mini PC, exposes via Cloudflare Tunnel | Users with always-on hardware |
| **Fly.io deploy** | One-click deploy from V3 app, runs Docker-in-Docker, user pays Fly.io | Users without home server |
| **Railway deploy** | One-click deploy, Nixpacks for Node parts, limited Cloud env support | Users who want simple |
| **VPS (DIY)** | Advanced users follow docs to install on Hetzner/DigitalOcean/etc | Power users |

### 1.3 Inherited from T3 Code (unchanged)

- **Electron desktop shell** wrapping the web frontend
- **WebSocket RPC** between frontend and backend (V3 extends this to work remotely)
- **Event-sourced** conversation state
- **Effect-TS** on the backend
- **React 19 + TanStack Router + Tailwind** on the frontend
- **Bun + Turbo** monorepo tooling
- **node-pty** for terminal sessions
- **Git worktree** integration per chat
- **Provider abstraction** for Claude Code and Codex

---

## 2. Core Concepts

### 2.1 Server Node

The user's own deployment of the V3 backend. Exactly one per user account. Responsibilities:

- Hosts the WebSocket hub all the user's devices connect to
- Runs Postgres for persistent state (devices, chats, events, prefs)
- Manages Docker containers for Cloud env chats
- Stores GitHub OAuth tokens for the user's Cloud env
- Verifies incoming Google ID tokens from client devices
- Serves the V3 web app for browser access

### 2.2 Client Device

Anything that runs V3 and connects to a server node. Types:

- **Desktop client** (Electron app on Windows/macOS/Linux)
- **Mobile client** (Android via Capacitor v1, iOS later)
- **Web client** (browser accessing server node's hosted web UI)

Client devices can be "hosts" for chats (if they have execute capability) or "viewers" (web/mobile, view only but can send prompts to other hosts).

### 2.3 Cloud Env

A special virtual device that always appears in every user's device list. Physically it's just Docker containers running on the server node. Every chat started in Cloud env gets its own ephemeral container that dies when the chat ends. Linked to the user's GitHub account for repo access.

### 2.4 Chat

A conversation with a coding agent. Properties:

- Has exactly one `host_device_id` (the device or Cloud env executing it)
- Has a monotonic `event_seq` counter for ordered event replay
- Belongs to exactly one user
- Can be forked to another device, producing a new chat with `parent_chat_id` set

### 2.5 Event

An atomic change to a chat's state. Types include:

- `prompt_sent` (user input)
- `assistant_message_chunk` (streaming token)
- `tool_call_started`
- `tool_call_result`
- `file_change` (diff info)
- `commit_made`
- `subagent_spawned`
- `subagent_event` (nested events from a subagent)
- `chat_title_updated`
- `chat_archived`

Each event has: `id`, `chat_id`, `seq`, `type`, `payload`, `actor_device_id`, `created_at`.

### 2.6 User

One Google account = one user = one server node. No multi-tenant per server node in V1. Future could allow family/team sharing via explicit invite but not in scope now.

---

## 3. Authentication & Identity

### 3.1 Google Sign-In (client device to server node)

**Flow:**

1. User opens V3 on a new client device
2. Clicks "Sign in with Google" (visible at top of UI if not signed in)
3. V3 opens system browser or in-app browser to Google OAuth page
4. Scopes requested:
   - `openid email profile` (identity)
   - `https://www.googleapis.com/auth/drive.appdata` (server URL storage)
5. User consents, Google redirects back to V3 with auth code
6. V3 exchanges code for ID token + access token
7. V3 stores tokens in OS keychain (Windows Credential Manager, macOS Keychain, Android KeyStore, browser IndexedDB for web)
8. V3 reads Google Drive App Data to find server URL (section 3.4)
9. V3 connects to server node via WebSocket, presenting Google ID token
10. Server node verifies token via Google's public keys, extracts email
11. If email matches server node's authorized user → accept, return device-scoped session token
12. If no match → reject with "This server node is not configured for your account"

**Token refresh:**

- ID tokens expire after ~1 hour
- V3 uses stored refresh token to get a fresh ID token before expiry
- Device session token on server node is long-lived (30 days), rotated on refresh

### 3.2 GitHub OAuth (for Cloud env)

**When it happens:** Both Google and GitHub sign-in buttons shown at top of the UI. User can connect either or both at any time. GitHub connection is required only to use the Cloud env.

**Flow:**

1. User clicks "Connect GitHub" in UI
2. V3 client opens GitHub OAuth, scopes: `repo read:user`
3. User authorizes, GitHub redirects back with code
4. V3 client sends code to **server node** (not Google's infra)
5. Server node exchanges code for access token
6. Server node stores GitHub access token in Postgres, keyed to user
7. Server node uses this token for Cloud env container git operations

**Key point:** GitHub tokens live on the server node, not on client devices. This means:

- Cloud env can always git clone/push without going through client
- If user revokes on github.com, server node detects 401 and prompts reconnect
- Stolen client device doesn't leak GitHub token

### 3.3 Device authentication

Every client device has a persistent `device_id` (UUID, generated on first launch, stored locally). Device registration:

1. First WS connection after Google sign-in: device sends `hello` with `device_id`, Google ID token, capabilities, platform
2. Server node verifies Google token
3. If `device_id` already known → update `last_seen_at`, issue session token
4. If `device_id` new → register in `devices` table, user must approve the device via existing-device notification (prevents unauthorized new devices)

**New device approval UX:**

- Existing online device shows toast: "New device 'iPhone-Lucas' is trying to sign in. Approve?"
- User clicks approve → new device registered, future connections auto-accepted
- If no existing device is online, server node auto-approves (bootstrap case)

### 3.4 Server Node Discovery (Google Drive App Data)

**What's stored in App Data:**

```json
{
  "v3_config": {
    "server_url": "https://v3.agaminggod.com",
    "server_version_installed": "0.1.0",
    "setup_at": "2026-04-18T10:00:00Z",
    "device_list": [
      { "device_id": "...", "name": "Desktop", "added_at": "..." },
      { "device_id": "...", "name": "Laptop", "added_at": "..." }
    ]
  }
}
```

**Read/write pattern:**

- On sign-in: client reads App Data
  - If `server_url` present → connect to it
  - If `server_url` absent but `device_list` has other devices → show "multiple devices detected, configure your server" prompt
  - If App Data entirely absent → fresh install, show full onboarding
- On device register: client appends itself to `device_list`
- On server setup: client writes `server_url` after successful verification
- On server change: user can reset via Settings → Server Node → Reset

**Fallback:** manual URL entry in Settings. If Drive App Data call fails or user revokes the scope, manual entry always works.

**The "configure your server" prompt:**

Rendered as a persistent banner above the chat window when user is signed in with Google but no server URL resolved:

> **⚙️ Multiple devices detected on your Google account.** V3 works across devices when you set up a server node. [Configure server] [Remind me later] [Keep single-device]

Clicking "Configure server" opens the Server Node Setup wizard (section 10).

---

## 4. Data Model

### 4.1 Server node database (Postgres)

```sql
-- Users (one row per Google account; in V1, only one row total per server node)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  github_access_token_enc BYTEA,  -- AES-encrypted at rest
  github_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Devices registered to the user
CREATE TABLE devices (
  id UUID PRIMARY KEY,  -- generated client-side
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,  -- 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web'
  kind TEXT NOT NULL,  -- 'desktop' | 'laptop' | 'server' | 'phone' | 'tablet' | 'browser' | 'cloud'
  capabilities JSONB NOT NULL DEFAULT '[]',  -- ['execute', 'claude_code', 'codex', 'browser_use']
  approved BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  UNIQUE(user_id, id)
);

-- Active sessions
CREATE TABLE device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ
);

-- Chats
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  host_device_id UUID REFERENCES devices(id),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived' | 'ended'
  parent_chat_id UUID,  -- for forks
  parent_device_id UUID,  -- the device we forked from
  working_directory TEXT,  -- path on host device
  github_repo TEXT,  -- for Cloud env chats: 'user/repo'
  github_branch TEXT,
  container_id TEXT,  -- for Cloud env chats: Docker container ID
  event_seq BIGINT NOT NULL DEFAULT 0,  -- latest event seq
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_event_at TIMESTAMPTZ
);

-- Full event log (the authoritative source of truth for chat state)
CREATE TABLE chat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  actor_device_id UUID REFERENCES devices(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chat_id, seq)
);
CREATE INDEX idx_chat_events_chat_seq ON chat_events(chat_id, seq);
CREATE INDEX idx_chat_events_created ON chat_events(created_at);

-- Pending prompts (for future offline-host support; not used in V1 per design)
-- Included in schema anyway for forward compatibility
CREATE TABLE pending_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  from_device_id UUID REFERENCES devices(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'  -- 'pending' | 'delivered' | 'canceled'
);

-- User preferences (synced across all the user's devices)
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'dark',
  font_family TEXT,
  font_size INT DEFAULT 14,
  default_provider TEXT DEFAULT 'claude_code',  -- 'claude_code' | 'codex'
  keybindings JSONB DEFAULT '{}',
  editor_settings JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 Client device local storage (SQLite)

Each client device has its own SQLite db for offline cache + local-first experience. Inherits T3 Code's existing schema with extensions:

```sql
-- Inherited from T3 Code, extended with sync columns
ALTER TABLE threads ADD COLUMN remote_id UUID;  -- maps to server chats.id
ALTER TABLE threads ADD COLUMN host_device_id UUID;
ALTER TABLE threads ADD COLUMN last_synced_seq BIGINT DEFAULT 0;
ALTER TABLE threads ADD COLUMN is_local BOOLEAN DEFAULT true;  -- true if this device is host

-- New table: known devices (from server node)
CREATE TABLE remote_devices (
  device_id UUID PRIMARY KEY,
  name TEXT,
  platform TEXT,
  kind TEXT,
  online BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ
);

-- New table: cached events for remote chats (write-through cache)
CREATE TABLE remote_chat_events (
  chat_id UUID,
  seq BIGINT,
  type TEXT,
  payload JSONB,
  actor_device_id UUID,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (chat_id, seq)
);
```

### 4.3 Google Drive App Data (per user, across all their devices)

See section 3.4 for schema.

### 4.4 Docker state (server node)

Managed entirely through Docker daemon API. No custom tables. Each chat's container is named `v3-chat-{chat_id}`.

Persistent volumes: NONE. Ephemeral per-chat. Any state the user wants persisted must be committed to their GitHub repo before chat ends.

---

## 5. Sync Protocol

All communication between client device and server node is over WebSocket (WSS). Single persistent connection per client. JSON messages.

### 5.1 Connection lifecycle

```
Client                          Server Node
  │                                  │
  ├──── WS connect (TLS) ──────────►│
  │     with session token           │
  │                                  │
  │◄─── connection_established ──────┤
  │     { server_version, user_id }  │
  │                                  │
  ├──── hello ─────────────────────►│
  │     { device_id, capabilities }  │
  │                                  │
  │◄─── hello_ack ───────────────────┤
  │     { devices: [...], chats:[] } │
  │                                  │
  ├──── heartbeat (every 15s) ─────►│
  │                                  │
  │◄─── heartbeat_ack ───────────────┤
  │                                  │
  [...ongoing...]                    │
  │                                  │
  ├──── subscribe {chat_id: X} ────►│
  │◄─── chat_event stream ───────────┤ (while subscribed)
  │                                  │
  ├──── disconnect ─────────────────►│
```

Reconnection uses exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max.

### 5.2 Message types (full spec)

All messages have this envelope:

```ts
interface Message {
  id: string;           // UUID for this message
  type: string;         // see below
  ref?: string;         // if this is a reply, the id of the message being replied to
  timestamp: string;    // ISO 8601
  payload: any;         // type-specific
}
```

#### Client → Server

| Type | Payload | Purpose |
|---|---|---|
| `hello` | `{ device_id, device_name, platform, kind, capabilities[], app_version }` | Initial handshake after connect |
| `heartbeat` | `{}` | Every 15s, keeps connection alive and signals online |
| `subscribe` | `{ chat_id, since_seq? }` | Subscribe to a chat's event stream; optional since_seq for reconnect gap fill |
| `unsubscribe` | `{ chat_id }` | Stop receiving events for a chat |
| `publish_event` | `{ chat_id, seq, event_type, payload }` | Host device publishes a new event |
| `create_chat` | `{ host_device_id, working_directory?, github_repo?, github_branch?, title?, client_chat_id }` | Request to create a new chat |
| `send_prompt` | `{ chat_id, content, client_msg_id }` | Send a new prompt to a chat (host or viewer) |
| `fork_chat` | `{ source_chat_id, target_device_id, working_directory?, github_repo?, github_branch? }` | Fork a chat to another device |
| `end_chat` | `{ chat_id }` | End a chat (for Cloud env, triggers container cleanup) |
| `archive_chat` | `{ chat_id }` | Archive a chat (soft delete) |
| `update_preferences` | `{ ...prefs }` | Update user preferences |
| `approve_device` | `{ device_id }` | Approve a pending new device |
| `remove_device` | `{ device_id }` | Revoke a device's access |

#### Server → Client

| Type | Payload | Purpose |
|---|---|---|
| `connection_established` | `{ server_version, user_id, user_email }` | Sent right after WS accepts |
| `hello_ack` | `{ devices[], chats[], preferences }` | Response to hello, bulk initial state |
| `heartbeat_ack` | `{ server_time }` | Keepalive response |
| `presence_update` | `{ device_id, online, last_seen_at }` | A device's online status changed |
| `device_registered` | `{ device, needs_approval: bool }` | A new device connected |
| `device_approval_requested` | `{ device, from_ip }` | Another device needs approval |
| `device_removed` | `{ device_id }` | A device was revoked |
| `chat_created` | `{ chat }` | A new chat exists (any user device can see this) |
| `chat_event` | `{ chat_id, seq, type, payload, actor_device_id, created_at }` | A new event on a subscribed chat |
| `chat_updated` | `{ chat_id, changes }` | Chat metadata changed (title, status) |
| `chat_forked` | `{ new_chat_id, source_chat_id }` | A fork completed |
| `prompt_delivered` | `{ client_msg_id, chat_id }` | Server confirms prompt queued to host |
| `prompt_rejected` | `{ client_msg_id, reason }` | Server can't deliver (host offline) |
| `preferences_updated` | `{ preferences }` | Prefs changed on another device |
| `error` | `{ code, message, ref? }` | Generic error |
| `gh_token_invalid` | `{}` | GitHub token rotation needed |

### 5.3 Event ordering & replay

Per-chat `seq` is a monotonic counter assigned by the host device when it publishes an event. Server node stores the ordering authoritatively.

**Reconnection flow:**

1. Client reconnects, sends `hello`
2. For each chat it previously subscribed to, client sends `subscribe { chat_id, since_seq: N }`
3. Server replays all events with `seq > N` in order
4. Once caught up, live streaming resumes
5. Client updates local cache with events

**Duplicate handling:**

- Client dedupes by `(chat_id, seq)` in local cache
- If same `(chat_id, seq)` arrives twice (reconnect edge cases), second is discarded

**Gaps:**

- If client notices missing seq (e.g., received 5, 6, 8), client re-sends `subscribe` with `since_seq: 6`
- Server replays 7 and any subsequent events

### 5.4 Presence

Each device sends `heartbeat` every 15s. Server marks device `offline` if no heartbeat for 60s. Presence changes are broadcast to all the user's other devices via `presence_update`.

Web/browser clients: each tab is its own ephemeral device, appears and disappears with the tab. Kind = 'browser'.

### 5.5 End-to-end reliability

- All messages from client → server have a `client_msg_id` where applicable for idempotency
- Server responds with `ack` message referencing original id
- Client retries unacked messages on reconnection
- Messages are small (< 64KB typical) so no chunking needed

---

## 6. Chat Lifecycle

### 6.1 Creating a chat on a physical device

```
User clicks "New Chat" on Desktop
    │
    ▼
Desktop opens "New Chat" dialog:
    - Pick host device (default: this device)
    - Pick working directory (file picker, defaults to last used)
    - Pick provider (Claude Code / Codex, defaults to user pref)
    - Optional: title
    │
    ▼
Client generates client_chat_id (UUID), sends create_chat
    │
    ▼
Server creates chats row, assigns server-side id
Server responds with chat_created event
Server broadcasts to all user's other devices
    │
    ▼
Desktop UI opens chat view
Desktop creates local worktree at working_directory (T3 Code logic)
Desktop starts Claude Code / Codex process (T3 Code logic)
Desktop is the host, ready to receive prompts
```

### 6.2 Creating a chat in Cloud env

```
User clicks "New Chat", picks "Cloud" as host
Dialog now shows:
    - GitHub repo picker (user's repos, via stored GitHub token)
    - Branch picker
    - Optional: working directory within repo
    - Provider pick
    │
    ▼
Client sends create_chat with host_device_id = cloud_device_id, github_repo, github_branch
    │
    ▼
Server node:
    1. Validates user's GitHub token, has repo access
    2. Generates chat id
    3. Starts new Docker container: `v3-chat-{chat_id}` from V3 base image
    4. Inside container: git clone <repo> at <branch>
    5. Starts Claude Code process inside container
    6. Writes chat row with container_id
    7. Broadcasts chat_created
    │
    ▼
Container is the "host". When events happen inside container, agent-side sync client
(same code as physical device) publishes to server node.
    │
    ▼
All user devices subscribed to this chat receive events live.
```

**Container startup time:** ~5-10 seconds. UI shows "Starting Cloud environment..." progress.

### 6.3 Sending a prompt from host device

```
User types prompt on Desktop (which hosts this chat)
    │
    ▼
Desktop's local Claude Code/Codex process receives prompt directly
(standard T3 Code flow)
    │
    ▼
Events generated as agent runs (prompt_sent, tool_call, assistant_chunk, etc)
    │
    ▼
Desktop's sync module intercepts each event, publishes to server:
    publish_event { chat_id, seq: N+1, ... }
    │
    ▼
Server stores event, broadcasts to subscribed viewers
    │
    ▼
Viewers (Laptop, phone, etc) receive chat_event, apply to their local view
```

### 6.4 Sending a prompt from remote viewer

```
User on Laptop is viewing a Desktop-hosted chat
User types a prompt, hits send
    │
    ▼
Laptop sends send_prompt { chat_id, content, client_msg_id } to server
    │
    ▼
Server looks up host_device_id (Desktop)
    │
    ▼
IF Desktop is online:
    Server pushes send_prompt to Desktop
    Desktop receives, injects into local agent process (as if typed locally)
    Flow continues like 6.3
    Server replies to Laptop with prompt_delivered
    │
IF Desktop is offline:
    Server replies to Laptop with prompt_rejected { reason: "device_offline" }
    Laptop UI shows error: "Desktop is offline. Prompt not sent."
    (per design decision: no queueing in V1)
```

### 6.5 Streaming responses to all viewers

All `chat_event` messages for a chat flow to every currently-subscribed viewer. Assistant text chunks are broadcast as-generated, not batched (simpler; optimise later if bandwidth becomes an issue).

Tool call events include full payload: tool name, arguments, result. Large results (e.g., entire file contents) are fine as long as they fit in one WS frame (~1MB max).

### 6.6 Forking a chat

```
User on Desktop clicks "Send to..." on a chat, picks "Laptop"
    │
    ▼
Desktop sends fork_chat { source_chat_id, target_device_id: laptop_id, working_directory? }
    │
    ▼
Server:
    1. Creates new chat row with parent_chat_id = source, host_device_id = laptop_id
    2. Copies ALL chat_events to new chat_id (with same seq values)
    3. Broadcasts chat_forked to both devices + any other user devices
    │
    ▼
Laptop receives chat_forked, fetches full event log, rebuilds local state
Laptop starts Claude Code process at specified working_directory
Laptop is now the host of the new chat
    │
    ▼
Original chat on Desktop is unchanged; still runs there
User can continue new prompts on Laptop; they execute there
```

**Restriction:** fork only on non-running chats in V1. UI disables "Send to..." while agent is mid-turn. (Forking an active chat is too error-prone with tool calls in flight.)

**Working directory remapping:** fork dialog on Desktop asks user to pick a target path on Laptop. Defaults to "~/V3Projects/{repo-name}" if chat was in a git repo, else prompts for full path. Laptop validates path exists before accepting the fork.

### 6.7 Ending a Cloud env chat

```
User clicks "End chat" on a Cloud env chat
    │
    ▼
Client shows confirmation modal:
    "This will destroy the container. Uncommitted changes will be lost.
     Last commit: <sha> (2 minutes ago). 5 files modified since then.
     
     [Commit and end]  [End without committing]  [Cancel]"
    │
    ▼
If user picks "Commit and end":
    Client sends prompt: "Please commit all pending changes with message 'V3 auto-commit before end'"
    Agent commits + pushes
    Then proceeds to end
    │
If user picks "End without committing":
    Client sends end_chat to server
    │
    ▼
Server:
    1. Stops container (docker stop {container_id})
    2. Removes container (docker rm)
    3. Updates chat row: status = 'ended'
    4. Broadcasts chat_updated
    │
    ▼
Chat remains in history as read-only (full event log preserved)
```

### 6.8 Archive

Soft delete. Chat hidden from default list, recoverable. No actual row deletion in V1. User can view archived chats via filter.

---

## 7. Cloud env specifics

### 7.1 Container image

Base image: `ghcr.io/v3-code/cloud-env:latest`

Contents:
- Ubuntu 24.04 minimal
- Node 22 LTS
- Git, curl, wget, build-essential
- Python 3.12 + uv
- Claude Code CLI installed and pre-authed (via passed-through creds)
- Codex CLI
- node-pty for terminal
- V3 sync client (packaged from `packages/mesh-client`)
- Common tools: ripgrep, fd, bat, jq

Image built in CI from `apps/cloud-env-image/Dockerfile`, published to GHCR.

### 7.2 Container lifecycle

| Phase | Duration | Activity |
|---|---|---|
| **Start** | 3-8s | Pull image (if needed), create container, start entrypoint, wait for sync client handshake |
| **Clone** | 5-30s | `git clone` the user's chosen repo at specified branch |
| **Ready** | instant | Claude Code process started, chat ready for prompts |
| **Active** | hours/days | User interacts with chat |
| **End** | 1-2s | SIGTERM to processes, `docker stop`, `docker rm` |

Container resource limits (per container):
- 2 CPU cores (cgroup limit)
- 4 GB RAM (hard cap)
- 20 GB disk (via overlay fs limit)
- 10 GB/day egress bandwidth (tc-based shaping)
- 30 day max runtime (auto-end if hit)

All limits configurable in `apps/server/src/config.ts` by the server node operator.

### 7.3 GitHub integration

- Server node holds user's GitHub OAuth token
- Container startup: server node injects ephemeral token via env var + gitconfig
- Token is short-lived (hour-scoped), re-issued if container runs long enough
- Agent uses `gh` CLI or plain git with token for operations

**Operations supported:**
- `git clone` on start
- `git commit && git push` on save
- `gh pr create` for pull requests
- Reading other repos via API (for cross-repo context)

### 7.4 Resource limits enforcement

Enforced by Docker daemon and Linux cgroups. Monitored by a `container-monitor` service on the server node that:
- Checks resource usage every 60s
- Kills containers that exceed limits
- Logs violations
- Notifies user via `chat_event` type `container_killed`

---

## 8. UI Specification

Inherits T3 Code visually. Minimal changes below.

### 8.1 Sidebar

Current T3 Code sidebar: flat thread list.

V3 sidebar:

```
┌────────────────────────────────────────┐
│  V3 Code                           ⚙  │  <- logo swap + settings
├────────────────────────────────────────┤
│  [+ New Chat]                          │
├────────────────────────────────────────┤
│  Signed in: lucas@example.com          │  <- hidden if not signed in
│  [Google ✓]  [GitHub ✓]                │  <- quick-connect buttons
├────────────────────────────────────────┤
│  ▼ 🖥️ This Device (Desktop)   ● 3     │  <- "this device" always top
│      💬 Current chat                   │
│      💬 Discord bot refactor           │
│      💬 Minecraft mod debug            │
│                                        │
│  ▼ 💻 Laptop                  ● 2      │
│      💬 Travel blog post               │
│      💬 History SBQ analysis           │
│                                        │
│  ▼ 📦 Mini PC                 ● 1      │
│      💬 MessageArchive fix             │
│                                        │
│  ▶ ☁️ Cloud                   ● 2      │  <- collapsed view
│                                        │
│  ▼ 📱 Phone                   ○       │  <- offline
│      💬 Quick note prompt              │
│                                        │
│  ▼ Archived (12)              ▶       │
└────────────────────────────────────────┘
```

- Hovering a device shows last-seen timestamp
- Right-click device: rename, remove
- Right-click chat: rename, archive, fork, delete (irreversible, requires confirm)
- Signed-out users see flat thread list exactly like T3 Code

### 8.2 Chat view

Mostly inherits T3 Code. Additions:

**Top-of-chat strip (when viewing non-local chat):**
```
┌────────────────────────────────────────┐
│ ℹ Viewing chat hosted on Laptop. All  │
│   prompts you send will run there.     │
└────────────────────────────────────────┘
```

**Prompt attribution badge** (when a message was sent from a different device):
```
[User message]
  "Can you refactor the auth module?"
  via Phone · 2 mins ago
```

**Cloud env status indicator** (when chat is Cloud-hosted):
```
┌────────────────────────────────────────┐
│ ☁ Cloud · agaminggod/v3code · main    │
│   Container: 4GB RAM · 2h runtime      │
│   [End chat and clean up]              │
└────────────────────────────────────────┘
```

### 8.3 "Configure your server" prompt

Persistent banner at top of chat area:
```
┌────────────────────────────────────────┐
│ ⚙ Multiple devices detected on your    │
│   Google account. Set up a server node │
│   to sync chats across them.            │
│   [Configure server] [Dismiss] [Learn] │
└────────────────────────────────────────┘
```

Only shown if:
- User signed in with Google AND
- No `server_url` in Drive App Data AND
- `device_list` in Drive App Data has 2+ entries AND
- User hasn't dismissed in last 7 days

### 8.4 Settings

New sections on top of T3 Code's existing settings:

- **Account**: Google info, GitHub status, sign out
- **Server Node**: URL, connection status, manual override, reset
- **Devices**: list of registered devices with remove buttons
- **Preferences** (synced): theme, font, provider default, keybindings
- **Local preferences** (per-device): which project to default to, window size

### 8.5 Server Node admin panel

Only visible when V3 is running in server-node mode (see section 10). New route `/admin`.

- Active WebSocket connections
- Running Cloud env containers (with resource usage)
- Postgres stats (size, row counts)
- Event log size per chat
- Docker daemon health
- Logs viewer
- Emergency "kill all Cloud containers" button
- Backup / restore database

### 8.6 Mobile app specifics

Android (via Capacitor v1):
- Same UI as web app, same code
- FCM push notifications for:
  - Chat response received while app backgrounded
  - Device approval request
  - Cloud env container killed (unexpected)
- Background WS connection with wake-locks off
- Foreground service + notification when actively streaming

---

## 9. Error Handling & Offline Behavior

### 9.1 Offline host device

User tries to prompt a chat whose host is offline:
- Input field disabled
- Placeholder text: "Host device '{name}' is offline"
- Toast on send attempt: "Can't send. {name} is offline. [Open on another device]"

User can still scroll and read chat history (from local cache or via server event replay).

### 9.2 Server node unreachable

Client fails to connect to server node:
- Toast: "Can't reach your server node. Retrying..."
- Sidebar shows "⚠ Disconnected" next to other devices
- Local chats still work fully (all T3 Code functionality preserved)
- Auto-retry with exponential backoff
- If down > 5 min, show persistent banner: "Server node offline. [Settings] [Retry now]"

### 9.3 Lost WebSocket mid-stream

Events in flight when WS drops are lost from wire but not from server DB. On reconnect, client sends `subscribe since_seq: last_known_seq` to each active chat, gets replay.

### 9.4 Docker daemon down on server node

Cloud env chats fail to start with error: "Cloud environment unavailable. Check server node status."
Existing Cloud chats become unreachable but other chats (physical devices) work fine.
Admin panel surfaces the Docker error loudly.

### 9.5 GitHub token expired

- Container startup fails with 401
- User sees: "GitHub session expired. [Reconnect GitHub]"
- Existing Cloud chats pause until reconnected (don't lose state)

### 9.6 Google token expired

- Client WS disconnects with 401
- Auto-refresh in background using refresh token
- If refresh fails → sign-in dialog

### 9.7 Google Drive App Data fails

- Log error, fall back to manual URL entry in Settings
- Show once-only toast: "Couldn't auto-discover your server. Enter URL manually."

---

## 10. Server Node Deployment

### 10.1 Self-host on user's own machine

**Pre-reqs:** Docker installed, ports available, a way to expose publicly.

**Setup wizard inside V3:**

1. User clicks "Set up server on this machine"
2. V3 checks Docker is running, warns if not
3. V3 asks:
   - Public URL (options: "Use Cloudflare Tunnel", "I'll set up my own", "Local-only via Tailnet IP")
   - Data directory (default: `~/v3-code-server/`)
4. V3 writes config, starts Postgres via Docker Compose, starts V3 server process
5. If Cloudflare Tunnel chosen, V3 prompts for CF account + domain, runs `cloudflared` service install
6. V3 returns final URL, writes to Drive App Data
7. Other devices auto-discover and connect

### 10.2 One-click cloud deploy

V3 includes Deploy buttons for:

- **Fly.io:** user logs in with `flyctl auth login`, V3 runs `fly launch` with pre-written `fly.toml` from `deploy/flyio/`. Provisions Postgres + Docker-in-Docker Machine.
- **Railway:** OAuth integration, V3 creates project from template, sets env vars, deploys.
- **Cloudflare Workers + D1 + R2 + Containers:** for users who want pure serverless. Cloud env uses Cloudflare Containers (public beta as of 2026). Limited functionality but zero cold-start.

Each deploy target has its own template in `deploy/<target>/`.

### 10.3 Manual VPS deploy

Docs at `docs/deploy-vps.md`. Covers:
- Ubuntu/Debian server setup
- Docker install
- Postgres install
- V3 server clone + build
- Systemd service
- Nginx/Caddy reverse proxy
- TLS via Let's Encrypt or Cloudflare Tunnel
- Monitoring basics

### 10.4 Server node configuration file

`~/.v3-code-server/config.toml`:

```toml
[server]
public_url = "https://v3.agaminggod.com"
bind_host = "0.0.0.0"
bind_port = 8080

[auth]
google_client_id = "..."
google_client_secret = "..."  # or via env
github_client_id = "..."
github_client_secret = "..."
authorized_emails = ["lucas@gmail.com"]

[database]
postgres_url = "postgres://v3:v3@localhost/v3"
encryption_key = "..."  # for GitHub token encryption at rest

[cloud_env]
enabled = true
docker_socket = "/var/run/docker.sock"
base_image = "ghcr.io/v3-code/cloud-env:latest"
max_containers = 10
container_cpu_limit = 2
container_memory_mb = 4096
container_disk_gb = 20
container_max_runtime_hours = 720

[limits]
max_devices_per_user = 20
max_chats_per_user = 10000
max_event_log_size_mb = 100000
```

---

## 11. Tech Stack (Final)

### 11.1 Inherited from T3 Code (no changes)

- **Monorepo:** Bun + Turbo
- **Desktop shell:** Electron
- **Frontend:** React 19, Vite, TanStack Router, Tailwind, xterm.js
- **Backend:** Node 22, Effect-TS, node-pty
- **Protocol:** WebSocket RPC
- **Event sourcing:** custom (inherited)

### 11.2 Added by V3

| Concern | Tech | Rationale |
|---|---|---|
| Auth | Better Auth | Modern, self-hostable, TS-native, supports Google + GitHub |
| Database | Postgres 16 | Standard, reliable, great for event logs |
| ORM | Drizzle ORM | TS-first, great for Postgres, fits Effect-TS |
| Google Drive App Data | `googleapis` npm | Official Google client |
| Cloud env runtime | Docker daemon + dockerode | Standard |
| Sync client library | Custom: `packages/mesh-client` | Shared between client and server |
| Protocol types | Custom: `packages/mesh-contracts` | Single source of truth |
| Mobile wrapper | Capacitor 6 | Fast to ship, reuses web |
| Push notifications | Firebase Cloud Messaging | Standard for Android |
| One-click deploy (Fly.io) | `flyctl` + `fly.toml` template | Official |
| TLS for self-host | Cloudflare Tunnel (recommended) | Lucas already uses it, free, easy |

### 11.3 Dev tooling

- TypeScript strict mode everywhere
- Oxlint (inherited from T3 Code)
- Vitest for unit tests
- Playwright for E2E
- GitHub Actions for CI/build/release
- GHCR for container images

---

## 12. Monorepo structure

```
v3-code/
├── apps/
│   ├── desktop/           # Electron shell (from T3 Code, mostly unchanged)
│   ├── server/            # Node backend (from T3 Code + V3 mesh extensions)
│   ├── web/               # React SPA (from T3 Code + device sidebar rewrite)
│   ├── mobile/            # NEW: Capacitor wrap of web for Android/iOS
│   ├── cloud-env-image/   # NEW: Dockerfile + scripts for Cloud env base image
│   └── landing/           # NEW: v3code.com marketing site (simple Astro)
├── packages/
│   ├── contracts/         # from T3 Code, unchanged
│   ├── mesh-contracts/    # NEW: WebSocket message types + JSON schemas
│   ├── mesh-client/       # NEW: shared sync client (client-side only)
│   ├── mesh-server/       # NEW: shared sync server logic
│   └── ui/                # from T3 Code, minimal tweaks
├── deploy/
│   ├── flyio/             # fly.toml + Dockerfile + scripts
│   ├── railway/           # railway.json + scripts
│   ├── cloudflare/        # Workers + Containers config
│   └── vps/               # scripts + docs
├── docs/
│   ├── architecture.md    # this spec summarised
│   ├── deploy-self.md     # self-host guide
│   ├── deploy-cloud.md    # one-click cloud
│   ├── deploy-vps.md      # manual VPS
│   ├── api-reference.md   # WS message types
│   └── troubleshooting.md
└── ...
```

### 12.1 Files that need to be created fresh (not forked)

- `packages/mesh-contracts/*` (types, zod schemas, docs)
- `packages/mesh-client/*` (client-side sync logic)
- `packages/mesh-server/*` (server-side hub logic)
- `apps/server/src/mesh/*` (integration into existing server)
- `apps/web/src/components/DeviceSidebar.tsx` (new sidebar component)
- `apps/web/src/components/CrossDeviceBanner.tsx`
- `apps/web/src/routes/admin/*` (server node admin panel)
- `apps/mobile/*` (entire Capacitor app)
- `apps/cloud-env-image/*`
- `deploy/*`

### 12.2 Files that need modification in the fork

- `apps/server/src/bootstrap.ts` (add mesh hub startup)
- `apps/web/src/routes/_chat.$environmentId.$threadId.tsx` (add remote-chat awareness)
- `apps/web/src/main.tsx` (wire up auth + Drive App Data check)
- Thread creation flow throughout
- Settings page extensions

Document every modification in `MESH_CHANGES.md` so upstream rebasing stays sane.

---

## 13. Phased roadmap (updated for full vision, 7-9 months)

### Phase 0: Foundation (weeks 1-2)
- Fork t3code to `aGamingGod1234/v3code`
- Get it building on all 3 devices
- Read all `.docs/*` thoroughly
- Try T3 Code's existing remote web mode over Cloudflare Tunnel
- Write PROJECT_LOG.md

### Phase 1: Auth + Drive App Data (weeks 3-5)
- Google OAuth integration with Better Auth
- Drive App Data read/write for server URL + device list
- GitHub OAuth with token storage on server
- Sign-in UI at top of app
- Basic `users`, `devices`, `user_preferences` tables

### Phase 2: Server node mode + setup wizard (weeks 6-8)
- Server/client mode toggle in V3
- Config file + initial setup wizard
- Cloudflare Tunnel auto-install flow
- Admin panel scaffolding
- `hello`, `heartbeat`, `presence_update` messages

### Phase 3: Sidebar rewrite + presence (weeks 9-10)
- Device list in sidebar with grouping
- Online/offline indicators
- Local chats still flat under "This Device"
- "Configure server" prompt

### Phase 4: Chat sync (weeks 11-16) ← the hard part
- `chat_events` table + event log
- `subscribe`, `publish_event`, `chat_event` messages
- Client-side event replay
- Gap detection and recovery
- Reconnection logic
- Stream all T3 Code events through the sync layer
- Test across all 3 physical devices

### Phase 5: Cross-device prompts (weeks 17-18)
- `send_prompt` routing
- Prompt attribution badges in UI
- Offline-device error handling

### Phase 6: Fork chat (weeks 19-20)
- Fork UI and target device picker
- Event log copy logic
- Working directory remapping

### Phase 7: Web app cloud mode (weeks 21-23)
- Build-flag-controlled variant of `apps/web`
- Serve from server node (no local backend expected)
- Deploy to Cloudflare Pages hosted by user's server node or at public URL
- GitHub repo browser when no local filesystem

### Phase 8: Cloud env (weeks 24-27)
- Docker integration on server node
- Base image creation
- Cloud device registration
- Container lifecycle
- GitHub integration inside container
- Cloud chat creation flow

### Phase 9: Android app (weeks 28-30)
- Capacitor project setup
- FCM integration
- Background WS strategy
- Play Store internal testing

### Phase 10: Enhanced (weeks 31-34)
- Web previews (Cloudflare Tunnel from container)
- In-app browser (Playwright on host)
- Subagent chat display
- Polish, performance, edge cases

### Phase 11: Public launch prep (weeks 35-36)
- Landing page at v3code.com
- Deploy templates (Fly.io, Railway, Cloudflare)
- Docs site
- Video demos
- GitHub README polish
- MIT license retained

---

## 14. Open questions / known unknowns

1. **Cloud env on serverless platforms.** Cloudflare Containers is still maturing; may need to defer Cloudflare deploy until post-launch.
2. **Android background WS reliability.** Real-world test needed. May end up using FCM-data-only messages as wake signal instead of persistent WS.
3. **T3 Code upstream drift.** They ship releases every few days. Plan to rebase onto their latest tagged release monthly.
4. **Google Drive App Data quota.** Free tier is 10 MB per app; V3's usage is tiny so likely never hit. Monitor anyway.
5. **Forking a Cloud chat.** Edge case: Cloud env chat gets forked to a physical device. The fork inherits the event log but not the filesystem state inside the dead container. Dialog must warn.
6. **Multi-account on same device.** V1 assumes one Google account per V3 install. Switching accounts: fully sign out, clear local data, sign in as new account. Document this.
7. **Server node migration.** If user wants to move their server from Mini PC to cloud, need an export/import tool. Plan for v1.1.
8. **GitHub Enterprise / self-hosted GitHub.** V1 supports only github.com. Document the limitation.

---

## 15. Appendix: TypeScript types for WebSocket messages

Located at `packages/mesh-contracts/src/index.ts`. Full source:

```ts
// Envelope
export interface WireMessage<T = unknown> {
  id: string;
  type: string;
  ref?: string;
  timestamp: string;
  payload: T;
}

// Client → Server
export interface HelloPayload {
  device_id: string;
  device_name: string;
  platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web';
  kind: 'desktop' | 'laptop' | 'server' | 'phone' | 'tablet' | 'browser';
  capabilities: Capability[];
  app_version: string;
}

export type Capability =
  | 'execute'
  | 'claude_code'
  | 'codex'
  | 'browser_use'
  | 'terminal'
  | 'view_only';

export interface HeartbeatPayload { /* empty */ }

export interface SubscribePayload {
  chat_id: string;
  since_seq?: number;
}

export interface UnsubscribePayload {
  chat_id: string;
}

export interface PublishEventPayload {
  chat_id: string;
  seq: number;
  event_type: ChatEventType;
  payload: unknown;
}

export interface CreateChatPayload {
  client_chat_id: string;
  host_device_id: string;
  title?: string;
  working_directory?: string;
  github_repo?: string;
  github_branch?: string;
  provider?: 'claude_code' | 'codex';
}

export interface SendPromptPayload {
  chat_id: string;
  content: string;
  client_msg_id: string;
}

export interface ForkChatPayload {
  source_chat_id: string;
  target_device_id: string;
  working_directory?: string;
  github_repo?: string;
  github_branch?: string;
}

export interface EndChatPayload {
  chat_id: string;
}

export interface ArchiveChatPayload {
  chat_id: string;
}

export interface UpdatePreferencesPayload {
  theme?: string;
  font_family?: string;
  font_size?: number;
  default_provider?: 'claude_code' | 'codex';
  keybindings?: Record<string, string>;
  editor_settings?: Record<string, unknown>;
}

export interface ApproveDevicePayload {
  device_id: string;
}

export interface RemoveDevicePayload {
  device_id: string;
}

// Server → Client
export interface ConnectionEstablishedPayload {
  server_version: string;
  user_id: string;
  user_email: string;
}

export interface HelloAckPayload {
  devices: DeviceInfo[];
  chats: ChatInfo[];
  preferences: UserPreferences;
}

export interface HeartbeatAckPayload {
  server_time: string;
}

export interface PresenceUpdatePayload {
  device_id: string;
  online: boolean;
  last_seen_at: string;
}

export interface DeviceRegisteredPayload {
  device: DeviceInfo;
  needs_approval: boolean;
}

export interface DeviceApprovalRequestedPayload {
  device: DeviceInfo;
  from_ip: string;
}

export interface DeviceRemovedPayload {
  device_id: string;
}

export interface ChatCreatedPayload {
  chat: ChatInfo;
}

export interface ChatEventPayload {
  chat_id: string;
  seq: number;
  type: ChatEventType;
  payload: unknown;
  actor_device_id: string;
  created_at: string;
}

export interface ChatUpdatedPayload {
  chat_id: string;
  changes: Partial<ChatInfo>;
}

export interface ChatForkedPayload {
  new_chat_id: string;
  source_chat_id: string;
}

export interface PromptDeliveredPayload {
  client_msg_id: string;
  chat_id: string;
}

export interface PromptRejectedPayload {
  client_msg_id: string;
  reason: 'device_offline' | 'device_removed' | 'not_authorized' | 'chat_not_found';
}

export interface PreferencesUpdatedPayload {
  preferences: UserPreferences;
}

export interface ErrorPayload {
  code: string;
  message: string;
  ref?: string;
}

export interface GhTokenInvalidPayload { /* empty */ }

// Common
export interface DeviceInfo {
  id: string;
  name: string;
  platform: HelloPayload['platform'];
  kind: HelloPayload['kind'];
  capabilities: Capability[];
  online: boolean;
  last_seen_at: string;
}

export interface ChatInfo {
  id: string;
  title: string | null;
  host_device_id: string;
  status: 'active' | 'archived' | 'ended';
  parent_chat_id: string | null;
  parent_device_id: string | null;
  working_directory: string | null;
  github_repo: string | null;
  github_branch: string | null;
  event_seq: number;
  created_at: string;
  last_event_at: string;
}

export interface UserPreferences {
  theme: string;
  font_family: string | null;
  font_size: number;
  default_provider: 'claude_code' | 'codex';
  keybindings: Record<string, string>;
  editor_settings: Record<string, unknown>;
}

export type ChatEventType =
  | 'prompt_sent'
  | 'assistant_message_chunk'
  | 'assistant_message_complete'
  | 'tool_call_started'
  | 'tool_call_result'
  | 'file_change'
  | 'commit_made'
  | 'push_made'
  | 'subagent_spawned'
  | 'subagent_event'
  | 'chat_title_updated'
  | 'chat_archived'
  | 'container_started'
  | 'container_killed'
  | 'error';
```

---

## 16. What's explicitly deferred past V1

- iOS app (after Android is stable)
- Multi-user per server node (family / team accounts)
- E2E encryption (for cloud-deployed server nodes)
- Bring-your-own-API-key UI (just use Claude/Codex subscriptions for now)
- Server node export/import (migration)
- Auto-commit rules for Cloud env
- Chat templates / saved prompts
- Voice input
- Screen sharing between devices

---

## Document changelog

- **2026-04-18 (v0.1):** Initial spec based on 4 rounds of architecture decisions with Claude.

---
