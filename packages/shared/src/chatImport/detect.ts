import type { ChatImportFormat } from "@v3tools/contracts";

export interface DetectionResult {
  readonly format: ChatImportFormat;
  readonly confidence: "high" | "medium" | "low";
  readonly reason: string;
}

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

export function detectChatImportFormat(text: string): DetectionResult | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  // Anthropic Console exports are a single JSON object with `messages: [...]`
  // or a top-level array. Sniff the very first character.
  const first = trimmed[0];
  if (first === "{" || first === "[") {
    const parsed = tryJson(trimmed);
    if (Array.isArray(parsed)) {
      return {
        format: "anthropic-console",
        confidence: "medium",
        reason: "Top-level JSON array — assuming Anthropic Console export.",
      };
    }
    if (isRecord(parsed) && Array.isArray(parsed.messages)) {
      return {
        format: "anthropic-console",
        confidence: "high",
        reason: "Top-level object with `messages` array.",
      };
    }
  }

  // JSONL formats — first line is one envelope.
  const head = firstNonEmptyLine(trimmed);
  if (head === null) return null;

  const env = tryJson(head);
  if (!isRecord(env)) return null;

  // Codex CLI: envelopes have an `id` (uuid) plus `msg.type` discriminator.
  if (isRecord(env.msg) && typeof env.msg.type === "string") {
    return {
      format: "codex",
      confidence: "high",
      reason: "First line has Codex CLI envelope shape (id + msg.type).",
    };
  }

  // Claude Code: envelopes have `type: "user" | "assistant" | "tool_use" | ...`
  // at the top level, plus a `message` field for user/assistant.
  if (
    typeof env.type === "string" &&
    ["user", "assistant", "summary", "system"].includes(env.type)
  ) {
    return {
      format: "claude",
      confidence: "high",
      reason: "First line has Claude Code envelope shape (top-level type).",
    };
  }

  return {
    format: "codex",
    confidence: "low",
    reason: "Falling back to Codex format with low confidence.",
  };
}
