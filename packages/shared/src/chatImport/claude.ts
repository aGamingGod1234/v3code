import type { ParsedChat, ParsedMessage } from "@v3tools/contracts";
import { collectReferences } from "./references.ts";

// Claude Code session JSONL format (~/.claude/projects/<slug>/sessions/*.jsonl).
// Each line is one envelope. The shape we care about:
//   { type, timestamp, message: { role, content, model? } }
// where `type` ∈ "user" | "assistant" | "system" | "summary" | "tool_use" |
// "tool_result". For user/assistant lines we read message.role + message.content.

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
          if (part.type === "text") return stringField(part, "text") ?? "";
          if (part.type === "tool_use") {
            return JSON.stringify({
              tool: stringField(part, "name"),
              input: part.input,
            });
          }
          if (part.type === "tool_result") {
            return stringifyContent(part.content);
          }
        }
        return JSON.stringify(part);
      })
      .join("\n");
  }
  return JSON.stringify(value);
};

const collectModel = (env: Record<string, unknown>): string | null => {
  if (isRecord(env.message)) {
    const m = stringField(env.message, "model");
    if (m) return m;
  }
  return null;
};

const envelopeToMessage = (env: Record<string, unknown>): ParsedMessage | null => {
  const type = stringField(env, "type");
  const timestamp = stringField(env, "timestamp");
  if (!type) return null;

  if (type === "user" || type === "assistant" || type === "system") {
    const inner = isRecord(env.message) ? env.message : env;
    const role = stringField(inner, "role") ?? type;
    return {
      role: role === "user" || role === "assistant" || role === "system" ? role : "system",
      content: stringifyContent(inner.content),
      toolName: null,
      toolCallId: null,
      timestamp,
    };
  }

  if (type === "tool_use") {
    const inner = isRecord(env.message) ? env.message : env;
    return {
      role: "tool",
      content: stringifyContent(inner.input),
      toolName: stringField(inner, "name") ?? stringField(env, "name"),
      toolCallId: stringField(inner, "id") ?? stringField(env, "id"),
      timestamp,
    };
  }

  if (type === "tool_result") {
    const inner = isRecord(env.message) ? env.message : env;
    return {
      role: "tool",
      content: stringifyContent(inner.content),
      toolName: stringField(inner, "name") ?? stringField(env, "name"),
      toolCallId: stringField(inner, "tool_use_id") ?? stringField(env, "tool_use_id"),
      timestamp,
    };
  }

  return null;
};

export const parseClaudeSession = (text: string): ParsedChat => {
  const lines = text.split("\n");
  const messages: ParsedMessage[] = [];
  let title: string | null = null;
  let model: string | null = null;
  let sourceWorkspaceRoot: string | null = null;
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

    if (stringField(env, "type") === "summary") {
      title = stringField(env, "summary") ?? title;
      continue;
    }

    if (model === null) model = collectModel(env);
    if (sourceWorkspaceRoot === null) {
      sourceWorkspaceRoot =
        stringField(env, "cwd") ??
        stringField(env, "workspaceRoot") ??
        stringField(env, "workspace_root") ??
        (isRecord(env.message)
          ? (stringField(env.message, "cwd") ??
            stringField(env.message, "workspaceRoot") ??
            stringField(env.message, "workspace_root"))
          : null);
    }
    if (startedAt === null) startedAt = stringField(env, "timestamp");

    const message = envelopeToMessage(env);
    if (message) messages.push(message);
  }

  if (title === null) {
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser && firstUser.content.length > 0) {
      title = firstUser.content.slice(0, 80);
    }
  }

  return {
    format: "claude",
    title,
    sourceProvider: "claudeAgent",
    sourceModel: model,
    sourceWorkspaceRoot,
    startedAt,
    messages,
    references: collectReferences(messages, [model]),
  };
};
