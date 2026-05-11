import type { ParsedChat, ParsedMessage, ParsedMessageRole } from "@v3tools/contracts";
import { collectReferences } from "./references.ts";

// Codex CLI session JSONL has had two envelope shapes:
//   old: { id, timestamp, msg: { type, ...payload } }
//   new: { type, timestamp?, payload: { type?, ...payload } }
// Keep both supported so imports work across saved sessions.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

const firstStringField = (
  record: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): string | null => {
  for (const key of keys) {
    const value = stringField(record, key);
    if (value !== null && value.trim().length > 0) {
      return value;
    }
  }
  return null;
};

const normalizeMessageRole = (value: string | null): ParsedMessageRole | null => {
  switch (value) {
    case "developer":
    case "system":
      return "system";
    case "user":
    case "assistant":
    case "tool":
      return value;
    default:
      return null;
  }
};

const stringifyContent = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (isRecord(part)) {
          const text =
            stringField(part, "text") ??
            stringField(part, "content") ??
            stringField(part, "output");
          if (text !== null) return text;
          if ("input" in part) return stringifyContent(part.input);
        }
        return JSON.stringify(part);
      })
      .filter((part) => part.length > 0)
      .join("\n");
  }
  return JSON.stringify(value);
};

const getPayload = (env: Record<string, unknown>): Record<string, unknown> | null =>
  isRecord(env.payload) ? env.payload : null;

const envelopeTimestamp = (
  env: Record<string, unknown>,
  payload?: Record<string, unknown> | null,
): string | null =>
  stringField(env, "timestamp") ??
  (payload ? firstStringField(payload, ["timestamp", "created_at", "createdAt"]) : null);

const oldEnvelopeToMessage = (env: Record<string, unknown>): ParsedMessage | null => {
  const msg = env.msg;
  if (!isRecord(msg)) return null;
  const msgType = stringField(msg, "type");
  if (msgType === null) return null;

  const timestamp = envelopeTimestamp(env, msg);

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

const currentResponseItemToMessage = (env: Record<string, unknown>): ParsedMessage | null => {
  if (stringField(env, "type") !== "response_item") return null;

  const payload = getPayload(env);
  if (!payload) return null;
  const payloadType = stringField(payload, "type");
  const timestamp = envelopeTimestamp(env, payload);

  if (payloadType === "message") {
    const role = normalizeMessageRole(stringField(payload, "role"));
    if (!role) return null;
    const content = stringifyContent(payload.content ?? payload.text ?? payload.message);
    if (content.length === 0) return null;
    return {
      role,
      content,
      toolName: null,
      toolCallId: null,
      timestamp,
    };
  }

  if (payloadType === "function_call") {
    return {
      role: "tool",
      content: stringifyContent(payload.arguments ?? payload.input ?? payload.name ?? ""),
      toolName: stringField(payload, "name") ?? stringField(payload, "tool"),
      toolCallId: stringField(payload, "call_id") ?? stringField(payload, "id"),
      timestamp,
    };
  }

  if (payloadType === "function_call_output") {
    return {
      role: "tool",
      content: stringifyContent(payload.output ?? payload.result ?? payload.content ?? ""),
      toolName: stringField(payload, "name") ?? stringField(payload, "tool"),
      toolCallId: stringField(payload, "call_id") ?? stringField(payload, "id"),
      timestamp,
    };
  }

  return null;
};

export const parseCodexSession = (text: string): ParsedChat => {
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

    const payload = getPayload(env);
    if (isRecord(env.msg) && stringField(env.msg, "type") === "session_meta") {
      title = stringField(env.msg, "instructions")?.slice(0, 80) ?? title;
      model = stringField(env.msg, "model") ?? model;
      sourceWorkspaceRoot = stringField(env.msg, "cwd") ?? sourceWorkspaceRoot;
      startedAt = envelopeTimestamp(env, env.msg) ?? startedAt;
      continue;
    }

    if (stringField(env, "type") === "session_meta" && payload) {
      title =
        firstStringField(payload, ["instructions", "summary", "title"])?.slice(0, 80) ?? title;
      model = firstStringField(payload, ["model", "model_id", "modelId"]) ?? model;
      sourceWorkspaceRoot =
        firstStringField(payload, ["cwd", "workspace_root", "workspaceRoot"]) ??
        sourceWorkspaceRoot;
      startedAt = envelopeTimestamp(env, payload) ?? startedAt;
      continue;
    }

    if (stringField(env, "type") === "turn_context" && payload) {
      model = firstStringField(payload, ["model", "model_id", "modelId"]) ?? model;
      sourceWorkspaceRoot =
        firstStringField(payload, ["cwd", "workspace_root", "workspaceRoot"]) ??
        sourceWorkspaceRoot;
      startedAt = startedAt ?? envelopeTimestamp(env, payload);
      continue;
    }

    const message = oldEnvelopeToMessage(env) ?? currentResponseItemToMessage(env);
    if (message) messages.push(message);
  }

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
    sourceWorkspaceRoot,
    startedAt,
    messages,
    references: collectReferences(messages, [model]),
  };
};
