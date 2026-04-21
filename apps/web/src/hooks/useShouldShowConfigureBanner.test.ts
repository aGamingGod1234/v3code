import { describe, expect, it } from "vitest";

import { shouldShowConfigureServerBanner } from "./useShouldShowConfigureBanner";

describe("shouldShowConfigureServerBanner", () => {
  it("stays hidden when signed out", () => {
    expect(
      shouldShowConfigureServerBanner({
        isSignedIn: false,
        driveSnapshot: {
          serverUrl: null,
          devices: [
            { device_id: "a", name: "A", added_at: "2026-04-19T00:00:00.000Z" },
            { device_id: "b", name: "B", added_at: "2026-04-19T00:00:00.000Z" },
          ],
          blobExists: true,
          capturedAt: "2026-04-19T00:00:00.000Z",
          error: null,
        },
        dismissedAt: null,
      }),
    ).toBe(false);
  });

  it("shows when multiple devices are present but no server URL is configured", () => {
    expect(
      shouldShowConfigureServerBanner({
        isSignedIn: true,
        driveSnapshot: {
          serverUrl: null,
          devices: [
            { device_id: "a", name: "A", added_at: "2026-04-19T00:00:00.000Z" },
            { device_id: "b", name: "B", added_at: "2026-04-19T00:00:00.000Z" },
          ],
          blobExists: true,
          capturedAt: "2026-04-19T00:00:00.000Z",
          error: null,
        },
        dismissedAt: null,
      }),
    ).toBe(true);
  });

  it("hides when the banner was dismissed within the last 7 days", () => {
    const now = 1_700_000_000_000;
    expect(
      shouldShowConfigureServerBanner({
        isSignedIn: true,
        driveSnapshot: {
          serverUrl: null,
          devices: [
            { device_id: "a", name: "A", added_at: "2026-04-19T00:00:00.000Z" },
            { device_id: "b", name: "B", added_at: "2026-04-19T00:00:00.000Z" },
          ],
          blobExists: true,
          capturedAt: "2026-04-19T00:00:00.000Z",
          error: null,
        },
        dismissedAt: now,
        now: now + 6 * 24 * 60 * 60 * 1000,
      }),
    ).toBe(false);
  });

  it("hides once Drive advertises a server URL", () => {
    expect(
      shouldShowConfigureServerBanner({
        isSignedIn: true,
        driveSnapshot: {
          serverUrl: "https://mesh.example.com",
          devices: [
            { device_id: "a", name: "A", added_at: "2026-04-19T00:00:00.000Z" },
            { device_id: "b", name: "B", added_at: "2026-04-19T00:00:00.000Z" },
          ],
          blobExists: true,
          capturedAt: "2026-04-19T00:00:00.000Z",
          error: null,
        },
        dismissedAt: null,
      }),
    ).toBe(false);
  });

  it("stays hidden after a permanent dismissal", () => {
    expect(
      shouldShowConfigureServerBanner({
        isSignedIn: true,
        driveSnapshot: {
          serverUrl: null,
          devices: [
            { device_id: "a", name: "A", added_at: "2026-04-19T00:00:00.000Z" },
            { device_id: "b", name: "B", added_at: "2026-04-19T00:00:00.000Z" },
          ],
          blobExists: true,
          capturedAt: "2026-04-19T00:00:00.000Z",
          error: null,
        },
        dismissedAt: null,
        dismissedPermanently: true,
      }),
    ).toBe(false);
  });
});
