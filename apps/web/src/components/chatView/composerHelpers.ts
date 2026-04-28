import { type RefObject } from "react";
import { type ClaudeAgentEffort, type ProviderKind, type ServerProvider } from "@v3tools/contracts";
import { applyClaudePromptEffortPrefix } from "@v3tools/shared/model";
import { getProviderModelCapabilities } from "../../providerModels";
import { type TerminalContextSelection } from "../../lib/terminalContext";
import { type ChatComposerHandle } from "../chat/ChatComposer";

export function focusComposerHandleAtEnd(composerRef: RefObject<ChatComposerHandle | null>): void {
  composerRef.current?.focusAtEnd();
}

export function appendComposerTerminalContext(
  composerRef: RefObject<ChatComposerHandle | null>,
  selection: TerminalContextSelection,
): void {
  composerRef.current?.addTerminalContext(selection);
}

export function resetComposerCursor(
  composerRef: RefObject<ChatComposerHandle | null>,
  cursor: number,
): void {
  composerRef.current?.resetCursorState({ cursor });
}

export function syncComposerPendingUserInputCursor(
  composerRef: RefObject<ChatComposerHandle | null>,
  input: {
    readonly value: string;
    readonly nextCursor: number;
    readonly expandedCursor: number;
  },
): void {
  const snapshot = composerRef.current?.readSnapshot();
  if (
    snapshot?.value !== input.value ||
    snapshot?.cursor !== input.nextCursor ||
    snapshot?.expandedCursor !== input.expandedCursor
  ) {
    composerRef.current?.focusAt(input.nextCursor);
  }
}

export function readComposerSendContext(
  composerRef: RefObject<ChatComposerHandle | null>,
): ReturnType<ChatComposerHandle["getSendContext"]> | undefined {
  return composerRef.current?.getSendContext();
}

export function formatOutgoingPrompt(params: {
  provider: ProviderKind;
  model: string | null;
  models: ReadonlyArray<ServerProvider["models"][number]>;
  effort: string | null;
  text: string;
}): string {
  const caps = getProviderModelCapabilities(params.models, params.model, params.provider);
  if (params.effort && caps.promptInjectedEffortLevels.includes(params.effort)) {
    return applyClaudePromptEffortPrefix(params.text, params.effort as ClaudeAgentEffort | null);
  }
  return params.text;
}
