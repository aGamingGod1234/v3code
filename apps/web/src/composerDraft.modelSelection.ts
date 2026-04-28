// Composer draft model-selection helpers.
//
// Pure functions extracted from `composerDraftStore.ts` to keep the main
// store file focused on persistence and zustand actions. Everything here is
// referentially transparent — no zustand state, no DOM access — so it can
// be unit-tested without spinning up the store.
//
// Public API (re-exported from `./composerDraftStore.ts`):
//   - `EffectiveComposerModelState`
//   - `deriveEffectiveComposerModelState`

import {
  CURSOR_REASONING_OPTIONS,
  DEFAULT_MODEL_BY_PROVIDER,
  type CursorModelOptions,
  type CursorReasoningOption,
  ClaudeAgentEffort,
  CodexReasoningEffort,
  ModelSelection,
  ProviderKind,
  ProviderModelOptions,
  type ServerProvider,
} from "@v3tools/contracts";
import * as Schema from "effect/Schema";
import { createModelSelection, normalizeModelSlug } from "@v3tools/shared/model";

import { resolveAppModelSelection } from "./modelSelection";
import { getDefaultServerModel } from "./providerModels";
import { UnifiedSettings } from "@v3tools/contracts/settings";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EffectiveComposerModelState {
  selectedModel: string;
  modelOptions: ProviderModelOptions | null;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * Minimal draft shape needed by `deriveEffectiveComposerModelState`. Defined
 * locally instead of importing `ComposerThreadDraftState` to avoid a runtime
 * circular import between this module and `composerDraftStore.ts`.
 */
export type EffectiveComposerModelDraftSlice = {
  readonly modelSelectionByProvider?: Partial<Record<ProviderKind, ModelSelection>>;
  readonly activeProvider?: ProviderKind | null;
};

/**
 * Pre-v3 codex-only model options that we still parse from old persisted
 * payloads to migrate them forward.
 */
export type LegacyCodexFields = {
  readonly effort?: typeof CodexReasoningEffort.Type;
  readonly codexFastMode?: boolean;
  readonly serviceTier?: string;
};

// ---------------------------------------------------------------------------
// Provider <-> options bridges
// ---------------------------------------------------------------------------

export function providerModelOptionsFromSelection(
  modelSelection: ModelSelection | null | undefined,
): ProviderModelOptions | null {
  if (!modelSelection?.options) {
    return null;
  }

  return {
    [modelSelection.provider]: modelSelection.options,
  };
}

export function modelSelectionByProviderToOptions(
  map: Partial<Record<ProviderKind, ModelSelection>> | null | undefined,
): ProviderModelOptions | null {
  if (!map) return null;
  const result: Record<string, unknown> = {};
  for (const [provider, selection] of Object.entries(map)) {
    if (selection?.options) {
      result[provider] = selection.options;
    }
  }
  return Object.keys(result).length > 0 ? (result as ProviderModelOptions) : null;
}

// ---------------------------------------------------------------------------
// Normalisation (used during persisted-state migration)
// ---------------------------------------------------------------------------

export function normalizeProviderKind(value: unknown): ProviderKind | null {
  return value === "codex" || value === "claudeAgent" || value === "cursor" || value === "opencode"
    ? value
    : null;
}

export function normalizeProviderModelOptions(
  value: unknown,
  provider?: ProviderKind | null,
  legacy?: LegacyCodexFields,
): ProviderModelOptions | null {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const codexCandidate =
    candidate?.codex && typeof candidate.codex === "object"
      ? (candidate.codex as Record<string, unknown>)
      : null;
  const claudeCandidate =
    candidate?.claudeAgent && typeof candidate.claudeAgent === "object"
      ? (candidate.claudeAgent as Record<string, unknown>)
      : null;
  const cursorCandidate =
    candidate?.cursor && typeof candidate.cursor === "object"
      ? (candidate.cursor as Record<string, unknown>)
      : null;
  const openCodeCandidate =
    candidate?.opencode && typeof candidate.opencode === "object"
      ? (candidate.opencode as Record<string, unknown>)
      : null;

  const isCodexReasoningEffort = Schema.is(CodexReasoningEffort);
  const isClaudeAgentEffort = Schema.is(ClaudeAgentEffort);

  const codexReasoningEffort = isCodexReasoningEffort(codexCandidate?.reasoningEffort)
    ? codexCandidate.reasoningEffort
    : provider === "codex"
      ? isCodexReasoningEffort(legacy?.effort)
        ? legacy.effort
        : undefined
      : undefined;
  const codexFastMode =
    codexCandidate?.fastMode === true
      ? true
      : codexCandidate?.fastMode === false
        ? false
        : (provider === "codex" && legacy?.codexFastMode === true) ||
            (typeof legacy?.serviceTier === "string" && legacy.serviceTier === "fast")
          ? true
          : undefined;
  const codex =
    codexReasoningEffort !== undefined || codexFastMode !== undefined
      ? {
          ...(codexReasoningEffort !== undefined ? { reasoningEffort: codexReasoningEffort } : {}),
          ...(codexFastMode !== undefined ? { fastMode: codexFastMode } : {}),
        }
      : undefined;

  const claudeThinking =
    claudeCandidate?.thinking === true
      ? true
      : claudeCandidate?.thinking === false
        ? false
        : undefined;
  const claudeEffort = isClaudeAgentEffort(claudeCandidate?.effort)
    ? claudeCandidate.effort
    : undefined;
  const claudeFastMode =
    claudeCandidate?.fastMode === true
      ? true
      : claudeCandidate?.fastMode === false
        ? false
        : undefined;
  const claudeContextWindow =
    typeof claudeCandidate?.contextWindow === "string" && claudeCandidate.contextWindow.length > 0
      ? claudeCandidate.contextWindow
      : undefined;
  const claude =
    claudeThinking !== undefined ||
    claudeEffort !== undefined ||
    claudeFastMode !== undefined ||
    claudeContextWindow !== undefined
      ? {
          ...(claudeThinking !== undefined ? { thinking: claudeThinking } : {}),
          ...(claudeEffort !== undefined ? { effort: claudeEffort } : {}),
          ...(claudeFastMode !== undefined ? { fastMode: claudeFastMode } : {}),
          ...(claudeContextWindow !== undefined ? { contextWindow: claudeContextWindow } : {}),
        }
      : undefined;

  const cursorReasoningRaw = cursorCandidate?.reasoning;
  const cursorReasoning: CursorReasoningOption | undefined =
    typeof cursorReasoningRaw === "string" &&
    (CURSOR_REASONING_OPTIONS as readonly string[]).includes(cursorReasoningRaw)
      ? (cursorReasoningRaw as CursorReasoningOption)
      : undefined;
  const cursorFastMode =
    cursorCandidate?.fastMode === true
      ? true
      : cursorCandidate?.fastMode === false
        ? false
        : undefined;
  const cursorThinking =
    cursorCandidate?.thinking === true
      ? true
      : cursorCandidate?.thinking === false
        ? false
        : undefined;
  const cursorContextWindow =
    typeof cursorCandidate?.contextWindow === "string" && cursorCandidate.contextWindow.length > 0
      ? cursorCandidate.contextWindow
      : undefined;

  const cursor: CursorModelOptions | undefined =
    cursorCandidate !== null
      ? (() => {
          const nextCursor = {
            ...(cursorReasoning ? { reasoning: cursorReasoning } : {}),
            ...(cursorFastMode !== undefined ? { fastMode: cursorFastMode } : {}),
            ...(cursorThinking !== undefined ? { thinking: cursorThinking } : {}),
            ...(cursorContextWindow !== undefined ? { contextWindow: cursorContextWindow } : {}),
          } satisfies CursorModelOptions;
          return Object.keys(nextCursor).length > 0 ? nextCursor : undefined;
        })()
      : undefined;

  const openCodeVariant =
    typeof openCodeCandidate?.variant === "string" && openCodeCandidate.variant.length > 0
      ? openCodeCandidate.variant
      : undefined;
  const openCodeAgent =
    typeof openCodeCandidate?.agent === "string" && openCodeCandidate.agent.length > 0
      ? openCodeCandidate.agent
      : undefined;
  const opencode =
    openCodeVariant !== undefined || openCodeAgent !== undefined
      ? {
          ...(openCodeVariant !== undefined ? { variant: openCodeVariant } : {}),
          ...(openCodeAgent !== undefined ? { agent: openCodeAgent } : {}),
        }
      : undefined;

  if (!codex && !claude && cursor === undefined && !opencode) {
    return null;
  }
  return {
    ...(codex ? { codex } : {}),
    ...(claude ? { claudeAgent: claude } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(opencode ? { opencode } : {}),
  };
}

export function normalizeModelSelection(
  value: unknown,
  legacy?: {
    provider?: unknown;
    model?: unknown;
    modelOptions?: unknown;
    legacyCodex?: LegacyCodexFields;
  },
): ModelSelection | null {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const provider = normalizeProviderKind(candidate?.provider ?? legacy?.provider);
  if (provider === null) {
    return null;
  }
  const rawModel = candidate?.model ?? legacy?.model;
  if (typeof rawModel !== "string") {
    return null;
  }
  const model = normalizeModelSlug(rawModel, provider);
  if (!model) {
    return null;
  }
  const modelOptions = normalizeProviderModelOptions(
    candidate?.options ? { [provider]: candidate.options } : legacy?.modelOptions,
    provider,
    provider === "codex" ? legacy?.legacyCodex : undefined,
  );
  const options = modelOptions?.[provider];
  return createModelSelection(provider, model, options);
}

// ---------------------------------------------------------------------------
// Legacy-state migration helpers (used only when reading v2 storage).
// ---------------------------------------------------------------------------

export function legacySyncModelSelectionOptions(
  modelSelection: ModelSelection | null,
  modelOptions: ProviderModelOptions | null | undefined,
): ModelSelection | null {
  if (modelSelection === null) {
    return null;
  }
  const options = modelOptions?.[modelSelection.provider];
  return createModelSelection(modelSelection.provider, modelSelection.model, options);
}

export function legacyMergeModelSelectionIntoProviderModelOptions(
  modelSelection: ModelSelection | null,
  currentModelOptions: ProviderModelOptions | null | undefined,
): ProviderModelOptions | null {
  if (modelSelection?.options === undefined) {
    return normalizeProviderModelOptions(currentModelOptions);
  }
  return legacyReplaceProviderModelOptions(
    normalizeProviderModelOptions(currentModelOptions),
    modelSelection.provider,
    modelSelection.options,
  );
}

export function legacyReplaceProviderModelOptions(
  currentModelOptions: ProviderModelOptions | null | undefined,
  provider: ProviderKind,
  nextProviderOptions: ProviderModelOptions[ProviderKind] | null | undefined,
): ProviderModelOptions | null {
  const { [provider]: _discardedProviderModelOptions, ...otherProviderModelOptions } =
    currentModelOptions ?? {};
  const normalizedNextProviderOptions = normalizeProviderModelOptions(
    { [provider]: nextProviderOptions },
    provider,
  );

  return normalizeProviderModelOptions({
    ...otherProviderModelOptions,
    ...(normalizedNextProviderOptions ? normalizedNextProviderOptions : {}),
  });
}

// ── New helpers for the consolidated representation ────────────────────

export function legacyToModelSelectionByProvider(
  modelSelection: ModelSelection | null,
  modelOptions: ProviderModelOptions | null | undefined,
): Partial<Record<ProviderKind, ModelSelection>> {
  const result: Partial<Record<ProviderKind, ModelSelection>> = {};
  // Add entries from the options bag (for non-active providers)
  if (modelOptions) {
    for (const provider of ["codex", "claudeAgent", "cursor", "opencode"] as const) {
      const options = modelOptions[provider];
      if (options && Object.keys(options).length > 0) {
        result[provider] = createModelSelection(
          provider,
          modelSelection?.provider === provider
            ? modelSelection.model
            : DEFAULT_MODEL_BY_PROVIDER[provider],
          options,
        );
      }
    }
  }
  // Add/overwrite the active selection (it's authoritative for its provider)
  if (modelSelection) {
    result[modelSelection.provider] = modelSelection;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Effective state derivation (used by ChatComposer + composer hooks)
// ---------------------------------------------------------------------------

export function deriveEffectiveComposerModelState(input: {
  draft: EffectiveComposerModelDraftSlice | null | undefined;
  providers: ReadonlyArray<ServerProvider>;
  selectedProvider: ProviderKind;
  threadModelSelection: ModelSelection | null | undefined;
  projectModelSelection: ModelSelection | null | undefined;
  settings: UnifiedSettings;
}): EffectiveComposerModelState {
  const baseModel =
    normalizeModelSlug(
      input.threadModelSelection?.model ?? input.projectModelSelection?.model,
      input.selectedProvider,
    ) ?? getDefaultServerModel(input.providers, input.selectedProvider);
  const activeSelection = input.draft?.modelSelectionByProvider?.[input.selectedProvider];
  const selectedModel = activeSelection?.model
    ? resolveAppModelSelection(
        input.selectedProvider,
        input.settings,
        input.providers,
        activeSelection.model,
      )
    : baseModel;
  const modelOptions =
    modelSelectionByProviderToOptions(input.draft?.modelSelectionByProvider) ??
    providerModelOptionsFromSelection(input.threadModelSelection) ??
    providerModelOptionsFromSelection(input.projectModelSelection) ??
    null;

  return {
    selectedModel,
    modelOptions,
  };
}
