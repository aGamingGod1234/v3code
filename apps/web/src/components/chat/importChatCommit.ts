import type {
  EnvironmentId,
  MeshImportChatResult,
  ParsedChat,
  ParsedReferences,
  ProjectId,
  ThreadId,
} from "@v3tools/contracts";

import { normalizeProjectPathForComparison } from "../../lib/projectPaths";

export interface ImportCommitParsedSummary {
  readonly format: ParsedChat["format"];
  readonly title: ParsedChat["title"];
  readonly sourceProvider: ParsedChat["sourceProvider"];
  readonly sourceModel: ParsedChat["sourceModel"];
  readonly sourceWorkspaceRoot?: ParsedChat["sourceWorkspaceRoot"];
  readonly startedAt: ParsedChat["startedAt"];
  readonly references: ParsedReferences;
}

export interface ImportCommitItem {
  readonly id: string;
  readonly source: string;
  readonly parsed: ImportCommitParsedSummary;
}

export interface ImportProjectSummary {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly name: string;
  readonly cwd: string;
}

export interface ImportProjectPlanGroup {
  readonly workspaceKey: string;
  readonly path: string;
  readonly count: number;
  readonly existingName: string | null;
  readonly existingProjectId: ProjectId | null;
}

export interface ImportProjectPlan {
  readonly groups: ReadonlyArray<ImportProjectPlanGroup>;
  readonly missingWorkspaceItemIds: ReadonlyArray<string>;
}

export interface ImportResolvedProject {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly cwd: string;
}

export interface ImportChatCallInput {
  readonly item: ImportCommitItem;
  readonly parsed: ParsedChat;
  readonly targetThreadId: ThreadId;
  readonly targetProjectId: ProjectId;
}

export interface ImportCommitSuccess {
  readonly itemId: string;
  readonly source: string;
  readonly title: string;
  readonly projectKey: string;
  readonly result: MeshImportChatResult;
}

export interface ImportCommitFailure {
  readonly itemId: string;
  readonly source: string;
  readonly title: string;
  readonly message: string;
  readonly projectKey?: string;
}

export interface ImportCommitResult {
  readonly successes: ReadonlyArray<ImportCommitSuccess>;
  readonly failures: ReadonlyArray<ImportCommitFailure>;
  readonly resolvedProjectCount: number;
  readonly successProjectCount: number;
}

export interface ImportCommitProgress {
  readonly phase: "resolving-project" | "importing-chat";
  readonly completed: number;
  readonly total: number;
  readonly label: string;
}

export interface CommitChatImportsInput {
  readonly items: ReadonlyArray<ImportCommitItem>;
  readonly disabledSkillIds: ReadonlySet<string>;
  readonly disabledMcpServerIds: ReadonlySet<string>;
  readonly makeThreadId: () => ThreadId;
  readonly resolveProject: (folderPath: string) => Promise<ImportResolvedProject>;
  readonly loadParsedChat: (item: ImportCommitItem) => Promise<ParsedChat>;
  readonly importChat: (input: ImportChatCallInput) => Promise<MeshImportChatResult>;
  readonly onProgress?: (progress: ImportCommitProgress) => void;
}

export interface ImportCommitToastSummary {
  readonly type: "success" | "error" | "warning";
  readonly title: string;
  readonly description: string;
}

function titleForItem(item: ImportCommitItem): string {
  return item.parsed.title ?? item.source;
}

