import { readPrimaryEnvironmentTarget } from "../environments/primary/target";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);

export type ClientServerMode = "desktop" | "server-node" | "web";

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
}

export function resolveClientServerMode(): ClientServerMode {
  const target = readPrimaryEnvironmentTarget();
  if (target?.source === "desktop-managed") {
    return "desktop";
  }

  const httpBaseUrl = target?.target.httpBaseUrl ?? window.location.origin;
  const hostname = normalizeHostname(new URL(httpBaseUrl).hostname);
  return LOOPBACK_HOSTNAMES.has(hostname) ? "web" : "server-node";
}

export function useServerMode(): ClientServerMode {
  return resolveClientServerMode();
}
