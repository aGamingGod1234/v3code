// Configuration settings panel - Codex-style.
//
// Phase 1 rule: only render controls that are wired to runtime behaviour.
// Speed, Language, and Popout-window-hotkey are deferred until they're
// backed by something real; they're not surfaced here.

import {
  DEFAULT_MODEL_BY_PROVIDER,
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type SpawnDiscoveryOptions,
} from "@v3tools/contracts";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";

const WORK_MODES: ReadonlyArray<{ id: "coding" | "everyday"; label: string; description: string }> =
  [
    {
      id: "coding",
      label: "For coding",
      description: "More technical responses. The agent assumes engineering context.",
    },
    {
      id: "everyday",
      label: "For everyday work",
      description: "Plain-language replies. Same power, less jargon.",
    },
  ];

const PERMISSIONS_OPTIONS: ReadonlyArray<{
  id: "default" | "auto-review" | "full-access";
  label: string;
  description: string;
}> = [
  {
    id: "default",
    label: "Default permissions",
    description:
      "The agent can read and edit files in its workspace. It asks before doing anything else.",
  },
  {
    id: "auto-review",
    label: "Auto-review",
    description:
      "The agent reviews its own requests for additional access. Auto-review can make mistakes.",
  },
  {
    id: "full-access",
    label: "Full access",
    description:
      "The agent can edit any file and run network commands without your approval. Each run still requires per-run confirmation.",
  },
];

const FOLLOW_UP_OPTIONS: ReadonlyArray<{
  id: "queue" | "steer";
  label: string;
  description: string;
}> = [
  { id: "queue", label: "Queue", description: "Hold follow-ups until the current run finishes." },
  { id: "steer", label: "Steer", description: "Send follow-ups directly to the running agent." },
];

const CODE_REVIEW_OPTIONS: ReadonlyArray<{
  id: "inline" | "detached";
  label: string;
  description: string;
}> = [
  { id: "inline", label: "Inline", description: "Run /review in the current chat." },
  { id: "detached", label: "Detached", description: "Open /review in a separate review chat." },
];

const FALLBACK_PROVIDER_OPTIONS: ReadonlyArray<ProviderKind> = [
  "codex",
  "claudeAgent",
  "cursor",
  "opencode",
];

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs/5 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

const SEGMENT_BUTTON_CLASS = "min-w-32 justify-center";

