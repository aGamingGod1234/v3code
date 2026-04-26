// V3 Phase 2d — server-node setup wizard route.
//
// Rendered at `/setup`. The wizard guides an operator from "V3 Code is
// installed on a single machine" to "this machine hosts a server node
// the operator's other devices can connect to." Every step calls
// Electron IPC through `window.desktopBridge.v3Wizard.*` — the wizard
// is desktop-only in P2d; a future P7 web-cloud-mode browser flow will
// reuse the same state machine but swap the IPC for server endpoints.
//
// All of the complex logic (state, TOML shape, readiness) is pure and
// lives in `../v3/setup/state.ts` + `tomlBuilder.ts`. This file owns
// React state + layout only.

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLinkIcon, LoaderIcon, ShieldCheckIcon, XIcon, PencilIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  initialV3SetupWizardState,
  isAuthReady,
  isExposureReady,
  isPreflightReady,
  reduceV3SetupWizard,
  type V3SetupWizardStep,
} from "../v3/setup/state";
import { buildServerNodeConfigToml } from "../v3/setup/tomlBuilder";
import { resolveDeviceId } from "../v3/auth/deviceId";
import { writePendingDrivePublish } from "../v3/auth/drivePublishState";

export const Route = createFileRoute("/setup")({
  component: V3SetupWizardPage,
});

const STEP_ORDER: ReadonlyArray<V3SetupWizardStep> = [
  "overview",
  "preflight",
  "exposure",
  "data-dir",
  "auth",
  "review",
  "done",
];

const STEP_TITLES: Record<V3SetupWizardStep, string> = {
  overview: "Overview",
  preflight: "Pre-flight checks",
  exposure: "Public URL",
  "data-dir": "Data directory",
  auth: "Authentication",
  review: "Review",
  done: "Finished",
};

function V3SetupWizardPage() {
  const [state, dispatch] = useReducer(reduceV3SetupWizard, initialV3SetupWizardState);
  const bridge = typeof window === "undefined" ? null : (window.desktopBridge ?? null);
  const hasWizardBridge = bridge?.v3Wizard !== undefined;

  useEffect(() => {
    if (!hasWizardBridge) return;
    if (state.preflight.paths !== "unchecked") return;
    void bridge!.v3Wizard.probePaths().then((paths) => {
      dispatch({ _tag: "preflight-paths", value: paths });
      if (state.dataDirectory.length === 0) {
        dispatch({ _tag: "set-data-directory", path: paths.defaultDataDirectory });
      }
    });
  }, [bridge, hasWizardBridge, state.preflight.paths, state.dataDirectory.length]);

  if (!hasWizardBridge) {
    return <BrowserNotSupportedScreen />;
  }

  const stepIndex = STEP_ORDER.indexOf(state.step);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col gap-6 p-6 text-foreground">
      <header className="space-y-3 border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Set up server node</h1>
            <p className="text-sm text-muted-foreground">
              Step {stepIndex + 1} of {STEP_ORDER.length} — {STEP_TITLES[state.step]}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Exit setup"
            title="Exit setup — your progress is not saved"
            onClick={() => {
              if (
                state.step === "done" ||
                window.confirm("Exit setup? Progress on this wizard is not saved.")
              ) {
                window.location.href = "/";
              }
            }}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <ol
          aria-label="Setup progress"
          className="flex items-center gap-1.5"
          data-tour-id="setup-progress"
        >
          {STEP_ORDER.map((step, index) => {
            const isCurrent = index === stepIndex;
            const isComplete = index < stepIndex;
            return (
              <li
                key={step}
                aria-current={isCurrent ? "step" : undefined}
                title={STEP_TITLES[step]}
                className={
                  isCurrent
                    ? "h-1.5 w-6 rounded-full bg-foreground"
                    : isComplete
                      ? "h-1.5 w-3 rounded-full bg-foreground/60"
                      : "h-1.5 w-3 rounded-full bg-muted-foreground/20"
                }
              />
            );
          })}
        </ol>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-5">
        {state.step === "overview" && <OverviewScreen dispatch={dispatch} />}
        {state.step === "preflight" && (
          <PreflightScreen state={state} dispatch={dispatch} bridge={bridge!.v3Wizard} />
        )}
        {state.step === "exposure" && <ExposureScreen state={state} dispatch={dispatch} />}
        {state.step === "data-dir" && (
          <DataDirectoryScreen state={state} dispatch={dispatch} bridge={bridge!.v3Wizard} />
        )}
        {state.step === "auth" && (
          <AuthScreen state={state} dispatch={dispatch} bridge={bridge!.v3Wizard} />
        )}
        {state.step === "review" && (
          <ReviewScreen state={state} dispatch={dispatch} bridge={bridge!.v3Wizard} />
        )}
        {state.step === "done" && <DoneScreen state={state} />}
      </main>
    </div>
  );
}

