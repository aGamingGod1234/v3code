import { AuthSessionId, MeshPromptStreamItem } from "@v3tools/contracts";
import { Context, Schema } from "effect";
import type { Effect, Stream } from "effect";

export const PromptRouteInput = Schema.Struct({
  sessionId: AuthSessionId,
  item: MeshPromptStreamItem,
});
export type PromptRouteInput = typeof PromptRouteInput.Type;

export interface PromptRouterShape {
  readonly publishToSession: (input: PromptRouteInput) => Effect.Effect<void>;
  readonly subscribeSession: (
    sessionId: AuthSessionId,
  ) => Stream.Stream<MeshPromptStreamItem, never, never>;
}

export class PromptRouter extends Context.Service<PromptRouter, PromptRouterShape>()(
  "v3/mesh/Services/PromptRouter",
) {}
