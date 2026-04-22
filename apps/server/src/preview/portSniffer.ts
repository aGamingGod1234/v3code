// V3 Phase 10 — port sniffer for the local-host preview pane.
//
// The agent signals a preview port in one of three ways:
//
//   1. Prints a `localhost:PORT` log line (the Next.js / Vite / Bun
//      happy path).
//   2. Opens a listening socket that shows up in `netstat` / `ss` /
//      `lsof` output (the fallback the master plan calls out).
//   3. The provider runtime emits an explicit preview hint (future —
//      for now we keep the types additive so P10's client side is
//      prepared).
//
// This module owns the **pure** parsing logic: take a stdout/stderr
// chunk, a netstat dump, or a ports snapshot and return a list of
// candidate ports. An Effect-layer wrapper (`PortSnifferLive`)
// subscribes to provider stdout + polls `ss`/`netstat` once every
// 3 seconds and emits `PortHint` events onto a PubSub so the
// frontend can read the latest.
//
// Keeping the parsing pure is important because the integration
// tests can then exercise the matcher against canned Next.js /
// Vite / Django / Rails banner strings without booting a real
// dev server.

import { Context, DateTime, Effect, Layer, PubSub, Stream } from "effect";

export interface PortHint {
  readonly source: "stdout" | "netstat" | "lsof" | "manual";
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly detectedAt: string;
  readonly framework: string | null;
  readonly raw: string | null;
}

const MIN_EPHEMERAL_PORT = 1024;
const MAX_PORT = 65535;

const isUsablePort = (port: number): boolean =>
  Number.isInteger(port) && port >= MIN_EPHEMERAL_PORT && port <= MAX_PORT;

// -- stdout/stderr parsing ---------------------------------------------------

interface MatcherSpec {
  readonly framework: string;
  readonly pattern: RegExp;
  readonly pathCapture?: number;
}

// Each matcher is tested independently. `pattern` MUST have a capture
// group for the port number. Case-insensitive to catch "Listening on"
// vs "listening on". The order is informational only — if multiple
// matchers fire on the same line, the first one wins.
const STDOUT_MATCHERS: ReadonlyArray<MatcherSpec> = [
  // http(s)://host:port(/path?)
  {
    framework: "generic-url",
    pattern: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::(\d{2,5}))?(\/[^\s)"'<>]*)?/i,
    pathCapture: 2,
  },
  // "http://[::1]:PORT"
  {
    framework: "generic-ipv6",
    pattern: /\bhttps?:\/\/\[(?:::1|::)\]:(\d{2,5})/i,
  },
  // "Listening on 3000"
  {
    framework: "generic-listen",
    pattern: /\blistening (?:on|at)(?::| )?\s*(?:port\s*)?(\d{2,5})\b/i,
  },
  // "Local: http://localhost:5173"
  {
    framework: "vite-local",
    pattern: /\blocal:\s+https?:\/\/localhost:(\d{2,5})/i,
  },
  // "ready - started server on 0.0.0.0:3000"
  {
    framework: "nextjs-started",
    pattern:
      /started (?:web )?server on (?:https?:\/\/)?(?:0\.0\.0\.0|localhost|127\.0\.0\.1):(\d{2,5})/i,
  },
  // "Starting development server at http://127.0.0.1:8000/"
  {
    framework: "django-runserver",
    pattern: /development server at https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})\//i,
  },
  // "Puma starting" followed by "Listening on http://0.0.0.0:3000"
  {
    framework: "rails-puma",
    pattern: /puma[\s\S]*?listening on https?:\/\/(?:0\.0\.0\.0|localhost|127\.0\.0\.1):(\d{2,5})/i,
  },
];

export interface StdoutHintOptions {
  readonly now?: () => Date;
  readonly hostOverride?: string;
}

export const parseStdoutHints = (
  chunk: string,
  options: StdoutHintOptions = {},
): ReadonlyArray<PortHint> => {
  if (chunk.length === 0) return [];
  const now = (options.now ?? (() => new Date()))();
  const detectedAt = now.toISOString();
  const host = options.hostOverride ?? "127.0.0.1";

  const hints: PortHint[] = [];
  const seen = new Set<number>();

  for (const line of chunk.split(/\r?\n/)) {
    for (const matcher of STDOUT_MATCHERS) {
      const match = line.match(matcher.pattern);
      if (match === null) continue;
      const portString = match[1];
      if (portString === undefined) continue;
      const port = Number.parseInt(portString, 10);
      if (!isUsablePort(port)) continue;
      if (seen.has(port)) continue;
      seen.add(port);
      const pathCandidate =
        matcher.pathCapture !== undefined ? match[matcher.pathCapture] : undefined;
      const path =
        typeof pathCandidate === "string" && pathCandidate.length > 0 ? pathCandidate : "/";
      hints.push({
        source: "stdout",
        host,
        port,
        path,
        detectedAt,
        framework: matcher.framework,
        raw: line,
      });
      break;
    }
  }
  return hints;
};

