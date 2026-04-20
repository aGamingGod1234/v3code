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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
