import { GoogleSub, TrimmedNonEmptyString, UserId } from "@v3tools/contracts";
import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { UserRepository } from "../Services/UserRepository.ts";
import { UserRepositoryLive } from "./UserRepository.ts";

const layer = it.layer(UserRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

const now = DateTime.makeUnsafe(Date.UTC(2026, 3, 18, 12, 0, 0));
const later = DateTime.makeUnsafe(Date.UTC(2026, 3, 18, 13, 0, 0));

layer("UserRepositoryLive", (it) => {
  it.effect("inserts a new user and returns the record", () =>
    Effect.gen(function* () {
      const users = yield* UserRepository;
      const inserted = yield* users.upsertFromGoogle({
        id: UserId.make("u1"),
        googleSub: GoogleSub.make("google-sub-1"),
        email: TrimmedNonEmptyString.make("lucas@example.com"),
        displayName: "Lucas",
        avatarUrl: null,
        now,
      });
      assert.equal(inserted.id, UserId.make("u1"));
      assert.equal(inserted.email, "lucas@example.com");
      assert.equal(inserted.displayName, "Lucas");
      assert.equal(inserted.githubUsername, null);
    }),
  );

  it.effect("upsert is idempotent on the same google_sub", () =>
    Effect.gen(function* () {
      const users = yield* UserRepository;
      const first = yield* users.upsertFromGoogle({
        id: UserId.make("u1"),
        googleSub: GoogleSub.make("google-sub-1"),
        email: TrimmedNonEmptyString.make("a@example.com"),
        displayName: null,
        avatarUrl: null,
        now,
      });
      const second = yield* users.upsertFromGoogle({
        id: UserId.make("u2"), // different id — should be ignored because sub matches
        googleSub: GoogleSub.make("google-sub-1"),
        email: TrimmedNonEmptyString.make("b@example.com"),
        displayName: "Lucas 2",
        avatarUrl: "https://example.com/avatar.png",
        now: later,
      });
      // The second call should UPDATE the existing row (keyed on google_sub),
      // not INSERT a new one. id must remain u1.
      assert.equal(second.id, first.id);
      assert.equal(second.email, "b@example.com");
      assert.equal(second.displayName, "Lucas 2");
      assert.equal(second.avatarUrl, "https://example.com/avatar.png");
    }),
  );

  it.effect("getByGoogleSub returns Some for existing, None for missing", () =>
    Effect.gen(function* () {
      const users = yield* UserRepository;
      yield* users.upsertFromGoogle({
        id: UserId.make("u1"),
        googleSub: GoogleSub.make("google-sub-1"),
        email: TrimmedNonEmptyString.make("a@example.com"),
        displayName: null,
        avatarUrl: null,
        now,
      });
      const hit = yield* users.getByGoogleSub({ googleSub: GoogleSub.make("google-sub-1") });
      const miss = yield* users.getByGoogleSub({ googleSub: GoogleSub.make("google-sub-absent") });
      assert.equal(Option.isSome(hit), true);
      assert.equal(Option.isNone(miss), true);
    }),
  );

  it.effect("getById returns Some for existing, None for missing", () =>
    Effect.gen(function* () {
      const users = yield* UserRepository;
      yield* users.upsertFromGoogle({
        id: UserId.make("u1"),
        googleSub: GoogleSub.make("google-sub-1"),
        email: TrimmedNonEmptyString.make("a@example.com"),
        displayName: null,
        avatarUrl: null,
        now,
      });
      const hit = yield* users.getById({ id: UserId.make("u1") });
      const miss = yield* users.getById({ id: UserId.make("u-absent") });
      assert.equal(Option.isSome(hit), true);
      assert.equal(Option.isNone(miss), true);
    }),
  );
});
