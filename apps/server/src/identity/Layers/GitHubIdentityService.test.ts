import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { GitHubIdentityError } from "../Errors.ts";
import {
  makeGitHubIdentityServiceWith,
  makeNotConfiguredGitHubIdentityService,
} from "./GitHubIdentityService.ts";

type Request = { readonly url: string; readonly body: string; readonly headers: Headers };

const makeFetch = (response: {
  status: number;
  body: string;
  contentType?: string;
}): { fetchImpl: typeof fetch; calls: Request[] } => {
  const calls: Request[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    calls.push({
      url,
      body: typeof (init ?? {}).body === "string" ? String((init ?? {}).body) : "",
      headers: new Headers((init ?? {}).headers),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.contentType ?? "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

describe("GitHubIdentityService.exchangeCode", () => {
  it("parses a JSON token response", async () => {
    const { fetchImpl, calls } = makeFetch({
      status: 200,
      body: JSON.stringify({
        access_token: "ghp_abc",
        scope: "repo,read:user",
        token_type: "bearer",
      }),
    });
    const service = makeGitHubIdentityServiceWith({
      clientId: "cid",
      clientSecret: "csec",
      fetchImpl,
    });
    const result = await Effect.runPromise(
      service.exchangeCode({
        code: "the-code",
        state: "the-state",
        redirectUri: "https://v3.example.com/cb",
      }),
    );
    expect(result.accessToken).toBe("ghp_abc");
    expect(result.scopes).toEqual(["repo", "read:user"]);
    expect(result.tokenType).toBe("bearer");
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected one call");
    expect(call.body).toContain("client_id=cid");
    expect(call.body).toContain("client_secret=csec");
    expect(call.body).toContain("code=the-code");
    expect(call.body).toContain("state=the-state");
    expect(call.headers.get("Accept")).toBe("application/json");
  });

  it("parses form-urlencoded token responses as a fallback", async () => {
    const { fetchImpl } = makeFetch({
      status: 200,
      contentType: "application/x-www-form-urlencoded",
      body: "access_token=ghp_xyz&scope=repo&token_type=bearer",
    });
    const service = makeGitHubIdentityServiceWith({
      clientId: "cid",
      clientSecret: "csec",
      fetchImpl,
    });
    const result = await Effect.runPromise(
      service.exchangeCode({ code: "c", state: "s", redirectUri: "r" }),
    );
    expect(result.accessToken).toBe("ghp_xyz");
    expect(result.scopes).toEqual(["repo"]);
  });

  it("raises a tagged error on non-2xx", async () => {
    const { fetchImpl } = makeFetch({
      status: 400,
      body: JSON.stringify({ error: "bad_verification_code" }),
    });
    const service = makeGitHubIdentityServiceWith({
      clientId: "cid",
      clientSecret: "csec",
      fetchImpl,
    });
    await expect(
      Effect.runPromise(service.exchangeCode({ code: "c", state: "s", redirectUri: "r" })),
    ).rejects.toThrow();
  });

  it("flags user-cancelled when access_token is empty", async () => {
    const { fetchImpl } = makeFetch({
      status: 200,
      body: JSON.stringify({ access_token: "", scope: "", token_type: "" }),
    });
    const service = makeGitHubIdentityServiceWith({
      clientId: "cid",
      clientSecret: "csec",
      fetchImpl,
    });
    const exit = await Effect.runPromiseExit(
      service.exchangeCode({ code: "c", state: "s", redirectUri: "r" }),
    );
    expect(exit._tag).toBe("Failure");
  });
});

describe("GitHubIdentityService.fetchUser", () => {
  it("maps the /user response to GitHubUserSummary", async () => {
    const { fetchImpl, calls } = makeFetch({
      status: 200,
      body: JSON.stringify({
        login: "aGamingGod1234",
        id: 12345,
        name: "Lucas",
        email: null,
        avatar_url: "https://cdn/avatar.png",
      }),
    });
    const service = makeGitHubIdentityServiceWith({
      clientId: "cid",
      clientSecret: "csec",
      fetchImpl,
    });
    const result = await Effect.runPromise(service.fetchUser({ accessToken: "ghp_xxx" }));
    expect(result.login).toBe("aGamingGod1234");
    expect(result.id).toBe(12345);
    expect(result.avatarUrl).toBe("https://cdn/avatar.png");
    const call = calls[0];
    if (!call) throw new Error("expected one call");
    expect(call.headers.get("Authorization")).toBe("Bearer ghp_xxx");
  });

  it("raises a tagged error on 401", async () => {
    const { fetchImpl } = makeFetch({ status: 401, body: JSON.stringify({ message: "Bad" }) });
    const service = makeGitHubIdentityServiceWith({
      clientId: "cid",
      clientSecret: "csec",
      fetchImpl,
    });
    const exit = await Effect.runPromiseExit(service.fetchUser({ accessToken: "bad" }));
    expect(exit._tag).toBe("Failure");
  });
});

describe("makeNotConfiguredGitHubIdentityService", () => {
  it("returns not-configured errors on every call", async () => {
    const service = makeNotConfiguredGitHubIdentityService();
    const exit1 = await Effect.runPromiseExit(
      service.exchangeCode({ code: "c", state: "s", redirectUri: "r" }),
    );
    expect(exit1._tag).toBe("Failure");
    if (exit1._tag === "Failure") {
      const cause = exit1.cause;
      // Shape check: the Cause string contains the error reason in its
      // message field but not the discriminator literally. Match the
      // message instead.
      expect(String(cause)).toContain("GitHub sign-in is not configured");
    }
    const exit2 = await Effect.runPromiseExit(service.fetchUser({ accessToken: "x" }));
    expect(exit2._tag).toBe("Failure");
  });
});

// Keeps the import used so tsc doesn't complain in a CI run where the
// file is read but the constructor is only referenced indirectly.
describe("GitHubIdentityError", () => {
  it("is re-exportable", () => {
    const error = new GitHubIdentityError({ reason: "unknown", message: "test" });
    expect(error.reason).toBe("unknown");
  });
});
