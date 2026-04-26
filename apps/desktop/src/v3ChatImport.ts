// V3 chat-import IPC: scans the host CLI's transcript directories
// (~/.codex/sessions, ~/.claude/projects/<slug>/sessions) and reads
// individual transcript files into the renderer for parsing. Pure I/O —
// the parsers themselves live in @v3tools/shared/chatImport.
//
// The actual scan/read logic lives in v3ChatImportCore.ts so vitest can
// import it without pulling the electron module. This file is the thin
// electron-only wrapper that registers ipcMain handlers.

import { ipcMain } from "electron";

import { listLocalTranscripts, readTranscript } from "./v3ChatImportCore.ts";

export const V3_CHAT_IMPORT_CHANNELS = {
  LIST_TRANSCRIPTS: "desktop:v3-chat-import-list-transcripts",
  READ_TRANSCRIPT: "desktop:v3-chat-import-read-transcript",
} as const;

export const registerV3ChatImportIpc = (): void => {
  ipcMain.handle(V3_CHAT_IMPORT_CHANNELS.LIST_TRANSCRIPTS, async () => listLocalTranscripts());
  ipcMain.handle(V3_CHAT_IMPORT_CHANNELS.READ_TRANSCRIPT, async (_event, rawPath: unknown) => {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      throw new Error("readTranscript requires a non-empty path string.");
    }
    return readTranscript(rawPath);
  });
};
