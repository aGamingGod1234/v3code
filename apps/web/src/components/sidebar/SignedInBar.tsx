import { useAccountState } from "../../hooks/useAccountState";

interface SignedInBarProps {
  readonly account: ReturnType<typeof useAccountState>;
}

// Signed-in account card in the sidebar.
//
// Intentionally minimal — just the avatar initial + display name +
// email. Sign-out, device listing, GitHub connection and server-node
// status all live under Settings (Devices / Connections), not here,
// so the sidebar stays focused on chats/projects. Prior revisions
// surfaced badges like "desktop · Setup pending · V3 Code (Alpha)
// (windows)" which were both ugly and meaningless for the default
// desktop-only user — those are now removed.
export function SignedInBar({ account }: SignedInBarProps) {
  if (!account.isSignedIn || account.email === null) {
    return null;
  }

  const initial = (account.displayName ?? account.email).slice(0, 1).toUpperCase();

  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm/4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{account.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{account.email}</div>
        </div>
      </div>
    </div>
  );
}
