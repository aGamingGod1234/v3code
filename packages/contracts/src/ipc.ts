import type {
  GitCheckoutInput,
  GitCheckoutResult,
  GitCreateBranchInput,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullRequestRefInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPullInput,
  GitPullResult,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitStatusInput,
  GitStatusResult,
  GitCreateBranchResult,
} from "./git.ts";
import type { FilesystemBrowseInput, FilesystemBrowseResult } from "./filesystem.ts";
import type {
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project.ts";
import type {
  ServerConfig,
  ServerProviderUpdatedPayload,
  ServerUpsertKeybindingResult,
} from "./server.ts";
import type {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal.ts";
import type { ServerUpsertKeybindingInput } from "./server.ts";
import type {
  ClientOrchestrationCommand,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetFullThreadDiffResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationShellStreamItem,
  OrchestrationSubscribeThreadInput,
  OrchestrationThreadStreamItem,
} from "./orchestration.ts";
import type { EnvironmentId } from "./baseSchemas.ts";
import { EditorId } from "./editor.ts";
import { ServerSettings, type ClientSettings, type ServerSettingsPatch } from "./settings.ts";

export interface ContextMenuItem<T extends string = string> {
  id: T;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  children?: readonly ContextMenuItem<T>[];
}

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type DesktopRuntimeArch = "arm64" | "x64" | "other";
export type DesktopTheme = "light" | "dark" | "system";
export type DesktopUpdateChannel = "latest" | "nightly";
export type DesktopAppStageLabel = "Alpha" | "Dev" | "Nightly";

export interface DesktopAppBranding {
  baseName: string;
  stageLabel: DesktopAppStageLabel;
  displayName: string;
}

export interface DesktopRuntimeInfo {
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
}

export interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  channel: DesktopUpdateChannel;
  currentVersion: string;
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: "check" | "download" | "install" | null;
  canRetry: boolean;
}

export interface DesktopUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
}

export interface DesktopUpdateCheckResult {
  checked: boolean;
  state: DesktopUpdateState;
}

export interface DesktopEnvironmentBootstrap {
  label: string;
  httpBaseUrl: string | null;
  wsBaseUrl: string | null;
  bootstrapToken?: string;
}

export interface PersistedSavedEnvironmentRecord {
  environmentId: EnvironmentId;
  label: string;
  wsBaseUrl: string;
  httpBaseUrl: string;
  createdAt: string;
  lastConnectedAt: string | null;
}

export type DesktopServerExposureMode = "local-only" | "network-accessible";

export interface DesktopServerExposureState {
  mode: DesktopServerExposureMode;
  endpointUrl: string | null;
  advertisedHost: string | null;
}

export interface PickFolderOptions {
  initialPath?: string | null;
}

// V3 (Phase 2d): shared shapes for the server-node setup wizard. The
// wizard runs as React routes inside `apps/web` but all privileged ops
// (Docker probe, port probe, file I/O, cloudflared detect) happen in
// Electron's main process and are reached via `DesktopBridge.v3Wizard*`.
// Each method returns a discriminated result so the renderer can render
// pre-flight check rows uniformly.
export type V3WizardProbeStatus = "ok" | "missing" | "error";

export interface V3WizardDockerProbeResult {
  readonly status: V3WizardProbeStatus;
  readonly version: string | null;
  readonly message: string | null;
}

export interface V3WizardPortProbeResult {
  readonly port: number;
  readonly available: boolean;
  readonly message: string | null;
}

export interface V3WizardCloudflaredProbeResult {
  readonly status: V3WizardProbeStatus;
  readonly version: string | null;
  readonly installDocsUrl: string;
}

export interface V3WizardPathsProbeResult {
  // The full resolved path the server-node config.toml would be written
  // to, taking `V3CODE_SERVER_CONFIG_PATH` override into account.
  readonly configPath: string;
  // True if a config.toml already exists at that path — lets the wizard
  // warn before overwriting.
  readonly configExists: boolean;
  // Default data directory suggestion (~/.v3-code-server on POSIX,
  // %USERPROFILE%\.v3-code-server on Windows).
  readonly defaultDataDirectory: string;
}

export interface V3WizardWriteConfigInput {
  // Full TOML document the wizard wants to persist. The main-process
  // handler writes exactly these bytes (plus a trailing newline if
  // missing) to the resolved `configPath`.
  readonly contentToml: string;
  // When `true`, create the target directory (recursive) before writing.
  readonly createDirectories: boolean;
}

