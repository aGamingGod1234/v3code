import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  ThreadId,
  type OrchestrationReadModel,
  type ParsedChat,
  type ParsedMessage,
} from "@v3tools/contracts";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { OrchestrationCommandInvariantError } from "./Errors.ts";
import { validateChatImportCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

function expectInvariantFailure(
  exit: Exit.Exit<unknown, OrchestrationCommandInvariantError>,
  detailFragment?: string,
) {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const error = Cause.squash(exit.cause) as OrchestrationCommandInvariantError;
    expect(error).toBeInstanceOf(OrchestrationCommandInvariantError);
    if (detailFragment !== undefined) {
      expect(error.detail).toContain(detailFragment);
    }
  }
}

const asCommandId = (value: string): CommandId => CommandId.make(value);
const asEventId = (value: string): EventId => EventId.make(value);
const asProjectId = (value: string): ProjectId => ProjectId.make(value);
const asThreadId = (value: string): ThreadId => ThreadId.make(value);

async function seedProject(projectId: ProjectId): Promise<OrchestrationReadModel> {
  const now = new Date().toISOString();
  const initial = createEmptyReadModel(now);
  return Effect.runPromise(
    projectEvent(initial, {
      sequence: 1,
      eventId: asEventId("evt-project-import"),
      aggregateKind: "project",
      aggregateId: projectId,
      type: "project.created",
      occurredAt: now,
      commandId: asCommandId("cmd-project-create"),
      causationEventId: null,
      correlationId: asCommandId("cmd-project-create"),
      metadata: {},
      payload: {
        projectId,
        title: "Project Import",
        workspaceRoot: "/tmp/project-import",
        defaultModelSelection: null,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
}

const sampleMessage: ParsedMessage = {
  role: "user",
  content: "Hello",
  toolName: null,
  toolCallId: null,
  timestamp: null,
};

const sampleParsed: ParsedChat = {
  format: "codex",
  title: "Imported chat",
  sourceProvider: "codex",
  sourceModel: "gpt-5-codex",
  startedAt: null,
  messages: [sampleMessage],
  references: { skillIds: [], mcpServerIds: [], modelIds: [] },
};

describe("validateChatImportCommand", () => {
  it("succeeds when the target project exists and the parsed chat has messages", async () => {
    const projectId = asProjectId("project-import");
    const readModel = await seedProject(projectId);
    const result = await Effect.runPromise(
      validateChatImportCommand({
        command: {
          type: "chat.import",
          commandId: asCommandId("cmd-import-1"),
          targetThreadId: asThreadId("thread-import-target"),
          targetProjectId: projectId,
          parsed: sampleParsed,
          createdAt: new Date().toISOString(),
        },
        readModel,
      }),
    );
    expect(result.targetProjectId).toBe(projectId);
  });

  it("rejects when targetProjectId is missing", async () => {
    const readModel = createEmptyReadModel(new Date().toISOString());
    const result = await Effect.runPromise(
      Effect.exit(
        validateChatImportCommand({
          command: {
            type: "chat.import",
            commandId: asCommandId("cmd-import-2"),
            targetThreadId: asThreadId("thread-import-target-2"),
            parsed: sampleParsed,
            createdAt: new Date().toISOString(),
          },
          readModel,
        }),
      ),
    );
    expectInvariantFailure(result, "requires a targetProjectId");
  });

  it("rejects when the target project does not exist", async () => {
    const readModel = createEmptyReadModel(new Date().toISOString());
    const result = await Effect.runPromise(
      Effect.exit(
        validateChatImportCommand({
          command: {
            type: "chat.import",
            commandId: asCommandId("cmd-import-3"),
            targetThreadId: asThreadId("thread-import-target-3"),
            targetProjectId: asProjectId("project-missing"),
            parsed: sampleParsed,
            createdAt: new Date().toISOString(),
          },
          readModel,
        }),
      ),
    );
    expectInvariantFailure(result, "does not exist");
  });

  it("rejects when the target thread already exists", async () => {
    const projectId = asProjectId("project-import");
    const initial = await seedProject(projectId);
    const now = new Date().toISOString();
    const targetThreadId = asThreadId("thread-import-existing");
    const readModel = await Effect.runPromise(
      projectEvent(initial, {
        sequence: 2,
        eventId: asEventId("evt-thread-existing"),
        aggregateKind: "thread",
        aggregateId: targetThreadId,
        type: "thread.created",
        occurredAt: now,
        commandId: asCommandId("cmd-thread-existing"),
        causationEventId: null,
        correlationId: asCommandId("cmd-thread-existing"),
        metadata: {},
        payload: {
          threadId: targetThreadId,
          projectId,
          title: "Existing thread",
          modelSelection: { provider: "codex", model: "gpt-5-codex" },
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    const result = await Effect.runPromise(
      Effect.exit(
        validateChatImportCommand({
          command: {
            type: "chat.import",
            commandId: asCommandId("cmd-import-4"),
            targetThreadId,
            targetProjectId: projectId,
            parsed: sampleParsed,
            createdAt: new Date().toISOString(),
          },
          readModel,
        }),
      ),
    );
    expectInvariantFailure(result, "already exists");
  });

  it("rejects when the parsed transcript has no messages", async () => {
    const projectId = asProjectId("project-import");
    const readModel = await seedProject(projectId);
    const result = await Effect.runPromise(
      Effect.exit(
        validateChatImportCommand({
          command: {
            type: "chat.import",
            commandId: asCommandId("cmd-import-5"),
            targetThreadId: asThreadId("thread-import-empty"),
            targetProjectId: projectId,
            parsed: { ...sampleParsed, messages: [] },
            createdAt: new Date().toISOString(),
          },
          readModel,
        }),
      ),
    );
    expectInvariantFailure(result, "at least one message");
  });
});
