// Declarative tour-step list. Each step targets a `data-tour-id`
// attribute on a real component already present in the app. If the
// target is missing at runtime (component unmounted, refactored away),
// TourProvider skips the step with a console warning so the tour
// never wedges on a missing anchor.

export interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  // null target → centered modal (welcome / done screens). Otherwise the
  // popover anchors to the first element matching `[data-tour-id="..."]`.
  readonly target: string | null;
  readonly route?: string;
}

export const TOUR_STEPS: ReadonlyArray<TourStep> = [
  {
    id: "welcome",
    title: "You're set up",
    body: "Take 90 seconds to get the lay of the land. You can replay this any time from Settings → General.",
    target: null,
  },
  {
    id: "providers",
    title: "Add a provider",
    body: "Plug in Codex CLI, Claude Code, Cursor, or OpenCode. You'll need at least one host CLI authenticated for V3 to do anything useful.",
    target: "providers-section",
    route: "/settings/providers",
  },
  {
    id: "import-chat",
    title: "Import existing chats",
    body: "Bring your Codex or Claude Code transcripts in. Skills and MCP servers referenced in those chats are auto-detected — installed ones are flagged as enabled, missing ones surface for manual install.",
    target: "import-chat-button",
    route: "/settings/connections",
  },
  {
    id: "rerun-setup",
    title: "Re-run the setup wizard",
    body: "If your server URL changes, encryption key gets lost, or you want a different allow-list, re-run the wizard from here. Hand-editing config.toml works too.",
    target: "rerun-setup-button",
    route: "/settings/general",
  },
  {
    id: "done",
    title: "That's it",
    body: "You can replay this tour from Settings → General → Re-take tour. Have fun.",
    target: null,
  },
];