export interface V3WizardWriteConfigResult {
  readonly path: string;
  readonly bytesWritten: number;
}

export interface DesktopBridge {
  getAppBranding: () => DesktopAppBranding | null;
  getLocalEnvironmentBootstrap: () => DesktopEnvironmentBootstrap | null;
  getClientSettings: () => Promise<ClientSettings | null>;
  setClientSettings: (settings: ClientSettings) => Promise<void>;
  getSavedEnvironmentRegistry: () => Promise<readonly PersistedSavedEnvironmentRecord[]>;
  setSavedEnvironmentRegistry: (
    records: readonly PersistedSavedEnvironmentRecord[],
  ) => Promise<void>;
  getSavedEnvironmentSecret: (environmentId: EnvironmentId) => Promise<string | null>;
  setSavedEnvironmentSecret: (environmentId: EnvironmentId, secret: string) => Promise<boolean>;
  removeSavedEnvironmentSecret: (environmentId: EnvironmentId) => Promise<void>;
  getServerExposureState: () => Promise<DesktopServerExposureState>;
  setServerExposureMode: (mode: DesktopServerExposureMode) => Promise<DesktopServerExposureState>;
  pickFolder: (options?: PickFolderOptions) => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
  setTheme: (theme: DesktopTheme) => Promise<void>;
  showContextMenu: <T extends string>(
    items: readonly ContextMenuItem<T>[],
    position?: { x: number; y: number },
  ) => Promise<T | null>;
  openExternal: (url: string) => Promise<boolean>;
  onMenuAction: (listener: (action: string) => void) => () => void;
  getUpdateState: () => Promise<DesktopUpdateState>;
  setUpdateChannel: (channel: DesktopUpdateChannel) => Promise<DesktopUpdateState>;
  checkForUpdate: () => Promise<DesktopUpdateCheckResult>;
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  installUpdate: () => Promise<DesktopUpdateActionResult>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
  // V3 (Phase 1d + 2c): drive Google sign-in via the system browser.
  // Resolves with the `id_token` (for /api/auth/google/bootstrap) and the
  // short-lived `access_token` (for the Drive App Data client in
  // `@v3tools/client-runtime`) returned by Google's token endpoint after
  // the user consents and the `v3://auth/google/callback` deep link fires.
  // The access token scope includes `drive.appdata` so the renderer can
  // read/write the `v3_config.json` discovery blob in the user's per-app
  // Drive folder. Rejects on cancellation, timeout, network failure, or
  // a misconfigured client.
  openV3GoogleSignIn: (input: {
    clientId: string;
  }) => Promise<{ idToken: string; accessToken: string }>;
  // V3 (Phase 2d): server-node setup wizard IPC. Grouped under a single
  // object so the renderer can pass the whole namespace around as a
  // dependency without the `DesktopBridge` surface exploding flat-list-
  // style. All methods resolve to discriminated results (see
  // V3Wizard*Result types above) rather than throwing — the wizard UI
  // renders every step as a pass/fail row.
  v3Wizard: {
    readonly probeDocker: () => Promise<V3WizardDockerProbeResult>;
    readonly probePort: (port: number) => Promise<V3WizardPortProbeResult>;
    readonly probeCloudflared: () => Promise<V3WizardCloudflaredProbeResult>;
    readonly probePaths: () => Promise<V3WizardPathsProbeResult>;
    readonly pickDataDirectory: (options?: PickFolderOptions) => Promise<string | null>;
    readonly writeServerNodeConfig: (
      input: V3WizardWriteConfigInput,
    ) => Promise<V3WizardWriteConfigResult>;
    readonly generateEncryptionKey: () => Promise<string>;
  };
}

/**
 * APIs bound to the local app shell, not to any particular backend environment.
 *
 * These capabilities describe the desktop/browser host that the user is
 * currently running: dialogs, editor/external-link opening, context menus, and
 * app-level settings/config access. They must not be used as a proxy for
 * "whatever environment the user is targeting", because in a multi-environment
 * world the local shell and a selected backend environment are distinct
 * concepts.
 */
