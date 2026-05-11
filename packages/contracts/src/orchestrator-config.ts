import { Effect, Schema } from "effect";

export const OrchestratorProvider = Schema.Literals(["claude_code", "codex", "gemini", "custom"]);
export type OrchestratorProvider = typeof OrchestratorProvider.Type;

export const SessionMode = Schema.Literals(["single", "orchestrated"]);
export type SessionMode = typeof SessionMode.Type;
export const DEFAULT_SESSION_MODE: SessionMode = "single";

export const OrchestratorRoleConfig = Schema.Struct({
  provider: OrchestratorProvider,
  model: Schema.String,
  effort: Schema.String,
  mode: Schema.String,
});
export type OrchestratorRoleConfig = typeof OrchestratorRoleConfig.Type;

export const SubAgentDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  role: Schema.String,
  provider: OrchestratorProvider,
  model: Schema.String,
  effort: Schema.String,
  mode: Schema.String,
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  description: Schema.optionalKey(Schema.String),
});
export type SubAgentDefinition = typeof SubAgentDefinition.Type;

export const PlanningBudget = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("auto") }),
  Schema.Struct({ kind: Schema.Literal("fixed"), turns: Schema.Number }),
]);
export type PlanningBudget = typeof PlanningBudget.Type;

export const OrchestratorConfig = Schema.Struct({
  roles: Schema.Struct({
    orchestrator: OrchestratorRoleConfig,
    implementation: OrchestratorRoleConfig,
    assistant: OrchestratorRoleConfig,
  }),
  subAgents: Schema.Array(SubAgentDefinition).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  planning: Schema.Struct({
    codexFastMode: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
    budget: PlanningBudget.pipe(
      Schema.withDecodingDefault(Effect.succeed({ kind: "auto" as const })),
    ),
  }).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type OrchestratorConfig = typeof OrchestratorConfig.Type;

const emptyRoleConfig: OrchestratorRoleConfig = {
  provider: "custom",
  model: "",
  effort: "",
  mode: "",
};

export const EMPTY_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  roles: {
    orchestrator: emptyRoleConfig,
    implementation: emptyRoleConfig,
    assistant: emptyRoleConfig,
  },
  subAgents: [],
  planning: {
    codexFastMode: false,
    budget: { kind: "auto" },
  },
};
