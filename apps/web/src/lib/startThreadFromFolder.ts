import {
  DEFAULT_MODEL_BY_PROVIDER,
  type DeviceId,
  type EnvironmentId,
  type ModelSelection,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
  type ThreadId,
} from "@v3tools/contracts";

import { readEnvironmentApi } from "../environmentApi";
import { inferProjectTitleFromPath, normalizeProjectPathForComparison } from "./projectPaths";
import { newCommandId, newMessageId, newProjectId, newThreadId } from "./utils";
import type { Project } from "../types";
import type { UnifiedSettings } from "@v3tools/contracts/settings";
import {
  applyCodexRuntimeModelDefaults,
  interactionModeFromCodexSettings,
  runtimeModeFromCodexSettings,
} from "./codexRuntimeSettings";

const THREAD_TITLE_MAX_LENGTH = 80;

export interface FolderProjectRef {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly cwd: string;
}

export interface ResolveProjectFromFolderInput {
  readonly folderPath: string;
  readonly projects: readonly Project[];
  readonly primaryEnvironmentId: EnvironmentId | null;
}

export interface StartThreadFromFolderInput extends ResolveProjectFromFolderInput {
  readonly prompt: string;
  readonly hostDeviceId?: DeviceId | null;
  readonly settings: UnifiedSettings;
}

export interface StartThreadFromFolderResult extends FolderProjectRef {
  readonly threadId: ThreadId;
}

export async function resolveOrCreateProjectFromFolder(
  input: ResolveProjectFromFolderInput,
): Promise<FolderProjectRef> {
  const folderPath = input.folderPath.trim();
  if (folderPath.length === 0) {
    throw new Error("Pick a folder first.");
  }

  const folderKey = normalizeProjectPathForComparison(folderPath);
  const matchingProject = input.projects.find(
    (project) => normalizeProjectPathForComparison(project.cwd) === folderKey,
  );
  if (matchingProject) {
    return {
      environmentId: matchingProject.environmentId,
      projectId: matchingProject.id,
      cwd: matchingProject.cwd,
    };
  }

  if (!input.primaryEnvironmentId) {
    throw new Error("No local environment is connected.");
  }
  const api = readEnvironmentApi(input.primaryEnvironmentId);
  if (!api) {
    throw new Error("Environment API is unavailable.");
  }

  const projectId = newProjectId();
  await api.orchestration.dispatchCommand({
    type: "project.create",
    commandId: newCommandId(),
    projectId,
    title: inferProjectTitleFromPath(folderPath),
    workspaceRoot: folderPath,
    createWorkspaceRootIfMissing: true,
    defaultModelSelection: {
      provider: "codex",
      model: DEFAULT_MODEL_BY_PROVIDER.codex,
    },
    createdAt: new Date().toISOString(),
  });

  return { environmentId: input.primaryEnvironmentId, projectId, cwd: folderPath };
}

export async function startThreadFromFolder(
  input: StartThreadFromFolderInput,
): Promise<StartThreadFromFolderResult> {
  const prompt = input.prompt.trim();
  if (prompt.length === 0) {
    throw new Error("Enter a prompt first.");
  }

  const project = await resolveOrCreateProjectFromFolder(input);
  const api = readEnvironmentApi(project.environmentId);
  if (!api) {
    throw new Error("Environment API is unavailable.");
  }

  const threadId = newThreadId();
  const createdAt = new Date().toISOString();
  const title = prompt.slice(0, THREAD_TITLE_MAX_LENGTH) || "New thread";
  const modelSelection: ModelSelection = applyCodexRuntimeModelDefaults(
    {
      provider: "codex",
      model: DEFAULT_MODEL_BY_PROVIDER.codex,
    },
    input.settings,
  );
  const runtimeMode: RuntimeMode = runtimeModeFromCodexSettings(input.settings);
  const interactionMode: ProviderInteractionMode = interactionModeFromCodexSettings(input.settings);
  await api.orchestration.dispatchCommand({
    type: "thread.turn.start",
    commandId: newCommandId(),
    threadId,
    message: {
      messageId: newMessageId(),
      role: "user",
      text: prompt,
      attachments: [],
    },
    modelSelection,
    titleSeed: title,
    approvalPolicy: input.settings.codexRuntime.approvalPolicy,
    sandboxMode: input.settings.codexRuntime.sandboxMode,
    runtimeMode,
    interactionMode,
    bootstrap: {
      createThread: {
        projectId: project.projectId,
        title,
        ...(input.hostDeviceId !== undefined ? { hostDeviceId: input.hostDeviceId } : {}),
        modelSelection,
        runtimeMode,
        interactionMode,
        branch: null,
        worktreePath: null,
        createdAt,
      },
    },
    createdAt,
  });

  return { ...project, threadId };
}
