// V3 chat-import IPC: thin Electron wrapper over v3ChatImportCore.
//
// All logic lives in v3ChatImportCore.ts (electron-free, vitest-runnable).
// This file registers the session-scoped IPC handlers exposed via the
// preload bridge.

import { ipcMain } from "electron";

import {
  closeSession,
  listLocal,
  openSession,
  readPreview,
  readTranscript,
  scanFolder,
} from "./v3ChatImportCore.ts";

export const V3_CHAT_IMPORT_CHANNELS = {
  OPEN_SESSION: "desktop:v3-chat-import-open-session",
  LIST_LOCAL: "desktop:v3-chat-import-list-local",
  SCAN_FOLDER: "desktop:v3-chat-import-scan-folder",
  READ_PREVIEW: "desktop:v3-chat-import-read-preview",
  READ_TRANSCRIPT: "desktop:v3-chat-import-read-transcript",
  CLOSE_SESSION: "desktop:v3-chat-import-close-session",
} as const;

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
};

const requireSessionInput = (raw: unknown): { sessionId: string } => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Expected an input object with sessionId.");
  }
  const sessionId = requireString((raw as { sessionId?: unknown }).sessionId, "sessionId");
  return { sessionId };
};

const requireScanFolderInput = (raw: unknown): { sessionId: string; folderPath: string } => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Expected an input object with sessionId and folderPath.");
  }
  const sessionId = requireString((raw as { sessionId?: unknown }).sessionId, "sessionId");
  const folderPath = requireString((raw as { folderPath?: unknown }).folderPath, "folderPath");
  return { sessionId, folderPath };
};

const requireTranscriptInput = (raw: unknown): { sessionId: string; transcriptId: string } => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Expected an input object with sessionId and transcriptId.");
  }
  const sessionId = requireString((raw as { sessionId?: unknown }).sessionId, "sessionId");
  const transcriptId = requireString(
    (raw as { transcriptId?: unknown }).transcriptId,
    "transcriptId",
  );
  return { sessionId, transcriptId };
};

export const registerV3ChatImportIpc = (): void => {
  ipcMain.handle(V3_CHAT_IMPORT_CHANNELS.OPEN_SESSION, async () => openSession());
  ipcMain.handle(V3_CHAT_IMPORT_CHANNELS.LIST_LOCAL, async (_event, raw: unknown) => {
    const { sessionId } = requireSessionInput(raw);
    return listLocal(sessionId);
  });
  ipcMain.handle(V3_CHAT_IMPORT_CHANNELS.SCAN_FOLDER, async (_event, raw: unknown) => {
    const { sessionId, folderPath } = requireScanFolderInput(raw);
    return scanFolder(sessionId, folderPath);
  });
  ipcMain.handle(V3_CHAT_IMPORT_CHANNELS.READ_PREVIEW, async (_event, raw: unknown) => {
    const { sessionId, transcriptId } = requireTranscriptInput(raw);
    return readPreview(sessionId, transcriptId);
  });
  ipcMain.handle(V3_CHAT_IMPORT_CHANNELS.READ_TRANSCRIPT, async (_event, raw: unknown) => {
    const { sessionId, transcriptId } = requireTranscriptInput(raw);
    return readTranscript(sessionId, transcriptId);
  });
  ipcMain.handle(V3_CHAT_IMPORT_CHANNELS.CLOSE_SESSION, async (_event, raw: unknown) => {
    const { sessionId } = requireSessionInput(raw);
    closeSession(sessionId);
  });
};