export interface LocalApi {
  dialogs: {
    pickFolder: (options?: PickFolderOptions) => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
  };
  shell: {
    openInEditor: (cwd: string, editor: EditorId) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
  contextMenu: {
    show: <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
  persistence: {
    getClientSettings: () => Promise<ClientSettings | null>;
    setClientSettings: (settings: ClientSettings) => Promise<void>;
    getSavedEnvironmentRegistry: () => Promise<readonly PersistedSavedEnvironmentRecord[]>;
    setSavedEnvironmentRegistry: (
      records: readonly PersistedSavedEnvironmentRecord[],
    ) => Promise<void>;
    getSavedEnvironmentSecret: (environmentId: EnvironmentId) => Promise<string | null>;
    setSavedEnvironmentSecret: (environmentId: EnvironmentId, secret: string) => Promise<boolean>;
    removeSavedEnvironmentSecret: (environmentId: EnvironmentId) => Promise<void>;
  };
  server: {
    getConfig: () => Promise<ServerConfig>;
    refreshProviders: () => Promise<ServerProviderUpdatedPayload>;
    upsertKeybinding: (input: ServerUpsertKeybindingInput) => Promise<ServerUpsertKeybindingResult>;
    getSettings: () => Promise<ServerSettings>;
    updateSettings: (patch: ServerSettingsPatch) => Promise<ServerSettings>;
  };
}

/**
 * APIs bound to a specific backend environment connection.
 *
 * These operations must always be routed with explicit environment context.
 * They represent remote stateful capabilities such as orchestration, terminal,
 * project, and git operations. In multi-environment mode, each environment gets
 * its own instance of this surface, and callers should resolve it by
 * `environmentId` rather than reaching through the local desktop bridge.
 */
export interface EnvironmentApi {
  terminal: {
    open: (input: typeof TerminalOpenInput.Encoded) => Promise<TerminalSessionSnapshot>;
    write: (input: typeof TerminalWriteInput.Encoded) => Promise<void>;
    resize: (input: typeof TerminalResizeInput.Encoded) => Promise<void>;
    clear: (input: typeof TerminalClearInput.Encoded) => Promise<void>;
    restart: (input: typeof TerminalRestartInput.Encoded) => Promise<TerminalSessionSnapshot>;
    close: (input: typeof TerminalCloseInput.Encoded) => Promise<void>;
    onEvent: (callback: (event: TerminalEvent) => void) => () => void;
  };
  projects: {
    searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
    writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
  };
  filesystem: {
    browse: (input: FilesystemBrowseInput) => Promise<FilesystemBrowseResult>;
  };
  git: {
    listBranches: (input: GitListBranchesInput) => Promise<GitListBranchesResult>;
    createWorktree: (input: GitCreateWorktreeInput) => Promise<GitCreateWorktreeResult>;
    removeWorktree: (input: GitRemoveWorktreeInput) => Promise<void>;
    createBranch: (input: GitCreateBranchInput) => Promise<GitCreateBranchResult>;
    checkout: (input: GitCheckoutInput) => Promise<GitCheckoutResult>;
    init: (input: GitInitInput) => Promise<void>;
    resolvePullRequest: (input: GitPullRequestRefInput) => Promise<GitResolvePullRequestResult>;
    preparePullRequestThread: (
      input: GitPreparePullRequestThreadInput,
    ) => Promise<GitPreparePullRequestThreadResult>;
    pull: (input: GitPullInput) => Promise<GitPullResult>;
    refreshStatus: (input: GitStatusInput) => Promise<GitStatusResult>;
    onStatus: (
      input: GitStatusInput,
      callback: (status: GitStatusResult) => void,
      options?: {
        onResubscribe?: () => void;
      },
    ) => () => void;
  };
  orchestration: {
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{ sequence: number }>;
    getTurnDiff: (input: OrchestrationGetTurnDiffInput) => Promise<OrchestrationGetTurnDiffResult>;
    getFullThreadDiff: (
      input: OrchestrationGetFullThreadDiffInput,
    ) => Promise<OrchestrationGetFullThreadDiffResult>;
    subscribeShell: (
      callback: (event: OrchestrationShellStreamItem) => void,
      options?: {
        onResubscribe?: () => void;
      },
    ) => () => void;
    subscribeThread: (
      input: OrchestrationSubscribeThreadInput,
      callback: (event: OrchestrationThreadStreamItem) => void,
      options?: {
        onResubscribe?: () => void;
      },
    ) => () => void;
  };
}
