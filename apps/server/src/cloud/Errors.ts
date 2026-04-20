import { Schema } from "effect";

import { TrimmedNonEmptyString } from "@v3tools/contracts";

// Tagged error for every Cloud env failure mode we surface to HTTP
// routes. `reason` drives status codes + UI behaviour:
//
//   - "not-enabled"       → operator hasn't turned cloud_env on.
//   - "docker-unavailable"→ docker CLI missing or daemon not reachable.
//   - "github-not-linked" → user has no stored GitHub token.
//   - "repo-access"       → token exists but GitHub rejected the clone/list.
//   - "limit-reached"     → server is at `max_containers`.
//   - "container-failure" → container exited non-zero / exec failure.
//   - "unknown"            → catch-all.
export class CloudEnvError extends Schema.TaggedErrorClass<CloudEnvError>()("CloudEnvError", {
  reason: Schema.Literals([
    "not-enabled",
    "docker-unavailable",
    "github-not-linked",
    "repo-access",
    "limit-reached",
    "container-failure",
    "unknown",
  ]),
  message: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect),
}) {}
