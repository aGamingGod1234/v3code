import { describe, expect, it } from "vitest";

import { initialV3SetupWizardState } from "./state";
import { buildServerNodeConfigToml } from "./tomlBuilder";

describe("buildServerNodeConfigToml", () => {
  it("emits a minimal document when only required fields are populated", () => {
    const toml = buildServerNodeConfigToml(
      {
        ...initialV3SetupWizardState,
        exposure: {
          mode: "cloudflare-tunnel",
          publicUrl: "https://v3.agaminggod.com",
          bindHost: "0.0.0.0",
          bindPort: 8080,
        },
        auth: {
          googleClientId: "client-id.apps.googleusercontent.com",
          authorizedEmails: "agaminggod12345@gmail.com",
        },
        database: {
          postgresUrl: "postgres://v3:v3@localhost:5432/v3",
          encryptionKey: "a".repeat(64),
        },
      },
      { header: null },
    );
    expect(toml).toBe(
      [
        "[server]",
        'public_url = "https://v3.agaminggod.com"',
        'bind_host = "0.0.0.0"',
        "bind_port = 8080",
        "",
        "[auth]",
        'google_client_id = "client-id.apps.googleusercontent.com"',
        'authorized_emails = ["agaminggod12345@gmail.com"]',
        "",
        "[database]",
        'postgres_url = "postgres://v3:v3@localhost:5432/v3"',
        `encryption_key = "${"a".repeat(64)}"`,
        "",
      ].join("\n"),
    );
  });

  it("parses comma-and-whitespace separated authorized_emails and lowercases them", () => {
    const toml = buildServerNodeConfigToml(
      {
        ...initialV3SetupWizardState,
        exposure: { ...initialV3SetupWizardState.exposure, publicUrl: "https://v3.example.com" },
        auth: {
          googleClientId: "cid",
          authorizedEmails: "Alice@Example.com,  bob@other.io\nCharlie@Example.com",
        },
        database: { ...initialV3SetupWizardState.database, encryptionKey: "k".repeat(64) },
      },
      { header: null },
    );
    expect(toml).toContain(
      `authorized_emails = ["alice@example.com", "bob@other.io", "charlie@example.com"]`,
    );
  });

  it("skips sections with no populated fields", () => {
    const toml = buildServerNodeConfigToml(
      {
        ...initialV3SetupWizardState,
        // Leave auth fields empty so the [auth] section is suppressed.
        auth: { googleClientId: "", authorizedEmails: "" },
        database: { postgresUrl: "", encryptionKey: "" },
      },
      { header: null },
    );
    expect(toml).not.toContain("[auth]");
    expect(toml).not.toContain("[database]");
  });

  it("escapes TOML-reserved characters in strings", () => {
    const toml = buildServerNodeConfigToml(
      {
        ...initialV3SetupWizardState,
        exposure: {
          ...initialV3SetupWizardState.exposure,
          publicUrl: 'weird"url\\segment',
        },
        auth: {
          googleClientId: "cid",
          authorizedEmails: "a@b.co",
        },
        database: { ...initialV3SetupWizardState.database, encryptionKey: "e".repeat(64) },
      },
      { header: null },
    );
    expect(toml).toContain('public_url = "weird\\"url\\\\segment"');
  });

  it("includes a default header when one is not provided", () => {
    const toml = buildServerNodeConfigToml(initialV3SetupWizardState);
    expect(toml.startsWith("# V3 Code server-node configuration.")).toBe(true);
  });
});
