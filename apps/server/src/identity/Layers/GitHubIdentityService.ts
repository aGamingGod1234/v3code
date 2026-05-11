// V3 Phase 1e — Live + test factory for the GitHub identity service.
//
// The Live layer consumes `ServerConfig.githubClientId` +
// `.githubClientSecret` and issues real HTTPS calls to GitHub. When
// either secret is unset the redirect-code exchange returns a
// `not-configured` GitHubIdentityError, while token profile validation
// remains available for desktop Device Flow bootstrap.

import { Effect, Layer, Schema } from "effect";

import type { GitHubUserSummary } from "@v3tools/contracts";

import { ServerConfig } from "../../config.ts";
import { GitHubIdentityError } from "../Errors.ts";

const isGitHubIdentityError = Schema.is(GitHubIdentityError);
import {
  GitHubIdentityService,
  type GitHubIdentityServiceShape,
} from "../Services/GitHubIdentityService.ts";

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

interface GitHubTokenResponse {
  readonly access_token: string;
  readonly scope: string;
  readonly token_type: string;
}

const isTokenResponse = (value: unknown): value is GitHubTokenResponse =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>).access_token === "string" &&
  typeof (value as Record<string, unknown>).scope === "string" &&
  typeof (value as Record<string, unknown>).token_type === "string";

const clampScopes = (scope: string): ReadonlyArray<string> =>
  scope
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export interface GitHubIdentityServiceFactoryOptions {
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly fetchImpl: typeof fetch;
}

/**
 * Pure factory used by tests. The Live layer below wires production fetch +
 * operator config into this factory.
 */
export const makeGitHubIdentityServiceWith = (
  opts: GitHubIdentityServiceFactoryOptions,
): GitHubIdentityServiceShape => {
  const exchangeCode: GitHubIdentityServiceShape["exchangeCode"] = (input) =>
    Effect.tryPromise({
      try: async () => {
        if (!opts.clientId || !opts.clientSecret) {
          throw new GitHubIdentityError({
            reason: "not-configured",
            message: "GitHub sign-in is not configured on this server.",
          });
        }
        const body = new URLSearchParams({
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
          code: input.code,
          state: input.state,
          redirect_uri: input.redirectUri,
        });
        const response = await opts.fetchImpl(GITHUB_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": "v3-code/0.1",
          },
          body: body.toString(),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new GitHubIdentityError({
            reason: "token-exchange",
            message: `GitHub token endpoint responded with ${response.status}: ${text.slice(0, 200)}`,
          });
        }
        // GitHub returns application/json only when Accept is set; older
        // setups sometimes return application/x-www-form-urlencoded. Try
        // JSON first, fall back to URLSearchParams.
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          const params = new URLSearchParams(text);
          parsed = {
            access_token: params.get("access_token") ?? "",
            scope: params.get("scope") ?? "",
            token_type: params.get("token_type") ?? "",
          } satisfies GitHubTokenResponse;
        }
        if (!isTokenResponse(parsed)) {
          throw new GitHubIdentityError({
            reason: "token-exchange",
            message: "GitHub token response missing access_token/scope/token_type.",
          });
        }
        if (parsed.access_token.length === 0) {
          throw new GitHubIdentityError({
            reason: "user-cancelled",
            message: "GitHub returned an empty access_token — user may have cancelled.",
          });
        }
        return {
          accessToken: parsed.access_token,
          scopes: clampScopes(parsed.scope),
          tokenType: parsed.token_type,
        };
      },
      catch: (cause) =>
        isGitHubIdentityError(cause)
          ? cause
          : new GitHubIdentityError({
              reason: "unknown",
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
    });

  const fetchUser: GitHubIdentityServiceShape["fetchUser"] = (input) =>
    Effect.tryPromise({
      try: async () => {
        const response = await opts.fetchImpl(GITHUB_USER_URL, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "v3-code/0.1",
          },
        });
        const text = await response.text();
        if (!response.ok) {
          throw new GitHubIdentityError({
            reason: "profile-fetch",
            message: `GitHub /user responded with ${response.status}: ${text.slice(0, 200)}`,
          });
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch (cause) {
          throw new GitHubIdentityError({
            reason: "profile-fetch",
            message: `GitHub /user returned non-JSON: ${(cause as Error).message}`,
            cause,
          });
        }
        const login = typeof parsed.login === "string" ? parsed.login.trim() : "";
        const id = typeof parsed.id === "number" ? parsed.id : 0;
        if (login.length === 0 || id === 0) {
          throw new GitHubIdentityError({
            reason: "profile-fetch",
            message: "GitHub /user response missing login or id.",
          });
        }
        const summary: GitHubUserSummary = {
          login: login as GitHubUserSummary["login"],
          id,
          name: typeof parsed.name === "string" ? parsed.name : null,
          email: typeof parsed.email === "string" ? parsed.email : null,
          avatarUrl: typeof parsed.avatar_url === "string" ? parsed.avatar_url : null,
        };
        return summary;
      },
      catch: (cause) =>
        isGitHubIdentityError(cause)
          ? cause
          : new GitHubIdentityError({
              reason: "unknown",
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
    });

  return { exchangeCode, fetchUser };
};

/**
 * Builds a service that fails fast with `not-configured` on every call.
 * Kept for tests and explicit disabled-service wiring.
 */
export const makeNotConfiguredGitHubIdentityService = (): GitHubIdentityServiceShape => {
  const notConfigured = Effect.fail(
    new GitHubIdentityError({
      reason: "not-configured",
      message: "GitHub sign-in is not configured on this server.",
    }),
  );
  return {
    exchangeCode: () => notConfigured,
    fetchUser: () => notConfigured,
  };
};

export const makeGitHubIdentityService = Effect.gen(function* () {
  const config = yield* ServerConfig;
  return makeGitHubIdentityServiceWith({
    ...(config.githubClientId !== undefined ? { clientId: config.githubClientId } : {}),
    ...(config.githubClientSecret !== undefined ? { clientSecret: config.githubClientSecret } : {}),
    fetchImpl: fetch,
  });
});

export const GitHubIdentityServiceLive = Layer.effect(
  GitHubIdentityService,
  makeGitHubIdentityService,
);
