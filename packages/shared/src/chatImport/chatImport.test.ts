import { describe, expect, it } from "vitest";

import { detectChatImportFormat } from "./detect.ts";
import { parseAnthropicConsoleExport } from "./anthropicConsole.ts";
import { parseClaudeSession } from "./claude.ts";
import { parseCodexSession } from "./codex.ts";
import { parseChatImport } from "./parse.ts";

const codexFixture = [
  JSON.stringify({
    id: "11111111-1111-1111-1111-111111111111",
    timestamp: "2026-04-26T01:00:00Z",
    msg: { type: "session_meta", model: "gpt-5", instructions: "Help refactor the cache layer." },
  }),
  JSON.stringify({
    id: "22222222-2222-2222-2222-222222222222",
    timestamp: "2026-04-26T01:00:01Z",
    msg: { type: "user_message", content: "Refactor cache.ts to use lru-cache@10." },
  }),
  JSON.stringify({
    id: "33333333-3333-3333-3333-333333333333",
    timestamp: "2026-04-26T01:00:02Z",
    msg: {
      type: "tool_use",
      name: "mcp__plugin_claude-mem_mcp-search__smart_search",
      call_id: "call_1",
      input: { query: "lru-cache invalidation" },
    },
  }),
  JSON.stringify({
    id: "44444444-4444-4444-4444-444444444444",
    timestamp: "2026-04-26T01:00:03Z",
    msg: { type: "assistant_message", content: "Here's the diff…" },
  }),
].join("\n");

const currentCodexFixture = [
  JSON.stringify({
    type: "session_meta",
    payload: {
      timestamp: "2026-05-01T01:00:00Z",
      cwd: "C:\\Users\\lucas\\Desktop\\Projects\\2048",
      model: "gpt-5.4",
    },
  }),
  JSON.stringify({
    type: "turn_context",
    payload: {
      cwd: "C:\\Users\\lucas\\Desktop\\Projects\\2048",
      model: "gpt-5.4",
    },
  }),
  JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Fix tile movement." }],
    },
  }),
  JSON.stringify({
    type: "response_item",
    payload: {
      type: "function_call",
      name: "shell_command",
      call_id: "call_1",
      arguments: { command: "bun lint" },
    },
  }),
  JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Tile movement is fixed." }],
    },
  }),
].join("\n");

const claudeFixture = [
  JSON.stringify({
    type: "summary",
    summary: "Refactoring the cache layer to lru-cache 10",
  }),
  JSON.stringify({
    type: "user",
    timestamp: "2026-04-26T02:00:00Z",
    message: { role: "user", content: "Switch our cache to lru-cache@10." },
  }),
  JSON.stringify({
    type: "assistant",
    timestamp: "2026-04-26T02:00:01Z",
    message: {
      role: "assistant",
      model: "claude-opus-4-7",
      content: [
        { type: "text", text: "I'll search the codebase first." },
        {
          type: "tool_use",
          name: "mcp__context-mode__ctx_search",
          input: { query: "import lru-cache" },
        },
      ],
    },
  }),
].join("\n");

const anthropicConsoleFixture = JSON.stringify({
  name: "Cache refactor scratch",
  model: "claude-opus-4-7",
  created_at: "2026-04-26T03:00:00Z",
  messages: [
    { role: "user", content: "List the lru-cache call sites." },
    {
      role: "assistant",
      content: [{ type: "text", text: "I count three: cache.ts, indexer.ts, sessionCache.ts." }],
    },
  ],
});

describe("detectChatImportFormat", () => {
  it("recognises Codex JSONL", () => {
    const result = detectChatImportFormat(codexFixture);
    expect(result?.format).toBe("codex");
    expect(result?.confidence).toBe("high");
  });

  it("recognises current Codex JSONL", () => {
    const result = detectChatImportFormat(currentCodexFixture);
    expect(result?.format).toBe("codex");
    expect(result?.confidence).toBe("high");
  });

  it("recognises Claude JSONL", () => {
    const result = detectChatImportFormat(claudeFixture);
    expect(result?.format).toBe("claude");
    expect(result?.confidence).toBe("high");
  });

  it("recognises Anthropic Console JSON", () => {
    const result = detectChatImportFormat(anthropicConsoleFixture);
    expect(result?.format).toBe("anthropic-console");
  });

  it("returns null for empty input", () => {
    expect(detectChatImportFormat("")).toBeNull();
    expect(detectChatImportFormat("   \n\n  ")).toBeNull();
  });

  it("does not guess unsupported JSON or JSONL as importable formats", () => {
    expect(detectChatImportFormat(JSON.stringify([{ id: "not-a-chat" }]))).toBeNull();
    expect(
      detectChatImportFormat(`${JSON.stringify({ event: "queued", payload: {} })}\n`),
    ).toBeNull();
  });
});

