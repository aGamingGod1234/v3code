import { describe, expect, it } from "vitest";

import { createV3GoogleAuthFlow, type LoopbackServer } from "./v3GoogleAuthFlow.ts";

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

interface OpenedRequest {
  readonly url: string;
}

interface MockLoopbackServer extends LoopbackServer {
  readonly closed: () => boolean;
  readonly triggerCallback: (query: string) => void;
}

// Build a fake loopback server factory that the flow can use in place of
// a real http.Server. Captures the onCallback handler so tests can
// synthesise the Google redirect without actually opening sockets.
const makeLoopbackFactory = (
  port = 54321,
): {
  readonly factory: (onCallback: (url: URL) => void) => Promise<LoopbackServer>;
  readonly lastServer: () => MockLoopbackServer | null;
} => {
  let last: MockLoopbackServer | null = null;
  return {
    factory: async (onCallback) => {
      let closed = false;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const server: MockLoopbackServer = {
        redirectUri,
        close: () => {
          closed = true;
        },
        closed: () => closed,
        triggerCallback: (query: string) => {
          onCallback(new URL(`${redirectUri}?${query}`));
        },
      };
      last = server;
      return server;
    },
    lastServer: () => last,
  };
};

const setupFlow = (overrides?: {
  readonly tokenResponse?: () => Response;
  readonly openExternalImpl?: (url: string) => Promise<void>;
  readonly port?: number;
  readonly clientSecret?: string | null;
}) => {
  const opened: OpenedRequest[] = [];
  let tokenCalls = 0;
  let lastTokenBody: URLSearchParams | null = null;
  const { factory, lastServer } = makeLoopbackFactory(overrides?.port);
  const flow = createV3GoogleAuthFlow({
    openExternal: overrides?.openExternalImpl
      ? overrides.openExternalImpl
      : async (url) => {
          opened.push({ url });
        },
    fetch: async (_url, init) => {
      tokenCalls += 1;
      const body = (init?.body ?? null) as string | null;
      lastTokenBody = body ? new URLSearchParams(body) : null;
      return (
        overrides?.tokenResponse?.() ??
        okJson({ id_token: "stubbed-id-token", access_token: "stubbed-access-token" })
      );
    },
    createLoopbackServer: factory,
    clientSecret: overrides?.clientSecret ?? null,
  });
  return {
    flow,
    opened,
    getTokenCalls: () => tokenCalls,
    getLastTokenBody: () => lastTokenBody,
    getServer: () => lastServer(),
  };
};

const extractStateFrom = (opened: ReadonlyArray<OpenedRequest>): string => {
  expect(opened).toHaveLength(1);
  const url = new URL(opened[0]!.url);
  const state = url.searchParams.get("state");
  expect(state).not.toBeNull();
  return state!;
};

