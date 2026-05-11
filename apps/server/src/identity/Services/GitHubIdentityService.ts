// V3 Phase 1e — GitHub identity service.
//
// Mirrors the Google identity service, but for GitHub's web application
// OAuth flow. The server can exchange a code for an access token using the
// operator's `V3CODE_GITHUB_CLIENT_SECRET`, and it can also fetch /user for
// a token obtained by desktop Device Flow. The token is handed back to the caller
// (identity/http.ts) which encrypts it and writes it to `v3_users` via
// `UserRepository.setGitHubToken`.
//
// The service is deliberately thin — no storage, no session handling,
// just the HTTPS round-trips. Tests build a stub service from
// `makeGitHubIdentityServiceWith({ fetchImpl })` and pass a mocked
// `fetch`.

import { Context } from "effect";
import type { Effect } from "effect";

import type { GitHubUserSummary } from "@v3tools/contracts";

import type { GitHubIdentityError } from "../Errors.ts";

export interface GitHubIdentityServiceShape {
  readonly exchangeCode: (input: {
    readonly code: string;
    readonly state: string;
    readonly redirectUri: string;
  }) => Effect.Effect<
    {
      readonly accessToken: string;
      readonly scopes: ReadonlyArray<string>;
      readonly tokenType: string;
    },
    GitHubIdentityError
  >;
  readonly fetchUser: (input: {
    readonly accessToken: string;
  }) => Effect.Effect<GitHubUserSummary, GitHubIdentityError>;
}

export class GitHubIdentityService extends Context.Service<
  GitHubIdentityService,
  GitHubIdentityServiceShape
>()("v3/identity/Services/GitHubIdentityService") {}
