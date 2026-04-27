// V3 Phase 10 — collapsible preview pane that sits beside ChatView.
//
// Renders a sandboxed iframe pointed at the URL resolved from the
// server's port-sniffer hint (local-host) or the Cloud env reverse
// proxy (`/preview/{chat_id}/*`). `ElementInspector` overlays the
// frame while the inspect toggle is on; picked elements hand back
// markdown via `onElementPicked` so the caller can drop it into the
// chat composer as agent context.
//
// Sandbox attributes enforce the spec: `allow-scripts allow-same-origin
// allow-forms` so the preview can actually execute the user's app, plus
// `referrer-policy="no-referrer"` to avoid leaking the outer origin
// into the previewed app's analytics. Drop-down controls:
//
//   * **Refresh** — reloads the iframe without reparenting it.
//   * **Inspect** — toggles `ElementInspector`.
//   * **Open** — opens the resolved URL in a new browser tab.
//   * **Close** — lets the parent hide the pane (optional prop).
//
// The component is presentational: the caller decides when / how to
// pass in the preview URL (via the server-side sniffer feed) and what
// to do with picked elements.

import { ArrowUpRightIcon, RefreshCwIcon, SquareArrowOutUpRightIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "~/lib/utils";

import { Button } from "../../ui/button";

import { ElementInspector } from "./ElementInspector";
import type { SerializedElement } from "./elementSerialization.ts";

export interface PreviewPaneProps {
  readonly url: string | null;
  readonly title?: string;
  readonly host?: "cloud" | "localhost" | "custom";
  readonly onElementPicked?: (payload: {
    readonly markdown: string;
    readonly element: SerializedElement | null;
  }) => void;
  readonly onClose?: () => void;
  readonly className?: string;
}

const SANDBOX = "allow-scripts allow-same-origin allow-forms";

export function PreviewPane({
  url,
  title = "Preview",
  host,
  onElementPicked,
  onClose,
  className,
}: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [inspecting, setInspecting] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const displayUrl = url ?? null;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border/60 bg-background",
        className,
      )}
      data-slot="preview-pane"
    >
      <header className="flex items-center gap-2 border-b border-border/60 bg-card/40 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {host !== undefined ? (
            <span
              className={cn(
                "rounded-sm border border-border/50 px-1 py-0.5 text-[0.6rem] uppercase tracking-wider",
                host === "cloud" ? "text-info" : "text-muted-foreground",
              )}
            >
              {host}
            </span>
          ) : null}
          <span className="ml-1 truncate font-mono text-xs text-foreground/80">
            {displayUrl ?? "waiting for the agent to start a server…"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={displayUrl === null}
            aria-pressed={inspecting}
            onClick={() => setInspecting((value) => !value)}
            title="Inspect element (Esc to exit)"
          >
            <ArrowUpRightIcon className="size-3.5" aria-hidden />
            <span className="sr-only">Inspect</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={displayUrl === null}
            onClick={() => setReloadKey((n) => n + 1)}
            title="Reload"
          >
            <RefreshCwIcon className="size-3.5" aria-hidden />
            <span className="sr-only">Reload</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={displayUrl === null}
            onClick={() => {
              if (displayUrl !== null) window.open(displayUrl, "_blank", "noopener,noreferrer");
            }}
            title="Open in a new tab"
          >
            <SquareArrowOutUpRightIcon className="size-3.5" aria-hidden />
            <span className="sr-only">Open</span>
          </Button>
          {onClose ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClose} title="Close preview">
              <XIcon className="size-3.5" aria-hidden />
              <span className="sr-only">Close</span>
            </Button>
          ) : null}
        </div>
      </header>
      <div className="relative min-h-0 flex-1 bg-background">
        {displayUrl === null ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Start a dev server in your workspace — V3 will auto-detect the port and preview it here.
          </div>
        ) : (
          <iframe
            key={`${displayUrl}:${reloadKey}`}
            ref={iframeRef}
            src={displayUrl}
            title={title}
            sandbox={SANDBOX}
            referrerPolicy="no-referrer"
            className="h-full w-full border-0"
          />
        )}
        <ElementInspector
          iframeRef={iframeRef}
          active={inspecting && displayUrl !== null}
          previewUrl={displayUrl}
          onElementPicked={(payload) => {
            onElementPicked?.(payload);
          }}
          onExit={() => setInspecting(false)}
        />
      </div>
    </div>
  );
}
