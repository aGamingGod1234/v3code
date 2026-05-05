import type { AuthClientMetadata, AuthClientMetadataDeviceType } from "@v3tools/contracts";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as Crypto from "node:crypto";

const SESSION_COOKIE_NAME = "t3_session";

export function resolveSessionCookieName(input: {
  // V3 Phase 2a widened the union to include `server-node`. Server-node
  // mode shares the cookie strategy with `web` (one cookie per origin),
  // so the non-desktop branch handles it implicitly.
  readonly mode: "web" | "desktop" | "server-node";
  readonly port: number;
}): string {
  if (input.mode !== "desktop") {
    return SESSION_COOKIE_NAME;
  }

  return `${SESSION_COOKIE_NAME}_${input.port}`;
}

export function base64UrlEncode(input: string | Uint8Array): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buffer.toString("base64url");
}

export function base64UrlDecodeUtf8(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function signPayload(payload: string, secret: Uint8Array): string {
  return Crypto.createHmac("sha256", Buffer.from(secret)).update(payload).digest("base64url");
}

export function timingSafeEqualBase64Url(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "base64url");
  const rightBuffer = Buffer.from(right, "base64url");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return Crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeNonEmptyString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeIpAddress(value: string | null | undefined): string | undefined {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) {
    return undefined;
  }
  return normalized.startsWith("::ffff:") ? normalized.slice("::ffff:".length) : normalized;
}

function inferDeviceType(userAgent: string | undefined): AuthClientMetadataDeviceType {
  if (!userAgent) {
    return "unknown";
  }

  const normalized = userAgent.toLowerCase();
  if (/bot|crawler|spider|slurp|curl|wget/.test(normalized)) {
    return "bot";
  }
  if (/ipad|tablet/.test(normalized)) {
    return "tablet";
  }
  if (/iphone|android.+mobile|mobile/.test(normalized)) {
    return "mobile";
  }
  return "desktop";
}

