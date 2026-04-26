// V3 Code — Cloudflare Workers entrypoint.
//
// Wraps the V3 server bundle in the Workers request shape. Each
// request is routed through the same Effect-TS HTTP router the
// self-host build uses; the only Worker-specific piece is the
// D1 / R2 / Containers binding translation layer (see
// `./platform.ts`, which is built alongside the server bundle).
//
// Durable Objects pin per-session state. A signed-in device always
// lands on the same DO instance, which owns the WebSocket + the
// chat subscription PubSub for that device.

import type {
  D1Database,
  DurableObjectNamespace,
  ExecutionContext,
  Fetcher,
  R2Bucket,
  ScheduledEvent,
  WebSocket,
} from "@cloudflare/workers-types";

export interface Env {
  readonly V3_DB: D1Database;
  readonly V3_ATTACHMENTS: R2Bucket;
  readonly V3_MESH_SESSION: DurableObjectNamespace;
  readonly V3_CLOUD_ENV: Fetcher;
  readonly V3CODE_MODE: string;
  readonly V3CODE_CLOUDFLARE_DEPLOYMENT: string;
  readonly V3CODE_STARTUP_PRESENTATION: string;
  readonly V3CODE_NO_BROWSER: string;
  readonly V3CODE_GITHUB_OAUTH_SCOPES: string;
  readonly V3CODE_GOOGLE_CLIENT_ID?: string;
  readonly V3CODE_GOOGLE_CLIENT_SECRET?: string;
  readonly V3CODE_GITHUB_CLIENT_ID?: string;
  readonly V3CODE_GITHUB_CLIENT_SECRET?: string;
  readonly V3CODE_AUTHORIZED_EMAILS?: string;
  readonly V3CODE_TOKEN_ENCRYPTION_KEY?: string;
}

// The server bundle is produced by `bun run build --filter=t3` which
// emits an ESM bundle at `apps/server/dist/workers-entry.js`. We lazy-
// import it so Wrangler can analyse the top of this file without
// needing the server build to exist during `wrangler types`.
type WorkersServer = {
  readonly handleFetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
  readonly handleScheduled: (
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ) => Promise<void>;
};

let serverPromise: Promise<WorkersServer> | null = null;
const loadServer = (): Promise<WorkersServer> => {
  if (serverPromise === null) {
    // The build step points this import at
    // `../../../apps/server/dist/workers-entry.js`. `wrangler dev`
    // will fail until you've built once with `bun run build`.
    serverPromise = import("./server-bundle.js") as unknown as Promise<WorkersServer>;
  }
  return serverPromise;
};

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    const server = await loadServer();
    return server.handleFetch(request, env, ctx);
  },
  scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> => {
    const server = await loadServer();
    return server.handleScheduled(event, env, ctx);
  },
};

// Durable Object class. Each instance owns one signed-in session's
// mesh state. The `MeshSessionDurableObject` delegates to the same
// `meshWsHandlers` that the self-host build uses; the adapter reads
// the WebSocket envelope, calls the handler, and writes the response
// back. See `apps/server/src/mesh/meshWsHandlers.ts` for the handler
// implementation.
export class MeshSessionDurableObject {
  private readonly env: Env;
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    const bundle = await loadServer();
    // Delegate the WebSocket to the server-side mesh handler. The
    // handler reads/writes Effect-RPC frames over `server` directly;
    // when it returns, the socket closes and the DO hibernates.
    await (
      bundle as unknown as {
        handleMeshWebSocket: (
          socket: WebSocket,
          env: Env,
          state: DurableObjectState,
        ) => Promise<void>;
      }
    ).handleMeshWebSocket(server, this.env, this.state);
    return new Response(null, { status: 101, webSocket: client });
  }
}

// Ambient types. Workers types aren't loaded globally in this file to
// keep the entrypoint portable between edge runtimes; we narrow to
// the pieces we actually touch.
type DurableObjectState = {
  readonly id: { readonly toString: () => string };
  readonly storage: {
    readonly get: <T>(key: string) => Promise<T | undefined>;
    readonly put: <T>(key: string, value: T) => Promise<void>;
    readonly delete: (key: string) => Promise<boolean>;
  };
};

declare const WebSocketPair: new () => Record<string, WebSocket>;
