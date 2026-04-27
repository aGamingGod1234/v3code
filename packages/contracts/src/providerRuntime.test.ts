import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import { ProviderRuntimeEvent } from "./providerRuntime.ts";

const decodeRuntimeEvent = Schema.decodeUnknownSync(ProviderRuntimeEvent);

describe("ProviderRuntimeEvent", () => {
  it("decodes turn.plan.updated for plan rendering", () => {
    const parsed = decodeRuntimeEvent({
      type: "turn.plan.updated",
      eventId: "event-1",
      provider: "claudeAgent",
      sessionId: "runtime-session-1",
      createdAt: "2026-02-28T00:00:00.000Z",
      threadId: "thread-1",
      turnId: "turn-1",
      payload: {
        explanation: "Implement schema updates",
        plan: [
          { step: "Define event union", status: "completed" },
          { step: "Wire adapter mapping", status: "inProgress" },
        ],
      },
    });

    expect(parsed.type).toBe("turn.plan.updated");
    if (parsed.type !== "turn.plan.updated") {
      throw new Error("expected turn.plan.updated");
    }
    expect(parsed.payload.plan).toHaveLength(2);
    expect(parsed.payload.plan[1]?.status).toBe("inProgress");
  });

  it("decodes proposed-plan completion events", () => {
    const parsed = decodeRuntimeEvent({
      type: "turn.proposed.completed",
      eventId: "event-proposed-plan-1",
      provider: "codex",
      createdAt: "2026-02-28T00:00:00.000Z",
      threadId: "thread-1",
      turnId: "turn-1",
      payload: {
        planMarkdown: "# Ship it",
      },
    });

    expect(parsed.type).toBe("turn.proposed.completed");
    if (parsed.type !== "turn.proposed.completed") {
      throw new Error("expected turn.proposed.completed");
    }
    expect(parsed.payload.planMarkdown).toBe("# Ship it");
  });

  it("decodes user-input.requested with structured questions", () => {
    const parsed = decodeRuntimeEvent({
      type: "user-input.requested",
      eventId: "event-2",
      provider: "claudeAgent",
      sessionId: "runtime-session-2",
      createdAt: "2026-02-28T00:00:01.000Z",
      threadId: "thread-2",
      requestId: "request-1",
      payload: {
        questions: [
          {
            id: "sandbox_mode",
            header: "Sandbox",
            question: "Which mode should be used?",
            options: [
              {
                label: "workspace-write",
                description: "Allow edits in workspace only",
              },
              {
                label: "danger-full-access",
                description: "Allow unrestricted access",
              },
            ],
          },
        ],
      },
    });

    expect(parsed.type).toBe("user-input.requested");
    if (parsed.type !== "user-input.requested") {
      throw new Error("expected user-input.requested");
    }
    expect(parsed.payload.questions[0]?.id).toBe("sandbox_mode");
    expect(parsed.payload.questions[0]?.options).toHaveLength(2);
  });

  it("decodes user-input.resolved with answer map", () => {
    const parsed = decodeRuntimeEvent({
      type: "user-input.resolved",
      eventId: "event-3",
      provider: "claudeAgent",
      sessionId: "runtime-session-2",
      createdAt: "2026-02-28T00:00:02.000Z",
      threadId: "thread-2",
      requestId: "request-1",
      payload: {
        answers: {
          sandbox_mode: "workspace-write",
        },
      },
    });

    expect(parsed.type).toBe("user-input.resolved");
    if (parsed.type !== "user-input.resolved") {
      throw new Error("expected user-input.resolved");
    }
    expect(parsed.payload.answers.sandbox_mode).toBe("workspace-write");
  });

  it("rejects legacy message.delta type", () => {
    expect(() =>
      decodeRuntimeEvent({
        type: "message.delta",
        eventId: "event-4",
        provider: "codex",
        sessionId: "runtime-session-3",
        createdAt: "2026-02-28T00:00:03.000Z",
        payload: { delta: "legacy" },
      }),
    ).toThrow();
  });

  it("rejects empty branded canonical ids", () => {
    expect(() =>
      decodeRuntimeEvent({
        type: "runtime.error",
        eventId: "event-5",
        provider: "codex",
        sessionId: "runtime-session-3",
        createdAt: "2026-02-28T00:00:03.000Z",
        threadId: "   ",
        payload: { message: "boom" },
      }),
    ).toThrow();
  });

  it("decodes normalized thread token usage snapshots", () => {
    const parsed = decodeRuntimeEvent({
      type: "thread.token-usage.updated",
      eventId: "event-token-usage-1",
      provider: "claudeAgent",
      createdAt: "2026-02-28T00:00:04.000Z",
      threadId: "thread-1",
      payload: {
        usage: {
          usedTokens: 31251,
          maxTokens: 200000,
          toolUses: 25,
          durationMs: 43567,
        },
      },
    });

    expect(parsed.type).toBe("thread.token-usage.updated");
    if (parsed.type !== "thread.token-usage.updated") {
      throw new Error("expected thread.token-usage.updated");
    }
    expect(parsed.payload.usage.maxTokens).toBe(200000);
    expect(parsed.payload.usage.usedTokens).toBe(31251);
  });

  // V3 Phase 10 — subagent lifecycle event decoding.
  it("decodes subagent.started / progress / completed / failed variants", () => {
    const started = decodeRuntimeEvent({
      type: "subagent.started",
      eventId: "event-subagent-1",
      provider: "claudeAgent",
      createdAt: "2026-04-22T10:00:00.000Z",
      threadId: "thread-1",
      turnId: "turn-1",
      payload: {
        subagentId: "sub-1",
        parentToolUseId: "tool-use-a",
        agentType: "code-explorer",
        label: "Explorer",
        prompt: "Investigate auth",
        model: "claude-sonnet-4-6",
      },
    });
    expect(started.type).toBe("subagent.started");
    if (started.type !== "subagent.started") throw new Error("expected subagent.started");
    expect(started.payload.subagentId).toBe("sub-1");
    expect(started.payload.agentType).toBe("code-explorer");

    const progress = decodeRuntimeEvent({
      type: "subagent.progress",
      eventId: "event-subagent-2",
      provider: "claudeAgent",
      createdAt: "2026-04-22T10:00:05.000Z",
      threadId: "thread-1",
      turnId: "turn-1",
      payload: {
        subagentId: "sub-1",
        summary: "Scanning file tree",
        lastToolName: "Read",
        toolCount: 3,
        elapsedSeconds: 4.2,
      },
    });
    expect(progress.type).toBe("subagent.progress");
    if (progress.type !== "subagent.progress") throw new Error("expected subagent.progress");
    expect(progress.payload.toolCount).toBe(3);

    const completed = decodeRuntimeEvent({
      type: "subagent.completed",
      eventId: "event-subagent-3",
      provider: "claudeAgent",
      createdAt: "2026-04-22T10:00:15.000Z",
      threadId: "thread-1",
      turnId: "turn-1",
      payload: {
        subagentId: "sub-1",
        summary: "Found 4 suspects in apps/server/src/auth",
        toolCount: 8,
        elapsedSeconds: 14.7,
        result: "## Findings\n- ...",
      },
    });
    expect(completed.type).toBe("subagent.completed");
    if (completed.type !== "subagent.completed") throw new Error("expected subagent.completed");
    expect(completed.payload.elapsedSeconds).toBeGreaterThan(0);

    const failed = decodeRuntimeEvent({
      type: "subagent.failed",
      eventId: "event-subagent-4",
      provider: "claudeAgent",
      createdAt: "2026-04-22T10:00:20.000Z",
      threadId: "thread-1",
      turnId: "turn-1",
      payload: {
        subagentId: "sub-1",
        reason: "timeout",
        errorMessage: "30s elapsed",
        toolCount: 12,
        elapsedSeconds: 30,
      },
    });
    expect(failed.type).toBe("subagent.failed");
    if (failed.type !== "subagent.failed") throw new Error("expected subagent.failed");
    expect(failed.payload.reason).toBe("timeout");
  });
});
