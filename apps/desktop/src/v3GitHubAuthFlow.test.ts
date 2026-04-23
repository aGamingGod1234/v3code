import { describe, expect, it } from "vitest";

import { createV3GitHubAuthFlow, type LoopbackServer } from "./v3GitHubAuthFlow.ts";

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

const makeLoopbackFactory = (
  port = 54322,
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
}) => {
  const opened: OpenedRequest[] = [];
  let tokenCalls = 0;
  let lastTokenBody: URLSearchParams | null = null;
  const { factory, lastServer } = makeLoopbackFactory(overrides?.port);
  const flow = createV3GitHubAuthFlow({
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
        okJson({ access_token: "gh_stub_token", scope: "repo,read:user", token_type: "bearer" })
      );
    },
    createLoopbackServer: factory,
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

describe("V3GitHubAuthFlow (loopback)", () => {
  it("opens the system browser and resolves with the access token after the loopback callback fires", async () => {
    const { flow, opened, getServer, getLastTokenBody } = setupFlow();
    const startPromise = flow.start({
      clientId: "gh-client-id",
      clientSecret: "gh-secret",
      scopes: "repo read:user",
    });
    await new Promise((resolve) => setImmediate(resolve));

    const state = extractStateFrom(opened);
    getServer()!.triggerCallback(`code=auth-code&state=${state}`);

    const tokens = await startPromise;
    expect(tokens.accessToken).toBe("gh_stub_token");
    expect(tokens.scopes).toEqual(["repo", "read:user"]);
    expect(tokens.tokenType).toBe("bearer");

    const body = getLastTokenBody();
    expect(body?.get("code")).toBe("auth-code");
    expect(body?.get("client_id")).toBe("gh-client-id");
    expect(body?.get("client_secret")).toBe("gh-secret");
    expect(getServer()!.closed()).toBe(true);
  });

  it("rejects when GitHub returns an error on the callback URL", async () => {
    const { flow, opened, getServer } = setupFlow();
    const startPromise = flow.start({
      clientId: "gh-client-id",
      clientSecret: "gh-secret",
      scopes: "repo",
    });
    await new Promise((resolve) => setImmediate(resolve));

    extractStateFrom(opened);
    getServer()!.triggerCallback(`error=access_denied`);

    await expect(startPromise).rejects.toThrow(/access_denied/);
    expect(getServer()!.closed()).toBe(true);
  });

  it("ignores callbacks whose state does not match the pending flow", async () => {
    const { flow, opened, getServer } = setupFlow();
    const startPromise = flow.start({
      clientId: "gh-client-id",
      clientSecret: "gh-secret",
      scopes: "repo",
    });
    await new Promise((resolve) => setImmediate(resolve));

    extractStateFrom(opened);
    // Wrong state — the flow should ignore this and remain pending.
    getServer()!.triggerCallback(`code=wrong&state=not-the-right-state`);

    // Triggering the correct state should still resolve.
    const url = new URL(opened[0]!.url);
    const state = url.searchParams.get("state")!;
    getServer()!.triggerCallback(`code=correct-code&state=${state}`);

    const tokens = await startPromise;
    expect(tokens.accessToken).toBe("gh_stub_token");
  });

  it("rejects when the token exchange returns an error body", async () => {
    const { flow, opened, getServer } = setupFlow({
      tokenResponse: () =>
        okJson({ error: "bad_verification_code", error_description: "The code expired" }),
    });
    const startPromise = flow.start({
      clientId: "gh-client-id",
      clientSecret: "gh-secret",
      scopes: "repo",
    });
    await new Promise((resolve) => setImmediate(resolve));

    const state = extractStateFrom(opened);
    getServer()!.triggerCallback(`code=auth-code&state=${state}`);

    await expect(startPromise).rejects.toThrow(/bad_verification_code/);
  });
});
