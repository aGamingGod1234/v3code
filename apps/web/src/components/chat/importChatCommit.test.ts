import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type MeshImportChatResult,
  type ParsedChat,
} from "@v3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  buildImportProjectPlan,
  commitChatImports,
  summarizeImportCommitResult,
  type ImportCommitParsedSummary,
} from "./importChatCommit";

function parsedChat(workspaceRoot: string | null, title: string): ParsedChat {
  return {
    format: "codex",
    title,
    sourceProvider: "codex",
    sourceModel: "gpt-5-codex",
    sourceWorkspaceRoot: workspaceRoot,
    startedAt: null,
    messages: [
      {
        role: "user",
        content: `Prompt for ${title}`,
        toolName: null,
        toolCallId: null,
        timestamp: null,
      },
    ],
    references: {
      skillIds: ["shared-skill"],
      mcpServerIds: ["shared-mcp"],
      modelIds: [],
    },
  };
}

function parsedSummary(workspaceRoot: string | null, title: string): ImportCommitParsedSummary {
  const parsed = parsedChat(workspaceRoot, title);
  return {
    format: parsed.format,
    title: parsed.title,
    sourceProvider: parsed.sourceProvider,
    sourceModel: parsed.sourceModel,
    sourceWorkspaceRoot: parsed.sourceWorkspaceRoot,
    startedAt: parsed.startedAt,
    references: parsed.references,
  };
}

const envId = EnvironmentId.make("env-import-test");
const projectId = ProjectId.make("project-existing");

describe("buildImportProjectPlan", () => {
  it("groups imports by normalized workspace path and marks existing projects", () => {
    const plan = buildImportProjectPlan({
      items: [
        { id: "codex", source: "codex.jsonl", parsed: parsedChat("C:\\Work\\Demo", "Codex") },
        { id: "claude", source: "claude.jsonl", parsed: parsedChat("c:/work/demo/", "Claude") },
      ],
      projects: [
        {
          id: projectId,
          environmentId: envId,
          name: "Demo",
          cwd: "C:/Work/Demo",
        },
      ],
    });

    expect(plan.missingWorkspaceItemIds).toEqual([]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]).toMatchObject({
      count: 2,
      existingName: "Demo",
      existingProjectId: projectId,
    });
  });

  it("tracks selected imports that cannot be committed because the workspace path is missing", () => {
    const plan = buildImportProjectPlan({
      items: [{ id: "missing", source: "bad.jsonl", parsed: parsedChat(null, "Missing") }],
      projects: [],
    });

    expect(plan.groups).toEqual([]);
    expect(plan.missingWorkspaceItemIds).toEqual(["missing"]);
  });

  it("does not need full transcript messages to build the review plan", () => {
    const plan = buildImportProjectPlan({
      items: [
        {
          id: "summary",
          source: "summary.jsonl",
          parsed: parsedSummary("C:/Work/Demo", "Summary"),
        },
      ],
      projects: [],
    });

    expect(plan.groups).toEqual([
      expect.objectContaining({
        count: 1,
        path: "C:/Work/Demo",
      }),
    ]);
  });
});

