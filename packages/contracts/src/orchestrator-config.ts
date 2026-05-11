import { Effect, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

export const OrchestratorProvider = Schema.Literals(["claude_code", "codex", "gemini", "custom"]);
export type OrchestratorProvider = typeof OrchestratorProvider.Type;

export const OrchestratorRole = Schema.Literals(["orchestrator", "implementation", "assistant"]);
export type OrchestratorRole = typeof OrchestratorRole.Type;

export const OrchestratorRoleConfig = Schema.Struct({
  provider: OrchestratorProvider,
  model: TrimmedNonEmptyString,
  effort: Schema.NullOr(TrimmedString),
  mode: Schema.NullOr(TrimmedString),
});
export type OrchestratorRoleConfig = typeof OrchestratorRoleConfig.Type;

export const SubAgentDefinition = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  provider: OrchestratorProvider,
  model: TrimmedNonEmptyString,
  effort: Schema.NullOr(TrimmedString),
  mode: Schema.NullOr(TrimmedString),
  description: TrimmedString,
  prompt: Schema.String,
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
});
export type SubAgentDefinition = typeof SubAgentDefinition.Type;

export const OrchestratorPlanningBudget = Schema.Union([Schema.Literal("auto"), PositiveInt]);
export type OrchestratorPlanningBudget = typeof OrchestratorPlanningBudget.Type;

export const OrchestratorConfig = Schema.Struct({
  orchestrator: OrchestratorRoleConfig,
  implementation: OrchestratorRoleConfig,
  assistant: OrchestratorRoleConfig,
  subAgents: Schema.Array(SubAgentDefinition).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  fastMode: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  planningBudget: OrchestratorPlanningBudget.pipe(
    Schema.withDecodingDefault(Effect.succeed("auto" as const)),
  ),
});
export type OrchestratorConfig = typeof OrchestratorConfig.Type;

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  orchestrator: {
    provider: "codex",
    model: "gpt-5.4",
    effort: "high",
    mode: "fast",
  },
  implementation: {
    provider: "codex",
    model: "gpt-5.5",
    effort: "xhigh",
    mode: "default",
  },
  assistant: {
    provider: "claude_code",
    model: "claude-sonnet-4-6",
    effort: "high",
    mode: null,
  },
  subAgents: [],
  fastMode: false,
  planningBudget: "auto",
};
