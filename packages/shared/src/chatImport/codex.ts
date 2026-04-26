import type { ParsedChat, ParsedMessage } from "@v3tools/contracts";
import { collectReferences } from "./references.ts";

// Codex CLI session JSONL format (reverse-engineered from
// `~/.codex/sessions/*.jsonl`). Each line is one envelope with shape:
//   { id, timestamp, msg: { type, ...payload } }
// The `msg.type` discriminator we care about:
//   - "user_message"          → role "user"
//   - "assistant_message"     → role "assistant"
//   - "system_message"        → role "system"
//   - "tool_use" / "exec"     → role "tool"
//   - "tool_result"           → role "tool"
// Anything else is skipped (session_meta, agent_reasoning, etc.).

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

const stringifyContent = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (isRecord(part)) {
          const text = stringField(part, "text") ?? stringField(part, "content");
          if (text !== null) return text;
        }
        return JSON.stringify(part);
      })
      .join("");
  }
  return JSON.stringify(value);
};

const envelopeToMessage = (env: Record<string, unknown>): ParsedMessage | null => {
  const msg = env.msg;
  if (!isRecord(msg)) return null;
  const msgType = stringField(msg, "type");
  if (msgType === null) return null;

  const timestamp = stringField(env, "timestamp");

  switch (msgType) {
    case "user_message":
    case "user_input":
      return {
        role: "user",
        content: stringifyContent(msg.content ?? msg.text ?? msg.message),
        toolName: null,
        toolCallId: null,
        timestamp,
      };
    case "assistant_message":
    case "agent_message":
      return {
        role: "assistant",
        content: stringifyContent(msg.content ?? msg.text ?? msg.message),
        toolName: null,
        toolCallId: null,
        timestamp,
      };
    case "system_message":
      return {
        role: "system",
        content: stringifyContent(msg.content ?? msg.text ?? msg.message),
        toolName: null,
        toolCallId: null,
        timestamp,
      };
    case "tool_use":
    case "exec":
    case "tool_call":
      return {
        role: "tool",
        content: stringifyContent(msg.input ?? msg.command ?? msg.args ?? ""),
        toolName: stringField(msg, "name") ?? stringField(msg, "tool"),
        toolCallId: stringField(msg, "call_id") ?? stringField(msg, "id"),
        timestamp,
      };
    case "tool_result":
    case "exec_result":
      return {
        role: "tool",
        content: stringifyContent(msg.output ?? msg.stdout ?? msg.result ?? ""),
        toolName: stringField(msg, "name") ?? stringField(msg, "tool"),
        toolCallId: stringField(msg, "call_id") ?? stringField(msg, "id"),
        timestamp,
      };
    default:
      return null;
  }
};

export const parseCodexSession = (text: string): ParsedChat => {
  const lines = text.split("\n");
  const messages: ParsedMessage[] = [];
  let title: string | null = null;
  let model: string | null = null;
  let startedAt: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    let env: unknown;
    try {
      env = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(env)) continue;

    if (isRecord(env.msg) && stringField(env.msg, "type") === "session_meta") {
      title = stringField(env.msg, "instructions")?.slice(0, 80) ?? null;
      model = stringField(env.msg, "model");
      startedAt = stringField(env, "timestamp");
      continue;
    }

    const message = envelopeToMessage(env);
    if (message) messages.push(message);
  }

  // Fall back to the first user prompt for the title if session_meta missing.
  if (title === null) {
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser && firstUser.content.length > 0) {
      title = firstUser.content.slice(0, 80);
    }
  }

  return {
    format: "codex",
    title,
    sourceProvider: "codex",
    sourceModel: model,
    startedAt,
    messages,
    references: collectReferences(messages, [model]),
  };
};
