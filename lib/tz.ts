/**
 * Everything in the app is reconciled to the main office's time: US Central.
 * The IANA zone (not a fixed -06:00 offset) so daylight saving is handled —
 * CST in winter, CDT in summer. Dates stored as `date` columns are plain
 * calendar days; timestamps are stored in UTC and shown in this zone.
 *
 * No server-only imports: client components (form defaults) use this too.
 */
export const APP_TZ = "America/Chicago";

/** Calendar date (YYYY-MM-DD) in Central time. */
export function todayInTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "Oct 28, 2026, 3:04 PM CDT" — a timestamp as the main office sees it. */
export function formatDateTime(d: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(typeof d === "string" ? new Date(d) : d);
}
