// V3 setup wizard state + reducer.
//
// Small, pure state machine so the wizard routes can be rehydrated on
// refresh (step + form values go through `sessionStorage`) and the
// reducer is unit-testable without React. Each step captures one
// cohesive piece of config; the final `review` step renders the full
// state and calls into the Electron IPC surface to persist it.

import type { V3WizardPathsProbeResult } from "@v3tools/contracts";

export type V3SetupWizardStep =
  | "overview"
  | "preflight"
  | "exposure"
  | "data-dir"
  | "auth"
  | "review"
  | "done";

export type V3SetupExposureMode = "cloudflare-tunnel" | "tailnet" | "manual";

export const STEP_TITLES: Record<V3SetupWizardStep, string> = {
  overview: "Overview",
  preflight: "System checks",
  exposure: "Public URL",
  "data-dir": "Data directory",
  auth: "Authentication",
  review: "Review",
  done: "Finished",
};

export interface V3SetupWizardState {
  readonly step: V3SetupWizardStep;
  // Pre-flight probe results — null while unchecked, captured structs
  // once the renderer runs a probe.
  readonly preflight: {
    readonly docker:
      | "unchecked"
      | {
          readonly status: "ok" | "missing" | "error";
          readonly version: string | null;
          readonly message: string | null;
        };
    readonly port:
      | "unchecked"
      | { readonly port: number; readonly available: boolean; readonly message: string | null };
    readonly cloudflared:
      | "unchecked"
      | { readonly status: "ok" | "missing" | "error"; readonly version: string | null };
    readonly paths: "unchecked" | V3WizardPathsProbeResult;
  };
  readonly exposure: {
    readonly mode: V3SetupExposureMode;
    readonly publicUrl: string;
    readonly bindHost: string;
    readonly bindPort: number;
  };
  readonly dataDirectory: string;
  readonly auth: {
    readonly googleClientId: string;
    // Raw textarea value so we don't lose whitespace mid-edit; the TOML
    // builder parses + trims on write.
    readonly authorizedEmails: string;
  };
  readonly database: {
    // Default points at the docker-compose `postgres` service the wizard
    // success screen instructs the operator to start; the bundled
    // password is a placeholder they're expected to override.
    readonly postgresUrl: string;
    readonly encryptionKey: string;
  };
  readonly writeStatus:
    | { readonly _tag: "idle" }
    | { readonly _tag: "writing" }
    | { readonly _tag: "written"; readonly path: string; readonly bytesWritten: number }
    | { readonly _tag: "error"; readonly message: string };
}

export const initialV3SetupWizardState: V3SetupWizardState = {
  step: "overview",
  preflight: {
    docker: "unchecked",
    port: "unchecked",
    cloudflared: "unchecked",
    paths: "unchecked",
  },
  exposure: {
    mode: "cloudflare-tunnel",
    publicUrl: "",
    bindHost: "0.0.0.0",
    bindPort: 8080,
  },
  dataDirectory: "",
  auth: {
    googleClientId: "",
    authorizedEmails: "",
  },
  database: {
    postgresUrl: "postgres://v3:v3@localhost:5432/v3",
    encryptionKey: "",
  },
  writeStatus: { _tag: "idle" },
};

export type V3SetupWizardAction =
  | { readonly _tag: "go-to"; readonly step: V3SetupWizardStep }
  | { readonly _tag: "preflight-docker"; readonly value: V3SetupWizardState["preflight"]["docker"] }
  | { readonly _tag: "preflight-port"; readonly value: V3SetupWizardState["preflight"]["port"] }
  | {
      readonly _tag: "preflight-cloudflared";
      readonly value: V3SetupWizardState["preflight"]["cloudflared"];
    }
  | { readonly _tag: "preflight-paths"; readonly value: V3SetupWizardState["preflight"]["paths"] }
  | { readonly _tag: "set-exposure-mode"; readonly mode: V3SetupExposureMode }
  | { readonly _tag: "set-public-url"; readonly url: string }
  | { readonly _tag: "set-bind-host"; readonly host: string }
  | { readonly _tag: "set-bind-port"; readonly port: number }
  | { readonly _tag: "set-data-directory"; readonly path: string }
  | { readonly _tag: "set-google-client-id"; readonly value: string }
  | { readonly _tag: "set-authorized-emails"; readonly value: string }
  | { readonly _tag: "set-postgres-url"; readonly value: string }
  | { readonly _tag: "set-encryption-key"; readonly value: string }
  | { readonly _tag: "write-status"; readonly value: V3SetupWizardState["writeStatus"] }
  | { readonly _tag: "reset" };

export const reduceV3SetupWizard = (
  state: V3SetupWizardState,
  action: V3SetupWizardAction,
): V3SetupWizardState => {
  switch (action._tag) {
    case "go-to":
      return { ...state, step: action.step };
    case "preflight-docker":
      return { ...state, preflight: { ...state.preflight, docker: action.value } };
    case "preflight-port":
      return { ...state, preflight: { ...state.preflight, port: action.value } };
    case "preflight-cloudflared":
      return { ...state, preflight: { ...state.preflight, cloudflared: action.value } };
    case "preflight-paths":
      return { ...state, preflight: { ...state.preflight, paths: action.value } };
    case "set-exposure-mode":
      return { ...state, exposure: { ...state.exposure, mode: action.mode } };
    case "set-public-url":
      return { ...state, exposure: { ...state.exposure, publicUrl: action.url } };
    case "set-bind-host":
      return { ...state, exposure: { ...state.exposure, bindHost: action.host } };
    case "set-bind-port":
      return { ...state, exposure: { ...state.exposure, bindPort: action.port } };
    case "set-data-directory":
      return { ...state, dataDirectory: action.path };
    case "set-google-client-id":
      return { ...state, auth: { ...state.auth, googleClientId: action.value } };
    case "set-authorized-emails":
      return { ...state, auth: { ...state.auth, authorizedEmails: action.value } };
    case "set-postgres-url":
      return { ...state, database: { ...state.database, postgresUrl: action.value } };
    case "set-encryption-key":
      return { ...state, database: { ...state.database, encryptionKey: action.value } };
    case "write-status":
      return { ...state, writeStatus: action.value };
    case "reset":
      return initialV3SetupWizardState;
  }
};

// Wizard-readiness helpers used by the step-gating buttons. Keeping
// them here keeps the rules testable alongside the reducer.

export const isPreflightReady = (state: V3SetupWizardState): boolean => {
  const { docker, port, paths } = state.preflight;
  if (docker === "unchecked" || port === "unchecked" || paths === "unchecked") return false;
  // Docker is strictly required per spec §10.1. Cloudflared is optional;
  // the user can decline the tunnel path.
  return docker.status === "ok" && port.available === true;
};

export const isExposureReady = (state: V3SetupWizardState): boolean => {
  if (state.exposure.mode === "cloudflare-tunnel" || state.exposure.mode === "manual") {
    return state.exposure.publicUrl.trim().length > 0;
  }
  // Tailnet-only: the public URL is derived from the Tailnet machine
  // name, so a hand-entered URL is optional. bindPort is always required.
  return state.exposure.bindPort > 0;
};

export const isAuthReady = (state: V3SetupWizardState): boolean => {
  const emails = state.auth.authorizedEmails
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return (
    state.auth.googleClientId.trim().length > 0 &&
    emails.length > 0 &&
    state.database.encryptionKey.trim().length >= 32
  );
};
