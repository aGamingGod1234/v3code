import type { ChatImportFormat } from "@v3tools/contracts";

export interface DetectionResult {
  readonly format: ChatImportFormat;
  readonly confidence: "high" | "medium" | "low";
  readonly reason: string;
}

const ANTHROPIC_MESSAGE_ROLES = new Set(["user", "assistant", "system", "tool"]);
const CODEX_MESSAGE_TYPES = new Set([
  "user_message",
  "user_input",
  "assistant_message",
  "agent_message",
  "system_message",
  "tool_use",
  "exec",
  "tool_call",
  "tool_result",
  "exec_result",
  "session_meta",
]);
const CLAUDE_ENVELOPE_TYPES = new Set([
  "user",
  "assistant",
  "system",
  "summary",
  "tool_use",
  "tool_result",
]);

const firstNonEmptyLine = (text: string): string | null => {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length > 0) return line;
  }
  return null;
};

const tryJson = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const looksLikeAnthropicConsoleMessage = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return typeof value.role === "string" && ANTHROPIC_MESSAGE_ROLES.has(value.role);
};

const looksLikeAnthropicConsoleMessages = (value: unknown): boolean =>
  Array.isArray(value) && value.some(looksLikeAnthropicConsoleMessage);

export function detectChatImportFormat(text: string): DetectionResult | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  // Require at least one role-bearing message so random JSON is not treated as
  // an importable Anthropic Console export.
  const first = trimmed[0];
  if (first === "{" || first === "[") {
    const parsed = tryJson(trimmed);
    if (looksLikeAnthropicConsoleMessages(parsed)) {
      return {
        format: "anthropic-console",
        confidence: "high",
        reason: "Top-level JSON array with Anthropic-style message roles.",
      };
    }
    if (isRecord(parsed) && looksLikeAnthropicConsoleMessages(parsed.messages)) {
      return {
        format: "anthropic-console",
        confidence: "high",
        reason: "Top-level object with Anthropic-style `messages` array.",
      };
    }
  }

  const head = firstNonEmptyLine(trimmed);
  if (head === null) return null;

  const env = tryJson(head);
  if (!isRecord(env)) return null;

  if (
    isRecord(env.msg) &&
    typeof env.msg.type === "string" &&
    CODEX_MESSAGE_TYPES.has(env.msg.type)
  ) {
    return {
      format: "codex",
      confidence: "high",
      reason: "First line has Codex CLI envelope shape.",
    };
  }

  if (typeof env.type === "string" && CLAUDE_ENVELOPE_TYPES.has(env.type)) {
    return {
      format: "claude",
      confidence: "high",
      reason: "First line has Claude Code envelope shape.",
    };
  }

  return null;
}
