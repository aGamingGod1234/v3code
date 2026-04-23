// V3 Phase 10 — subagent tree derivation.
//
// Consumes the `OrchestrationThreadActivity` feed (kind is a free-form
// string populated from the provider runtime's `ProviderRuntimeEventType`)
// and produces a forest of `SubagentNode`s. Each node represents one
// subagent run — the model is flat-per-id plus a `parentSubagentId`
// pointer so nested Claude-Agent-inside-Agent runs nest naturally.
//
// The module is pure so the renderer can drive it from a `useMemo`
// and unit tests can exercise the state machine without React.
//
// State machine (matches the four subagent.* events):
//
//                 started
//   (none) ────────────────────▶ running
//   running ───── progress* ───▶ running    (accumulates lastToolName,
//                                            tool count, elapsed)
//   running ───── completed ──▶ completed
//   running ───── failed ─────▶ failed (with reason)
//
// Unknown / malformed events are ignored so a stray SDK payload never
// crashes the timeline; malformed completion / failure events without
// a matching `started` produce a best-effort "completed"-style node
// so the UI can still show the historical fact.

import type { OrchestrationThreadActivity } from "@v3tools/contracts";

export type SubagentStatus = "running" | "completed" | "failed";

export interface SubagentUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
}

export interface SubagentNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly parentToolUseId: string | null;
  readonly agentType: string | null;
  readonly label: string;
  readonly prompt: string | null;
  readonly model: string | null;
  readonly status: SubagentStatus;
  readonly failureReason: "error" | "stopped" | "timeout" | "aborted" | null;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly summary: string | null;
  readonly lastToolName: string | null;
  readonly toolCount: number;
  readonly elapsedSeconds: number;
  readonly usage: SubagentUsage;
  readonly result: string | null;
  readonly errorMessage: string | null;
  readonly children: ReadonlyArray<SubagentNode>;
}

interface MutableNode {
  id: string;
  parentId: string | null;
  parentToolUseId: string | null;
  agentType: string | null;
  label: string;
  prompt: string | null;
  model: string | null;
  status: SubagentStatus;
  failureReason: "error" | "stopped" | "timeout" | "aborted" | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  summary: string | null;
  lastToolName: string | null;
  toolCount: number;
  elapsedSeconds: number;
  usage: SubagentUsage;
  result: string | null;
  errorMessage: string | null;
  children: MutableNode[];
}

const EMPTY_USAGE: SubagentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
};

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
};

const readUsage = (value: unknown): SubagentUsage | null => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const result: SubagentUsage = {
    inputTokens: readNumber(record.input_tokens) ?? readNumber(record.inputTokens) ?? 0,
    outputTokens: readNumber(record.output_tokens) ?? readNumber(record.outputTokens) ?? 0,
    cacheCreationInputTokens:
      readNumber(record.cache_creation_input_tokens) ??
      readNumber(record.cacheCreationInputTokens) ??
      0,
    cacheReadInputTokens:
      readNumber(record.cache_read_input_tokens) ?? readNumber(record.cacheReadInputTokens) ?? 0,
  };
  return result.inputTokens === 0 &&
    result.outputTokens === 0 &&
    result.cacheCreationInputTokens === 0 &&
    result.cacheReadInputTokens === 0
    ? null
    : result;
};

const readFailureReason = (value: unknown): "error" | "stopped" | "timeout" | "aborted" | null => {
  if (value === "error" || value === "stopped" || value === "timeout" || value === "aborted") {
    return value;
  }
  return null;
};

const makeLabel = (subagentId: string, agentType: string | null, label: string | null): string => {
  if (label !== null) return label;
  if (agentType !== null) return agentType;
  // Final fallback: a short slice of the id so the UI never renders an
  // empty title cell. Long ids get truncated to stay readable.
  return subagentId.length > 16 ? `${subagentId.slice(0, 13)}…` : subagentId;
};

const freezeTree = (node: MutableNode): SubagentNode => ({
  ...node,
  children: node.children.map(freezeTree),
});

interface DerivationState {
  readonly byId: Map<string, MutableNode>;
  readonly orphanEvents: Array<{ readonly activity: OrchestrationThreadActivity }>;
}