describe("parseCodexSession", () => {
  it("extracts user, assistant, tool, model, and references", () => {
    const parsed = parseCodexSession(codexFixture);
    expect(parsed.format).toBe("codex");
    expect(parsed.sourceModel).toBe("gpt-5");
    expect(parsed.title).toContain("Help refactor");
    const roles = parsed.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "tool", "assistant"]);
    expect(parsed.references.mcpServerIds).toContain("plugin_claude-mem_mcp-search");
    expect(parsed.references.skillIds).toContain("smart_search");
  });

  it("tolerates malformed lines", () => {
    const parsed = parseCodexSession(`${codexFixture}\nnot-json\n${"{}"}\n`);
    expect(parsed.messages.length).toBeGreaterThan(0);
  });

  it("extracts references consistently across repeated parses", () => {
    const first = parseCodexSession(codexFixture);
    const second = parseCodexSession(codexFixture);
    expect(first.references.skillIds).toContain("smart_search");
    expect(second.references.skillIds).toContain("smart_search");
    expect(first.references.mcpServerIds).toContain("plugin_claude-mem_mcp-search");
    expect(second.references.mcpServerIds).toContain("plugin_claude-mem_mcp-search");
  });

  it("extracts current Codex response items and workspace root", () => {
    const parsed = parseCodexSession(currentCodexFixture);
    expect(parsed.format).toBe("codex");
    expect(parsed.sourceModel).toBe("gpt-5.4");
    expect(parsed.sourceWorkspaceRoot).toBe("C:\\Users\\lucas\\Desktop\\Projects\\2048");
    expect(parsed.title).toContain("Fix tile movement");
    expect(parsed.messages.map((message) => message.role)).toEqual(["user", "tool", "assistant"]);
  });
});

describe("parseClaudeSession", () => {
  it("flattens tool_use inside assistant content", () => {
    const parsed = parseClaudeSession(claudeFixture);
    expect(parsed.format).toBe("claude");
    expect(parsed.title).toContain("Refactoring the cache layer");
    expect(parsed.sourceModel).toBe("claude-opus-4-7");
    expect(parsed.messages.length).toBe(2);
    expect(parsed.messages[1]?.content).toContain("ctx_search");
    expect(parsed.references.mcpServerIds).toContain("context-mode");
  });
});

describe("parseAnthropicConsoleExport", () => {
  it("supports the wrapped object shape", () => {
    const parsed = parseAnthropicConsoleExport(anthropicConsoleFixture);
    expect(parsed.title).toBe("Cache refactor scratch");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1]?.content).toContain("three");
  });

  it("supports a top-level array", () => {
    const arrayFixture = JSON.stringify([
      { role: "user", content: "Ping?" },
      { role: "assistant", content: "Pong." },
    ]);
    const parsed = parseAnthropicConsoleExport(arrayFixture);
    expect(parsed.messages).toHaveLength(2);
  });

  it("returns an empty result for malformed JSON", () => {
    const parsed = parseAnthropicConsoleExport("{bad json");
    expect(parsed.messages).toHaveLength(0);
  });
});

describe("parseChatImport (dispatcher)", () => {
  it("auto-detects + parses Codex", () => {
    const result = parseChatImport(codexFixture);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.format).toBe("codex");
    }
  });

  it("respects an explicit format override", () => {
    const result = parseChatImport(anthropicConsoleFixture, "anthropic-console");
    expect(result.ok).toBe(true);
  });

  it("surfaces an error for empty input", () => {
    const result = parseChatImport("");
    expect(result.ok).toBe(false);
  });

  it("surfaces an error when the format yields zero messages", () => {
    const result = parseChatImport("{}\n{}\n", "codex");
    expect(result.ok).toBe(false);
  });
});
