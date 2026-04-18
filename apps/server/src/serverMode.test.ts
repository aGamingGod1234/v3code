import * as Path from "node:path";

import { Option, type Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  resolveServerMode,
  resolveServerNodeConfigPath,
  SERVER_NODE_CONFIG_DIR_NAME,
  SERVER_NODE_CONFIG_FILE_NAME,
} from "./serverMode.ts";
import { RuntimeMode } from "./config.ts";

type Mode = Schema.Schema.Type<typeof RuntimeMode>;
const some = Option.some<Mode>;
const none = Option.none<Mode>();

describe("resolveServerNodeConfigPath", () => {
  it("returns the V3CODE_SERVER_CONFIG_PATH env override when set", () => {
    expect(
      resolveServerNodeConfigPath(
        { V3CODE_SERVER_CONFIG_PATH: "C:/custom/path/cfg.toml" },
        "/home/me",
      ),
    ).toBe("C:/custom/path/cfg.toml");
  });

  it("ignores an empty/whitespace override and falls back to the home-dir default", () => {
    const expected = Path.join(
      "/home/me",
      SERVER_NODE_CONFIG_DIR_NAME,
      SERVER_NODE_CONFIG_FILE_NAME,
    );
    expect(resolveServerNodeConfigPath({ V3CODE_SERVER_CONFIG_PATH: "" }, "/home/me")).toBe(
      expected,
    );
    expect(resolveServerNodeConfigPath({ V3CODE_SERVER_CONFIG_PATH: "   " }, "/home/me")).toBe(
      expected,
    );
    expect(resolveServerNodeConfigPath({}, "/home/me")).toBe(expected);
  });

  it("trims surrounding whitespace from the override", () => {
    expect(
      resolveServerNodeConfigPath({ V3CODE_SERVER_CONFIG_PATH: "  /tmp/cfg.toml  " }, "/home/me"),
    ).toBe("/tmp/cfg.toml");
  });
});

describe("resolveServerMode", () => {
  it("CLI flag wins over every other source", () => {
    expect(
      resolveServerMode({
        cliMode: some("desktop"),
        envMode: some("server-node"),
        bootstrapMode: some("web"),
        hasConfigToml: true,
        fallback: "web",
      }),
    ).toBe("desktop");
  });

  it("env var wins over bootstrap and config-toml when CLI is absent", () => {
    expect(
      resolveServerMode({
        cliMode: none,
        envMode: some("server-node"),
        bootstrapMode: some("desktop"),
        hasConfigToml: true,
        fallback: "web",
      }),
    ).toBe("server-node");
  });

  it("bootstrap envelope wins over config-toml presence when CLI/env are absent", () => {
    expect(
      resolveServerMode({
        cliMode: none,
        envMode: none,
        bootstrapMode: some("desktop"),
        hasConfigToml: true,
        fallback: "web",
      }),
    ).toBe("desktop");
  });

  it("config.toml presence promotes mode to server-node when nothing else specifies it", () => {
    expect(
      resolveServerMode({
        cliMode: none,
        envMode: none,
        bootstrapMode: none,
        hasConfigToml: true,
        fallback: "web",
      }),
    ).toBe("server-node");
  });

  it("falls through to the requested fallback when nothing claims the mode", () => {
    expect(
      resolveServerMode({
        cliMode: none,
        envMode: none,
        bootstrapMode: none,
        hasConfigToml: false,
        fallback: "desktop",
      }),
    ).toBe("desktop");
    expect(
      resolveServerMode({
        cliMode: none,
        envMode: none,
        bootstrapMode: none,
        hasConfigToml: false,
        fallback: "web",
      }),
    ).toBe("web");
  });

  it("explicit CLI/env can opt OUT of server-node even when config.toml exists", () => {
    expect(
      resolveServerMode({
        cliMode: some("desktop"),
        envMode: none,
        bootstrapMode: none,
        hasConfigToml: true,
        fallback: "web",
      }),
    ).toBe("desktop");
  });
});
