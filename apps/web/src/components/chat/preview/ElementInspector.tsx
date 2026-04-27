// V3 Phase 10 — `ElementInspector` overlay for the PreviewPane.
//
// When enabled, renders a translucent crosshair layer over the iframe.
// Clicks are intercepted and forwarded via `postMessage` to the iframe
// which is expected to host the companion script at
// `apps/web/public/preview-inspector-client.js`. The iframe replies
// with a `SerializedElement` which this component formats into agent-
// ready markdown via `formatElementForAgent` and hands to the parent
// via `onElementPicked`.
//
// We never require the iframe-side helper to be present: when the
// child origin is foreign or doesn't respond in time, we fall back to
// a lightweight overlay-only UI that emits the click coordinate + the
// current preview URL. That degraded path still gives the agent useful
// context ("user clicked at (325, 218) on /dashboard") without any
// cross-origin assumptions.

import { type CSSProperties, type RefObject, useCallback, useEffect, useState } from "react";

import { cn } from "~/lib/utils";

import {
  formatElementForAgent,
  isSerializedElement,
  type SerializedElement,
} from "./elementSerialization.ts";

const INSPECT_REQUEST_TYPE = "v3:preview-inspect:request";
const INSPECT_RESPONSE_TYPE = "v3:preview-inspect:response";
const RESPONSE_TIMEOUT_MS = 400;

export interface ElementInspectorProps {
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly active: boolean;
  readonly previewUrl: string | null;
  readonly onElementPicked: (payload: {
    markdown: string;
    element: SerializedElement | null;
  }) => void;
  readonly onExit?: () => void;
  readonly className?: string;
}

export function ElementInspector({
  iframeRef,
  active,
  previewUrl,
  onElementPicked,
  onExit,
  className,
}: ElementInspectorProps) {
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onExit?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [active, onExit]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!active) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = event.currentTarget.getBoundingClientRect();
      const coord = {
        x: Math.round(event.clientX - rect.left),
        y: Math.round(event.clientY - rect.top),
        clientWidth: Math.round(rect.width),
        clientHeight: Math.round(rect.height),
      };

      const iframe = iframeRef.current;
      if (iframe === null || iframe.contentWindow === null) {
        const fallback = buildFallbackMarkdown(coord, previewUrl);
        onElementPicked({ markdown: fallback, element: null });
        return;
      }

      const requestId = globalThis.crypto?.randomUUID?.() ?? `inspect-${Date.now()}`;
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", listener);
        const fallback = buildFallbackMarkdown(coord, previewUrl);
        onElementPicked({ markdown: fallback, element: null });
      }, RESPONSE_TIMEOUT_MS);

      const listener = (message: MessageEvent): void => {
        if (message.source !== iframe.contentWindow) return;
        const data = message.data as Record<string, unknown> | null;
        if (data === null || typeof data !== "object") return;
        if (data.type !== INSPECT_RESPONSE_TYPE) return;
        if (data.requestId !== requestId) return;
        window.clearTimeout(timer);
        window.removeEventListener("message", listener);
        const element = isSerializedElement(data.element) ? data.element : null;
        const markdown =
          element !== null
            ? formatElementForAgent(element)
            : buildFallbackMarkdown(coord, previewUrl);
        onElementPicked({ markdown, element });
      };
      window.addEventListener("message", listener);

      iframe.contentWindow.postMessage(
        {
          type: INSPECT_REQUEST_TYPE,
          requestId,
          coord,
        },
        "*",
      );
    },
    [active, iframeRef, onElementPicked, previewUrl],
  );

  const overlayStyle: CSSProperties = {
    cursor: active ? "crosshair" : "default",
    pointerEvents: active ? "auto" : "none",
  };

  return (
    <div
      aria-hidden={!active}
      className={cn("absolute inset-0 z-10", active ? "bg-black/8" : "bg-transparent", className)}
      style={overlayStyle}
      onClick={handleClick}
      onMouseMove={(event) => {
        if (!active) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setHoverPosition({
          x: Math.round(event.clientX - rect.left),
          y: Math.round(event.clientY - rect.top),
        });
      }}
      onMouseLeave={() => setHoverPosition(null)}
      data-slot="element-inspector"
    >
      {active && hoverPosition !== null ? (
        <div
          className="pointer-events-none absolute rounded-sm border border-info/80 bg-info/10"
          style={{
            left: hoverPosition.x - 16,
            top: hoverPosition.y - 16,
            width: 32,
            height: 32,
          }}
        />
      ) : null}
      {active ? (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-sm border border-border/60 bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow">
          Click to inspect · <kbd className="font-mono">Esc</kbd> to exit
        </div>
      ) : null}
    </div>
  );
}

export const buildFallbackMarkdown = (
  coord: { x: number; y: number; clientWidth: number; clientHeight: number },
  url: string | null,
): string => {
  const lines: string[] = [];
  lines.push(
    `**Preview click**: (${coord.x}, ${coord.y}) at ${coord.clientWidth}×${coord.clientHeight}`,
  );
  if (url !== null) {
    lines.push(`**URL**: ${url}`);
  }
  lines.push(
    "",
    "_The preview iframe is cross-origin or the inspector script was not injected, so we can’t walk the DOM directly. Consider opening the page in the browser and pasting the element’s HTML._",
  );
  return lines.join("\n");
};
