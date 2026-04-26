// V3 chat-import contracts.
//
// Schemas for ingesting external chat transcripts (Codex CLI sessions,
// Claude Code sessions, Anthropic Console exports) into V3 as fresh
// orchestration threads. The parser layer (packages/shared/src/chatImport)
// emits ParsedChat values; the server's mesh.importChat RPC accepts them
// and dispatches a sequence of orchestration events.

import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

export const ChatImportFormat = Schema.Literals(["codex", "claude", "anthropic-console"]);
export type ChatImportFormat = typeof ChatImportFormat.Type;

// ---------------------------------------------------------------------------
// Parsed message
// ---------------------------------------------------------------------------

export const ParsedMessageRole = Schema.Literals(["user", "assistant", "system", "tool"]);
export type ParsedMessageRole = typeof ParsedMessageRole.Type;

export const ParsedMessage = Schema.Struct({
  role: ParsedMessageRole,
  content: Schema.String,
  toolName: Schema.NullOr(Schema.String),
  toolCallId: Schema.NullOr(Schema.String),
  timestamp: Schema.NullOr(Schema.String),
});
export type ParsedMessage = typeof ParsedMessage.Type;

// ---------------------------------------------------------------------------
// Reference set: skills + MCP servers + models named in the transcript
// ---------------------------------------------------------------------------

export const ParsedReferences = Schema.Struct({
  skillIds: Schema.Array(Schema.String),
  mcpServerIds: Schema.Array(Schema.String),
  modelIds: Schema.Array(Schema.String),
});
export type ParsedReferences = typeof ParsedReferences.Type;

// ---------------------------------------------------------------------------
// Parsed chat (parser output)
// ---------------------------------------------------------------------------

export const ParsedChat = Schema.Struct({
  format: ChatImportFormat,
  title: Schema.NullOr(TrimmedNonEmptyString),
  sourceProvider: Schema.NullOr(Schema.String),
  sourceModel: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  messages: Schema.Array(ParsedMessage),
  references: ParsedReferences,
});
export type ParsedChat = typeof ParsedChat.Type;

// ---------------------------------------------------------------------------
// RPC: mesh.importChat — resolution result types
//
// The full orchestration command (ChatImportCommand) lives in orchestration.ts
// next to ChatForkCommand and is what the mesh.importChat RPC actually carries.
// ---------------------------------------------------------------------------

export const ChatImportSkillResolution = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["enabled", "missing"]),
  source: Schema.NullOr(Schema.String),
});
export type ChatImportSkillResolution = typeof ChatImportSkillResolution.Type;

export const ChatImportMcpResolution = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["enabled", "missing"]),
  source: Schema.NullOr(Schema.String),
});
export type ChatImportMcpResolution = typeof ChatImportMcpResolution.Type;
