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
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(candidate).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    const wd = WEEKDAY[parts.weekday];
    if (!days.has(wd)) continue;
    const target = wallTimeToUtc(`${parts.year}-${parts.month}-${parts.day}`, hour, minute, timeZone);
    if (target.getTime() > from.getTime()) return target;
  }
  return new Date(from.getTime() + 24 * 3600_000);
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

export function isPersistableImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("data:")) return false;
  return url.startsWith("https://") || url.startsWith("http://");
}
