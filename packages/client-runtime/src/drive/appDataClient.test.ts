import { describe, expect, it } from "vitest";

import { createV3DriveAppDataClient, V3DriveClientError } from "./appDataClient.ts";
import type { V3DriveConfig } from "./schema.ts";

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
}

interface FetchMock {
  readonly impl: typeof fetch;
  readonly calls: ReadonlyArray<RecordedCall>;
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const textResponse = (body: string, status: number): Response =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });

const recordHeaders = (init: RequestInit | undefined): Record<string, string> => {
  if (init?.headers === undefined) return {};
  if (init.headers instanceof Headers) {
    return Object.fromEntries(init.headers.entries());
  }
  if (Array.isArray(init.headers)) {
    return Object.fromEntries(init.headers);
  }
  return { ...(init.headers as Record<string, string>) };
};

const recordBody = (init: RequestInit | undefined): string | null => {
  if (init?.body === undefined || init.body === null) return null;
  if (typeof init.body === "string") return init.body;
  return String(init.body);
};

const implThrow: typeof fetch = async () => {
  throw new TypeError("connection refused");
};

const makeFetchMock = (responders: ReadonlyArray<(call: RecordedCall) => Response>): FetchMock => {
  const calls: RecordedCall[] = [];
  let index = 0;
  const impl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : "";
    const method = init?.method ?? "GET";
    const call: RecordedCall = {
      url,
      method,
      headers: recordHeaders(init),
      body: recordBody(init),
    };
    calls.push(call);
    const responder = responders[index];
    index += 1;
    if (responder === undefined) {
      throw new Error(`Unexpected extra fetch call: ${method} ${url}`);
    }
    return responder(call);
  };
  return { impl, calls };
};

const validConfig: V3DriveConfig = {
  v3_config: {
    server_url: "https://v3.agaminggod.com",
    server_version_installed: "0.1.0",
    setup_at: "2026-04-18T10:00:00Z",
    device_list: [
      { device_id: "device-existing", name: "Desktop", added_at: "2026-04-18T10:00:00Z" },
    ],
  },
};

describe("createV3DriveAppDataClient.read", () => {
  it("returns null when no v3_config.json exists", async () => {
    const mock = makeFetchMock([() => jsonResponse({ files: [] })]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    expect(await client.read("token-xyz")).toBeNull();
    expect(mock.calls).toHaveLength(1);
    const [first] = mock.calls;
    expect(first!.url).toContain("appDataFolder");
    expect(first!.url).toContain("v3_config.json");
    expect(first!.headers.Authorization).toBe("Bearer token-xyz");
  });

  it("decodes an existing blob after a find + media fetch", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [{ id: "file-123", name: "v3_config.json" }] }),
      () => jsonResponse(validConfig),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    const result = await client.read("token");
    expect(result).toEqual(validConfig);
    expect(mock.calls[1]!.url).toContain("/files/file-123");
    expect(mock.calls[1]!.url).toContain("alt=media");
  });

  it("raises malformed when the blob is not JSON", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [{ id: "file-123", name: "v3_config.json" }] }),
      () => textResponse("<html>oops</html>", 200),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    await expect(client.read("token")).rejects.toMatchObject({
      name: "V3DriveClientError",
      reason: "malformed",
    });
  });

  it("raises malformed when the blob fails schema decode", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [{ id: "file-123", name: "v3_config.json" }] }),
      () => jsonResponse({ v3_config: { device_list: "not-an-array" } }),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    await expect(client.read("token")).rejects.toMatchObject({ reason: "malformed" });
  });

  it("raises unauthorized on 401", async () => {
    const mock = makeFetchMock([() => textResponse("not authenticated", 401)]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    await expect(client.read("token")).rejects.toMatchObject({
      reason: "unauthorized",
      status: 401,
    });
  });

  it("raises quota-exhausted on 403 with storageQuotaExceeded", async () => {
    const mock = makeFetchMock([
      () =>
        jsonResponse(
          {
            error: {
              code: 403,
              message: "quota",
              errors: [{ domain: "global", reason: "storageQuotaExceeded", message: "full" }],
            },
          },
          403,
        ),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    await expect(client.read("token")).rejects.toMatchObject({
      reason: "quota-exhausted",
      status: 403,
    });
  });

  it("raises unauthorized on 403 without a quota marker", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ error: { code: 403, message: "nope" } }, 403),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    await expect(client.read("token")).rejects.toMatchObject({
      reason: "unauthorized",
      status: 403,
    });
  });

  it("raises network when fetch throws", async () => {
    const client = createV3DriveAppDataClient({ fetch: implThrow });
    await expect(client.read("token")).rejects.toBeInstanceOf(V3DriveClientError);
    await expect(client.read("token")).rejects.toMatchObject({ reason: "network" });
  });
});


