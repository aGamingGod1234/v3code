import { useMemo, useState } from "react";
import { ArrowLeftIcon, SearchIcon, XIcon } from "lucide-react";
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
import { SETTINGS_NAV_ITEMS, type SettingsSectionPath } from "./settingsNavigation";
import {
  getSettingsSearchTerms,
  searchSettings,
  type SettingsSearchResult,
} from "./settingsSearch";

export function SettingsSidebarNav({
  pathname,
  showMeshChrome = true,
}: {
  readonly pathname: string;
  readonly showMeshChrome?: boolean;
}) {
  const account = useAccountState();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedSearchQuery = searchQuery.trim();
  const searchResults = useMemo(() => searchSettings(searchQuery), [searchQuery]);
  const searchTerms = useMemo(() => getSettingsSearchTerms(searchQuery), [searchQuery]);

  const openSettingsSection = (to: SettingsSectionPath) => {
    void navigate({ to, replace: true });
  };

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
        <SidebarGroup className="px-2 pt-3 pb-1">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="search"
              aria-label="Search settings"
              placeholder="Search settings"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const firstResult = searchResults[0];
                if (!firstResult) return;
                openSettingsSection(firstResult.path);
              }}
              className="h-9 w-full rounded-lg border border-border/70 bg-background/70 pr-8 pl-8 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-border focus:bg-background"
            />
            {trimmedSearchQuery.length > 0 ? (
              <button
                type="button"
                aria-label="Clear settings search"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
          {trimmedSearchQuery.length > 0 ? (
            <SettingsSearchResults
              results={searchResults}
              terms={searchTerms}
              onOpen={openSettingsSection}
            />
          ) : null}
        </SidebarGroup>
        <SidebarGroup className="px-2 py-2">
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
                    onClick={() => openSettingsSection(item.to)}
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

function SettingsSearchResults({
  results,
  terms,
  onOpen,
}: {
  readonly results: ReadonlyArray<SettingsSearchResult>;
  readonly terms: ReadonlyArray<string>;
  readonly onOpen: (path: SettingsSectionPath) => void;
}) {
  return (
    <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border/70 bg-background/80 p-1 shadow-sm">
      {results.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">No settings found</div>
      ) : (
        results.map((result) => (
          <button
            key={result.id}
            type="button"
            onClick={() => onOpen(result.path)}
            className="block w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <div className="truncate text-[13px] font-medium text-foreground">
              <HighlightedSearchText text={result.title} terms={terms} />
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              <HighlightedSearchText text={result.sectionLabel} terms={terms} />
              <span className="px-1.5 text-muted-foreground/50">/</span>
              <HighlightedSearchText text={result.description} terms={terms} />
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function HighlightedSearchText({
  text,
  terms,
}: {
  readonly text: string;
  readonly terms: ReadonlyArray<string>;
}) {
  const parts = splitTextBySearchTerms(text, terms);
  return (
    <>
      {parts.map((part) =>
        part.highlight ? (
          <mark key={part.key} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={part.key}>{part.text}</span>
        ),
      )}
    </>
  );
}

function splitTextBySearchTerms(
  text: string,
  terms: ReadonlyArray<string>,
): ReadonlyArray<{
  readonly key: string;
  readonly text: string;
  readonly highlight: boolean;
}> {
  if (terms.length === 0) return [{ key: `plain:0:${text}`, text, highlight: false }];

  const normalizedTerms = terms.map((term) => term.toLocaleLowerCase());
  const escapedTerms = normalizedTerms.map(escapeRegExp).filter((term) => term.length > 0);
  if (escapedTerms.length === 0) return [{ key: `plain:0:${text}`, text, highlight: false }];

  const matcher = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  const parts: Array<{ key: string; text: string; highlight: boolean }> = [];
  let cursor = 0;

  for (const match of text.matchAll(matcher)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? cursor;
    if (matchIndex > cursor) {
      const plainText = text.slice(cursor, matchIndex);
      parts.push({
        key: `plain:${cursor}:${plainText}`,
        text: plainText,
        highlight: false,
      });
    }
    parts.push({
      key: `match:${matchIndex}:${matchedText}`,
      text: matchedText,
      highlight: normalizedTerms.includes(matchedText.toLocaleLowerCase()),
    });
    cursor = matchIndex + matchedText.length;
  }

  if (cursor < text.length) {
    const plainText = text.slice(cursor);
    parts.push({ key: `plain:${cursor}:${plainText}`, text: plainText, highlight: false });
  }

  return parts.length > 0 ? parts : [{ key: `plain:0:${text}`, text, highlight: false }];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