describe("commitChatImports", () => {
  it("creates each target project once and continues importing after one chat fails", async () => {
    const imports = [
      { id: "first", source: "first.jsonl", parsed: parsedChat("C:/Work/Demo", "First") },
      { id: "second", source: "second.jsonl", parsed: parsedChat("C:/Work/Demo", "Second") },
    ];
    const resolvedProjectId = ProjectId.make("project-created");
    const resolveCalls: string[] = [];
    const importCalls: string[] = [];

    const result = await commitChatImports({
      items: imports,
      disabledSkillIds: new Set(["shared-skill"]),
      disabledMcpServerIds: new Set(),
      makeThreadId: () => ThreadId.make(`thread-${importCalls.length + 1}`),
      resolveProject: async (folderPath) => {
        resolveCalls.push(folderPath);
        return {
          environmentId: envId,
          projectId: resolvedProjectId,
          cwd: folderPath,
        };
      },
      loadParsedChat: async (item) => item.parsed as ParsedChat,
      importChat: async ({ item, parsed, targetProjectId, targetThreadId }) => {
        importCalls.push(item.id);
        if (item.id === "first") {
          throw new Error("RPC rejected first chat");
        }
        expect(parsed.references.skillIds).toEqual([]);
        return {
          targetThreadId,
          targetProjectId,
          importedMessageCount: parsed.messages.length,
          hostedOnDeviceId: null,
          skills: [],
          mcpServers: [],
        } satisfies MeshImportChatResult;
      },
    });

    expect(resolveCalls).toEqual(["C:/Work/Demo"]);
    expect(importCalls).toEqual(["first", "second"]);
    expect(result.successes).toHaveLength(1);
    expect(result.failures).toEqual([
      expect.objectContaining({
        itemId: "first",
        message: "RPC rejected first chat",
      }),
    ]);
    expect(result.successProjectCount).toBe(1);
  });

  it("loads full transcript content lazily during commit", async () => {
    const imports = [
      { id: "first", source: "first.jsonl", parsed: parsedChat("C:/Work/Demo", "First") },
      { id: "second", source: "second.jsonl", parsed: parsedChat("C:/Work/Demo", "Second") },
    ];
    const loadCalls: string[] = [];
    const importCalls: string[] = [];

    await commitChatImports({
      items: imports,
      disabledSkillIds: new Set(),
      disabledMcpServerIds: new Set(),
      makeThreadId: () => ThreadId.make(`thread-${importCalls.length + 1}`),
      resolveProject: async (folderPath) => ({
        environmentId: envId,
        projectId,
        cwd: folderPath,
      }),
      loadParsedChat: async (item) => {
        loadCalls.push(item.id);
        return item.parsed as ParsedChat;
      },
      importChat: async ({ item, parsed, targetProjectId, targetThreadId }) => {
        importCalls.push(item.id);
        expect(parsed.messages).toHaveLength(1);
        return {
          targetThreadId,
          targetProjectId,
          importedMessageCount: parsed.messages.length,
          hostedOnDeviceId: null,
          skills: [],
          mcpServers: [],
        } satisfies MeshImportChatResult;
      },
    });

    expect(loadCalls).toEqual(["first", "second"]);
    expect(importCalls).toEqual(["first", "second"]);
  });

  it("summarizes all-success and partial-failure results for notifications", () => {
    expect(
      summarizeImportCommitResult({
        successes: [
          {
            itemId: "one",
            source: "one.jsonl",
            title: "One",
            projectKey: "a",
            result: {
              targetThreadId: ThreadId.make("thread-one"),
              targetProjectId: ProjectId.make("project-one"),
              importedMessageCount: 2,
              hostedOnDeviceId: null,
              skills: [],
              mcpServers: [],
            },
          },
        ],
        failures: [],
        resolvedProjectCount: 1,
        successProjectCount: 1,
      }),
    ).toEqual({
      title: "Chat imported",
      description: "1 chat imported into 1 project.",
      type: "success",
    });

    expect(
      summarizeImportCommitResult({
        successes: [],
        failures: [
          {
            itemId: "bad",
            source: "bad.jsonl",
            title: "Bad",
            message: "Project missing",
          },
        ],
        resolvedProjectCount: 0,
        successProjectCount: 0,
      }),
    ).toEqual({
      title: "Import failed",
      description: "No chats imported. 1 failed: Project missing",
      type: "error",
    });

    expect(
      summarizeImportCommitResult({
        successes: [
          {
            itemId: "one",
            source: "one.jsonl",
            title: "One",
            projectKey: "a",
            result: {
              targetThreadId: ThreadId.make("thread-one"),
              targetProjectId: ProjectId.make("project-one"),
              importedMessageCount: 2,
              hostedOnDeviceId: null,
              skills: [],
              mcpServers: [],
            },
          },
        ],
        failures: [
          {
            itemId: "bad-one",
            source: "bad-one.jsonl",
            title: "Bad one",
            message: "First failed",
          },
          {
            itemId: "bad-two",
            source: "bad-two.jsonl",
            title: "Bad two",
            message: "Second failed",
          },
        ],
        resolvedProjectCount: 1,
        successProjectCount: 1,
      }).description,
    ).toBe("1 chat imported into 1 project. 2 failed.");
  });
});
