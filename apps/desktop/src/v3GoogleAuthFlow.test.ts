import { describe, expect, it } from "vitest";

import { createV3GoogleAuthFlow } from "./v3GoogleAuthFlow.ts";

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

interface OpenedRequest {
  readonly url: string;
}

const setupFlow = (overrides?: {
  readonly tokenResponse?: () => Response;
  readonly openExternalImpl?: (url: string) => Promise<void>;
}) => {
  const opened: OpenedRequest[] = [];
  let tokenCalls = 0;
  const flow = createV3GoogleAuthFlow({
    openExternal: overrides?.openExternalImpl
      ? overrides.openExternalImpl
      : async (url) => {
          opened.push({ url });
        },
    fetch: async () => {
      tokenCalls += 1;
      return (
        overrides?.tokenResponse?.() ??
        okJson({ id_token: "stubbed-id-token", access_token: "stubbed-access-token" })
      );
    },
  });
  return { flow, opened, getTokenCalls: () => tokenCalls };
};

const extractStateFrom = (opened: ReadonlyArray<OpenedRequest>): string => {
  expect(opened).toHaveLength(1);
  const url = new URL(opened[0]!.url);
  const state = url.searchParams.get("state");
  expect(state).not.toBeNull();
  return state!;
};

describe("V3GoogleAuthFlow", () => {
  it("opens the system browser and resolves with both tokens after a matching callback", async () => {
    const { flow, opened } = setupFlow();
    const startPromise = flow.start({ clientId: "test-client.apps.googleusercontent.com" });
    // Yield once so start() reaches the openExternal call and registers the pending flow.
    await Promise.resolve();
    const state = extractStateFrom(opened);
    const consumed = flow.handleDeepLink(`v3://auth/google/callback?code=fake-code&state=${state}`);
    expect(consumed).toBe(true);
    await expect(startPromise).resolves.toEqual({
      idToken: "stubbed-id-token",
      accessToken: "stubbed-access-token",
    });
    const authUrl = new URL(opened[0]!.url);
    const scope = authUrl.searchParams.get("scope") ?? "";
    expect(scope).toContain("openid");
    expect(scope).toContain("https://www.googleapis.com/auth/drive.appdata");
  });

  it("rejects when the token endpoint omits the access_token", async () => {
    const { flow, opened } = setupFlow({
      tokenResponse: () => okJson({ id_token: "only-id-token" }),
    });
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    const state = extractStateFrom(opened);
    flow.handleDeepLink(`v3://auth/google/callback?code=fake&state=${state}`);
    await expect(startPromise).rejects.toThrow(/access_token/);
  });

  it("rejects empty client ids without opening a browser", async () => {
    const { flow, opened } = setupFlow();
    await expect(flow.start({ clientId: "" })).rejects.toThrow(/empty/i);
    expect(opened).toHaveLength(0);
  });

  it("rejects callbacks whose state does not match the pending flow", async () => {
    const { flow, opened } = setupFlow();
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    extractStateFrom(opened);
    // Wrong state — must not consume or resolve.
    const consumed = flow.handleDeepLink("v3://auth/google/callback?code=ignored&state=mismatch");
    expect(consumed).toBe(false);
    flow.cancel();
    await expect(startPromise).rejects.toThrow(/cancel/i);
  });

  it("ignores deep links with a non-v3 scheme or wrong host/path", async () => {
    const { flow, opened } = setupFlow();
    void flow.start({ clientId: "test-client" }).catch(() => undefined);
    await Promise.resolve();
    const state = extractStateFrom(opened);
    expect(flow.handleDeepLink(`https://example.com/callback?code=x&state=${state}`)).toBe(false);
    expect(flow.handleDeepLink(`v3://other/path?code=x&state=${state}`)).toBe(false);
    flow.cancel();
  });

  it("propagates an explicit error parameter from Google", async () => {
    const { flow, opened } = setupFlow();
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    const state = extractStateFrom(opened);
    expect(
      flow.handleDeepLink(`v3://auth/google/callback?error=access_denied&state=${state}`),
    ).toBe(true);
    await expect(startPromise).rejects.toThrow(/access_denied/);
  });

  it("rejects when Google's token endpoint fails", async () => {
    const { flow, opened } = setupFlow({
      tokenResponse: () => new Response("rate limited", { status: 429 }),
    });
    const startPromise = flow.start({ clientId: "test-client" });
    await Promise.resolve();
    const state = extractStateFrom(opened);
    flow.handleDeepLink(`v3://auth/google/callback?code=fake&state=${state}`);
    await expect(startPromise).rejects.toThrow(/429/);
  });

  it("starts a new flow cancels the previous", async () => {
    const { flow } = setupFlow();
    const first = flow.start({ clientId: "client-a" });
    await Promise.resolve();
    void flow.start({ clientId: "client-b" }).catch(() => undefined);
    await expect(first).rejects.toThrow(/superseded/i);
    flow.cancel();
  });
});
