# V3 Code — Mesh API reference

Every message V3 sends across a WebSocket is defined as an Effect
Schema in [packages/contracts/src/](../packages/contracts/src/). The
schema package is the source of truth; this doc is the human-readable
index.

For the design rationale behind every field, read
[V3_CODE_SPEC.md §5 and §15](../V3_CODE_SPEC.md).

---

## Transport

- WebSocket over TLS (`wss://`) to the server node's `/ws` endpoint.
- Protocol: [Effect-RPC](https://effect.website/docs/rpc) over a JSON
  frame. The wire envelope is `{ id, type, ref?, timestamp, payload }`.
- Authentication: a device session cookie (`Set-Cookie` on the
  `/auth/google/bootstrap` response). The cookie carries the V3 session
  token; the server verifies it on every upgrade request.
- Heartbeats are piggy-backed on the WebSocket protocol's own
  ping/pong. Device presence is derived from session registration
  (open WS) → `PresenceBroadcaster` fans out `presence_update`.

---

## Handshake

1. Client opens `wss://<server>/ws` carrying its session cookie.
2. Server upgrades and immediately publishes a
   `connection_established` push with the server version and
   authenticated `user_id` / `user_email`.
3. Client registers through `subscribePresence`; server responds with a
   snapshot of the user's devices, then live `presence` deltas.

If the cookie is missing or invalid, the upgrade is rejected with a
close code 4401 and the client falls through to the Google sign-in
flow.

---

## RPC methods

Every method is defined in
[packages/contracts/src/mesh/chat.ts](../packages/contracts/src/mesh/chat.ts)
under `MESH_WS_METHODS`. Inputs and outputs are Effect Schemas —
clients typically generate TypeScript types directly from
`@v3tools/contracts`.

| Method                          | Direction                | Purpose                                                                                              | Input schema                                                  | Output schema                                                  |
| ------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `mesh.subscribeChat`            | Client → Server (stream) | Subscribe to one chat's event stream, starting from `fromStreamVersionExclusive` for gap fill.       | `MeshSubscribeChatInput`                                      | stream of `MeshChatStreamItem` (`snapshot` then `event` items) |
| `mesh.publishEvent`             | Client → Server          | The host device of a chat publishes a new event.                                                     | `MeshPublishEventInput` wrapping `ClientOrchestrationCommand` | `DispatchResult`                                               |
| `mesh.sendPrompt`               | Client → Server          | Non-host viewer asks the host to run a prompt.                                                       | `MeshSendPromptInput` wrapping `ClientThreadTurnStartCommand` | `DispatchResult`                                               |
| `mesh.forkChat`                 | Client → Server          | Fork an existing chat onto a different device.                                                       | `MeshForkChatInput` wrapping `ChatForkCommand`                | `MeshForkChatResult`                                           |
| `mesh.subscribePresence`        | Client → Server (stream) | Device presence + device-list snapshot.                                                              | `Struct({})`                                                  | stream of `MeshPresenceStreamItem`                             |
| `mesh.subscribePrompts`         | Client → Server (stream) | Host devices listen for prompts forwarded from other viewers and for fork-ready notifications.       | `Struct({})`                                                  | stream of `MeshPromptStreamItem`                               |
| `mesh.subscribeDeviceApprovals` | Client → Server (stream) | Already-signed-in device receives `device-registered` / `device-approved` / `device-removed` events. | `Struct({})`                                                  | stream of `DeviceApprovalStreamEvent`                          |

### `MeshChatStreamItem` shape

```ts
type MeshChatStreamItem =
  | { kind: "snapshot"; snapshot: OrchestrationThreadDetailSnapshot; latestStreamVersion: number }
  | { kind: "event"; event: OrchestrationEvent };
```

The first item in any subscription is the replay snapshot; subsequent
items are live events with monotonically increasing `seq` numbers
matching the chat's `chat_events.seq` column.

### `MeshPromptStreamItem` shape

```ts
type MeshPromptStreamItem =
  | { kind: "send_prompt_forward"; command: ClientThreadTurnStartCommand }
  | { kind: "fork_ready"; threadId: ThreadId; title: string };
```

### Errors

All methods can fail with `MeshRpcError` (`TaggedError` with a trimmed
message and optional cause). The transport will additionally surface
close codes:

| Close code | Meaning                          | Client action                                  |
| ---------- | -------------------------------- | ---------------------------------------------- |
| 1000       | Graceful close                   | Reconnect                                      |
| 1006       | Network-level drop               | Reconnect with the spec §5.1 backoff curve     |
| 4401       | Session invalid/expired          | Clear session, re-run Google sign-in           |
| 4403       | Email not in `authorized_emails` | Show "not configured for this account" message |

---

## Shared enumerations

Defined in
[packages/contracts/src/identity.ts](../packages/contracts/src/identity.ts):

- `DevicePlatform = "windows" | "macos" | "linux" | "android" | "ios" | "web"`
- `DeviceKind = "desktop" | "laptop" | "server" | "phone" | "tablet" | "browser" | "cloud"`
- `DeviceCapability = "execute" | "claude_code" | "codex" | "browser_use" | "terminal" | "view_only"`

Chat event types live in
[packages/contracts/src/orchestration.ts](../packages/contracts/src/orchestration.ts)
(`OrchestrationEvent` union). They correspond to the 15 spec §15
`ChatEventType` literals, renamed to match the T3 event-store naming
but semantically identical:

| Spec name                                | Emitted on                             |
| ---------------------------------------- | -------------------------------------- |
| `prompt_sent`                            | `turn.started` (user input recorded)   |
| `assistant_message_chunk`                | `turn.assistantChunk`                  |
| `assistant_message_complete`             | `turn.assistantMessage`                |
| `tool_call_started` / `tool_call_result` | `turn.toolCall*`                       |
| `file_change`                            | `turn.fileChange`                      |
| `commit_made` / `push_made`              | `git.commit*`, `git.push*`             |
| `subagent_spawned` / `subagent_event`    | `subagent.*`                           |
| `chat_title_updated`                     | `thread.titled`                        |
| `chat_archived`                          | `thread.archived`                      |
| `container_started` / `container_killed` | `cloud.container*`                     |
| `error`                                  | emitted on provider / transport faults |

---

## HTTP endpoints (non-mesh)

The server also exposes a handful of HTTP routes for identity and
static hosting:

| Path                          | Method | Purpose                                                                                                                  |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `/auth/google/bootstrap`      | POST   | Exchange a Google ID token for a V3 session cookie.                                                                      |
| `/auth/github/callback`       | GET    | GitHub OAuth redirect landing.                                                                                           |
| `/admin/*`                    | GET    | Server-node admin panel (cloud-mode only).                                                                               |
| `/app/*`                      | GET    | Cloud-mode web bundle (if `V3CODE_CLOUD_MODE_STATIC_DIR` is set).                                                        |
| `/preview/:containerId/*`     | ANY    | Reverse-proxy into a Cloud env container's dev server (see [previewProxy.ts](../apps/server/src/cloud/previewProxy.ts)). |
| `/.well-known/t3/environment` | GET    | Health + environment metadata. Used by CI and deploy templates.                                                          |

All identity routes are defined in
[apps/server/src/identity/http.ts](../apps/server/src/identity/http.ts).
The auth middleware lives in
[apps/server/src/auth/http.ts](../apps/server/src/auth/http.ts).

---

## Generating types

From TypeScript consumers:

```ts
import {
  MESH_WS_METHODS,
  MeshChatStreamItem,
  MeshRpcError,
  PresenceUpdatePayload,
} from "@v3tools/contracts";
```

The `@v3tools/contracts` package is framework-neutral and safe to pull
into a non-Effect client. All schemas decode to plain JSON-compatible
values.

---

## Related docs

- [architecture.md](./architecture.md) — how the pieces fit together
- [deploy-vps.md](./deploy-vps.md), [deploy-self.md](./deploy-self.md),
  [deploy-cloud.md](./deploy-cloud.md) — putting a server node
  somewhere
- [troubleshooting.md](./troubleshooting.md) — debugging the transport
- [observability.md](./observability.md) — trace + log output format
