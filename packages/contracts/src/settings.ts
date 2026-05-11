import { Effect } from "effect";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";
import {
  ClaudeModelOptions,
  CodexReasoningEffort,
  CodexModelOptions,
  CursorModelOptions,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER,
  OpenCodeModelOptions,
} from "./model.ts";
import { ModelSelection, ProviderKind } from "./orchestration.ts";
import { EMPTY_ORCHESTRATOR_CONFIG, OrchestratorConfig } from "./orchestrator-config.ts";

// ── Client Settings (local-only) ───────────────────────────────

export const TimestampFormat = Schema.Literals(["locale", "12-hour", "24-hour"]);
export type TimestampFormat = typeof TimestampFormat.Type;
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";

export const SidebarProjectSortOrder = Schema.Literals(["updated_at", "created_at", "manual"]);
export type SidebarProjectSortOrder = typeof SidebarProjectSortOrder.Type;
export const DEFAULT_SIDEBAR_PROJECT_SORT_ORDER: SidebarProjectSortOrder = "updated_at";

export const SidebarThreadSortOrder = Schema.Literals(["updated_at", "created_at"]);
export type SidebarThreadSortOrder = typeof SidebarThreadSortOrder.Type;
export const DEFAULT_SIDEBAR_THREAD_SORT_ORDER: SidebarThreadSortOrder = "updated_at";

export const SidebarProjectGroupingMode = Schema.Literals([
  "repository",
  "repository_path",
  "separate",
]);
export type SidebarProjectGroupingMode = typeof SidebarProjectGroupingMode.Type;
export const DEFAULT_SIDEBAR_PROJECT_GROUPING_MODE: SidebarProjectGroupingMode = "repository";

// Phase 1 Codex-style settings.
export const WorkMode = Schema.Literals(["coding", "everyday"]);
export type WorkMode = typeof WorkMode.Type;

export const PermissionMode = Schema.Literals(["default", "auto-review", "full-access"]);
export type PermissionMode = typeof PermissionMode.Type;

export const FullAccessGrant = Schema.Struct({
  cwd: Schema.String,
  grantedAt: Schema.String,
});
export type FullAccessGrant = typeof FullAccessGrant.Type;

export const PermissionsSettings = Schema.Struct({
  mode: PermissionMode.pipe(Schema.withDecodingDefault(Effect.succeed("default" as const))),
  // Per-project remembered Full Access grants — keyed by ProjectId, with the
  // cwd at grant time so renamed/relocated projects get re-prompted.
  // NOTE: legacy `Record<ProjectId, true>` values from earlier versions are
  // discarded at parse time (Effect Schema rejects them as the wrong shape),
  // matching the security-fail-closed migration plan.
  fullAccessRememberByProject: Schema.Record(TrimmedNonEmptyString, FullAccessGrant).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
});
export type PermissionsSettings = typeof PermissionsSettings.Type;

export const FollowUpBehavior = Schema.Literals(["queue", "steer"]);
export type FollowUpBehavior = typeof FollowUpBehavior.Type;

export const CodeReviewStyle = Schema.Literals(["inline", "detached"]);
export type CodeReviewStyle = typeof CodeReviewStyle.Type;

export const InterfaceProfile = Schema.Literals(["v3", "codex", "claude", "cursor", "windsurf"]);
export type InterfaceProfile = typeof InterfaceProfile.Type;

export const RuntimeApprovalPolicy = Schema.Literals([
  "untrusted",
  "on-request",
  "on-failure",
  "never",
]);
export type RuntimeApprovalPolicy = typeof RuntimeApprovalPolicy.Type;

export const RuntimeSandboxMode = Schema.Literals([
  "read-only",
  "workspace-write",
  "danger-full-access",
]);
export type RuntimeSandboxMode = typeof RuntimeSandboxMode.Type;

