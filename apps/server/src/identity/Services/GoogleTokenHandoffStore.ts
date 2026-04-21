import { Context } from "effect";
import type { DateTime, Effect, Option } from "effect";

import type { GoogleTokenBundle, GoogleTokenHandoffConsumeResult } from "@v3tools/contracts";

export interface GoogleTokenHandoffStoreShape {
  readonly issue: (input: {
    readonly snapshot: GoogleTokenHandoffConsumeResult["snapshot"];
    readonly tokens: GoogleTokenBundle;
    readonly now: DateTime.DateTime;
  }) => Effect.Effect<string>;
  readonly consume: (input: {
    readonly id: string;
    readonly now: DateTime.DateTime;
  }) => Effect.Effect<Option.Option<GoogleTokenHandoffConsumeResult>>;
}

export class GoogleTokenHandoffStore extends Context.Service<
  GoogleTokenHandoffStore,
  GoogleTokenHandoffStoreShape
>()("v3/identity/Services/GoogleTokenHandoffStore") {}
