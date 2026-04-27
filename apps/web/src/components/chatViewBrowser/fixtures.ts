import {
  EnvironmentId,
  type EnvironmentApi,
  type MessageId,
  type ServerConfig,
  DEFAULT_SERVER_SETTINGS,
} from "@v3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@v3tools/contracts/settings";
import { type TerminalContextDraft } from "../../lib/terminalContext";
import { BASE_TIME_MS, NOW_ISO, THREAD_ID } from "./constants";

export function isoAt(offsetSeconds: number): string {
  return new Date(BASE_TIME_MS + offsetSeconds * 1_000).toISOString();
}

export function createBaseServerConfig(): ServerConfig {
  return {
    environment: {
      environmentId: EnvironmentId.make("environment-local"),
      label: "Local environment",
      platform: { os: "darwin" as const, arch: "arm64" as const },
      serverVersion: "0.0.0-test",
      capabilities: { repositoryIdentity: true },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie", "bearer-session-token"],
      sessionCookieName: "t3_session",
    },
    cwd: "/repo/project",
    keybindingsConfigPath: "/repo/project/.t3code-keybindings.json",
    keybindings: [],
    issues: [],
    providers: [
      {
        provider: "codex",
        enabled: true,
        installed: true,
        version: "0.116.0",
        status: "ready",
        auth: { status: "authenticated" },
        checkedAt: NOW_ISO,
        models: [],
        slashCommands: [],
        skills: [],
      },
    ],
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/repo/project/.v3code/logs",
      localTracingEnabled: true,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
    },
    settings: {
      ...DEFAULT_SERVER_SETTINGS,
      ...DEFAULT_CLIENT_SETTINGS,
    },
  };
}

export function createMockEnvironmentApi(input: {
  browse: EnvironmentApi["filesystem"]["browse"];
  dispatchCommand: EnvironmentApi["orchestration"]["dispatchCommand"];
}): EnvironmentApi {
  return {
    terminal: {} as EnvironmentApi["terminal"],
    projects: {} as EnvironmentApi["projects"],
    filesystem: {
      browse: input.browse,
    },
    git: {} as EnvironmentApi["git"],
    orchestration: {
      dispatchCommand: input.dispatchCommand,
      forkChat: (() => {
        throw new Error("Not implemented in browser test.");
      }) as EnvironmentApi["orchestration"]["forkChat"],
      getTurnDiff: (() => {
        throw new Error("Not implemented in browser test.");
      }) as EnvironmentApi["orchestration"]["getTurnDiff"],
      getFullThreadDiff: (() => {
        throw new Error("Not implemented in browser test.");
      }) as EnvironmentApi["orchestration"]["getFullThreadDiff"],
      subscribeShell: (() => () => undefined) as EnvironmentApi["orchestration"]["subscribeShell"],
      subscribeThread: (() => () =>
        undefined) as EnvironmentApi["orchestration"]["subscribeThread"],
    },
  };
}

export function createUserMessage(options: {
  id: MessageId;
  text: string;
  offsetSeconds: number;
  attachments?: Array<{
    type: "image";
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}) {
  return {
    id: options.id,
    role: "user" as const,
    text: options.text,
    ...(options.attachments ? { attachments: options.attachments } : {}),
    turnId: null,
    streaming: false,
    createdAt: isoAt(options.offsetSeconds),
    updatedAt: isoAt(options.offsetSeconds + 1),
  };
}

export function createAssistantMessage(options: {
  id: MessageId;
  text: string;
  offsetSeconds: number;
}) {
  return {
    id: options.id,
    role: "assistant" as const,
    text: options.text,
    turnId: null,
    streaming: false,
    createdAt: isoAt(options.offsetSeconds),
    updatedAt: isoAt(options.offsetSeconds + 1),
  };
}

export function createTerminalContext(input: {
  id: string;
  terminalLabel: string;
  lineStart: number;
  lineEnd: number;
  text: string;
}): TerminalContextDraft {
  return {
    id: input.id,
    threadId: THREAD_ID,
    terminalId: `terminal-${input.id}`,
    terminalLabel: input.terminalLabel,
    lineStart: input.lineStart,
    lineEnd: input.lineEnd,
    text: input.text,
    createdAt: NOW_ISO,
  };
}