export function ConfigurationSettings() {
  const settings = useSettings((s) => ({
    codexRuntime: s.codexRuntime,
    workMode: s.workMode,
    permissions: s.permissions,
    requireCtrlEnter: s.requireCtrlEnter,
    followUpBehavior: s.followUpBehavior,
    codeReviewStyle: s.codeReviewStyle,
    agentEnvironment: s.agentEnvironment,
    terminalShell: s.terminalShell,
    autoFallback: s.autoFallback,
  }));
  const { updateSettings } = useUpdateSettings();
  const [discovery, setDiscovery] = useState<SpawnDiscoveryOptions | null>(null);

  useEffect(() => {
    const bridge = window.desktopBridge?.spawnDiscovery;
    if (!bridge) return;
    let cancelled = false;
    void bridge.getOptions().then((result) => {
      if (cancelled) return;
      setDiscovery(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fullAccessGrantCount = useMemo(
    () => Object.keys(settings.permissions.fullAccessRememberByProject ?? {}).length,
    [settings.permissions],
  );

  return (
    <div className="space-y-8">
      <Section title="Work mode" description="Tunes the system prompt prefix sent to the agent.">
        <div className="grid gap-2 sm:grid-cols-2">
          {WORK_MODES.map((option) => (
            <RadioCard
              key={option.id}
              active={settings.workMode === option.id}
              label={option.label}
              description={option.description}
              onSelect={() => updateSettings({ workMode: option.id })}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Codex runtime"
        description="Default approval, sandbox, planning, and tool behavior used when starting new Codex-backed runs."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Reasoning effort</span>
            <select
              value={settings.codexRuntime.reasoningEffort}
              onChange={(event) =>
                updateSettings({
                  codexRuntime: {
                    ...settings.codexRuntime,
                    reasoningEffort: event.currentTarget
                      .value as typeof settings.codexRuntime.reasoningEffort,
                  },
                })
              }
              className={FIELD_CLASS}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">Extra high</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Approval policy</span>
            <select
              value={settings.codexRuntime.approvalPolicy}
              onChange={(event) =>
                updateSettings({
                  codexRuntime: {
                    ...settings.codexRuntime,
                    approvalPolicy: event.currentTarget
                      .value as typeof settings.codexRuntime.approvalPolicy,
                  },
                })
              }
              className={FIELD_CLASS}
            >
              <option value="untrusted">Untrusted</option>
              <option value="on-request">On request</option>
              <option value="on-failure">On failure</option>
              <option value="never">Never ask</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Sandbox mode</span>
            <select
              value={settings.codexRuntime.sandboxMode}
              onChange={(event) =>
                updateSettings({
                  codexRuntime: {
                    ...settings.codexRuntime,
                    sandboxMode: event.currentTarget
                      .value as typeof settings.codexRuntime.sandboxMode,
                  },
                })
              }
              className={FIELD_CLASS}
            >
              <option value="read-only">Read only</option>
              <option value="workspace-write">Workspace write</option>
              <option value="danger-full-access">Full access</option>
            </select>
          </label>
          <SettingsToggle
            checked={settings.codexRuntime.workspaceWriteNetwork}
            label="Allow network in workspace-write mode"
            onChange={(checked) =>
              updateSettings({
                codexRuntime: {
                  ...settings.codexRuntime,
                  workspaceWriteNetwork: checked,
                },
              })
            }
          />
          <SettingsToggle
            checked={settings.codexRuntime.planModeByDefault}
            label="Start new complex tasks in plan mode"
            onChange={(checked) =>
              updateSettings({
                codexRuntime: {
                  ...settings.codexRuntime,
                  planModeByDefault: checked,
                },
              })
            }
          />
          <SettingsToggle
            checked={settings.codexRuntime.webSearchEnabled}
            className="sm:col-span-2"
            label="Allow web search when current information is required"
            onChange={(checked) =>
              updateSettings({
                codexRuntime: {
                  ...settings.codexRuntime,
                  webSearchEnabled: checked,
                },
              })
            }
          />
        </div>
      </Section>

      <Section
        title="Permissions"
        description="Per-run confirmation still applies for Full Access. Settings here is the default; each run can be allowed-once or remembered for the workspace."
      >
        <div className="space-y-2">
          {PERMISSIONS_OPTIONS.map((option) => (
            <RadioCard
              key={option.id}
              active={settings.permissions.mode === option.id}
              label={option.label}
              description={option.description}
              onSelect={() => {
                updateSettings({
                  permissions: {
                    ...settings.permissions,
                    mode: option.id,
                  },
                });
              }}
            />
          ))}
        </div>
        {fullAccessGrantCount > 0 ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-card/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {fullAccessGrantCount} workspace
              {fullAccessGrantCount === 1 ? "" : "s"} have remembered Full Access.
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                updateSettings({
                  permissions: {
                    ...settings.permissions,
                    fullAccessRememberByProject: {},
                  },
                })
              }
            >
              Forget remembered workspaces
            </Button>
          </div>
        ) : null}
      </Section>

      <Section
        title="Agent environment"
        description="Where the agent runs. Only environments this device can actually spawn are listed."
      >
        {!discovery ? (
          <div className="text-xs text-muted-foreground">Discovering...</div>
        ) : discovery.agentEnvironments.length === 0 ? (
          <div className="text-xs text-muted-foreground">No spawnable environments detected.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {discovery.agentEnvironments.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={settings.agentEnvironment === option.id ? "default" : "outline"}
                className={SEGMENT_BUTTON_CLASS}
                onClick={() => updateSettings({ agentEnvironment: option.id })}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Integrated terminal shell"
        description="Only shells found on PATH are listed. Restart any open terminals to pick up the change."
      >
        {!discovery ? (
          <div className="text-xs text-muted-foreground">Discovering...</div>
        ) : discovery.terminalShells.length === 0 ? (
          <div className="text-xs text-muted-foreground">No supported shells found on PATH.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {discovery.terminalShells.map((shell) => (
              <Button
                key={shell.id}
                type="button"
                size="sm"
                variant={settings.terminalShell === shell.id ? "default" : "outline"}
                className={SEGMENT_BUTTON_CLASS}
                onClick={() => updateSettings({ terminalShell: shell.id })}
                title={shell.path}
              >
                {shell.label}
              </Button>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Follow-up behaviour"
        description="What happens when you press Enter while the agent is still running."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {FOLLOW_UP_OPTIONS.map((option) => (
            <RadioCard
              key={option.id}
              active={settings.followUpBehavior === option.id}
              label={option.label}
              description={option.description}
              onSelect={() => updateSettings({ followUpBehavior: option.id })}
            />
          ))}
        </div>
      </Section>

      <Section title="Code review" description="What /review does when run from the chat composer.">
        <div className="grid gap-2 sm:grid-cols-2">
          {CODE_REVIEW_OPTIONS.map((option) => (
            <RadioCard
              key={option.id}
              active={settings.codeReviewStyle === option.id}
              label={option.label}
              description={option.description}
              onSelect={() => updateSettings({ codeReviewStyle: option.id })}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Auto fallback"
        description="Continue only when a provider reports an explicit usage or rate-limit stop."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsToggle
            checked={settings.autoFallback.enabled}
            label="Continue after usage limits"
            description="Cancellations, auth failures, and generic errors still stop."
            onChange={(checked) =>
              updateSettings({
                autoFallback: {
                  ...settings.autoFallback,
                  enabled: checked,
                },
              })
            }
          />
          <div className="min-h-20 rounded-lg border border-border bg-card/30 p-3 text-xs">
            <div className="font-medium text-foreground">Trigger</div>
            <div className="mt-1 text-muted-foreground">Usage-limit only</div>
          </div>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Fallback provider</span>
            <select
              value={settings.autoFallback.targetProviderKind}
              onChange={(event) => {
                const targetProviderKind = event.currentTarget.value as ProviderKind;
                updateSettings({
                  autoFallback: {
                    ...settings.autoFallback,
                    targetProviderKind,
                    targetModel: DEFAULT_MODEL_BY_PROVIDER[targetProviderKind],
                  },
                });
              }}
              className={FIELD_CLASS}
            >
              {FALLBACK_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider} value={provider}>
                  {PROVIDER_DISPLAY_NAMES[provider]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Fallback model</span>
            <input
              value={settings.autoFallback.targetModel}
              onChange={(event) =>
                updateSettings({
                  autoFallback: {
                    ...settings.autoFallback,
                    targetModel: event.currentTarget.value,
                  },
                })
              }
              placeholder={DEFAULT_MODEL_BY_PROVIDER[settings.autoFallback.targetProviderKind]}
              className={FIELD_CLASS}
            />
          </label>
        </div>
      </Section>

      <Section title="Composer" description="Tweaks for how the chat composer handles input.">
        <SettingsToggle
          checked={settings.requireCtrlEnter}
          label="Guard long prompt sends"
          description="Enter sends short single-line prompts. Ctrl+Enter or Cmd+Enter sends multiline and long prompts."
          onChange={(checked) => updateSettings({ requireCtrlEnter: checked })}
        >
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <KeyboardChip>Enter</KeyboardChip>
            <span className="text-muted-foreground">short prompts</span>
            <KeyboardChip>Ctrl</KeyboardChip>
            <span className="text-muted-foreground">+</span>
            <KeyboardChip>Enter</KeyboardChip>
            <span className="text-muted-foreground">long prompts</span>
            <KeyboardChip>Cmd</KeyboardChip>
            <span className="text-muted-foreground">+</span>
            <KeyboardChip>Enter</KeyboardChip>
          </div>
        </SettingsToggle>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SettingsToggle({
  checked,
  label,
  description,
  className,
  children,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly description?: string;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border border-border bg-card/30 p-3 text-sm transition-colors hover:border-border/70 ${
        className ?? ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{label}</span>
        {description ? (
          <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
        ) : null}
        {children}
      </span>
    </label>
  );
}

function KeyboardChip({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-9 items-center justify-center rounded-md border border-border bg-background px-2 font-mono text-[11px] font-medium text-foreground shadow-xs">
      {children}
    </kbd>
  );
}

function RadioCard({
  active,
  label,
  description,
  onSelect,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly description: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-24 flex-col gap-1 rounded-lg border-2 p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border bg-card/30 hover:border-border/70"
      }`}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
