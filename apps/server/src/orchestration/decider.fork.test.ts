import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  ThreadId,
  type OrchestrationReadModel,
} from "@v3tools/contracts";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { OrchestrationCommandInvariantError } from "./Errors.ts";
import { validateChatForkCommand } from "./decider.ts";
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

interface SeedOptions {
  readonly sessionStatus?: "idle" | "starting" | "running" | "ready" | "stopped" | "error";
  readonly sourceThreadId?: string;
}

async function seedReadModel(options: SeedOptions = {}): Promise<OrchestrationReadModel> {
  const now = new Date().toISOString();
  const sourceThreadId = asThreadId(options.sourceThreadId ?? "thread-fork-source");
  const initial = createEmptyReadModel(now);

  const withProject = await Effect.runPromise(
    projectEvent(initial, {
      sequence: 1,
      eventId: asEventId("evt-project-create"),
      aggregateKind: "project",
      aggregateId: asProjectId("project-fork"),
      type: "project.created",
      occurredAt: now,
      commandId: asCommandId("cmd-project-create"),
      causationEventId: null,
      correlationId: asCommandId("cmd-project-create"),
      metadata: {},
      payload: {
        projectId: asProjectId("project-fork"),
        title: "Project Fork",
        workspaceRoot: "/tmp/project-fork",
        defaultModelSelection: null,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  const withThread = await Effect.runPromise(
    projectEvent(withProject, {
      sequence: 2,
      eventId: asEventId("evt-thread-create"),
      aggregateKind: "thread",
      aggregateId: sourceThreadId,
      type: "thread.created",
      occurredAt: now,
      commandId: asCommandId("cmd-thread-create"),
      causationEventId: null,
      correlationId: asCommandId("cmd-thread-create"),
      metadata: {},
      payload: {
        threadId: sourceThreadId,
        projectId: asProjectId("project-fork"),
        title: "Source Thread",
        modelSelection: {
          provider: "codex",
          model: "gpt-5-codex",
        },
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  if (options.sessionStatus === undefined) {
    return withThread;
  }

  return Effect.runPromise(
    projectEvent(withThread, {
      sequence: 3,
      eventId: asEventId("evt-session-set"),
      aggregateKind: "thread",
      aggregateId: sourceThreadId,
      type: "thread.session-set",
      occurredAt: now,
      commandId: asCommandId("cmd-session-set"),
      causationEventId: null,
      correlationId: asCommandId("cmd-session-set"),
      metadata: {},
      payload: {
        threadId: sourceThreadId,
        session: {
          threadId: sourceThreadId,
          status: options.sessionStatus,
          providerName: "codex",
          runtimeMode: "approval-required",
          activeTurnId: null,
          lastError: null,
          updatedAt: now,
        },
      },
    }),
  );
}

describe("validateChatForkCommand", () => {
  it("succeeds when source exists and has no active session", async () => {
    const readModel = await seedReadModel();
    const result = await Effect.runPromise(
      validateChatForkCommand({
        command: {
          type: "chat.fork",
          commandId: asCommandId("cmd-fork-1"),
          sourceThreadId: asThreadId("thread-fork-source"),
          targetThreadId: asThreadId("thread-fork-target"),
          createdAt: new Date().toISOString(),
        },
        readModel,
      }),
    );
    expect(result.sourceThread.id).toBe("thread-fork-source");
    expect(result.sourceThread.projectId).toBe("project-fork");
    expect(result.targetProjectId).toBe("project-fork");
  });

  it("rejects when the source thread does not exist", async () => {
    const readModel = createEmptyReadModel(new Date().toISOString());
    const result = await Effect.runPromise(
      Effect.exit(
        validateChatForkCommand({
          command: {
            type: "chat.fork",
            commandId: asCommandId("cmd-fork-2"),
            sourceThreadId: asThreadId("thread-missing"),
            targetThreadId: asThreadId("thread-fork-target-2"),
            createdAt: new Date().toISOString(),
          },
          readModel,
        }),
      ),
    );
    expectInvariantFailure(result, "does not exist");
  });

  it("rejects when the source has a running session", async () => {
    const readModel = await seedReadModel({ sessionStatus: "running" });
    const result = await Effect.runPromise(
      Effect.exit(
        validateChatForkCommand({
          command: {
            type: "chat.fork",
            commandId: asCommandId("cmd-fork-3"),
            sourceThreadId: asThreadId("thread-fork-source"),
            targetThreadId: asThreadId("thread-fork-target-3"),
            createdAt: new Date().toISOString(),
          },
          readModel,
        }),
      ),
    );
    expectInvariantFailure(result, "active session");
  });

  it("rejects when the source has a starting session", async () => {
    const readModel = await seedReadModel({ sessionStatus: "starting" });
    const result = await Effect.runPromise(
      Effect.exit(
        validateChatForkCommand({
          command: {
            type: "chat.fork",
            commandId: asCommandId("cmd-fork-4"),
            sourceThreadId: asThreadId("thread-fork-source"),
            targetThreadId: asThreadId("thread-fork-target-4"),
            createdAt: new Date().toISOString(),
          },
          readModel,
        }),
      ),
    );
    expectInvariantFailure(result);
  });

  it("rejects when the target thread already exists", async () => {
    const readModel = await seedReadModel();
    const result = await Effect.runPromise(
      Effect.exit(
        validateChatForkCommand({
          command: {
            type: "chat.fork",
            commandId: asCommandId("cmd-fork-5"),
            sourceThreadId: asThreadId("thread-fork-source"),
            // Re-use the source id as the target id to trigger the absence
            // invariant.
            targetThreadId: asThreadId("thread-fork-source"),
            createdAt: new Date().toISOString(),
          },
          readModel,
        }),
      ),
    );
    expectInvariantFailure(result, "already exists");
  });
});