export const CodexRuntimeSettings = Schema.Struct({
  reasoningEffort: CodexReasoningEffort.pipe(
    Schema.withDecodingDefault(Effect.succeed("medium" as const)),
  ),
  approvalPolicy: RuntimeApprovalPolicy.pipe(
    Schema.withDecodingDefault(Effect.succeed("on-request" as const)),
  ),
  sandboxMode: RuntimeSandboxMode.pipe(
    Schema.withDecodingDefault(Effect.succeed("workspace-write" as const)),
  ),
  workspaceWriteNetwork: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  planModeByDefault: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  webSearchEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
});
export type CodexRuntimeSettings = typeof CodexRuntimeSettings.Type;

export const McpServerTransport = Schema.Literals(["stdio", "sse", "http"]);
export type McpServerTransport = typeof McpServerTransport.Type;

export const McpServerSettings = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  transport: McpServerTransport.pipe(Schema.withDecodingDefault(Effect.succeed("stdio" as const))),
  command: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  args: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  url: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  env: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  disabledTools: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  timeoutSeconds: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(30))),
});
export type McpServerSettings = typeof McpServerSettings.Type;

export const WorktreeSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  baseDirectory: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  defaultBaseBranch: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed("main"))),
  maxPerRepository: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(4))),
  cleanupStaleOnStartup: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
});
export type WorktreeSettings = typeof WorktreeSettings.Type;

export const BrowserUseSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  mode: Schema.Literals(["headed", "headless"]).pipe(
    Schema.withDecodingDefault(Effect.succeed("headed" as const)),
  ),
  isolatedProfile: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  requirePerRunApproval: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  domainAllowlist: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  cookiePolicy: Schema.Literals(["isolated", "reuse-current"]).pipe(
    Schema.withDecodingDefault(Effect.succeed("isolated" as const)),
  ),
});
export type BrowserUseSettings = typeof BrowserUseSettings.Type;

export const DictationSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  hotkey: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed("Ctrl+Shift+D"))),
  provider: Schema.Literals(["web-speech", "server"]).pipe(
    Schema.withDecodingDefault(Effect.succeed("web-speech" as const)),
  ),
});
export type DictationSettings = typeof DictationSettings.Type;

export const UsageSettings = Schema.Struct({
  retentionDays: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(90))),
  exportCsvIncludesPrompts: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  detailedModelSpecsEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  pricingTableUrl: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
});
export type UsageSettings = typeof UsageSettings.Type;

export const AutoFallbackTrigger = Schema.Literal("usage-limit");
export type AutoFallbackTrigger = typeof AutoFallbackTrigger.Type;

export const AutoFallbackSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  targetProviderKind: ProviderKind.pipe(
    Schema.withDecodingDefault(Effect.succeed("codex" as const)),
  ),
  targetModel: TrimmedString.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_MODEL_BY_PROVIDER.codex)),
  ),
  trigger: AutoFallbackTrigger.pipe(Schema.withDecodingDefault(Effect.succeed("usage-limit"))),
});
export type AutoFallbackSettings = typeof AutoFallbackSettings.Type;

export const CustomPrompt = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedString.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transformOrFail({
        decode: (value) => Effect.succeed(value.replace(/[\r\n]+/g, " ").slice(0, 60)),
        encode: (value) => Effect.succeed(value),
      }),
    ),
  ),
  content: Schema.String.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transformOrFail({
        decode: (value) => Effect.succeed(value.slice(0, 4000)),
        encode: (value) => Effect.succeed(value),
      }),
    ),
  ),
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
});
export type CustomPrompt = typeof CustomPrompt.Type;

export const GitHubAppSettings = Schema.Struct({
  deviceFlowClientId: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
});
export type GitHubAppSettings = typeof GitHubAppSettings.Type;