const emptyState = (): DerivationState => ({
  byId: new Map(),
  orphanEvents: [],
});

// Handle subagent.started: insert or refresh the node.
const handleStarted = (
  state: DerivationState,
  activity: OrchestrationThreadActivity,
  payload: Record<string, unknown>,
): void => {
  const id = readString(payload.subagentId);
  if (id === null) return;
  const parentId = readString(payload.parentSubagentId);
  const parentToolUseId = readString(payload.parentToolUseId);
  const agentType = readString(payload.agentType);
  const label = readString(payload.label);
  const prompt = typeof payload.prompt === "string" ? payload.prompt : null;
  const model = readString(payload.model);

  const existing = state.byId.get(id);
  if (existing !== undefined) {
    existing.parentId = parentId ?? existing.parentId;
    existing.parentToolUseId = parentToolUseId ?? existing.parentToolUseId;
    existing.agentType = agentType ?? existing.agentType;
    existing.label = makeLabel(id, agentType ?? existing.agentType, label ?? existing.label);
    existing.prompt = prompt ?? existing.prompt;
    existing.model = model ?? existing.model;
    existing.updatedAt = activity.createdAt;
    return;
  }
  state.byId.set(id, {
    id,
    parentId,
    parentToolUseId,
    agentType,
    label: makeLabel(id, agentType, label),
    prompt,
    model,
    status: "running",
    failureReason: null,
    startedAt: activity.createdAt,
    updatedAt: activity.createdAt,
    completedAt: null,
    summary: null,
    lastToolName: null,
    toolCount: 0,
    elapsedSeconds: 0,
    usage: EMPTY_USAGE,
    result: null,
    errorMessage: null,
    children: [],
  });
};

const handleProgress = (
  state: DerivationState,
  activity: OrchestrationThreadActivity,
  payload: Record<string, unknown>,
): void => {
  const id = readString(payload.subagentId);
  if (id === null) return;
  const node = state.byId.get(id);
  if (node === undefined) {
    state.orphanEvents.push({ activity });
    return;
  }
  const summary = readString(payload.summary);
  const lastToolName = readString(payload.lastToolName);
  const toolCount = readNumber(payload.toolCount);
  const elapsedSeconds = readNumber(payload.elapsedSeconds);
  const usage = readUsage(payload.usage);

  if (summary !== null) node.summary = summary;
  if (lastToolName !== null) node.lastToolName = lastToolName;
  if (toolCount !== null) node.toolCount = Math.max(node.toolCount, Math.floor(toolCount));
  if (elapsedSeconds !== null) node.elapsedSeconds = Math.max(node.elapsedSeconds, elapsedSeconds);
  if (usage !== null) node.usage = usage;
  node.updatedAt = activity.createdAt;
};

const handleCompletion = (
  state: DerivationState,
  activity: OrchestrationThreadActivity,
  payload: Record<string, unknown>,
  kind: "completed" | "failed",
): void => {
  const id = readString(payload.subagentId);
  if (id === null) return;
  let node = state.byId.get(id);
  if (node === undefined) {
    // Best-effort recovery for out-of-order streams: synthesise a
    // running node then transition it so the UI still shows the fact
    // that a subagent finished, even when we missed the "started".
    node = {
      id,
      parentId: null,
      parentToolUseId: null,
      agentType: null,
      label: makeLabel(id, null, null),
      prompt: null,
      model: null,
      status: "running",
      failureReason: null,
      startedAt: activity.createdAt,
      updatedAt: activity.createdAt,
      completedAt: null,
      summary: null,
      lastToolName: null,
      toolCount: 0,
      elapsedSeconds: 0,
      usage: EMPTY_USAGE,
      result: null,
      errorMessage: null,
      children: [],
    };
    state.byId.set(id, node);
  }
  const summary = readString(payload.summary);
  const toolCount = readNumber(payload.toolCount);
  const elapsedSeconds = readNumber(payload.elapsedSeconds);
  const usage = readUsage(payload.usage);

  if (summary !== null) node.summary = summary;
  if (toolCount !== null) node.toolCount = Math.max(node.toolCount, Math.floor(toolCount));
  if (elapsedSeconds !== null) node.elapsedSeconds = Math.max(node.elapsedSeconds, elapsedSeconds);
  if (usage !== null) node.usage = usage;

  node.completedAt = activity.createdAt;
  node.updatedAt = activity.createdAt;
  if (kind === "completed") {
    node.status = "completed";
    node.result = typeof payload.result === "string" ? payload.result : node.result;
  } else {
    node.status = "failed";
    node.failureReason = readFailureReason(payload.reason) ?? "error";
    const errorMessage = readString(payload.errorMessage);
    if (errorMessage !== null) node.errorMessage = errorMessage;
  }
};