function inferBrowser(userAgent: string | undefined): string | undefined {
  if (!userAgent) {
    return undefined;
  }
  const normalized = userAgent.toLowerCase();
  if (/edg\//.test(normalized)) return "Edge";
  if (/opr\//.test(normalized)) return "Opera";
  if (/firefox\//.test(normalized)) return "Firefox";
  if (/electron\//.test(normalized)) return "Electron";
  if (/chrome\//.test(normalized) || /crios\//.test(normalized)) return "Chrome";
  if (/safari\//.test(normalized) && !/chrome\//.test(normalized)) return "Safari";
  return undefined;
}

function inferOs(userAgent: string | undefined): string | undefined {
  if (!userAgent) {
    return undefined;
  }
  const normalized = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(normalized)) return "iOS";
  if (/android/.test(normalized)) return "Android";
  if (/mac os x|macintosh/.test(normalized)) return "macOS";
  if (/windows nt/.test(normalized)) return "Windows";
  if (/linux/.test(normalized)) return "Linux";
  return undefined;
}

function readRemoteAddressFromSource(source: unknown): string | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const candidate = source as {
    readonly remoteAddress?: string | null;
    readonly socket?: {
      readonly remoteAddress?: string | null;
    };
  };

  return normalizeIpAddress(candidate.socket?.remoteAddress ?? candidate.remoteAddress);
}

// Fixed-window in-memory rate limiter keyed by client IP. Bootstrap and
// bearer routes are unauthenticated chokepoints, so brute-force attacks
// against bootstrap credentials must be slowed at the HTTP boundary.
// The window resets every RATE_LIMIT_WINDOW_MS for each key (not strictly
// sliding) — sufficient for chokepoint defence, deliberately simple.
// Memory bound: at most one entry per IP, oldest entries evicted lazily
// when the bucket map grows past RATE_LIMIT_BUCKETS_SOFT_CAP.
interface RateLimitBucket {
  readonly windowStartMs: number;
  count: number;
}
const RATE_LIMIT_BUCKETS = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_PER_WINDOW = 10; // 10 attempts/min/IP
const RATE_LIMIT_BUCKETS_SOFT_CAP = 5_000;
const RATE_LIMIT_BUCKETS_EVICT_BATCH = 1_000;

function evictOldestBuckets(): void {
  // Maps preserve insertion order, so iterating gives oldest first. Use
  // an iterator instead of allocating an Array.from snapshot of the keys.
  const iter = RATE_LIMIT_BUCKETS.keys();
  for (let i = 0; i < RATE_LIMIT_BUCKETS_EVICT_BATCH; i += 1) {
    const next = iter.next();
    if (next.done) break;
    RATE_LIMIT_BUCKETS.delete(next.value);
  }
}

// Vitest sets `process.env.VITEST = "true"` for any test run, so server
// integration tests don't trip the chokepoint cap when bootstrapping the
// test runtime many times in sequence. Operators can also set
// `V3CODE_DISABLE_RATE_LIMIT=1` explicitly (useful for ad-hoc load testing).
function isRateLimitDisabled(): boolean {
  if (process.env["VITEST"] === "true") return true;
  const flag = process.env["V3CODE_DISABLE_RATE_LIMIT"];
  return flag === "1" || flag?.toLowerCase() === "true";
}

export function checkRateLimit(key: string, nowMs: number = Date.now()): boolean {
  if (isRateLimitDisabled()) return true;
  const bucket = RATE_LIMIT_BUCKETS.get(key);
  if (!bucket || nowMs - bucket.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    // New window: drop the previous bucket so re-insertion places this
    // key at the end of insertion order (LRU-like for eviction).
    if (bucket) RATE_LIMIT_BUCKETS.delete(key);
    RATE_LIMIT_BUCKETS.set(key, { windowStartMs: nowMs, count: 1 });
    if (RATE_LIMIT_BUCKETS.size > RATE_LIMIT_BUCKETS_SOFT_CAP) {
      evictOldestBuckets();
    }
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX_PER_WINDOW) {
    return false;
  }
  bucket.count += 1;
  return true;
}

// Visible for tests only — never call from runtime code.
export function __resetRateLimiterForTests(): void {
  RATE_LIMIT_BUCKETS.clear();
}

// True when the operator has opted in to honouring `X-Forwarded-For` (i.e.
// the server is genuinely behind a trusted reverse proxy that strips
// client-supplied XFF headers and appends a real one). Default off — direct
// trust of XFF is a documented rate-limit-bypass vector.
function shouldHonourForwardedFor(): boolean {
  const flag = process.env["V3CODE_TRUST_FORWARDED_FOR"];
  return typeof flag === "string" && (flag === "1" || flag.toLowerCase() === "true");
}

export function rateLimitKeyFromRequest(request: HttpServerRequest.HttpServerRequest): string {
  // Always start from the socket peer address — that's the only attribution
  // we can authenticate without a trusted proxy in front.
  const socketIp = normalizeIpAddress(readRemoteAddressFromSource(request.source));

  if (shouldHonourForwardedFor()) {
    // When the operator has explicitly opted in (i.e. they own the proxy in
    // front and it appends to XFF), use the FIRST entry — that is the
    // original client address documented for X-Forwarded-For. Operators who
    // haven't deployed a stripping proxy must leave V3CODE_TRUST_FORWARDED_FOR
    // unset; otherwise this is a spoofable bypass.
    const forwarded = normalizeNonEmptyString(request.headers["x-forwarded-for"]);
    const xff = forwarded ? normalizeIpAddress(forwarded.split(",")[0]?.trim()) : undefined;
    if (xff) return xff;
  }

  return socketIp ?? "anonymous";
}

export function deriveAuthClientMetadata(input: {
  readonly request: HttpServerRequest.HttpServerRequest;
  readonly label?: string;
}): AuthClientMetadata {
  const userAgent = normalizeNonEmptyString(input.request.headers["user-agent"]);
  const ipAddress = readRemoteAddressFromSource(input.request.source);
  const os = inferOs(userAgent);
  const browser = inferBrowser(userAgent);
  return {
    ...(input.label ? { label: input.label } : {}),
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    deviceType: inferDeviceType(userAgent),
    ...(os ? { os } : {}),
    ...(browser ? { browser } : {}),
  };
}
