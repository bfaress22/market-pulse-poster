/** Shared timezone-aware schedule helpers (UTC storage, IANA display). */

const WEEKDAY: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

export function wallTimeToUtc(localIsoDate: string, hour: number, minute: number, timeZone: string): Date {
  const hh = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  const local = `${localIsoDate}T${hh}:${mi}:00`;
  const asUtc = new Date(`${local}Z`).getTime();
  const tzString = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(asUtc));
  const m = tzString.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})/);
  let offsetMin = 0;
  if (m) {
    const tzAsUtc = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5]);
    offsetMin = (asUtc - tzAsUtc) / 60000;
  }
  return new Date(asUtc + offsetMin * 60000);
}

export function datePartsInZone(date: Date, timeZone: string): { year: string; month: string; day: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: WEEKDAY[parts.weekday] ?? 0,
  };
}

export function computeNextRun(
  daysOfWeek: number[],
  hour: number,
  minute: number,
  timeZone: string,
  from: Date = new Date(),
): Date {
  if (!daysOfWeek?.length) return new Date(from.getTime() + 24 * 3600_000);
  const days = new Set(daysOfWeek);
  for (let i = 0; i < 14; i++) {
    const candidate = new Date(from.getTime() + i * 24 * 3600_000);
    const parts = datePartsInZone(candidate, timeZone);
    if (!days.has(parts.weekday)) continue;
    const target = wallTimeToUtc(`${parts.year}-${parts.month}-${parts.day}`, hour, minute, timeZone);
    if (target.getTime() > from.getTime()) return target;
  }
  return new Date(from.getTime() + 24 * 3600_000);
}

export function computeNextRunISO(
  daysOfWeek: number[],
  hour: number,
  minute: number,
  timeZone: string,
  from?: Date,
): string {
  return computeNextRun(daysOfWeek, hour, minute, timeZone, from).toISOString();
}

export function formatInZone(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function makeIdempotencyKey(parts: {
  postId?: string | null;
  targetId: string;
  scheduleId?: string | null;
  executionId: string;
}): string {
  return [
    parts.scheduleId ? `sched:${parts.scheduleId}` : "oneshot",
    parts.postId ? `post:${parts.postId}` : "nopost",
    `target:${parts.targetId}`,
    `exec:${parts.executionId}`,
  ].join("|");
}

export const TERMINAL_ERROR_CODES = new Set([
  "LINKEDIN_TOKEN_EXPIRED",
  "LINKEDIN_NOT_CONNECTED",
  "LINKEDIN_FORBIDDEN",
  "INVALID_CONTENT",
  "IMAGE_REQUIRED",
  "IMAGE_NOT_PERSISTED",
  "TARGET_INVALID",
]);

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
}

export function isRetryableErrorCode(code: string | null | undefined): boolean {
  if (!code) return false;
  if (TERMINAL_ERROR_CODES.has(code)) return false;
  return code === "LINKEDIN_RATE_LIMITED" || code === "LINKEDIN_TRANSIENT" || code === "NETWORK_ERROR" || code === "TIMEOUT";
}

export function retryBackoffMs(attemptCount: number): number {
  const steps = [60_000, 180_000, 540_000];
  return steps[Math.min(Math.max(attemptCount - 1, 0), steps.length - 1)];
}

export function isPersistableImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("data:")) return false;
  return url.startsWith("https://") || url.startsWith("http://");
}
