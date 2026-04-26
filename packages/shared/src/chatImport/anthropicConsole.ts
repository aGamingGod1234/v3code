import type { ParsedChat, ParsedMessage } from "@v3tools/contracts";
import { collectReferences } from "./references.ts";

// Anthropic Console export format (single JSON file). Two shapes seen in the
// wild — a top-level array of messages, or a top-level object with a
// `messages` array. We accept either.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

const stringifyContent = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (isRecord(part) && part.type === "text") return stringField(part, "text") ?? "";
        return JSON.stringify(part);
      })
      .join("\n");
  }
  return value === null || value === undefined ? "" : JSON.stringify(value);
};

const messageFrom = (record: Record<string, unknown>): ParsedMessage | null => {
  const role = stringField(record, "role");
  if (role !== "user" && role !== "assistant" && role !== "system" && role !== "tool") {
    return null;
  }
  return {
    role,
    content: stringifyContent(record.content),
    toolName: null,
    toolCallId: null,
    timestamp: stringField(record, "created_at") ?? stringField(record, "timestamp"),
  };
};

export const parseAnthropicConsoleExport = (text: string): ParsedChat => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      format: "anthropic-console",
      title: null,
      sourceProvider: "claudeAgent",
      sourceModel: null,
      startedAt: null,
      messages: [],
      references: { skillIds: [], mcpServerIds: [], modelIds: [] },
    };
  }

  let raw: ReadonlyArray<unknown> = [];
  let title: string | null = null;
  let model: string | null = null;
  let startedAt: string | null = null;

  if (Array.isArray(parsed)) {
    raw = parsed;
  } else if (isRecord(parsed)) {
    title = stringField(parsed, "name") ?? stringField(parsed, "title");
    model = stringField(parsed, "model");
    startedAt = stringField(parsed, "created_at") ?? stringField(parsed, "started_at");
    if (Array.isArray(parsed.messages)) raw = parsed.messages;
  }

  const messages: ParsedMessage[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const message = messageFrom(entry);
    if (message) messages.push(message);
  }

  if (title === null) {
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser && firstUser.content.length > 0) {
      title = firstUser.content.slice(0, 80);
    }
  }

  return {
    format: "anthropic-console",
    title,
    sourceProvider: "claudeAgent",
    sourceModel: model,
    startedAt,
    messages,
    references: collectReferences(messages, [model]),
  };
};