const extractPayload = (activity: OrchestrationThreadActivity): Record<string, unknown> | null => {
  if (typeof activity.payload !== "object" || activity.payload === null) return null;
  return activity.payload as Record<string, unknown>;
};

export const deriveSubagentTree = (
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyArray<SubagentNode> => {
  const state = emptyState();

  for (const activity of activities) {
    const payload = extractPayload(activity);
    if (payload === null) continue;
    switch (activity.kind) {
      case "subagent.started":
        handleStarted(state, activity, payload);
        break;
      case "subagent.progress":
        handleProgress(state, activity, payload);
        break;
      case "subagent.completed":
        handleCompletion(state, activity, payload, "completed");
        break;
      case "subagent.failed":
        handleCompletion(state, activity, payload, "failed");
        break;
      default:
        break;
    }
  }

  // Attach children to parents. The parentId lookup is resilient: if
  // a parent never existed (broken stream), treat the node as a root.
  const roots: MutableNode[] = [];
  for (const node of state.byId.values()) {
    if (node.parentId !== null) {
      const parent = state.byId.get(node.parentId);
      if (parent !== undefined) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  const walk = (node: MutableNode): void => {
    node.children.sort(compareNodes);
    for (const child of node.children) walk(child);
  };
  roots.sort(compareNodes);
  for (const root of roots) walk(root);

  return roots.map(freezeTree);
};

// Deterministic order: startedAt ascending, id ascending as tie-break.
const compareNodes = (a: MutableNode, b: MutableNode): number => {
  if (a.startedAt < b.startedAt) return -1;
  if (a.startedAt > b.startedAt) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

// Flatten the forest so `AgentsTab` can render a flat list with
// indent levels. Tail-recursive, depth-first, parent-before-children.
export interface FlatSubagentEntry {
  readonly node: SubagentNode;
  readonly depth: number;
}

export const flattenSubagentTree = (
  roots: ReadonlyArray<SubagentNode>,
): ReadonlyArray<FlatSubagentEntry> => {
  const out: FlatSubagentEntry[] = [];
  const visit = (node: SubagentNode, depth: number): void => {
    out.push({ node, depth });
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return out;
};

export interface SubagentAggregate {
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
  readonly totalToolCount: number;
  readonly totalElapsedSeconds: number;
  readonly totalUsage: SubagentUsage;
}

export const aggregateSubagents = (roots: ReadonlyArray<SubagentNode>): SubagentAggregate => {
  let running = 0;
  let completed = 0;
  let failed = 0;
  let totalToolCount = 0;
  let totalElapsedSeconds = 0;
  const totalUsage: SubagentUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
  const walk = (node: SubagentNode): void => {
    switch (node.status) {
      case "running":
        running += 1;
        break;
      case "completed":
        completed += 1;
        break;
      case "failed":
        failed += 1;
        break;
    }
    totalToolCount += node.toolCount;
    totalElapsedSeconds += node.elapsedSeconds;
    const mutableUsage = totalUsage as {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    };
    mutableUsage.inputTokens += node.usage.inputTokens;
    mutableUsage.outputTokens += node.usage.outputTokens;
    mutableUsage.cacheCreationInputTokens += node.usage.cacheCreationInputTokens;
    mutableUsage.cacheReadInputTokens += node.usage.cacheReadInputTokens;
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return {
    running,
    completed,
    failed,
    totalToolCount,
    totalElapsedSeconds,
    totalUsage,
  };
};
