import {
  DeviceId,
  type EnvironmentId,
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  ProviderKind,
  RuntimeMode,
  SessionMode,
  type ScopedThreadRef,
  ThreadId,
} from "@v3tools/contracts";
import * as Schema from "effect/Schema";
import type { ChatImageAttachment } from "./types";
import type { TerminalContextDraft } from "./lib/terminalContext";

export const DraftThreadEnvModeSchema = Schema.Literals(["local", "worktree"]);
export type DraftThreadEnvMode = typeof DraftThreadEnvModeSchema.Type;

export const DraftId = Schema.String.pipe(Schema.brand("DraftId"));
export type DraftId = typeof DraftId.Type;

export const PersistedComposerImageAttachment = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Number,
  dataUrl: Schema.String,
});
export type PersistedComposerImageAttachment = typeof PersistedComposerImageAttachment.Type;

export const PersistedTerminalContextDraft = Schema.Struct({
  id: Schema.String,
  threadId: ThreadId,
  createdAt: Schema.String,
  terminalId: Schema.String,
  terminalLabel: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
});
export type PersistedTerminalContextDraft = typeof PersistedTerminalContextDraft.Type;

export interface ComposerImageAttachment extends Omit<ChatImageAttachment, "previewUrl"> {
  previewUrl: string;
  file: File;
}

/**
 * Composer content keyed by either a draft session (`DraftId`) or a real server
 * thread (`ScopedThreadRef`). This is the editable payload shown in the composer.
 */
export interface ComposerThreadDraftState {
  prompt: string;
  images: ComposerImageAttachment[];
  nonPersistedImageIds: string[];
  persistedAttachments: PersistedComposerImageAttachment[];
  terminalContexts: TerminalContextDraft[];
  modelSelectionByProvider: Partial<Record<ProviderKind, ModelSelection>>;
  activeProvider: ProviderKind | null;
  runtimeMode: RuntimeMode | null;
  interactionMode: ProviderInteractionMode | null;
  sessionMode?: SessionMode | null;
}

/**
 * Mutable routing and execution context for a pre-thread draft session.
 *
 * Unlike a real server thread, a draft session can still change target
 * environment/worktree configuration before the first send.
 */
export interface DraftSessionState {
  threadId: ThreadId;
  environmentId: EnvironmentId;
  projectId: ProjectId;
  logicalProjectKey: string;
  createdAt: string;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  sessionMode?: SessionMode;
  branch: string | null;
  worktreePath: string | null;
  /**
   * Workspace anchor for the agent run. Set by HomeComposer when the user
   * picks an arbitrary folder; unrelated to git worktrees. Falls back to
   * `worktreePath` when null for backwards compatibility.
   */
  cwd?: string | null;
  hostDeviceId?: DeviceId | null;
  envMode: DraftThreadEnvMode;
  promotedTo?: ScopedThreadRef | null;
}

export type DraftThreadState = DraftSessionState;

/**
 * Draft session metadata paired with its stable draft-session identity.
 */
export interface ProjectDraftSession extends DraftSessionState {
  draftId: DraftId;
}

/**
 * App-facing composer identity:
 * - `DraftId` for pre-thread draft sessions
 * - `ScopedThreadRef` for server-backed threads
 *
 * Raw `ThreadId` is intentionally excluded so callers cannot drop environment
 * identity for real threads.
 */
export type ComposerThreadTarget = ScopedThreadRef | DraftId;

export interface ComposerDraftModelState {
  activeProvider: ProviderKind | null;
  modelSelectionByProvider: Partial<Record<ProviderKind, ModelSelection>>;
}
