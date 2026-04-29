// Configuration settings panel — Codex-style.
//
// Phase 1 rule: only render controls that are wired to runtime behaviour.
// Speed, Language, and Popout-window-hotkey are deferred until they're
// backed by something real; they're not surfaced here.

import { useEffect, useMemo, useState } from "react";

import { Button } from "../ui/button";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import type { SpawnDiscoveryOptions } from "@v3tools/contracts";

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

export function ConfigurationSettings() {
  const settings = useSettings((s) => ({
    workMode: s.workMode,
    permissions: s.permissions,
    requireCtrlEnter: s.requireCtrlEnter,
    followUpBehavior: s.followUpBehavior,
    codeReviewStyle: s.codeReviewStyle,
    agentEnvironment: s.agentEnvironment,
    terminalShell: s.terminalShell,
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
          <div className="text-xs text-muted-foreground">Discovering…</div>
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
          <div className="text-xs text-muted-foreground">Discovering…</div>
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

      <Section title="Composer" description="Tweaks for how the chat composer handles input.">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card/30 p-3 text-sm">
          <input
            type="checkbox"
            checked={settings.requireCtrlEnter}
            onChange={(event) => updateSettings({ requireCtrlEnter: event.currentTarget.checked })}
            className="mt-1"
          />
          <div>
            <div className="font-medium text-foreground">
              Require ⌃/⌘ + Enter to send long prompts
            </div>
            <div className="text-xs text-muted-foreground">
              Multiline prompts need the modifier; single-line prompts still send on Enter.
            </div>
          </div>
        </label>
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
  readonly children: React.ReactNode;
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
      className={`flex flex-col gap-1 rounded-lg border-2 p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border bg-card/30 hover:border-border/70"
      }`}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
