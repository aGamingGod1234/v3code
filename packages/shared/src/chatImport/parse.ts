import type { ChatImportFormat, ParsedChat } from "@v3tools/contracts";

import { detectChatImportFormat } from "./detect.ts";
import { parseAnthropicConsoleExport } from "./anthropicConsole.ts";
import { parseClaudeSession } from "./claude.ts";
import { parseCodexSession } from "./codex.ts";

export interface ParseError {
  readonly _tag: "parse-error";
  readonly message: string;
}

const dispatch = (format: ChatImportFormat, text: string): ParsedChat => {
  switch (format) {
    case "codex":
      return parseCodexSession(text);
    case "claude":
      return parseClaudeSession(text);
    case "anthropic-console":
      return parseAnthropicConsoleExport(text);
  }
};

// Parse a transcript. If `format` is omitted, runs detection first.
// Returns the parsed chat or an error tag the caller can surface in the UI.
export function parseChatImport(
  text: string,
  format?: ChatImportFormat,
): { ok: true; parsed: ParsedChat } | { ok: false; error: ParseError } {
  if (text.trim().length === 0) {
    return { ok: false, error: { _tag: "parse-error", message: "Transcript is empty." } };
  }

  const resolvedFormat: ChatImportFormat | null =
    format ?? detectChatImportFormat(text)?.format ?? null;
  if (resolvedFormat === null) {
    return {
      ok: false,
      error: {
        _tag: "parse-error",
        message:
          "Could not auto-detect transcript format. Pick a format manually (Codex, Claude, or Anthropic Console).",
      },
    };
  }

  const parsed = dispatch(resolvedFormat, text);
  if (parsed.messages.length === 0) {
    return {
      ok: false,
      error: {
        _tag: "parse-error",
        message: `No messages recognised as ${resolvedFormat} format. The file may be malformed or in a different format.`,
      },
    };
  }
  return { ok: true, parsed };
}
