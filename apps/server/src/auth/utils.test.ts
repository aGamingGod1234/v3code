import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRateLimiterForTests,
  checkRateLimit,
  deriveAuthClientMetadata,
  rateLimitKeyFromRequest,
} from "./utils.ts";

describe("deriveAuthClientMetadata", () => {
  it("labels Electron user agents as Electron instead of Chrome", () => {
    const metadata = deriveAuthClientMetadata({
      request: {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) t3code/0.0.15 Chrome/136.0.7103.93 Electron/36.3.2 Safari/537.36",
        },
        source: {
          remoteAddress: "::ffff:127.0.0.1",
        },
      } as never,
    });

    expect(metadata).toMatchObject({
      browser: "Electron",
      deviceType: "desktop",
      ipAddress: "127.0.0.1",
      os: "macOS",
    });
  });
});

describe("checkRateLimit", () => {
  // checkRateLimit auto-bypasses under vitest (process.env.VITEST === "true")
  // so other server integration tests aren't tripped by the chokepoint cap.
  // For these tests we explicitly want the limiter on, so unset VITEST for
  // the duration of this describe block.
  let savedVitest: string | undefined;
  beforeEach(() => {
    savedVitest = process.env["VITEST"];
    delete process.env["VITEST"];
    __resetRateLimiterForTests();
  });
  afterEach(() => {
    if (savedVitest === undefined) {
      delete process.env["VITEST"];
    } else {
      process.env["VITEST"] = savedVitest;
    }
  });

  it("allows the first 10 requests in a window and rejects the 11th", () => {
    const t0 = 1_000_000_000;
    const results: Array<boolean> = [];
    for (let i = 0; i < 12; i += 1) {
      results.push(checkRateLimit("ip-a", t0 + i));
    }
    expect(results).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("resets the count when the window has elapsed", () => {
    const t0 = 1_000_000_000;
    for (let i = 0; i < 10; i += 1) {
      expect(checkRateLimit("ip-b", t0 + i)).toBe(true);
    }
    expect(checkRateLimit("ip-b", t0 + 100)).toBe(false);
    // Advance past the 60 s window — bucket should reset.
    expect(checkRateLimit("ip-b", t0 + 60_000)).toBe(true);
    expect(checkRateLimit("ip-b", t0 + 60_001)).toBe(true);
  });

  it("isolates rate-limit state across keys", () => {
    const t0 = 1_000_000_000;
    for (let i = 0; i < 10; i += 1) {
      expect(checkRateLimit("ip-c", t0)).toBe(true);
    }
    expect(checkRateLimit("ip-c", t0)).toBe(false);
    expect(checkRateLimit("ip-d", t0)).toBe(true);
  });
});

describe("rateLimitKeyFromRequest", () => {
  const originalTrustFlag = process.env["V3CODE_TRUST_FORWARDED_FOR"];

  afterEach(() => {
    if (originalTrustFlag === undefined) {
      delete process.env["V3CODE_TRUST_FORWARDED_FOR"];
    } else {
      process.env["V3CODE_TRUST_FORWARDED_FOR"] = originalTrustFlag;
    }
  });

  it("uses socket peer address by default and ignores client-supplied X-Forwarded-For", () => {
    delete process.env["V3CODE_TRUST_FORWARDED_FOR"];
    const key = rateLimitKeyFromRequest({
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
      source: { remoteAddress: "198.51.100.42" },
    } as never);
    expect(key).toBe("198.51.100.42");
  });

  it("honours X-Forwarded-For only when V3CODE_TRUST_FORWARDED_FOR=1", () => {
    process.env["V3CODE_TRUST_FORWARDED_FOR"] = "1";
    const key = rateLimitKeyFromRequest({
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
      source: { remoteAddress: "198.51.100.42" },
    } as never);
    expect(key).toBe("203.0.113.1");
  });

  it("strips IPv4-mapped IPv6 prefix", () => {
    delete process.env["V3CODE_TRUST_FORWARDED_FOR"];
    const key = rateLimitKeyFromRequest({
      headers: {},
      source: { remoteAddress: "::ffff:127.0.0.1" },
    } as never);
    expect(key).toBe("127.0.0.1");
  });

  it('falls back to "anonymous" when no peer information is available', () => {
    delete process.env["V3CODE_TRUST_FORWARDED_FOR"];
    const key = rateLimitKeyFromRequest({
      headers: {},
      source: {},
    } as never);
    expect(key).toBe("anonymous");
  });
});
