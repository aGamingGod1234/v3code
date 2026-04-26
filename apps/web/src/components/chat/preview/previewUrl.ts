// V3 Phase 10 — Preview URL derivation.
//
// The web bundle never asks the user for a URL: the server-side port
// sniffer (see `apps/server/src/preview/portSniffer.ts`) emits
// `preview.port-detected` events carrying an origin + path. For Cloud
// env chats the spec promises a path-based reverse proxy at
// `/preview/{chat_id}/*` so the iframe can point there; for local-host
// chats we use the plain loopback origin the sniffer reports.
//
// Keeping the resolver pure means the React component below can unit-
// test the "which origin wins" logic without a running server or
// WebView.

export type PreviewHostKind = "cloud" | "localhost" | "custom";

export interface PreviewHint {
  readonly host: PreviewHostKind;
  readonly origin: string;
  readonly port: number | null;
  readonly path: string;
  readonly detectedAt: string;
}

export interface PreviewResolveInput {
  readonly hint: PreviewHint | null;
  /**
   * Fallback path when a cloud proxy is known to exist but the hint
   * does not yet carry one. Shape: `/preview/{chat_id}/`.
   */
  readonly cloudProxyPath: string | null;
  readonly cloudProxyOrigin: string | null;
}

export interface PreviewResolution {
  readonly url: string;
  readonly host: PreviewHostKind;
  readonly detectedAt: string | null;
}

const normalisePath = (path: string): string => {
  const trimmed = path.trim();
  if (trimmed.length === 0) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const joinPath = (base: string, path: string): string => {
  const baseWithoutTrailing = base.endsWith("/") ? base.slice(0, -1) : base;
  const suffix = normalisePath(path);
  return `${baseWithoutTrailing}${suffix === "/" ? "/" : suffix}`;
};

export const resolvePreviewUrl = (input: PreviewResolveInput): PreviewResolution | null => {
  if (input.hint !== null) {
    if (input.hint.host === "cloud" && input.cloudProxyOrigin !== null) {
      return {
        url: joinPath(input.cloudProxyOrigin, input.hint.path),
        host: "cloud",
        detectedAt: input.hint.detectedAt,
      };
    }
    return {
      url: joinPath(input.hint.origin, input.hint.path),
      host: input.hint.host,
      detectedAt: input.hint.detectedAt,
    };
  }
  if (input.cloudProxyOrigin !== null && input.cloudProxyPath !== null) {
    return {
      url: joinPath(input.cloudProxyOrigin, input.cloudProxyPath),
      host: "cloud",
      detectedAt: null,
    };
  }
  return null;
};
