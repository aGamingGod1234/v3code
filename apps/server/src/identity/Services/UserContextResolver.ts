import { AuthSessionId, DeviceId, UserId } from "@v3tools/contracts";
import { Context, Option } from "effect";
import type { Effect } from "effect";

import type { DeviceRepositoryError, UserRepositoryError } from "../Errors.ts";

// UserContext: everything the WS/mesh runtime wants to know about who is on
// the other end of a session, keyed by the auth session id (the existing
// pre-V3 identity) — no changes to the existing `AuthenticatedSession` shape.
//
// Consumers resolve once per WS upgrade and propagate via Effect.Context.

export interface UserContext {
  readonly userId: UserId;
  readonly deviceId: DeviceId;
}

export interface UserContextResolverShape {
  readonly resolve: (
    sessionId: AuthSessionId,
  ) => Effect.Effect<Option.Option<UserContext>, DeviceRepositoryError | UserRepositoryError>;
}

export class UserContextResolver extends Context.Service<
  UserContextResolver,
  UserContextResolverShape
>()("v3/identity/Services/UserContextResolver") {}
