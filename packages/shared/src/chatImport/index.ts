// Chat-import parsers — pure functions producing ParsedChat from raw text.
//
// Three formats supported:
// - "codex":              Codex CLI session JSONL (~/.codex/sessions/*.jsonl)
// - "claude":             Claude Code session JSONL (~/.claude/projects/.../sessions/*.jsonl)
// - "anthropic-console":  Anthropic Console JSON export (single-file flattened messages)
//
// Each parser is intentionally tolerant: unknown fields are ignored, malformed
// lines surface as structured errors rather than throwing. The detection
// helper sniffs the first non-empty line to pick a format with a confidence
// score so the UI can offer a manual override when uncertain.

export { detectChatImportFormat, type DetectionResult } from "./detect.ts";
export { parseCodexSession } from "./codex.ts";
export { parseClaudeSession } from "./claude.ts";
export { parseAnthropicConsoleExport } from "./anthropicConsole.ts";
export { parseChatImport, type ParseError } from "./parse.ts";
