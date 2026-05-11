import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "@xterm/xterm/css/xterm.css";
import "./index.css";

import { CLOUD_MODE_BASE_PATH, IS_CLOUD_MODE } from "./build-flags";
import { isElectron } from "./env";
import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";
import { syncDocumentWindowControlsOverlayClass } from "./lib/windowControlsOverlay";

// V3 Phase 7: before the router mounts, strip the `/app` base prefix
// from the current URL so TanStack Router sees "/_chat/..." rather
// than "/app/_chat/...". The server static route's SPA fallback makes
// deep-link refreshes work by returning index.html; this runtime
// rewrite keeps the in-memory router in sync with the stripped path.
if (IS_CLOUD_MODE && typeof window !== "undefined") {
  const base = CLOUD_MODE_BASE_PATH.replace(/\/$/, "");
  const currentPath = window.location.pathname;
  if (base.length > 0 && currentPath.startsWith(base)) {
    const rewritten = currentPath.slice(base.length) || "/";
    window.history.replaceState(
      window.history.state,
      "",
      `${rewritten}${window.location.search}${window.location.hash}`,
    );
  }
}

// Electron loads the app from a file-backed shell, so hash history avoids
// path resolution issues. Cloud-mode and the legacy web bundle both use
// browser history — the router never sees the `/app` prefix thanks to
// the URL rewrite above.
const history = isElectron ? createHashHistory() : createBrowserHistory();

const router = getRouter(history);

if (isElectron) {
  syncDocumentWindowControlsOverlayClass();
}

document.title = APP_DISPLAY_NAME;

class RootRenderErrorBoundary extends React.Component<
  { readonly children: React.ReactNode },
  { readonly error: Error | null }
> {
  override state: { readonly error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { readonly error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[v3] Unhandled render error", error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    const details = error.stack ?? error.message;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
        <section className="w-full max-w-xl rounded-lg border border-border bg-card p-6 shadow-xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {APP_DISPLAY_NAME}
          </p>
          <h1 className="mt-3 text-2xl font-semibold">The app hit a render error.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reload the app, then retry the last action. If it happens again, copy the details below.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium"
              onClick={() => void navigator.clipboard?.writeText(details)}
            >
              Copy details
            </button>
          </div>
          <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
            {details}
          </pre>
        </section>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootRenderErrorBoundary>
      <RouterProvider router={router} />
    </RootRenderErrorBoundary>
  </React.StrictMode>,
);
