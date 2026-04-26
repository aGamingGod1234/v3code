import { describe, expect, it } from "vitest";

import {
  initialV3SetupWizardState,
  isAuthReady,
  isExposureReady,
  isPreflightReady,
  reduceV3SetupWizard,
  STEP_TITLES,
} from "./state";

describe("reduceV3SetupWizard", () => {
  it("advances step on go-to", () => {
    const next = reduceV3SetupWizard(initialV3SetupWizardState, {
      _tag: "go-to",
      step: "preflight",
    });
    expect(next.step).toBe("preflight");
  });

  it("captures probe results into preflight slot", () => {
    const next = reduceV3SetupWizard(initialV3SetupWizardState, {
      _tag: "preflight-docker",
      value: { status: "ok", version: "27.0.0", message: null },
    });
    expect(next.preflight.docker).toEqual({ status: "ok", version: "27.0.0", message: null });
  });

  it("reset returns to the initial state", () => {
    const dirty = reduceV3SetupWizard(initialV3SetupWizardState, {
      _tag: "set-data-directory",
      path: "/tmp/foo",
    });
    expect(dirty.dataDirectory).toBe("/tmp/foo");
    const fresh = reduceV3SetupWizard(dirty, { _tag: "reset" });
    expect(fresh).toEqual(initialV3SetupWizardState);
  });
});

describe("isPreflightReady", () => {
  it("is false until Docker + port + paths have been probed", () => {
    expect(isPreflightReady(initialV3SetupWizardState)).toBe(false);
  });

  it("is true when Docker is ok and port is available", () => {
    const state = reduceV3SetupWizard(
      reduceV3SetupWizard(
        reduceV3SetupWizard(initialV3SetupWizardState, {
          _tag: "preflight-docker",
          value: { status: "ok", version: "27.0.0", message: null },
        }),
        {
          _tag: "preflight-port",
          value: { port: 8080, available: true, message: null },
        },
      ),
      {
        _tag: "preflight-paths",
        value: {
          configPath: "/home/test/.v3-code-server/config.toml",
          configExists: false,
          defaultDataDirectory: "/home/test/.v3-code-server",
        },
      },
    );
    expect(isPreflightReady(state)).toBe(true);
  });

  it("is false when Docker is missing even if the port is free", () => {
    const state = reduceV3SetupWizard(
      reduceV3SetupWizard(
        reduceV3SetupWizard(initialV3SetupWizardState, {
          _tag: "preflight-docker",
          value: { status: "missing", version: null, message: null },
        }),
        {
          _tag: "preflight-port",
          value: { port: 8080, available: true, message: null },
        },
      ),
      {
        _tag: "preflight-paths",
        value: {
          configPath: "/x",
          configExists: false,
          defaultDataDirectory: "/y",
        },
      },
    );
    expect(isPreflightReady(state)).toBe(false);
  });
});

describe("isExposureReady", () => {
  it("requires a public URL for cloudflare-tunnel mode", () => {
    expect(isExposureReady(initialV3SetupWizardState)).toBe(false);
    const withUrl = reduceV3SetupWizard(initialV3SetupWizardState, {
      _tag: "set-public-url",
      url: "https://v3.example.com",
    });
    expect(isExposureReady(withUrl)).toBe(true);
  });

  it("requires a public URL for manual mode", () => {
    const manual = reduceV3SetupWizard(initialV3SetupWizardState, {
      _tag: "set-exposure-mode",
      mode: "manual",
    });
    expect(isExposureReady(manual)).toBe(false);
    const withUrl = reduceV3SetupWizard(manual, {
      _tag: "set-public-url",
      url: "https://my.server",
    });
    expect(isExposureReady(withUrl)).toBe(true);
  });

  it("does not require a URL for tailnet mode", () => {
    const tailnet = reduceV3SetupWizard(initialV3SetupWizardState, {
      _tag: "set-exposure-mode",
      mode: "tailnet",
    });
    expect(isExposureReady(tailnet)).toBe(true);
  });
});

describe("STEP_TITLES", () => {
  it("labels the preflight step 'System checks'", () => {
    expect(STEP_TITLES.preflight).toBe("System checks");
  });
});

describe("isAuthReady", () => {
  it("requires client id, at least one email, and a 32+ char encryption key", () => {
    const armed = [
      { _tag: "set-google-client-id", value: "cid" } as const,
      { _tag: "set-authorized-emails", value: "a@b.co" } as const,
      { _tag: "set-encryption-key", value: "k".repeat(64) } as const,
    ].reduce(reduceV3SetupWizard, initialV3SetupWizardState);
    expect(isAuthReady(armed)).toBe(true);
  });

  it("rejects an encryption key shorter than 32 chars", () => {
    const shortKey = [
      { _tag: "set-google-client-id", value: "cid" } as const,
      { _tag: "set-authorized-emails", value: "a@b.co" } as const,
      { _tag: "set-encryption-key", value: "short" } as const,
    ].reduce(reduceV3SetupWizard, initialV3SetupWizardState);
    expect(isAuthReady(shortKey)).toBe(false);
  });
});
