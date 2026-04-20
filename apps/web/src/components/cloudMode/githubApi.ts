// V3 Phase 7 — GitHub REST API client for the cloud-mode repo picker.
//
// The user-owned GitHub App flow that P8 delivers will mint installation
// tokens on the server-node and expose a thin proxy over the server's
// WebSocket so browsers never hold a GitHub token. Phase 7 needs a repo
// browser before that proxy exists, so this module accepts a **caller-
// supplied access token** (personal access token, classic PAT, or a
// fine-grained token) and talks directly to `api.github.com`.
//
// When P8 lands, the same React component will swap `githubApi` for a
// server-proxied implementation without changing its shape.
//
// Everything in this file is pure: the network call is threaded through
// a `fetchImpl` parameter so the tests can run without mocking globals.

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_PAGE_SIZE = 30;

export interface GitHubRepoSummary {
  readonly id: number;
  readonly name: string;
  readonly fullName: string; // "owner/repo"
  readonly owner: string;
  readonly private: boolean;
  readonly defaultBranch: string;
  readonly description: string | null;
  readonly updatedAt: string;
  readonly htmlUrl: string;
  readonly language: string | null;
}

export interface GitHubBranchSummary {
  readonly name: string;
  readonly commitSha: string;
  readonly protected: boolean;
}

export class GitHubApiError extends Error {
  override readonly name = "GitHubApiError";
  readonly status: number;
  readonly kind:
    | "unauthorised"
    | "forbidden"
    | "rate-limited"
    | "not-found"
    | "network"
    | "malformed"
    | "other";
  constructor(status: number, kind: GitHubApiError["kind"], message: string) {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

interface ListReposOptions {
  readonly token: string;
  readonly query?: string;
  readonly visibility?: "all" | "public" | "private";
  readonly page?: number;
  readonly perPage?: number;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal | undefined;
}

const authHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

const statusToKind = (status: number): GitHubApiError["kind"] => {
  if (status === 401) return "unauthorised";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 429) return "rate-limited";
  return "other";
};

const parseOrThrow = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!response.ok) {
    throw new GitHubApiError(
      response.status,
      statusToKind(response.status),
      text.length > 0
        ? `GitHub API ${response.status}: ${text.slice(0, 240)}`
        : `GitHub API ${response.status}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new GitHubApiError(
      response.status,
      "malformed",
      `GitHub API returned non-JSON payload: ${(cause as Error).message}`,
    );
  }
};

const toRepoSummary = (raw: Record<string, unknown>): GitHubRepoSummary => {
  const owner = (raw.owner as { login?: string } | undefined)?.login ?? "unknown";
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ""),
    fullName: String(raw.full_name ?? `${owner}/${raw.name ?? ""}`),
    owner,
    private: raw.private === true,
    defaultBranch: String(raw.default_branch ?? "main"),
    description: raw.description === null ? null : String(raw.description ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
    htmlUrl: String(raw.html_url ?? ""),
    language: raw.language === null || raw.language === undefined ? null : String(raw.language),
  };
};

const toBranchSummary = (raw: Record<string, unknown>): GitHubBranchSummary => {
  const commitSha = (raw.commit as { sha?: string } | undefined)?.sha ?? "";
  return {
    name: String(raw.name ?? ""),
    commitSha: commitSha,
    protected: raw.protected === true,
  };
};

/**
 * List the authenticated user's repositories. Ordered by most recent
 * activity so the picker lands on what the user most likely wants.
 */
export const listAuthenticatedUserRepos = async (
  options: ListReposOptions,
): Promise<{
  readonly repos: ReadonlyArray<GitHubRepoSummary>;
  readonly hasMore: boolean;
  readonly nextPage: number;
}> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PAGE_SIZE, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    sort: "pushed",
    direction: "desc",
  });
  if (options.visibility && options.visibility !== "all") {
    params.set("visibility", options.visibility);
  }

  // When the user has typed a query, `/search/repositories` with
  // `user:@me` scope gives much better results than /user/repos
  // client-side filtering. The `/user/repos` path returns at most
  // 100 rows per page, so searching with an empty query is wasteful.
  const trimmedQuery = options.query?.trim() ?? "";
  const searchMode = trimmedQuery.length > 0;
  const endpoint = searchMode
    ? `${GITHUB_API_BASE}/search/repositories?${new URLSearchParams({
        q: `${trimmedQuery} in:name,description,readme fork:true`,
        per_page: String(perPage),
        page: String(page),
        sort: "updated",
        order: "desc",
      }).toString()}`
    : `${GITHUB_API_BASE}/user/repos?${params.toString()}`;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: authHeaders(options.token),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    throw new GitHubApiError(0, "network", `GitHub API network error: ${(cause as Error).message}`);
  }

  const body = (await parseOrThrow(response)) as Record<string, unknown> | Array<unknown>;

  if (searchMode) {
    const resultsRaw = (body as { items?: unknown }).items;
    if (!Array.isArray(resultsRaw)) {
      throw new GitHubApiError(response.status, "malformed", "Search response missing items[]");
    }
    return {
      repos: resultsRaw
        .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
        .map(toRepoSummary),
      hasMore: resultsRaw.length === perPage,
      nextPage: page + 1,
    };
  }

  if (!Array.isArray(body)) {
    throw new GitHubApiError(response.status, "malformed", "List response is not an array");
  }
  return {
    repos: body
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map(toRepoSummary),
    hasMore: body.length === perPage,
    nextPage: page + 1,
  };
};

interface ListBranchesOptions {
  readonly token: string;
  readonly fullName: string; // "owner/repo"
  readonly page?: number;
  readonly perPage?: number;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal | undefined;
}

export const listRepoBranches = async (
  options: ListBranchesOptions,
): Promise<{
  readonly branches: ReadonlyArray<GitHubBranchSummary>;
  readonly hasMore: boolean;
  readonly nextPage: number;
}> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PAGE_SIZE, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const endpoint = `${GITHUB_API_BASE}/repos/${options.fullName}/branches?${new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  }).toString()}`;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: authHeaders(options.token),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    throw new GitHubApiError(0, "network", `GitHub API network error: ${(cause as Error).message}`);
  }

  const body = await parseOrThrow(response);
  if (!Array.isArray(body)) {
    throw new GitHubApiError(response.status, "malformed", "Branches response is not an array");
  }
  return {
    branches: body
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map(toBranchSummary),
    hasMore: body.length === perPage,
    nextPage: page + 1,
  };
};

/**
 * Accept either `owner/repo` or a full `https://github.com/owner/repo[.git]`
 * URL and normalise into `{ owner, repo }`. Used by the repo browser's
 * "paste a link" escape hatch so the user can bypass the interactive
 * picker for private repos where search ranking misses.
 */
export const parseRepoSpec = (input: string): { owner: string; repo: string } | null => {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (urlMatch && urlMatch[1] && urlMatch[2]) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  const slashMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (slashMatch && slashMatch[1] && slashMatch[2]) {
    return { owner: slashMatch[1], repo: slashMatch[2] };
  }

  return null;
};
