import { TrimmedNonEmptyString } from "@v3tools/contracts";
import { assert, describe, expect, it } from "vitest";

import { buildDefaultLabels, buildRunArgs, parseDockerPsJson } from "./DockerCloudRuntime.ts";
import {
  DOCKER_LABEL_CHAT_ID,
  DOCKER_LABEL_PRODUCT,
  DOCKER_LABEL_USER_ID,
  type DockerStartInput,
} from "../Services/DockerCloudRuntime.ts";

const tnes = (s: string) => TrimmedNonEmptyString.make(s);

const baseInput: DockerStartInput = {
  name: tnes("v3-chat-abc"),
  image: tnes("ghcr.io/v3-code/cloud-env:latest"),
  cpuLimit: 2,
  memoryMb: 4096,
  diskGb: 20,
  env: { V3_CHAT_ID: "abc", V3_USER_ID: "u1" },
  labels: {
    [DOCKER_LABEL_PRODUCT]: "v3-code",
    [DOCKER_LABEL_CHAT_ID]: "abc",
    [DOCKER_LABEL_USER_ID]: "u1",
  },
};

describe("buildRunArgs", () => {
  it("emits `docker run -d --name ...` with flags in a stable order", () => {
    const args = buildRunArgs(baseInput);
    assert.equal(args[0], "run");
    assert.equal(args[1], "-d");
    assert.equal(args[2], "--name");
    assert.equal(args[3], "v3-chat-abc");
    assert.include(args, "--cpus");
    assert.include(args, "2");
    assert.include(args, "--memory");
    assert.include(args, "4096m");
    assert.include(args, "--storage-opt");
    assert.include(args, "size=20G");
  });

  it("passes all env entries through as `-e KEY=VALUE`", () => {
    const args = buildRunArgs(baseInput);
    const envPairs: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-e") {
        const next = args[i + 1];
        if (typeof next === "string") envPairs.push(next);
      }
    }
    expect(envPairs).toContain("V3_CHAT_ID=abc");
    expect(envPairs).toContain("V3_USER_ID=u1");
  });

  it("passes labels through as `--label KEY=VALUE`", () => {
    const args = buildRunArgs(baseInput);
    const labelPairs: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--label") {
        const next = args[i + 1];
        if (typeof next === "string") labelPairs.push(next);
      }
    }
    expect(labelPairs).toContain("v3-code.product=v3-code");
    expect(labelPairs).toContain("v3-code.chat-id=abc");
    expect(labelPairs).toContain("v3-code.user-id=u1");
  });

  it("skips the storage-opt flag when diskGb is 0", () => {
    const args = buildRunArgs({ ...baseInput, diskGb: 0 });
    assert.notInclude(args, "--storage-opt");
  });

  it("uses the image as the final positional argument", () => {
    const args = buildRunArgs(baseInput);
    assert.equal(args[args.length - 1], "ghcr.io/v3-code/cloud-env:latest");
  });

  it("appends custom entrypoint + command when supplied", () => {
    const args = buildRunArgs({
      ...baseInput,
      entrypoint: tnes("/usr/local/bin/v3-entrypoint"),
      command: ["sleep", "5"],
    });
    assert.include(args, "--entrypoint");
    assert.include(args, "/usr/local/bin/v3-entrypoint");
    assert.equal(args[args.length - 2], "sleep");
    assert.equal(args[args.length - 1], "5");
  });
});

describe("parseDockerPsJson", () => {
  it("parses newline-delimited JSON from `docker ps --format`", () => {
    const raw = [
      JSON.stringify({
        ID: "abc123",
        Names: "v3-chat-one",
        Image: "ghcr.io/v3-code/cloud-env:latest",
        State: "running",
        CreatedAt: "2026-04-20 10:00:00 +0000 UTC",
      }),
      JSON.stringify({
        ID: "def456",
        Names: "v3-chat-two",
        Image: "ghcr.io/v3-code/cloud-env:latest",
        State: "exited",
        CreatedAt: "2026-04-20 08:00:00 +0000 UTC",
      }),
      "",
    ].join("\n");
    const summaries = parseDockerPsJson(raw);
    expect(summaries.length).toBe(2);
    expect(summaries[0]?.containerId).toBe("abc123");
    expect(summaries[0]?.state).toBe("running");
    expect(summaries[1]?.containerId).toBe("def456");
  });

  it("skips non-JSON lines gracefully", () => {
    const raw = `not json\n${JSON.stringify({ ID: "abc", Names: "v3-chat", Image: "x", State: "running" })}\n`;
    const summaries = parseDockerPsJson(raw);
    expect(summaries.length).toBe(1);
  });

  it("drops entries missing required fields", () => {
    const raw = `${JSON.stringify({ ID: "abc" })}\n`;
    const summaries = parseDockerPsJson(raw);
    expect(summaries.length).toBe(0);
  });
});

describe("buildDefaultLabels", () => {
  it("includes product + chat + user labels", () => {
    const labels = buildDefaultLabels({ chatId: "chat-1", userId: "user-1" });
    expect(labels["v3-code.product"]).toBe("v3-code");
    expect(labels["v3-code.chat-id"]).toBe("chat-1");
    expect(labels["v3-code.user-id"]).toBe("user-1");
    expect(labels["v3-code.image-variant"]).toBe("cloud-env");
  });
});