describe("V3GoogleAuthFlow (loopback)", () => {
  it("opens the system browser and resolves with both tokens after the loopback callback fires", async () => {
    const { flow, opened, getServer, getLastTokenBody } = setupFlow();
    const startPromise = flow.start({ clientId: "test-client.apps.googleusercontent.com" });
    // Yield once so start() reaches openExternal and registers the pending flow.
    await Promise.resolve();
    await Promise.resolve();
    const state = extractStateFrom(opened);
    const server = getServer();
    expect(server).not.toBeNull();
    server!.triggerCallback(`code=fake-code&state=${state}`);
    const result = await startPromise;
    expect(result).toMatchObject({
      idToken: "stubbed-id-token",
      accessToken: "stubbed-access-token",
      refreshToken: null,
      scope: null,
      tokenType: null,
    });
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());

    // Auth URL must include the loopback redirect the mock server handed us
    // and request the expected scopes.
    const authUrl = new URL(opened[0]!.url);
    expect(authUrl.searchParams.get("redirect_uri")).toBe(server!.redirectUri);
    const scope = authUrl.searchParams.get("scope") ?? "";
    expect(scope).toContain("openid");
    expect(scope).toContain("https://www.googleapis.com/auth/drive.appdata");

    // Token exchange body must echo the same redirect_uri (Google enforces
    // exact match between authorize + token request).
    const body = getLastTokenBody();
    expect(body).not.toBeNull();
    expect(body!.get("redirect_uri")).toBe(server!.redirectUri);
    expect(body!.get("grant_type")).toBe("authorization_code");

    // Server must be closed after the flow resolves.
    expect(server!.closed()).toBe(true);
  });

  it("rejects when the token endpoint omits the access_token", async () => {
    const { flow, opened, getServer } = setupFlow({
      tokenResponse: () => okJson({ id_token: "only-id-token" }),
    });
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    await Promise.resolve();
    const state = extractStateFrom(opened);
    getServer()!.triggerCallback(`code=fake&state=${state}`);
    await expect(startPromise).rejects.toThrow(/access_token/);
  });

  it("rejects empty client ids without opening a browser", async () => {
    const { flow, opened } = setupFlow();
    await expect(flow.start({ clientId: "" })).rejects.toThrow(/empty/i);
    expect(opened).toHaveLength(0);
  });

  it("ignores callbacks whose state does not match the pending flow", async () => {
    const { flow, opened, getServer } = setupFlow();
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    await Promise.resolve();
    extractStateFrom(opened);
    // Wrong state — should not resolve or reject the pending flow.
    getServer()!.triggerCallback("code=ignored&state=mismatch");
    flow.cancel();
    await expect(startPromise).rejects.toThrow(/cancel/i);
  });

  it("propagates an explicit error parameter from Google", async () => {
    const { flow, opened, getServer } = setupFlow();
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    await Promise.resolve();
    const state = extractStateFrom(opened);
    getServer()!.triggerCallback(`error=access_denied&state=${state}`);
    await expect(startPromise).rejects.toThrow(/access_denied/);
  });

  it("rejects when Google's token endpoint fails", async () => {
    const { flow, opened, getServer } = setupFlow({
      tokenResponse: () => new Response("rate limited", { status: 429 }),
    });
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    await Promise.resolve();
    const state = extractStateFrom(opened);
    getServer()!.triggerCallback(`code=fake&state=${state}`);
    await expect(startPromise).rejects.toThrow(/429/);
  });

  it("starting a new flow cancels the previous one and closes its loopback server", async () => {
    const { flow, getServer } = setupFlow();
    const first = flow.start({ clientId: "client-a" });
    await Promise.resolve();
    await Promise.resolve();
    const firstServer = getServer();
    expect(firstServer).not.toBeNull();
    void flow.start({ clientId: "client-b" }).catch(() => undefined);
    await expect(first).rejects.toThrow(/superseded/i);
    expect(firstServer!.closed()).toBe(true);
    flow.cancel();
  });

  it("includes client_secret in the token exchange when baked into the build", async () => {
    const { flow, opened, getServer, getLastTokenBody } = setupFlow({
      clientSecret: "baked-secret",
    });
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    await Promise.resolve();
    const state = extractStateFrom(opened);
    getServer()!.triggerCallback(`code=fake&state=${state}`);
    await startPromise;
    const body = getLastTokenBody();
    expect(body).not.toBeNull();
    expect(body!.get("client_secret")).toBe("baked-secret");
    expect(body!.get("code_verifier")).not.toBeNull();
  });

  it("omits client_secret when bundle does not ship one (Desktop-type OAuth clients)", async () => {
    const { flow, opened, getServer, getLastTokenBody } = setupFlow({ clientSecret: null });
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    await Promise.resolve();
    const state = extractStateFrom(opened);
    getServer()!.triggerCallback(`code=fake&state=${state}`);
    await startPromise;
    const body = getLastTokenBody();
    expect(body).not.toBeNull();
    expect(body!.get("client_secret")).toBeNull();
    expect(body!.get("code_verifier")).not.toBeNull();
  });

  it("handleDeepLink is a no-op and does not consume v3:// URLs", async () => {
    const { flow, opened } = setupFlow();
    void flow.start({ clientId: "test-client" }).catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
    const state = extractStateFrom(opened);
    // Legacy deep-link callers must not crash, but the loopback flow
    // ignores them entirely.
    expect(flow.handleDeepLink(`v3://auth/google/callback?code=x&state=${state}`)).toBe(false);
    flow.cancel();
  });
});