describe("createV3DriveAppDataClient.write", () => {
  it("POSTs multipart to create the file when none exists", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [] }),
      () => jsonResponse({ id: "new-file-id" }),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    await client.write("token", validConfig);
    expect(mock.calls).toHaveLength(2);
    const [, upload] = mock.calls;
    expect(upload!.method).toBe("POST");
    expect(upload!.url).toBe(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    );
    expect(upload!.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=v3-drive-/);
    expect(upload!.body).toContain(`"parents":["appDataFolder"]`);
    expect(upload!.body).toContain(`"name":"v3_config.json"`);
    expect(upload!.body).toContain(JSON.stringify(validConfig));
  });

  it("PATCHes the existing file when found", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [{ id: "existing-id", name: "v3_config.json" }] }),
      () => jsonResponse({}),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    await client.write("token", validConfig);
    const [, upload] = mock.calls;
    expect(upload!.method).toBe("PATCH");
    expect(upload!.url).toBe(
      "https://www.googleapis.com/upload/drive/v3/files/existing-id?uploadType=media",
    );
    expect(upload!.body).toBe(JSON.stringify(validConfig));
  });

  it("surfaces quota-exhausted from the upload response", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [] }),
      () =>
        jsonResponse({ error: { code: 403, errors: [{ reason: "storageQuotaExceeded" }] } }, 403),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    await expect(client.write("token", validConfig)).rejects.toMatchObject({
      reason: "quota-exhausted",
    });
  });
});

describe("createV3DriveAppDataClient.readOrInit", () => {
  it("synthesises an empty config without writing when the blob is missing", async () => {
    const mock = makeFetchMock([() => jsonResponse({ files: [] })]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    const result = await client.readOrInit("token");
    expect(result).toEqual({ v3_config: { device_list: [] } });
    expect(mock.calls).toHaveLength(1);
  });
});

describe("createV3DriveAppDataClient.appendDevice", () => {
  it("appends a new device and PATCHes the existing blob", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [{ id: "existing-id", name: "v3_config.json" }] }),
      () => jsonResponse(validConfig),
      () => jsonResponse({ files: [{ id: "existing-id", name: "v3_config.json" }] }),
      () => jsonResponse({}),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    const result = await client.appendDevice("token", {
      device_id: "device-new",
      name: "Laptop",
      added_at: "2026-04-19T00:00:00Z",
    });
    expect(result.v3_config.device_list).toHaveLength(2);
    expect(result.v3_config.device_list[1]).toEqual({
      device_id: "device-new",
      name: "Laptop",
      added_at: "2026-04-19T00:00:00Z",
    });
    const patch = mock.calls[3];
    expect(patch!.method).toBe("PATCH");
    expect(patch!.body).toContain("device-new");
  });

  it("is idempotent: a matching device_id is a no-op that skips the write", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [{ id: "existing-id", name: "v3_config.json" }] }),
      () => jsonResponse(validConfig),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    const result = await client.appendDevice("token", {
      device_id: "device-existing",
      name: "Desktop",
      added_at: "2026-04-18T10:00:00Z",
    });
    expect(result).toEqual(validConfig);
    expect(mock.calls).toHaveLength(2);
  });

  it("creates a fresh blob when none exists yet (readOrInit path)", async () => {
    const mock = makeFetchMock([
      () => jsonResponse({ files: [] }),
      () => jsonResponse({ files: [] }),
      () => jsonResponse({ id: "new-id" }),
    ]);
    const client = createV3DriveAppDataClient({ fetch: mock.impl });
    const entry = {
      device_id: "device-bootstrap",
      name: "Mini PC",
      added_at: "2026-04-19T01:02:03Z",
    };
    const result = await client.appendDevice("token", entry);
    expect(result).toEqual({ v3_config: { device_list: [entry] } });
    const create = mock.calls[2];
    expect(create!.method).toBe("POST");
    expect(create!.body).toContain("device-bootstrap");
  });
});
