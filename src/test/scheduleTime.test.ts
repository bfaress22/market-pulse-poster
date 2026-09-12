import { describe, expect, it } from "vitest";
import {
  computeNextRun,
  makeIdempotencyKey,
  isPersistableImageUrl,
  isRetryableHttpStatus,
  isRetryableErrorCode,
  retryBackoffMs,
  wallTimeToUtc,
} from "@/lib/scheduleTime";
import { isConfirmedPublished } from "@/lib/publishStatus";

describe("scheduleTime", () => {
  it("computes a future next run in Europe/Paris", () => {
    const from = new Date("2026-09-12T10:00:00.000Z");
    const next = computeNextRun([6], 18, 0, "Europe/Paris", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    const parisHour = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(next);
    expect(parisHour).toBe("18:00");
  });

  it("converts wall time to UTC without double-shifting", () => {
    const utc = wallTimeToUtc("2026-01-15", 18, 0, "Europe/Paris");
    expect(utc.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("handles DST offset in summer", () => {
    const utc = wallTimeToUtc("2026-07-15", 18, 0, "Europe/Paris");
    expect(utc.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });
});

describe("idempotency", () => {
  it("builds a stable key per post/target/execution", () => {
    const a = makeIdempotencyKey({ postId: "p1", targetId: "t1", scheduleId: "s1", executionId: "2026-09-12T18:00" });
    const b = makeIdempotencyKey({ postId: "p1", targetId: "t1", scheduleId: "s1", executionId: "2026-09-12T18:00" });
    const c = makeIdempotencyKey({ postId: "p1", targetId: "t2", scheduleId: "s1", executionId: "2026-09-12T18:00" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("retry policy", () => {
  it("retries 429/5xx only", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(401)).toBe(false);
    expect(isRetryableHttpStatus(403)).toBe(false);
    expect(isRetryableHttpStatus(400)).toBe(false);
  });

  it("does not retry terminal LinkedIn codes", () => {
    expect(isRetryableErrorCode("LINKEDIN_TOKEN_EXPIRED")).toBe(false);
    expect(isRetryableErrorCode("LINKEDIN_FORBIDDEN")).toBe(false);
    expect(isRetryableErrorCode("INVALID_CONTENT")).toBe(false);
    expect(isRetryableErrorCode("LINKEDIN_RATE_LIMITED")).toBe(true);
    expect(isRetryableErrorCode("TIMEOUT")).toBe(true);
  });

  it("uses exponential-ish backoff", () => {
    expect(retryBackoffMs(1)).toBe(60_000);
    expect(retryBackoffMs(2)).toBe(180_000);
    expect(retryBackoffMs(3)).toBe(540_000);
  });
});

describe("image urls", () => {
  it("rejects data URLs and accepts https", () => {
    expect(isPersistableImageUrl("data:image/png;base64,aaa")).toBe(false);
    expect(isPersistableImageUrl("https://example.com/x.png")).toBe(true);
    expect(isPersistableImageUrl(null)).toBe(false);
  });
});

describe("publish confirmation", () => {
  it("never treats published-without-URN as confirmed", () => {
    expect(isConfirmedPublished("published", null)).toBe(false);
    expect(isConfirmedPublished("published", "urn:li:share:1")).toBe(true);
    expect(isConfirmedPublished("scheduled", "urn:li:share:1")).toBe(false);
  });
});
