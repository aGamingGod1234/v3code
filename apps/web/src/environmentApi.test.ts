import { DeviceId, ProjectId, ThreadId } from "@v3tools/contracts";
import { describe, expect, it, vi } from "vitest";

import { createEnvironmentApi } from "./environmentApi";
import type { WsRpcClient } from "./rpc/wsRpcClient";

function createRpcClientStub(): WsRpcClient {
  return {
    dispose: vi.fn(async () => undefined),
    reconnect: vi.fn(async () => undefined),
    terminal: {
      open: vi.fn(async () => {
        throw new Error("unused");
      }),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
      restart: vi.fn(async () => {
        throw new Error("unused");
      }),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined),
    },
    projects: {
      searchEntries: vi.fn(async () => {
        throw new Error("unused");
      }),
      writeFile: vi.fn(async () => {
        throw new Error("unused");
      }),
    },
    filesystem: {
      browse: vi.fn(async () => {
        throw new Error("unused");
      }),
    },
    shell: {
      openInEditor: vi.fn(async () => undefined),
    },
    git: {
      pull: vi.fn(async () => {
        throw new Error("unused");
      }),
      refreshStatus: vi.fn(async () => {
        throw new Error("unused");
      }),
      onStatus: vi.fn(() => () => undefined),
      runStackedAction: vi.fn(async () => {
        throw new Error("unused");
      }),
      listBranches: vi.fn(async () => {
        throw new Error("unused");
      }),
      createWorktree: vi.fn(async () => {
        throw new Error("unused");
      }),
      removeWorktree: vi.fn(async () => undefined),
      createBranch: vi.fn(async () => {
        throw new Error("unused");
      }),
      checkout: vi.fn(async () => {
        throw new Error("unused");
      }),
      init: vi.fn(async () => undefined),
      resolvePullRequest: vi.fn(async () => {
        throw new Error("unused");
      }),
      preparePullRequestThread: vi.fn(async () => {
        throw new Error("unused");
      }),
    },
    server: {
      getConfig: vi.fn(async () => {
        throw new Error("unused");
      }),
      refreshProviders: vi.fn(async () => {
        throw new Error("unused");
      }),
      upsertKeybinding: vi.fn(async () => {
        throw new Error("unused");
      }),
      getSettings: vi.fn(async () => {
        throw new Error("unused");
      }),
      updateSettings: vi.fn(async () => {
        throw new Error("unused");
      }),
      subscribeConfig: vi.fn(() => () => undefined),
      subscribeLifecycle: vi.fn(() => () => undefined),
      subscribeAuthAccess: vi.fn(() => () => undefined),
    },
    mesh: {
      publishEvent: vi.fn(async () => ({ sequence: 42 })),
      sendPrompt: vi.fn(async () => ({ sequence: 24 })),
      forkChat: vi.fn(async () => ({
        targetThreadId: ThreadId.make("thread-2"),
        copiedEventCount: 3,
        forkedFromStreamVersion: 3,
        hostedOnDeviceId: DeviceId.make("device-2"),
        targetProjectId: ProjectId.make("project-1"),
      })),
      subscribeChat: vi.fn(() => () => undefined),
      subscribePresence: vi.fn(() => () => undefined),
      subscribePrompts: vi.fn(() => () => undefined),
    },
    orchestration: {
      dispatchCommand: vi.fn(async () => ({ sequence: 7 })),
      getTurnDiff: vi.fn(async () => {
        throw new Error("unused");
      }),
      getFullThreadDiff: vi.fn(async () => {
        throw new Error("unused");
      }),
      subscribeShell: vi.fn(() => () => undefined),
      subscribeThread: vi.fn(() => () => undefined),
    },
  };
}

describe("createEnvironmentApi", () => {
  it("routes thread commands through mesh.publishEvent", async () => {
    const rpcClient = createRpcClientStub();
    const api = createEnvironmentApi(rpcClient);
    const command = {
      type: "thread.archive" as const,
      commandId: "command-1" as never,
      threadId: "thread-1" as never,
    };

    await expect(api.orchestration.dispatchCommand(command)).resolves.toEqual({
      sequence: 42,
    });
    expect(rpcClient.mesh.publishEvent).toHaveBeenCalledWith({ command });
    expect(rpcClient.orchestration.dispatchCommand).not.toHaveBeenCalled();
  });

  it("routes thread.turn.start through mesh.sendPrompt", async () => {
    const rpcClient = createRpcClientStub();
    const api = createEnvironmentApi(rpcClient);
    const command = {
      type: "thread.turn.start" as const,
      commandId: "command-1" as never,
      threadId: "thread-1" as never,
      message: {
        messageId: "message-1" as never,
        role: "user" as const,
        text: "hello",
        attachments: [],
      },
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
      createdAt: "2026-04-19T00:00:00.000Z",
    };

    await expect(api.orchestration.dispatchCommand(command)).resolves.toEqual({
      sequence: 24,
    });
    expect(rpcClient.mesh.sendPrompt).toHaveBeenCalledWith({ command });
    expect(rpcClient.mesh.publishEvent).not.toHaveBeenCalled();
    expect(rpcClient.orchestration.dispatchCommand).not.toHaveBeenCalled();
  });

  it("routes chat.fork through mesh.forkChat", async () => {
    const rpcClient = createRpcClientStub();
    const api = createEnvironmentApi(rpcClient);
    const command = {
      type: "chat.fork" as const,
      commandId: "command-1" as never,
      sourceThreadId: "thread-1" as never,
      targetThreadId: "thread-2" as never,
      targetDeviceId: "device-2" as never,
      targetWorktreePath: null,
      createdAt: "2026-04-20T00:00:00.000Z",
    };

    await expect(api.orchestration.forkChat(command)).resolves.toEqual({
      targetThreadId: ThreadId.make("thread-2"),
      copiedEventCount: 3,
      forkedFromStreamVersion: 3,
      hostedOnDeviceId: DeviceId.make("device-2"),
      targetProjectId: ProjectId.make("project-1"),
    });
    expect(rpcClient.mesh.forkChat).toHaveBeenCalledWith({ command });
    expect(rpcClient.mesh.publishEvent).not.toHaveBeenCalled();
    expect(rpcClient.orchestration.dispatchCommand).not.toHaveBeenCalled();
  });

  it("keeps project commands on orchestration.dispatchCommand", async () => {
    const rpcClient = createRpcClientStub();
    const api = createEnvironmentApi(rpcClient);
    const command = {
      type: "project.delete" as const,
      commandId: "command-1" as never,
      projectId: "project-1" as never,
    };

    await expect(api.orchestration.dispatchCommand(command)).resolves.toEqual({
      sequence: 7,
    });
    expect(rpcClient.orchestration.dispatchCommand).toHaveBeenCalledWith(command);
    expect(rpcClient.mesh.publishEvent).not.toHaveBeenCalled();
  });
});
