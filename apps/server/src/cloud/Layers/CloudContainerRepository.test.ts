import { GoogleSub, ThreadId, TrimmedNonEmptyString, UserId } from "@v3tools/contracts";
import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { UserRepository } from "../../identity/Services/UserRepository.ts";
import { UserRepositoryLive } from "../../identity/Layers/UserRepository.ts";
import { CloudContainerRepository } from "../Services/CloudContainerRepository.ts";
import { CloudContainerRepositoryLive } from "./CloudContainerRepository.ts";

const layer = Layer.mergeAll(UserRepositoryLive, CloudContainerRepositoryLive);
const testLayer = it.layer(layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

const T0 = DateTime.makeUnsafe(Date.UTC(2026, 3, 20, 12, 0, 0));
const T1 = DateTime.makeUnsafe(Date.UTC(2026, 3, 20, 13, 0, 0));
const T2 = DateTime.makeUnsafe(Date.UTC(2026, 3, 20, 14, 0, 0));

const seedUser = (id: string) =>
  Effect.gen(function* () {
    const users = yield* UserRepository;
    yield* users.upsertFromGoogle({
      id: UserId.make(id),
      googleSub: GoogleSub.make(`sub-${id}`),
      email: TrimmedNonEmptyString.make(`${id}@example.com`),
      displayName: null,
      avatarUrl: null,
      now: T0,
    });
  });

testLayer("upsert inserts a fresh row", (it) => {
  it.effect("starting → ready lifecycle", () =>
    Effect.gen(function* () {
      yield* seedUser("user-a");
      const repo = yield* CloudContainerRepository;
      const created = yield* repo.upsert({
        chatId: ThreadId.make("chat-1"),
        userId: UserId.make("user-a"),
        containerId: TrimmedNonEmptyString.make("abc123"),
        image: TrimmedNonEmptyString.make("ghcr.io/v3-code/cloud-env:latest"),
        githubRepo: TrimmedNonEmptyString.make("agaminggod/repo"),
        githubBranch: TrimmedNonEmptyString.make("main"),
        status: "starting",
        statusMessage: null,
        cpuLimit: 2,
        memoryMb: 4096,
        diskGb: 20,
        startedAt: T0,
      });
      assert.equal(created.containerId, "abc123");
      assert.equal(created.status, "starting");

      const ready = yield* repo.updateStatus({
        chatId: ThreadId.make("chat-1"),
        status: "ready",
        statusMessage: "done",
        readyAt: T1,
        lastCheckedAt: T1,
      });
      assert.equal(ready.status, "ready");
      assert.equal(ready.statusMessage, "done");
      assert.isNotNull(ready.readyAt);
      assert.isNull(ready.endedAt);
    }),
  );
});

testLayer("getByChat returns Option.none for unknown chats", (it) => {
  it.effect("empty DB", () =>
    Effect.gen(function* () {
      yield* seedUser("user-a");
      const repo = yield* CloudContainerRepository;
      const result = yield* repo.getByChat({ chatId: ThreadId.make("ghost") });
      assert.isTrue(Option.isNone(result));
    }),
  );
});

testLayer("listForUser filters ended chats by default", (it) => {
  it.effect("only active rows", () =>
    Effect.gen(function* () {
      yield* seedUser("user-a");
      const repo = yield* CloudContainerRepository;
      const baseInsert = (chatId: string, status: "running" | "dead") =>
        repo.upsert({
          chatId: ThreadId.make(chatId),
          userId: UserId.make("user-a"),
          containerId: TrimmedNonEmptyString.make(chatId),
          image: TrimmedNonEmptyString.make("ghcr.io/v3-code/cloud-env:latest"),
          githubRepo: null,
          githubBranch: null,
          status,
          statusMessage: null,
          cpuLimit: 1,
          memoryMb: 2048,
          diskGb: 10,
          startedAt: T0,
        });
      yield* baseInsert("chat-1", "running");
      yield* baseInsert("chat-2", "dead");

      const active = yield* repo.listForUser({ userId: UserId.make("user-a") });
      assert.equal(active.length, 1);
      const first = active[0];
      assert.isDefined(first);
      assert.equal(first?.chatId, "chat-1");

      const all = yield* repo.listForUser({ userId: UserId.make("user-a"), includeEnded: true });
      assert.equal(all.length, 2);
    }),
  );
});

testLayer("listActive only returns non-terminal rows", (it) => {
  it.effect("excludes dead + error", () =>
    Effect.gen(function* () {
      yield* seedUser("user-a");
      yield* seedUser("user-b");
      const repo = yield* CloudContainerRepository;
      const insert = (chatId: string, userId: string, status: "running" | "dead" | "error") =>
        repo.upsert({
          chatId: ThreadId.make(chatId),
          userId: UserId.make(userId),
          containerId: TrimmedNonEmptyString.make(chatId),
          image: TrimmedNonEmptyString.make("image"),
          githubRepo: null,
          githubBranch: null,
          status,
          statusMessage: null,
          cpuLimit: 1,
          memoryMb: 1024,
          diskGb: 5,
          startedAt: T0,
        });
      yield* insert("a-running", "user-a", "running");
      yield* insert("a-dead", "user-a", "dead");
      yield* insert("b-error", "user-b", "error");
      yield* insert("b-running", "user-b", "running");

      const active = yield* repo.listActive;
      const ids = active.map((row) => row.chatId).toSorted();
      assert.deepEqual(ids, ["a-running", "b-running"]);
    }),
  );
});

// Reserve T2 for future multi-step lifecycle assertions. Referencing
// it keeps oxlint from flagging the export as unused.
void T2;