export const ClientSettingsSchema = Schema.Struct({
  confirmThreadArchive: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  confirmThreadDelete: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  diffWordWrap: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  sidebarProjectGroupingMode: SidebarProjectGroupingMode.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SIDEBAR_PROJECT_GROUPING_MODE)),
  ),
  sidebarProjectGroupingOverrides: Schema.Record(
    TrimmedNonEmptyString,
    SidebarProjectGroupingMode,
  ).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  sidebarProjectSortOrder: SidebarProjectSortOrder.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SIDEBAR_PROJECT_SORT_ORDER)),
  ),
  sidebarThreadSortOrder: SidebarThreadSortOrder.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SIDEBAR_THREAD_SORT_ORDER)),
  ),
  timestampFormat: TimestampFormat.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_TIMESTAMP_FORMAT)),
  ),
  v3ConfigureServerBannerDismissedPermanently: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false)),
  ),
  v3ServerNodeUrlOverride: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),

  // Phase 1 Codex-style configuration. Only fields wired to runtime behaviour
  // are persisted — unwired toggles must NOT live here.
  interfaceProfile: InterfaceProfile.pipe(
    Schema.withDecodingDefault(Effect.succeed("v3" as const)),
  ),
  codexRuntime: CodexRuntimeSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  mcpServers: Schema.Array(McpServerSettings).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  worktrees: WorktreeSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  browserUse: BrowserUseSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  dictation: DictationSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  usage: UsageSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  autoFallback: AutoFallbackSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  workMode: WorkMode.pipe(Schema.withDecodingDefault(Effect.succeed("coding" as const))),
  permissions: PermissionsSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  requireCtrlEnter: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  followUpBehavior: FollowUpBehavior.pipe(
    Schema.withDecodingDefault(Effect.succeed("queue" as const)),
  ),
  codeReviewStyle: CodeReviewStyle.pipe(
    Schema.withDecodingDefault(Effect.succeed("inline" as const)),
  ),
  agentEnvironment: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  terminalShell: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  customPrompts: Schema.Array(CustomPrompt).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  gitHub: GitHubAppSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type ClientSettings = typeof ClientSettingsSchema.Type;

export const DEFAULT_CLIENT_SETTINGS: ClientSettings = Schema.decodeSync(ClientSettingsSchema)({});

// ── Server Settings (server-authoritative) ────────────────────

export const ThreadEnvMode = Schema.Literals(["local", "worktree"]);
export type ThreadEnvMode = typeof ThreadEnvMode.Type;

const makeBinaryPathSetting = (fallback: string) =>
  TrimmedString.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transformOrFail({
        decode: (value) => Effect.succeed(value || fallback),
        encode: (value) => Effect.succeed(value),
      }),
    ),
    Schema.withDecodingDefault(Effect.succeed(fallback)),
  );

export const CodexSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  binaryPath: makeBinaryPathSetting("codex"),
  homePath: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type CodexSettings = typeof CodexSettings.Type;

export const ClaudeSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  binaryPath: makeBinaryPathSetting("claude"),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  launchArgs: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
});
export type ClaudeSettings = typeof ClaudeSettings.Type;

export const CursorSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  binaryPath: makeBinaryPathSetting("agent"),
  apiEndpoint: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type CursorSettings = typeof CursorSettings.Type;
export const OpenCodeSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  binaryPath: makeBinaryPathSetting("opencode"),
  serverUrl: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  serverPassword: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type OpenCodeSettings = typeof OpenCodeSettings.Type;

export const ObservabilitySettings = Schema.Struct({
  otlpTracesUrl: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  otlpMetricsUrl: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
});
export type ObservabilitySettings = typeof ObservabilitySettings.Type;

