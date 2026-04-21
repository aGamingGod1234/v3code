import type {
  CloudGitHubBranchListResponse,
  CloudGitHubRepoListResponse,
  GitHubBranchSummary,
  GitHubRepoSummary,
  UserId,
} from "@v3tools/contracts";
import { Schema } from "effect";
import { Effect, Option } from "effect";

import { ServerSecretStore } from "../auth/Services/ServerSecretStore.ts";
import { UserRepository } from "../identity/Services/UserRepository.ts";
import { decrypt as decryptToken } from "../identity/tokenEncryption.ts";
import { CloudError, toCloudError } from "./errors.ts";

const GITHUB_TOKEN_ENCRYPTION_KEY_NAME = "v3-token-enc-key";
const GITHUB_TOKEN_ENCRYPTION_KEY_BYTES = 32;
const GITHUB_API_BASE = "https://api.github.com";

const RawGitHubRepo = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  full_name: Schema.String,
  owner: Schema.Struct({
    login: Schema.String,
  }),
  private: Schema.Boolean,
  default_branch: Schema.String,
  description: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
  html_url: Schema.String,
  language: Schema.NullOr(Schema.String),
});

const RawGitHubBranch = Schema.Struct({
  name: Schema.String,
  protected: Schema.Boolean,
  commit: Schema.Struct({
    sha: Schema.String,
  }),
});

const SearchRepositoriesResponse = Schema.Struct({
  items: Schema.Array(RawGitHubRepo),
});

function unpackGitHubEncryptedToken(input: {
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
}): { readonly ciphertext: Uint8Array; readonly iv: Uint8Array; readonly authTag: Uint8Array } {
  if (input.ciphertext.length <= 16) {
    throw new Error("Stored GitHub token is corrupted.");
  }
  return {
    ciphertext: input.ciphertext.slice(0, input.ciphertext.length - 16),
    iv: input.iv,
    authTag: input.ciphertext.slice(input.ciphertext.length - 16),
  };
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function parseGitHubJson<A, I>(response: Response, schema: Schema.Codec<A, I>): Promise<A> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      text.length > 0
        ? `GitHub API ${response.status}: ${text.slice(0, 240)}`
        : `GitHub API ${response.status}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? `GitHub API returned invalid JSON: ${cause.message}`
        : "GitHub API returned invalid JSON.",
      { cause },
    );
  }
  return Schema.decodeUnknownSync(schema)(parsed);
}

function toRepoSummary(raw: typeof RawGitHubRepo.Type): GitHubRepoSummary {
  return {
    id: raw.id,
    name: raw.name as GitHubRepoSummary["name"],
    fullName: raw.full_name as GitHubRepoSummary["fullName"],
    owner: raw.owner.login as GitHubRepoSummary["owner"],
    private: raw.private,
    defaultBranch: raw.default_branch as GitHubRepoSummary["defaultBranch"],
    description: raw.description,
    updatedAt: raw.updated_at as GitHubRepoSummary["updatedAt"],
    htmlUrl: raw.html_url as GitHubRepoSummary["htmlUrl"],
    language: raw.language,
  };
}

function toBranchSummary(raw: typeof RawGitHubBranch.Type): GitHubBranchSummary {
  return {
    name: raw.name as GitHubBranchSummary["name"],
    commitSha: raw.commit.sha as GitHubBranchSummary["commitSha"],
    protected: raw.protected,
  };
}

export const loadGitHubAccessTokenForUser = Effect.fn("loadGitHubAccessTokenForUser")(function* (
  userId: UserId,
) {
  const users = yield* UserRepository;
  const secrets = yield* ServerSecretStore;
  const tokenRecord = yield* users.getGitHubToken({ id: userId });
  if (Option.isNone(tokenRecord)) {
    return yield* new CloudError({ message: "GitHub is not connected for this V3 account." });
  }

  const key = yield* secrets.getOrCreateRandom(
    GITHUB_TOKEN_ENCRYPTION_KEY_NAME,
    GITHUB_TOKEN_ENCRYPTION_KEY_BYTES,
  );
  return yield* Effect.try({
    try: () =>
      decryptToken(
        unpackGitHubEncryptedToken({
          ciphertext: tokenRecord.value.githubAccessTokenEnc,
          iv: tokenRecord.value.githubTokenEncIv,
        }),
        key,
      ),
    catch: toCloudError("Failed to decrypt the stored GitHub token."),
  });
});

export const listGitHubReposForUser = Effect.fn("listGitHubReposForUser")(function* (input: {
  readonly userId: UserId;
  readonly query?: string;
  readonly page?: number;
  readonly perPage?: number;
}) {
  const accessToken = yield* loadGitHubAccessTokenForUser(input.userId);
  const page = Math.max(input.page ?? 1, 1);
  const perPage = Math.min(Math.max(input.perPage ?? 25, 1), 100);
  const trimmedQuery = input.query?.trim() ?? "";
  const endpoint =
    trimmedQuery.length > 0
      ? `${GITHUB_API_BASE}/search/repositories?${new URLSearchParams({
          q: `${trimmedQuery} in:name,description,readme fork:true`,
          per_page: String(perPage),
          page: String(page),
          sort: "updated",
          order: "desc",
        }).toString()}`
      : `${GITHUB_API_BASE}/user/repos?${new URLSearchParams({
          per_page: String(perPage),
          page: String(page),
          sort: "pushed",
          direction: "desc",
        }).toString()}`;

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(endpoint, {
        method: "GET",
        headers: githubHeaders(accessToken),
      }),
    catch: toCloudError("Failed to reach the GitHub API."),
  });

  const repos = yield* Effect.tryPromise({
    try: async () => {
      if (trimmedQuery.length > 0) {
        const body = await parseGitHubJson(response, SearchRepositoriesResponse);
        return body.items.map(toRepoSummary);
      }
      const body = await parseGitHubJson(response, Schema.Array(RawGitHubRepo));
      return body.map(toRepoSummary);
    },
    catch: toCloudError("Failed to decode GitHub repositories."),
  });

  return {
    repos,
    hasMore: repos.length === perPage,
    nextPage: page + 1,
  } satisfies CloudGitHubRepoListResponse;
});

export const listGitHubBranchesForUser = Effect.fn("listGitHubBranchesForUser")(function* (input: {
  readonly userId: UserId;
  readonly repoFullName: string;
  readonly page?: number;
  readonly perPage?: number;
}) {
  const accessToken = yield* loadGitHubAccessTokenForUser(input.userId);
  const page = Math.max(input.page ?? 1, 1);
  const perPage = Math.min(Math.max(input.perPage ?? 50, 1), 100);
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(
        `${GITHUB_API_BASE}/repos/${input.repoFullName}/branches?${new URLSearchParams({
          per_page: String(perPage),
          page: String(page),
        }).toString()}`,
        {
          method: "GET",
          headers: githubHeaders(accessToken),
        },
      ),
    catch: toCloudError("Failed to reach the GitHub API."),
  });

  const branches = yield* Effect.tryPromise({
    try: () => parseGitHubJson(response, Schema.Array(RawGitHubBranch)),
    catch: toCloudError("Failed to decode GitHub branches."),
  });

  return {
    branches: branches.map(toBranchSummary),
    hasMore: branches.length === perPage,
    nextPage: page + 1,
  } satisfies CloudGitHubBranchListResponse;
});