function workspacePathForItem(item: ImportCommitItem): string | null {
  const workspacePath = item.parsed.sourceWorkspaceRoot?.trim() ?? "";
  return workspacePath.length > 0 ? workspacePath : null;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function failedCount(count: number): string {
  return `${count} failed`;
}

function removeDisabledReferences(
  parsed: ParsedChat,
  disabledSkillIds: ReadonlySet<string>,
  disabledMcpServerIds: ReadonlySet<string>,
): ParsedChat {
  return {
    ...parsed,
    references: {
      ...parsed.references,
      skillIds: parsed.references.skillIds.filter((id) => !disabledSkillIds.has(id)),
      mcpServerIds: parsed.references.mcpServerIds.filter((id) => !disabledMcpServerIds.has(id)),
    },
  };
}

export function buildImportProjectPlan(input: {
  readonly items: ReadonlyArray<ImportCommitItem>;
  readonly projects: ReadonlyArray<ImportProjectSummary>;
}): ImportProjectPlan {
  const byPath = new Map<string, ImportProjectPlanGroup>();
  const missingWorkspaceItemIds: string[] = [];

  for (const item of input.items) {
    const sourceWorkspaceRoot = workspacePathForItem(item);
    if (!sourceWorkspaceRoot) {
      missingWorkspaceItemIds.push(item.id);
      continue;
    }

    const workspaceKey = normalizeProjectPathForComparison(sourceWorkspaceRoot);
    const existing = input.projects.find(
      (project) => normalizeProjectPathForComparison(project.cwd) === workspaceKey,
    );
    const current = byPath.get(workspaceKey);
    byPath.set(workspaceKey, {
      workspaceKey,
      path: current?.path ?? sourceWorkspaceRoot,
      count: (current?.count ?? 0) + 1,
      existingName: current?.existingName ?? existing?.name ?? null,
      existingProjectId: current?.existingProjectId ?? existing?.id ?? null,
    });
  }

  return {
    groups: [...byPath.values()],
    missingWorkspaceItemIds,
  };
}

export async function commitChatImports(
  input: CommitChatImportsInput,
): Promise<ImportCommitResult> {
  const projectByWorkspaceKey = new Map<string, ImportResolvedProject>();
  const successes: ImportCommitSuccess[] = [];
  const failures: ImportCommitFailure[] = [];
  const total = input.items.length;
  let completed = 0;

  for (const item of input.items) {
    const title = titleForItem(item);
    const workspacePath = workspacePathForItem(item);
    if (!workspacePath) {
      completed += 1;
      failures.push({
        itemId: item.id,
        source: item.source,
        title,
        message: "Transcript did not include a workspace path.",
      });
      input.onProgress?.({
        phase: "importing-chat",
        completed,
        total,
        label: title,
      });
      continue;
    }

    const workspaceKey = normalizeProjectPathForComparison(workspacePath);
    let project = projectByWorkspaceKey.get(workspaceKey);
    if (!project) {
      input.onProgress?.({
        phase: "resolving-project",
        completed,
        total,
        label: workspacePath,
      });
      try {
        project = await input.resolveProject(workspacePath);
        projectByWorkspaceKey.set(workspaceKey, project);
      } catch (cause) {
        completed += 1;
        failures.push({
          itemId: item.id,
          source: item.source,
          title,
          projectKey: workspaceKey,
          message: errorMessage(cause),
        });
        input.onProgress?.({
          phase: "importing-chat",
          completed,
          total,
          label: title,
        });
        continue;
      }
    }

    input.onProgress?.({
      phase: "importing-chat",
      completed,
      total,
      label: title,
    });

    try {
      const parsedChat = await input.loadParsedChat(item);
      const parsed = removeDisabledReferences(
        parsedChat,
        input.disabledSkillIds,
        input.disabledMcpServerIds,
      );
      const result = await input.importChat({
        item,
        parsed,
        targetThreadId: input.makeThreadId(),
        targetProjectId: project.projectId,
      });
      successes.push({
        itemId: item.id,
        source: item.source,
        title,
        projectKey: workspaceKey,
        result,
      });
    } catch (cause) {
      failures.push({
        itemId: item.id,
        source: item.source,
        title,
        projectKey: workspaceKey,
        message: errorMessage(cause),
      });
    } finally {
      completed += 1;
      input.onProgress?.({
        phase: "importing-chat",
        completed,
        total,
        label: title,
      });
    }
  }

  return {
    successes,
    failures,
    resolvedProjectCount: projectByWorkspaceKey.size,
    successProjectCount: new Set(successes.map((success) => success.projectKey)).size,
  };
}

export function summarizeImportCommitResult(result: ImportCommitResult): ImportCommitToastSummary {
  if (result.successes.length === 0) {
    const firstFailure = result.failures[0]?.message;
    return {
      type: "error",
      title: "Import failed",
      description: `No chats imported. ${failedCount(result.failures.length)}${
        firstFailure ? `: ${firstFailure}` : "."
      }`,
    };
  }

  if (result.failures.length > 0) {
    return {
      type: "warning",
      title: "Import partially completed",
      description: `${pluralize(result.successes.length, "chat")} imported into ${pluralize(
        result.successProjectCount,
        "project",
      )}. ${failedCount(result.failures.length)}.`,
    };
  }

  return {
    type: "success",
    title: result.successes.length === 1 ? "Chat imported" : "Chats imported",
    description: `${pluralize(result.successes.length, "chat")} imported into ${pluralize(
      result.successProjectCount,
      "project",
    )}.`,
  };
}
