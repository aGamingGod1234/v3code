import type { ComponentType } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  Link2Icon,
  MonitorIcon,
  PlugIcon,
  Settings2Icon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useAccountState } from "../../hooks/useAccountState";
import { SignedInBar } from "../sidebar/SignedInBar";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "../ui/sidebar";
import { V3SignInButton } from "../../v3/ui/SignInButton";

export type SettingsSectionPath =
  | "/settings/general"
  | "/settings/providers"
  | "/settings/connections"
  | "/settings/devices"
  | "/settings/archived";

export const SETTINGS_NAV_ITEMS: ReadonlyArray<{
  label: string;
  to: SettingsSectionPath;
  icon: ComponentType<{ className?: string }>;
}> = [
  { label: "General", to: "/settings/general", icon: Settings2Icon },
  { label: "Providers", to: "/settings/providers", icon: PlugIcon },
  { label: "Connections", to: "/settings/connections", icon: Link2Icon },
  { label: "Devices", to: "/settings/devices", icon: MonitorIcon },
  { label: "Archive", to: "/settings/archived", icon: ArchiveIcon },
];

export function SettingsSidebarNav({
  pathname,
  showMeshChrome = true,
}: {
  readonly pathname: string;
  readonly showMeshChrome?: boolean;
}) {
  const account = useAccountState();
  const navigate = useNavigate();

  return (
    <>
      <SidebarContent className="overflow-x-hidden">
        {showMeshChrome ? (
          <SidebarGroup className="px-2 pt-2 pb-0">
            {account.isSignedIn ? (
              <SignedInBar account={account} />
            ) : (
              <V3SignInButton className="w-full justify-center rounded-xl" />
            )}
          </SidebarGroup>
        ) : null}
        <SidebarGroup className="px-2 py-3">
          <SidebarMenu>
            {SETTINGS_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.to;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={isActive}
                    className={
                      isActive
                        ? "gap-2.5 px-2.5 py-2 text-left text-[13px] font-medium text-foreground"
                        : "gap-2.5 px-2.5 py-2 text-left text-[13px] text-muted-foreground/70 hover:text-foreground/80"
                    }
                    onClick={() => void navigate({ to: item.to, replace: true })}
                  >
                    <Icon
                      className={
                        isActive
                          ? "size-4 shrink-0 text-foreground"
                          : "size-4 shrink-0 text-muted-foreground/60"
                      }
                    />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              className="gap-2 px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon className="size-4" />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
