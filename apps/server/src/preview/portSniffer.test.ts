import { describe, expect, it } from "vitest";

import {
  deduplicateHints,
  parseListeningPorts,
  parseStdoutHints,
  type PortHint,
} from "./portSniffer.ts";

const NOW = () => new Date("2026-04-22T10:00:00.000Z");

describe("parseStdoutHints", () => {
  it("detects a Next.js dev server banner", () => {
    const hints = parseStdoutHints(
      "   ▲ Next.js 15.0.2\n   - Local:        http://localhost:3000\n   - ready in 1.8s",
      { now: NOW },
    );
    expect(hints).toHaveLength(1);
    expect(hints[0]!.port).toBe(3000);
    expect(hints[0]!.framework).toBe("generic-url");
    expect(hints[0]!.path).toBe("/");
  });

  it("detects a Vite dev server", () => {
    const hints = parseStdoutHints(
      "VITE v5.4.0  ready in 320 ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host to expose",
      { now: NOW },
    );
    expect(hints.map((h) => h.port)).toEqual([5173]);
  });

  it("detects Django runserver", () => {
    const hints = parseStdoutHints(
      "Starting development server at http://127.0.0.1:8000/\nQuit the server with CONTROL-C.",
      { now: NOW },
    );
    expect(hints).toHaveLength(1);
    expect(hints[0]!.port).toBe(8000);
    expect(hints[0]!.framework).toBe("generic-url");
  });

  it("detects generic listening banners", () => {
    const hints = parseStdoutHints("Listening on port 4201", { now: NOW });
    expect(hints[0]?.port).toBe(4201);
    expect(hints[0]?.framework).toBe("generic-listen");
  });

  it("ignores privileged ports below 1024", () => {
    const hints = parseStdoutHints("Listening on 80", { now: NOW });
    expect(hints).toEqual([]);
  });

  it("dedupes within a single chunk", () => {
    const hints = parseStdoutHints(
      "starting...\nhttp://localhost:3000\nstill alive on http://localhost:3000\n",
      { now: NOW },
    );
    expect(hints).toHaveLength(1);
  });

  it("extracts sub-path when present in the URL", () => {
    const hints = parseStdoutHints("open http://localhost:9000/dashboard/home", {
      now: NOW,
    });
    expect(hints[0]?.path).toBe("/dashboard/home");
  });
});

describe("parseListeningPorts", () => {
  const netstatOutput = [
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234",
    "  TCP    127.0.0.1:49152        0.0.0.0:0              LISTENING       5678",
    "  TCP    127.0.0.1:49152        203.0.113.1:443        ESTABLISHED     5678",
  ].join("\n");

  it("picks up LISTENING TCP sockets in netstat output", () => {
    const hints = parseListeningPorts(netstatOutput, { now: NOW });
    expect(hints.map((h) => h.port).toSorted((a, b) => a - b)).toEqual([3000, 49152]);
  });

  it("uses the lsof source label when requested", () => {
    const hints = parseListeningPorts(
      "node    1234 lucas   27u  IPv4 0x…  0t0  TCP *:3000 (LISTEN)",
      { source: "lsof", now: NOW },
    );
    expect(hints[0]?.source).toBe("lsof");
    expect(hints[0]?.port).toBe(3000);
  });

  it("returns an empty list when no LISTEN rows are present", () => {
    expect(parseListeningPorts("", { now: NOW })).toEqual([]);
    expect(
      parseListeningPorts("TCP 127.0.0.1:3000 203.0.113.1:443 ESTABLISHED 5678", {
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe("deduplicateHints", () => {
  const base: PortHint = {
    source: "stdout",
    host: "127.0.0.1",
    port: 3000,
    path: "/",
    detectedAt: "2026-04-22T10:00:00.000Z",
    framework: "generic-url",
    raw: "http://localhost:3000",
  };

  it("collapses back-to-back duplicates", () => {
    const next = deduplicateHints([base], [base, base]);
    expect(next).toHaveLength(1);
  });

  it("accepts the same port from a different source", () => {
    const next = deduplicateHints([base], [{ ...base, source: "netstat" }]);
    expect(next).toHaveLength(2);
  });

  it("caps the history at the requested max", () => {
    const hints: PortHint[] = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      port: 3000 + i,
    }));
    const next = deduplicateHints([], hints, 4);
    expect(next).toHaveLength(4);
    expect(next[0]?.port).toBe(3006);
    expect(next[3]?.port).toBe(3009);
  });
});