// -- netstat / ss parsing ----------------------------------------------------

// netstat -ano -p tcp (Windows) outputs columns like:
//    TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       3244
// ss -ltnp (Linux) outputs like:
//   LISTEN  0  511  *:3000  *:*  users:(("node",pid=1234))
// lsof -iTCP -sTCP:LISTEN emits lines like:
//   node    1234 lucas   27u  IPv4 0x…  0t0  TCP *:3000 (LISTEN)
export interface ListeningPortsOptions {
  readonly now?: () => Date;
  readonly hostOverride?: string;
  readonly source?: "netstat" | "lsof";
}

// Captures the first port that appears in a row whose content contains
// "LISTEN"/"LISTENING". Works for:
//   * Windows netstat: "  TCP    0.0.0.0:3000   0.0.0.0:0   LISTENING   1234"
//   * Linux ss:        "LISTEN 0 511 *:3000 *:* users:(...)"
//   * lsof -iTCP:      "node 1234 lucas 27u IPv4 … TCP *:3000 (LISTEN)"
const NETSTAT_LINE_REGEX = /[:.*](\d{2,5})\b/;

export const parseListeningPorts = (
  raw: string,
  options: ListeningPortsOptions = {},
): ReadonlyArray<PortHint> => {
  const now = (options.now ?? (() => new Date()))();
  const detectedAt = now.toISOString();
  const host = options.hostOverride ?? "127.0.0.1";
  const source = options.source ?? "netstat";
  const seen = new Set<number>();
  const hints: PortHint[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const upper = line.toUpperCase();
    if (!upper.includes("LISTEN")) continue;
    const match = line.match(NETSTAT_LINE_REGEX);
    const portCandidate = match?.[1];
    if (portCandidate === undefined) continue;
    const port = Number.parseInt(portCandidate, 10);
    if (!isUsablePort(port)) continue;
    if (seen.has(port)) continue;
    seen.add(port);
    hints.push({
      source,
      host,
      port,
      path: "/",
      detectedAt,
      framework: null,
      raw: line.trim(),
    });
  }
  return hints;
};

// Keep a short rolling history of hints so consumers (UI / logs) can
// recover missed events without reaching into the PubSub subscription
// state. `deduplicateHints` collapses consecutive identical entries
// and caps the history to `max` items.
export const deduplicateHints = (
  history: ReadonlyArray<PortHint>,
  incoming: ReadonlyArray<PortHint>,
  max: number = 16,
): ReadonlyArray<PortHint> => {
  const next: PortHint[] = [...history];
  for (const hint of incoming) {
    const last = next[next.length - 1];
    if (
      last !== undefined &&
      last.port === hint.port &&
      last.host === hint.host &&
      last.path === hint.path &&
      last.source === hint.source
    ) {
      continue;
    }
    next.push(hint);
  }
  while (next.length > max) next.shift();
  return next;
};

// -- Effect-layer integration -----------------------------------------------

export interface PortSnifferShape {
  readonly publish: (hint: PortHint) => Effect.Effect<void>;
  readonly ingestStdout: (chunk: string) => Effect.Effect<number>;
  readonly ingestListeningPorts: (
    chunk: string,
    source: "netstat" | "lsof",
  ) => Effect.Effect<number>;
  readonly stream: Stream.Stream<PortHint>;
  readonly latest: () => Effect.Effect<ReadonlyArray<PortHint>>;
}

export class PortSniffer extends Context.Service<PortSniffer, PortSnifferShape>()(
  "v3/preview/Services/PortSniffer",
) {}

const makePortSniffer = Effect.gen(function* () {
  const pubSub = yield* PubSub.unbounded<PortHint>();
  let history: ReadonlyArray<PortHint> = [];

  const publishMany = (hints: ReadonlyArray<PortHint>) =>
    Effect.gen(function* () {
      if (hints.length === 0) return 0;
      const next = deduplicateHints(history, hints);
      const diff = next.slice(history.length);
      history = next;
      for (const hint of diff) {
        yield* PubSub.publish(pubSub, hint);
      }
      return diff.length;
    });

  const publish = (hint: PortHint) => publishMany([hint]).pipe(Effect.asVoid);

  return {
    publish,
    ingestStdout: (chunk: string) =>
      Effect.gen(function* () {
        const current = yield* DateTime.now;
        const hints = parseStdoutHints(chunk, {
          now: () => DateTime.toDate(current),
        });
        return yield* publishMany(hints);
      }),
    ingestListeningPorts: (chunk: string, source: "netstat" | "lsof") =>
      Effect.gen(function* () {
        const current = yield* DateTime.now;
        const hints = parseListeningPorts(chunk, {
          source,
          now: () => DateTime.toDate(current),
        });
        return yield* publishMany(hints);
      }),
    get stream() {
      return Stream.fromPubSub(pubSub);
    },
    latest: () => Effect.sync(() => history),
  } satisfies PortSnifferShape;
});

export const PortSnifferLive = Layer.effect(PortSniffer, makePortSniffer);
