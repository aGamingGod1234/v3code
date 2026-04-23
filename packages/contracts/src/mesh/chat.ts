import { Schema } from "effect";

import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "../baseSchemas.ts";
import { DeviceApprovalStreamEvent, DeviceId } from "../identity.ts";
import {
  ChatForkCommand,
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
  forkChat: "mesh.forkChat",
  subscribePresence: "mesh.subscribePresence",
  subscribePrompts: "mesh.subscribePrompts",
  subscribeDeviceApprovals: "mesh.subscribeDeviceApprovals",
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

export const MeshForkChatInput = Schema.Struct({
  command: ChatForkCommand,
});
export type MeshForkChatInput = typeof MeshForkChatInput.Type;

export const MeshForkChatResult = Schema.Struct({
  targetThreadId: ThreadId,
  copiedEventCount: NonNegativeInt,
  forkedFromStreamVersion: NonNegativeInt,
  hostedOnDeviceId: Schema.NullOr(DeviceId),
  targetProjectId: ProjectId,
});
export type MeshForkChatResult = typeof MeshForkChatResult.Type;

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

export const MeshPromptStreamItem = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("send_prompt_forward"),
    command: ClientThreadTurnStartCommand,
  }),
  Schema.Struct({
    kind: Schema.Literal("fork_ready"),
    threadId: ThreadId,
    title: TrimmedNonEmptyString,
  }),
]);
export type MeshPromptStreamItem = typeof MeshPromptStreamItem.Type;

export const MeshDeviceApprovalStreamItem = DeviceApprovalStreamEvent;
export type MeshDeviceApprovalStreamItem = typeof MeshDeviceApprovalStreamItem.Type;

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
  forkChat: {
    input: MeshForkChatInput,
    output: MeshForkChatResult,
  },
  subscribePresence: {
    input: Schema.Struct({}),
    output: MeshPresenceStreamItem,
  },
  subscribePrompts: {
    input: Schema.Struct({}),
    output: MeshPromptStreamItem,
  },
  subscribeDeviceApprovals: {
    input: Schema.Struct({}),
    output: MeshDeviceApprovalStreamItem,
  },
} as const;