export const ServerSettings = Schema.Struct({
  enableAssistantStreaming: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  defaultThreadEnvMode: ThreadEnvMode.pipe(
    Schema.withDecodingDefault(Effect.succeed("local" as const satisfies ThreadEnvMode)),
  ),
  addProjectBaseDirectory: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  textGenerationModelSelection: ModelSelection.pipe(
    Schema.withDecodingDefault(
      Effect.succeed({
        provider: "codex" as const,
        model: DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER.codex,
      }),
    ),
  ),

  // Provider specific settings
  providers: Schema.Struct({
    codex: CodexSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
    claudeAgent: ClaudeSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
    cursor: CursorSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
    opencode: OpenCodeSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  }).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  orchestratorConfig: OrchestratorConfig.pipe(
    Schema.withDecodingDefault(Effect.succeed(EMPTY_ORCHESTRATOR_CONFIG)),
  ),
  observability: ObservabilitySettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type ServerSettings = typeof ServerSettings.Type;

export const DEFAULT_SERVER_SETTINGS: ServerSettings = Schema.decodeSync(ServerSettings)({});

export class ServerSettingsError extends Schema.TaggedErrorClass<ServerSettingsError>()(
  "ServerSettingsError",
  {
    settingsPath: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Server settings error at ${this.settingsPath}: ${this.detail}`;
  }
}

// ── Unified type ─────────────────────────────────────────────────────

export type UnifiedSettings = ServerSettings & ClientSettings;
export const DEFAULT_UNIFIED_SETTINGS: UnifiedSettings = {
  ...DEFAULT_SERVER_SETTINGS,
  ...DEFAULT_CLIENT_SETTINGS,
};

// ── Server Settings Patch (replace with a Schema.deepPartial if available) ──────────────────────────────────────────

const CodexModelOptionsPatch = Schema.Struct({
  reasoningEffort: Schema.optionalKey(CodexModelOptions.fields.reasoningEffort),
  fastMode: Schema.optionalKey(CodexModelOptions.fields.fastMode),
});

const ClaudeModelOptionsPatch = Schema.Struct({
  thinking: Schema.optionalKey(ClaudeModelOptions.fields.thinking),
  effort: Schema.optionalKey(ClaudeModelOptions.fields.effort),
  fastMode: Schema.optionalKey(ClaudeModelOptions.fields.fastMode),
  contextWindow: Schema.optionalKey(ClaudeModelOptions.fields.contextWindow),
});

const CursorModelOptionsPatch = Schema.Struct({
  reasoning: Schema.optionalKey(CursorModelOptions.fields.reasoning),
  fastMode: Schema.optionalKey(CursorModelOptions.fields.fastMode),
  thinking: Schema.optionalKey(CursorModelOptions.fields.thinking),
  contextWindow: Schema.optionalKey(CursorModelOptions.fields.contextWindow),
});

const OpenCodeModelOptionsPatch = Schema.Struct({
  variant: Schema.optionalKey(OpenCodeModelOptions.fields.variant),
  agent: Schema.optionalKey(OpenCodeModelOptions.fields.agent),
});

const ModelSelectionPatch = Schema.Union([
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("codex")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(CodexModelOptionsPatch),
  }),
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("claudeAgent")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(ClaudeModelOptionsPatch),
  }),
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("cursor")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(CursorModelOptionsPatch),
  }),
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("opencode")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(OpenCodeModelOptionsPatch),
  }),
]);

const CodexSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  homePath: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

const ClaudeSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
  launchArgs: Schema.optionalKey(Schema.String),
});

const CursorSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  apiEndpoint: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

const OpenCodeSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  serverUrl: Schema.optionalKey(Schema.String),
  serverPassword: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

export const ServerSettingsPatch = Schema.Struct({
  enableAssistantStreaming: Schema.optionalKey(Schema.Boolean),
  defaultThreadEnvMode: Schema.optionalKey(ThreadEnvMode),
  addProjectBaseDirectory: Schema.optionalKey(Schema.String),
  textGenerationModelSelection: Schema.optionalKey(ModelSelectionPatch),
  observability: Schema.optionalKey(
    Schema.Struct({
      otlpTracesUrl: Schema.optionalKey(Schema.String),
      otlpMetricsUrl: Schema.optionalKey(Schema.String),
    }),
  ),
  providers: Schema.optionalKey(
    Schema.Struct({
      codex: Schema.optionalKey(CodexSettingsPatch),
      claudeAgent: Schema.optionalKey(ClaudeSettingsPatch),
      cursor: Schema.optionalKey(CursorSettingsPatch),
      opencode: Schema.optionalKey(OpenCodeSettingsPatch),
    }),
  ),
  orchestratorConfig: Schema.optionalKey(OrchestratorConfig),
});
export type ServerSettingsPatch = typeof ServerSettingsPatch.Type;