function BrowserNotSupportedScreen() {
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldCheckIcon className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Desktop-only flow</h1>
      <p className="text-sm text-muted-foreground">
        The server-node setup wizard writes config files on the machine that hosts V3 and needs
        Electron's main process. Open the V3 desktop app and navigate to <code>/setup</code> to
        continue.
      </p>
    </div>
  );
}

function StepNav(props: {
  readonly canContinue: boolean;
  readonly onBack?: () => void;
  readonly onContinue?: () => void;
  readonly continueLabel?: string;
  readonly busy?: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-2">
      {props.onBack ? (
        <Button variant="outline" onClick={props.onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {props.onContinue ? (
        <Button disabled={!props.canContinue || props.busy === true} onClick={props.onContinue}>
          {props.busy ? <LoaderIcon className="mr-2 size-4 animate-spin" /> : null}
          {props.continueLabel ?? "Continue"}
        </Button>
      ) : null}
    </div>
  );
}

type WizardDispatch = React.Dispatch<Parameters<typeof reduceV3SetupWizard>[1]>;
type WizardBridge = NonNullable<Window["desktopBridge"]>["v3Wizard"];

function OverviewScreen({ dispatch }: { dispatch: WizardDispatch }) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">This machine becomes your V3 server node.</h2>
      <p className="text-sm text-muted-foreground">
        Once it's set up, your other devices connect to this machine to share chats, sync state, and
        keep one source of truth. Your current V3 install keeps working as a client — only a small
        separate server process changes behaviour.
      </p>
      <p className="text-sm text-muted-foreground">
        This wizard takes about five minutes. It checks prerequisites, captures a public URL and
        sign-in details, then writes <code>~/.v3-code-server/config.toml</code>. You can re-run it
        any time from Settings → General.
      </p>
      <Alert>
        <AlertTitle>Before you begin</AlertTitle>
        <AlertDescription>
          Install Docker Desktop (or Docker Engine on Linux) and keep port 8080 free. If you plan to
          expose the server over the internet via Cloudflare Tunnel, also install{" "}
          <code>cloudflared</code> first — the wizard will check for it.
        </AlertDescription>
      </Alert>
      <StepNav
        canContinue
        onContinue={() => dispatch({ _tag: "go-to", step: "preflight" })}
        continueLabel="Start pre-flight checks"
      />
    </section>
  );
}

function PreflightRow({
  label,
  value,
  onRun,
}: {
  readonly label: string;
  readonly value: string;
  readonly onRun?: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{value}</div>
      </div>
      {onRun ? (
        <Button variant="ghost" size="sm" onClick={onRun}>
          Run check
        </Button>
      ) : null}
    </div>
  );
}

function PreflightScreen({
  state,
  dispatch,
  bridge,
}: {
  readonly state: ReturnType<typeof reduceV3SetupWizard>;
  readonly dispatch: WizardDispatch;
  readonly bridge: WizardBridge;
}) {
  const docker = state.preflight.docker;
  const port = state.preflight.port;
  const cloudflared = state.preflight.cloudflared;
  const paths = state.preflight.paths;
  const ready = isPreflightReady(state);

  const blockingReason = useMemo(() => {
    const reasons: string[] = [];
    if (docker === "unchecked") reasons.push("Docker hasn't been checked yet.");
    else if (docker.status !== "ok")
      reasons.push(`Docker: ${docker.message ?? docker.status}.`);
    if (port === "unchecked") reasons.push(`Port ${state.exposure.bindPort} hasn't been checked yet.`);
    else if (!port.available)
      reasons.push(`Port ${port.port}: ${port.message ?? "in use"}.`);
    if (paths === "unchecked") reasons.push("Config paths still resolving…");
    return reasons;
  }, [docker, port, paths, state.exposure.bindPort]);

  const runDocker = useCallback(() => {
    void bridge.probeDocker().then((result) => {
      dispatch({ _tag: "preflight-docker", value: result });
    });
  }, [bridge, dispatch]);

  const runPort = useCallback(() => {
    void bridge.probePort(state.exposure.bindPort).then((result) => {
      dispatch({ _tag: "preflight-port", value: result });
    });
  }, [bridge, dispatch, state.exposure.bindPort]);

  const runCloudflared = useCallback(() => {
    void bridge.probeCloudflared().then((result) => {
      dispatch({ _tag: "preflight-cloudflared", value: result });
    });
  }, [bridge, dispatch]);

  const dockerLine =
    docker === "unchecked"
      ? "Unchecked"
      : docker.status === "ok"
        ? `Docker ${docker.version ?? "ok"}`
        : docker.status === "missing"
          ? "Not found on PATH"
          : `Error: ${docker.message ?? "unknown"}`;

  const portLine =
    port === "unchecked"
      ? "Unchecked"
      : port.available
        ? `Port ${port.port} is free`
        : `Port ${port.port}: ${port.message ?? "in use"}`;

  const cloudflaredLine =
    cloudflared === "unchecked"
      ? "Unchecked"
      : cloudflared.status === "ok"
        ? `cloudflared ${cloudflared.version ?? "ok"}`
        : "Not installed (install if using Cloudflare Tunnel)";

  const pathsLine =
    paths === "unchecked"
      ? "Resolving…"
      : `${paths.configPath}${paths.configExists ? " (exists — will be overwritten)" : ""}`;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Pre-flight checks</h2>
      <p className="text-sm text-muted-foreground">
        Verify the host meets V3's hard requirements (Docker + a free port) and, optionally, that
        cloudflared is available.
      </p>
      <div className="space-y-2">
        <PreflightRow label="Docker Engine" value={dockerLine} onRun={runDocker} />
        <PreflightRow label={`Port ${state.exposure.bindPort}`} value={portLine} onRun={runPort} />
        <PreflightRow
          label="cloudflared (optional)"
          value={cloudflaredLine}
          onRun={runCloudflared}
        />
        <PreflightRow label="Config path" value={pathsLine} />
      </div>
      {!ready && blockingReason.length > 0 ? (
        <Alert variant="warning">
          <AlertTitle>Can't continue yet</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {blockingReason.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <StepNav
        canContinue={ready}
        onBack={() => dispatch({ _tag: "go-to", step: "overview" })}
        onContinue={() => dispatch({ _tag: "go-to", step: "exposure" })}
      />
    </section>
  );
}

function ExposureScreen({
  state,
  dispatch,
}: {
  readonly state: ReturnType<typeof reduceV3SetupWizard>;
  readonly dispatch: WizardDispatch;
}) {
  const ready = isExposureReady(state);
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">How will your devices reach this server?</h2>
      <div className="space-y-2">
        {[
          { mode: "cloudflare-tunnel" as const, label: "Cloudflare Tunnel (recommended)" },
          { mode: "tailnet" as const, label: "Private Tailscale / Tailnet IP" },
          { mode: "manual" as const, label: "I'll expose this server myself" },
        ].map((option) => (
          <label
            key={option.mode}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
          >
            <input
              type="radio"
              name="exposure"
              checked={state.exposure.mode === option.mode}
              onChange={() => dispatch({ _tag: "set-exposure-mode", mode: option.mode })}
            />
            <span className="text-sm">{option.label}</span>
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="public-url">Public URL</Label>
        <Input
          id="public-url"
          placeholder="https://v3.agaminggod.com"
          value={state.exposure.publicUrl}
          onChange={(event) => dispatch({ _tag: "set-public-url", url: event.currentTarget.value })}
        />
        <p className="text-xs text-muted-foreground">
          For Tailnet mode this is optional — leave blank to derive from the Tailnet hostname.
        </p>
      </div>
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="bind-host">Bind host</Label>
          <Input
            id="bind-host"
            value={state.exposure.bindHost}
            onChange={(event) =>
              dispatch({ _tag: "set-bind-host", host: event.currentTarget.value })
            }
          />
        </div>
        <div className="w-32 space-y-2">
          <Label htmlFor="bind-port">Port</Label>
          <Input
            id="bind-port"
            type="number"
            min={1}
            max={65535}
            value={state.exposure.bindPort}
            onChange={(event) => {
              const parsed = Number.parseInt(event.currentTarget.value, 10);
              if (Number.isFinite(parsed)) dispatch({ _tag: "set-bind-port", port: parsed });
            }}
          />
        </div>
      </div>
      <StepNav
        canContinue={ready}
        onBack={() => dispatch({ _tag: "go-to", step: "preflight" })}
        onContinue={() => dispatch({ _tag: "go-to", step: "data-dir" })}
      />
    </section>
  );
}

function DataDirectoryScreen({
  state,
  dispatch,
  bridge,
}: {
  readonly state: ReturnType<typeof reduceV3SetupWizard>;
  readonly dispatch: WizardDispatch;
  readonly bridge: WizardBridge;
}) {
  const pickDir = useCallback(() => {
    void bridge.pickDataDirectory({ initialPath: state.dataDirectory || null }).then((selected) => {
      if (selected !== null) {
        dispatch({ _tag: "set-data-directory", path: selected });
      }
    });
  }, [bridge, dispatch, state.dataDirectory]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Where should V3 store server state?</h2>
      <p className="text-sm text-muted-foreground">
        This is where the server-node process keeps its Postgres volume, encrypted secrets, and
        logs. The wizard itself only writes <code>config.toml</code>; the Postgres data directory is
        created when you first start the server.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="data-dir">Data directory</Label>
          <Input
            id="data-dir"
            value={state.dataDirectory}
            onChange={(event) =>
              dispatch({ _tag: "set-data-directory", path: event.currentTarget.value })
            }
            placeholder="~/.v3-code-server"
          />
        </div>
        <Button variant="outline" onClick={pickDir}>
          Browse…
        </Button>
      </div>
      <StepNav
        canContinue={state.dataDirectory.trim().length > 0}
        onBack={() => dispatch({ _tag: "go-to", step: "exposure" })}
        onContinue={() => dispatch({ _tag: "go-to", step: "auth" })}
      />
    </section>
  );
}

function AuthScreen({
  state,
  dispatch,
  bridge,
}: {
  readonly state: ReturnType<typeof reduceV3SetupWizard>;
  readonly dispatch: WizardDispatch;
  readonly bridge: WizardBridge;
}) {
  const [generating, setGenerating] = useState(false);
  const regenerate = useCallback(() => {
    setGenerating(true);
    void bridge
      .generateEncryptionKey()
      .then((value) => {
        dispatch({ _tag: "set-encryption-key", value });
      })
      .finally(() => setGenerating(false));
  }, [bridge, dispatch]);

  useEffect(() => {
    if (state.database.encryptionKey.length === 0) {
      regenerate();
    }
  }, [regenerate, state.database.encryptionKey.length]);

  const ready = isAuthReady(state);
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Google sign-in + encryption</h2>
      <p className="text-sm text-muted-foreground">
        V3 authenticates clients via Google Sign-In. Enter the OAuth client id registered in the
        operator's Google Cloud Console project, plus the list of Google-account emails allowed to
        sign in.
      </p>
      <Alert>
        <AlertTitle>Why Google?</AlertTitle>
        <AlertDescription>
          Google Sign-In is the only built-in identity provider for the server node — it's used to
          gate who can pair a device against this server. The allow-list below is the single source
          of truth; anyone whose email isn't on it cannot sign in, even if they have the URL. You
          can edit this list later by hand-editing <code>~/.v3-code-server/config.toml</code>.
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label htmlFor="google-client-id">Google OAuth client id</Label>
        <Input
          id="google-client-id"
          value={state.auth.googleClientId}
          onChange={(event) =>
            dispatch({ _tag: "set-google-client-id", value: event.currentTarget.value })
          }
          placeholder="123456789-abcdef.apps.googleusercontent.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="authorized-emails">Authorized emails</Label>
        <Textarea
          id="authorized-emails"
          value={state.auth.authorizedEmails}
          onChange={(event) =>
            dispatch({ _tag: "set-authorized-emails", value: event.currentTarget.value })
          }
          placeholder="you@example.com, family@example.com"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">Comma-, newline-, or space-separated.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="encryption-key">Secret encryption key</Label>
        <Input
          id="encryption-key"
          value={state.database.encryptionKey}
          onChange={(event) =>
            dispatch({ _tag: "set-encryption-key", value: event.currentTarget.value })
          }
          placeholder="32-byte hex"
        />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={regenerate} disabled={generating}>
            {generating ? "Regenerating…" : "Regenerate"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Used by the server to encrypt GitHub + provider tokens at rest (AES-256-GCM).
          </p>
        </div>
      </div>
      <StepNav
        canContinue={ready}
        onBack={() => dispatch({ _tag: "go-to", step: "data-dir" })}
        onContinue={() => dispatch({ _tag: "go-to", step: "review" })}
      />
    </section>
  );
}

function ReviewScreen({
  state,
  dispatch,
  bridge,
}: {
  readonly state: ReturnType<typeof reduceV3SetupWizard>;
  readonly dispatch: WizardDispatch;
  readonly bridge: WizardBridge;
}) {
  const toml = useMemo(() => buildServerNodeConfigToml(state), [state]);
  const writeStatus = state.writeStatus;
  const writing = writeStatus._tag === "writing";

  const onConfirm = useCallback(async () => {
    dispatch({ _tag: "write-status", value: { _tag: "writing" } });
    try {
      const result = await bridge.writeServerNodeConfig({
        contentToml: toml,
        createDirectories: true,
      });
      dispatch({
        _tag: "write-status",
        value: { _tag: "written", path: result.path, bytesWritten: result.bytesWritten },
      });
      // Best-effort Drive App Data write so other devices auto-discover
      // this server URL on their next sign-in. Failures here never block
      // the wizard — the Drive client already log-and-ignores per P2c.
      await publishDriveSnapshot(state);
      dispatch({ _tag: "go-to", step: "done" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      dispatch({ _tag: "write-status", value: { _tag: "error", message } });
    }
  }, [bridge, dispatch, state, toml]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Review config before writing</h2>
      <p className="text-sm text-muted-foreground">
        The wizard will write this file to{" "}
        <code>
          {state.preflight.paths === "unchecked"
            ? "~/.v3-code-server/config.toml"
            : state.preflight.paths.configPath}
        </code>
        . Everything below is editable by hand later — nothing here is encrypted.
      </p>
      <p className="text-xs text-muted-foreground">
        Skim for typos in the public URL and authorized-emails list. The encryption key won't be
        printed back to you after this step, so save it somewhere safe if you want to migrate the
        server elsewhere.
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-muted-foreground">Edit:</span>
        <button
          type="button"
          onClick={() => dispatch({ _tag: "go-to", step: "exposure" })}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <PencilIcon className="size-3" /> Public URL
        </button>
        <button
          type="button"
          onClick={() => dispatch({ _tag: "go-to", step: "data-dir" })}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <PencilIcon className="size-3" /> Data directory
        </button>
        <button
          type="button"
          onClick={() => dispatch({ _tag: "go-to", step: "auth" })}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <PencilIcon className="size-3" /> Auth + encryption
        </button>
      </div>
      <pre
        aria-label="Generated config.toml"
        className="max-h-64 overflow-y-auto rounded-md border border-border bg-background p-3 text-xs"
      >
        {toml}
      </pre>
      {writeStatus._tag === "error" ? (
        <Alert variant="error">
          <AlertTitle>Could not write config.toml</AlertTitle>
          <AlertDescription>{writeStatus.message}</AlertDescription>
        </Alert>
      ) : null}
      <StepNav
        canContinue={!writing}
        busy={writing}
        onBack={() => dispatch({ _tag: "go-to", step: "auth" })}
        onContinue={() => void onConfirm()}
        continueLabel="Write config.toml"
      />
    </section>
  );
}

function DoneScreen({ state }: { readonly state: ReturnType<typeof reduceV3SetupWizard> }) {
  const write = state.writeStatus;
  const path = write._tag === "written" ? write.path : "~/.v3-code-server/config.toml";
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Server-node config written</h2>
      <p className="text-sm text-muted-foreground">
        V3 wrote <code>{path}</code>. To start using server-node mode with Postgres persistence:
      </p>
      <ol className="list-decimal space-y-1 pl-6 text-sm">
        <li>Quit the V3 desktop app.</li>
        <li>
          Start Postgres:{" "}
          <code>
            docker run -d --name v3-postgres -p 5432:5432 -e POSTGRES_PASSWORD=v3 postgres:16
          </code>
          .
        </li>
        <li>
          Launch V3 with <code>V3CODE_MODE=server-node</code> (or a <code>--mode server-node</code>{" "}
          flag in a future release). The desktop shell will reconnect to the server-node process as
          a local client.
        </li>
        <li>
          Sign in with Google on each of your other devices; they'll auto-discover this server via
          Drive App Data and connect.
        </li>
      </ol>
      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          Back to app
        </Button>
        <Button
          variant="ghost"
          onClick={() => window.open("https://github.com/aGamingGod1234/v3code", "_blank")}
        >
          <ExternalLinkIcon className="mr-1 size-3.5" />
          Docs
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Drive App Data side-effect: the wizard finishes by *queueing* this
// machine's server_url into localStorage. The actual Drive write runs
// on the next successful Google sign-in (inside driveAppData.ts), which
// has the access token this wizard never sees. That keeps wizard
// completion fast, keeps the Drive access-token surface narrow, and
// lets sign-in → discovery remain idempotent if the operator re-runs
// the wizard later.
// ---------------------------------------------------------------------------

async function publishDriveSnapshot(state: ReturnType<typeof reduceV3SetupWizard>): Promise<void> {
  writePendingDrivePublish({
    server_url: state.exposure.publicUrl || null,
    server_version_installed: "0.1.0",
    setup_at: new Date().toISOString(),
    device_id: resolveDeviceId(),
    device_name: "V3 server node",
  });
}
