import { describe, expect, it } from "vitest";

import {
  GitHubApiError,
  listAuthenticatedUserRepos,
  listRepoBranches,
  parseRepoSpec,
} from "./githubApi";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const throwingFetch: typeof fetch = async () => {
  throw new Error("offline");
};

describe("parseRepoSpec", () => {
  it("parses owner/repo shorthand", () => {
    expect(parseRepoSpec("aGamingGod1234/v3code")).toEqual({
      owner: "aGamingGod1234",
      repo: "v3code",
    });
  });

  it("parses HTTPS clone URLs with the .git suffix", () => {
    expect(parseRepoSpec("https://github.com/pingdotgg/t3code.git")).toEqual({
      owner: "pingdotgg",
      repo: "t3code",
    });
  });

  it("parses web URLs without the .git suffix", () => {
    expect(parseRepoSpec("https://github.com/pingdotgg/t3code")).toEqual({
      owner: "pingdotgg",
      repo: "t3code",
    });
  });

  it("rejects malformed input", () => {
    expect(parseRepoSpec("")).toBeNull();
    expect(parseRepoSpec("just a string")).toBeNull();
    expect(parseRepoSpec("https://evil.com/owner/repo")).toBeNull();
  });
});

describe("listAuthenticatedUserRepos", () => {
  it("hits /user/repos with the `pushed` sort when no query is provided", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({
        url: typeof input === "string" ? input : (input as URL).toString(),
        headers: new Headers((init as RequestInit).headers),
      });
      return jsonResponse(200, [
        {
          id: 1,
          name: "v3code",
          full_name: "aGamingGod1234/v3code",
          owner: { login: "aGamingGod1234" },
          private: true,
          default_branch: "v3-dev",
          description: null,
          updated_at: "2026-04-20T00:00:00Z",
          html_url: "https://github.com/aGamingGod1234/v3code",
          language: "TypeScript",
        },
      ]);
    };
    const result = await listAuthenticatedUserRepos({
      token: "ghp_xxx",
      fetchImpl,
    });
    expect(result.repos).toHaveLength(1);
    const firstRepo = result.repos[0];
    if (!firstRepo) throw new Error("expected one repo");
    expect(firstRepo.defaultBranch).toBe("v3-dev");
    expect(firstRepo.private).toBe(true);
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    if (!firstCall) throw new Error("expected one captured fetch call");
    expect(firstCall.url).toContain("/user/repos");
    expect(firstCall.url).toContain("sort=pushed");
    expect(firstCall.headers.get("Authorization")).toBe("Bearer ghp_xxx");
    expect(firstCall.headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
  });

  it("switches to /search/repositories when a query is present", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(typeof input === "string" ? input : (input as URL).toString());
      return jsonResponse(200, {
        total_count: 1,
        items: [
          {
            id: 99,
            name: "v3code",
            full_name: "aGamingGod1234/v3code",
            owner: { login: "aGamingGod1234" },
            private: false,
            default_branch: "main",
            description: "Mesh coding",
            updated_at: "2026-04-19T00:00:00Z",
            html_url: "https://github.com/aGamingGod1234/v3code",
            language: "TypeScript",
          },
        ],
      });
    };
    const result = await listAuthenticatedUserRepos({
      token: "ghp_xxx",
      query: "v3code",
      fetchImpl,
    });
    expect(result.repos).toHaveLength(1);
    expect(calls[0]).toContain("/search/repositories");
    expect(calls[0]).toContain("q=v3code");
  });

  it("raises GitHubApiError(unauthorised) on 401", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(401, { message: "Bad credentials" });
    await expect(listAuthenticatedUserRepos({ token: "bad", fetchImpl })).rejects.toMatchObject({
      name: "GitHubApiError",
      status: 401,
      kind: "unauthorised",
    });
  });

  it("raises GitHubApiError(rate-limited) on 429", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(429, { message: "slow down" });
    await expect(listAuthenticatedUserRepos({ token: "x", fetchImpl })).rejects.toMatchObject({
      kind: "rate-limited",
    });
  });

  it("raises GitHubApiError(network) when fetch throws", async () => {
    await expect(
      listAuthenticatedUserRepos({ token: "x", fetchImpl: throwingFetch }),
    ).rejects.toMatchObject({
      kind: "network",
    });
  });
});

describe("listRepoBranches", () => {
  it("returns normalised branch rows", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(200, [
        { name: "main", commit: { sha: "abc" }, protected: true },
        { name: "feature/x", commit: { sha: "def" }, protected: false },
      ]);
    const result = await listRepoBranches({
      token: "x",
      fullName: "owner/repo",
      fetchImpl,
    });
    expect(result.branches).toEqual([
      { name: "main", commitSha: "abc", protected: true },
      { name: "feature/x", commitSha: "def", protected: false },
    ]);
  });

  it("surfaces 404 as GitHubApiError(not-found)", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(404, "Not Found");
    await expect(
      listRepoBranches({ token: "x", fullName: "nope/doesnt-exist", fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubApiError);
  });
});
