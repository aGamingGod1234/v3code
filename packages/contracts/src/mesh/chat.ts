import { Schema } from "effect";

import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "../baseSchemas.ts";
import {
  ClientOrchestrationCommand,
  ClientThreadTurnStartCommand,
  DispatchResult,
  OrchestrationEvent,
  OrchestrationThreadDetailSnapshot,
} from "../orchestration.ts";
import { PresenceUpdatePayload } from "./device.ts";

export const MESH_WS_METHODS = {
  subscribeChat: "mesh.subscribeChat",
  publishEvent: "mesh.publishEvent",
  sendPrompt: "mesh.sendPrompt",
  subscribePresence: "mesh.subscribePresence",
  subscribePrompts: "mesh.subscribePrompts",
} as const;

export const MeshSubscribeChatInput = Schema.Struct({
  threadId: ThreadId,
  fromStreamVersionExclusive: NonNegativeInt,
});
export type MeshSubscribeChatInput = typeof MeshSubscribeChatInput.Type;

export const MeshChatSnapshot = Schema.Struct({
  snapshot: OrchestrationThreadDetailSnapshot,
  latestStreamVersion: NonNegativeInt,
});
export type MeshChatSnapshot = typeof MeshChatSnapshot.Type;

export const MeshChatStreamItem = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("snapshot"),
    snapshot: OrchestrationThreadDetailSnapshot,
    latestStreamVersion: NonNegativeInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("event"),
    event: OrchestrationEvent,
  }),
]);
export type MeshChatStreamItem = typeof MeshChatStreamItem.Type;

export const MeshPublishEventInput = Schema.Struct({
  command: ClientOrchestrationCommand,
});
export type MeshPublishEventInput = typeof MeshPublishEventInput.Type;

export const MeshSendPromptInput = Schema.Struct({
  command: ClientThreadTurnStartCommand,
});
export type MeshSendPromptInput = typeof MeshSendPromptInput.Type;

export const MeshPresenceSnapshot = Schema.Struct({
  devices: Schema.Array(PresenceUpdatePayload),
});
export type MeshPresenceSnapshot = typeof MeshPresenceSnapshot.Type;

export const MeshPresenceStreamItem = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("snapshot"),
    snapshot: MeshPresenceSnapshot,
  }),
  Schema.Struct({
    kind: Schema.Literal("presence"),
    update: PresenceUpdatePayload,
  }),
]);
export type MeshPresenceStreamItem = typeof MeshPresenceStreamItem.Type;

export const MeshPromptStreamItem = Schema.Struct({
  kind: Schema.Literal("send_prompt_forward"),
  command: ClientThreadTurnStartCommand,
});
export type MeshPromptStreamItem = typeof MeshPromptStreamItem.Type;

export class MeshRpcError extends Schema.TaggedErrorClass<MeshRpcError>()("MeshRpcError", {
  message: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect),
}) {}

export const MeshRpcSchemas = {
  subscribeChat: {
    input: MeshSubscribeChatInput,
    output: MeshChatStreamItem,
  },
  publishEvent: {
    input: MeshPublishEventInput,
    output: DispatchResult,
  },
  sendPrompt: {
    input: MeshSendPromptInput,
    output: DispatchResult,
  },
  subscribePresence: {
    input: Schema.Struct({}),
    output: MeshPresenceStreamItem,
  },
  subscribePrompts: {
    input: Schema.Struct({}),
    output: MeshPromptStreamItem,
  },
} as const;
