import type { ComponentType } from "react";
import {
  ArchiveIcon,
  BarChart3Icon,
  BoxesIcon,
  GitBranchIcon,
  GitForkIcon,
  GlobeIcon,
  MonitorIcon,
  PaletteIcon,
  PlugIcon,
  ServerIcon,
  Settings2Icon,
  SlidersIcon,
  UserIcon,
  WorkflowIcon,
} from "lucide-react";

export type SettingsSectionPath =
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/configuration"
  | "/settings/personalization"
  | "/settings/orchestrator"
  | "/settings/providers"
  | "/settings/mcp"
  | "/settings/git"
  | "/settings/environments"
  | "/settings/worktrees"
  | "/settings/browser"
  | "/settings/devices"
  | "/settings/usage"
  | "/settings/archived";

export interface SettingsNavigationItem {
  readonly label: string;
  readonly to: SettingsSectionPath;
  readonly icon: ComponentType<{ className?: string }>;
}

export const SETTINGS_NAV_ITEMS: ReadonlyArray<SettingsNavigationItem> = [
  { label: "General", to: "/settings/general", icon: Settings2Icon },
  { label: "Appearance", to: "/settings/appearance", icon: PaletteIcon },
  { label: "Configuration", to: "/settings/configuration", icon: SlidersIcon },
  { label: "Personalization", to: "/settings/personalization", icon: UserIcon },
  { label: "Orchestrator", to: "/settings/orchestrator", icon: WorkflowIcon },
  { label: "Providers", to: "/settings/providers", icon: PlugIcon },
  { label: "MCP servers", to: "/settings/mcp", icon: BoxesIcon },
  { label: "Git", to: "/settings/git", icon: GitBranchIcon },
  { label: "Environments", to: "/settings/environments", icon: ServerIcon },
  { label: "Worktrees", to: "/settings/worktrees", icon: GitForkIcon },
  { label: "Browser use", to: "/settings/browser", icon: GlobeIcon },
  { label: "Devices", to: "/settings/devices", icon: MonitorIcon },
  { label: "Usage", to: "/settings/usage", icon: BarChart3Icon },
  { label: "Archive", to: "/settings/archived", icon: ArchiveIcon },
];
