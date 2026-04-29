import {
  CodexReasoningEffort,
  DeviceId,
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  ProviderKind,
  ProviderModelOptions,
  RuntimeMode,
  ThreadId,
} from "@v3tools/contracts";
import * as Schema from "effect/Schema";
import { createDebouncedStorage, createMemoryStorage } from "./lib/storage";
import {
  DraftThreadEnvModeSchema,
  PersistedComposerImageAttachment,
  PersistedTerminalContextDraft,
} from "./composerDraft.types";

export const COMPOSER_DRAFT_STORAGE_KEY = "t3code:composer-drafts:v1";
export const COMPOSER_DRAFT_STORAGE_VERSION = 5;
export const COMPOSER_PERSIST_DEBOUNCE_MS = 300;

export const composerDebouncedStorage = createDebouncedStorage(
  typeof localStorage !== "undefined" ? localStorage : createMemoryStorage(),
  COMPOSER_PERSIST_DEBOUNCE_MS,
);

// Flush pending composer draft writes before page unload to prevent data loss.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => {
    composerDebouncedStorage.flush();
  });
}

export const PersistedComposerThreadDraftState = Schema.Struct({
  prompt: Schema.String,
  attachments: Schema.Array(PersistedComposerImageAttachment),
  terminalContexts: Schema.optionalKey(Schema.Array(PersistedTerminalContextDraft)),
  modelSelectionByProvider: Schema.optionalKey(
    Schema.Record(ProviderKind, Schema.optionalKey(ModelSelection)),
  ),
  activeProvider: Schema.optionalKey(Schema.NullOr(ProviderKind)),
  runtimeMode: Schema.optionalKey(RuntimeMode),
  interactionMode: Schema.optionalKey(ProviderInteractionMode),
});
export type PersistedComposerThreadDraftState = typeof PersistedComposerThreadDraftState.Type;

export const LegacyCodexFields = Schema.Struct({
  effort: Schema.optionalKey(CodexReasoningEffort),
  codexFastMode: Schema.optionalKey(Schema.Boolean),
  serviceTier: Schema.optionalKey(Schema.String),
});
export type LegacyCodexFields = typeof LegacyCodexFields.Type;

export const LegacyThreadModelFields = Schema.Struct({
  provider: Schema.optionalKey(ProviderKind),
  model: Schema.optionalKey(Schema.String),
  modelOptions: Schema.optionalKey(Schema.NullOr(ProviderModelOptions)),
});
export type LegacyThreadModelFields = typeof LegacyThreadModelFields.Type;

export type LegacyV2ThreadDraftFields = {
  modelSelection?: ModelSelection | null;
  modelOptions?: ProviderModelOptions | null;
};

export type LegacyPersistedComposerThreadDraftState = PersistedComposerThreadDraftState &
  LegacyCodexFields &
  LegacyThreadModelFields &
  LegacyV2ThreadDraftFields;

export const LegacyStickyModelFields = Schema.Struct({
  stickyProvider: Schema.optionalKey(ProviderKind),
  stickyModel: Schema.optionalKey(Schema.String),
  stickyModelOptions: Schema.optionalKey(Schema.NullOr(ProviderModelOptions)),
});
export type LegacyStickyModelFields = typeof LegacyStickyModelFields.Type;

export type LegacyV2StoreFields = {
  stickyModelSelection?: ModelSelection | null;
  stickyModelOptions?: ProviderModelOptions | null;
  projectDraftThreadIdByProjectId?: Record<string, string> | null;
  draftsByThreadId?: Record<string, PersistedComposerThreadDraftState> | null;
  draftThreadsByThreadId?: Record<string, PersistedDraftThreadState> | null;
  projectDraftThreadIdByProjectKey?: Record<string, string> | null;
  draftsByThreadKey?: Record<string, PersistedComposerThreadDraftState> | null;
  draftThreadsByThreadKey?: Record<string, PersistedDraftThreadState> | null;
  projectDraftThreadKeyByProjectKey?: Record<string, string> | null;
  logicalProjectDraftThreadKeyByLogicalProjectKey?: Record<string, string> | null;
};

export type LegacyPersistedComposerDraftStoreState = PersistedComposerDraftStoreState &
  LegacyStickyModelFields &
  LegacyV2StoreFields;

export const PersistedDraftThreadState = Schema.Struct({
  threadId: ThreadId,
  environmentId: Schema.String,
  projectId: ProjectId,
  logicalProjectKey: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  cwd: Schema.optionalKey(Schema.NullOr(Schema.String)),
  hostDeviceId: Schema.optionalKey(Schema.NullOr(DeviceId)),
  envMode: DraftThreadEnvModeSchema,
  promotedTo: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        environmentId: Schema.String,
        threadId: Schema.String,
      }),
    ),
  ),
});
export type PersistedDraftThreadState = typeof PersistedDraftThreadState.Type;

export const PersistedComposerDraftStoreState = Schema.Struct({
  draftsByThreadKey: Schema.Record(Schema.String, PersistedComposerThreadDraftState),
  draftThreadsByThreadKey: Schema.Record(Schema.String, PersistedDraftThreadState),
  logicalProjectDraftThreadKeyByLogicalProjectKey: Schema.Record(Schema.String, Schema.String),
  stickyModelSelectionByProvider: Schema.optionalKey(
    Schema.Record(ProviderKind, Schema.optionalKey(ModelSelection)),
  ),
  stickyActiveProvider: Schema.optionalKey(Schema.NullOr(ProviderKind)),
});
export type PersistedComposerDraftStoreState = typeof PersistedComposerDraftStoreState.Type;

export const PersistedComposerDraftStoreStorage = Schema.Struct({
  version: Schema.Number,
  state: PersistedComposerDraftStoreState,
});

export const EMPTY_PERSISTED_DRAFT_STORE_STATE = Object.freeze<PersistedComposerDraftStoreState>({
  draftsByThreadKey: {},
  draftThreadsByThreadKey: {},
  logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  stickyModelSelectionByProvider: {},
  stickyActiveProvider: null,
});
