import { APP_TZ, todayInTz } from "./tz";

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Calendar dates (`YYYY-MM-DD`, from `date` columns) are formatted as-is, with
 * no timezone shift. Real timestamps are shown in Central time.
 */
export function shortDate(value: string | Date): string {
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = dateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : APP_TZ,
  }).format(d);
}

/**
 * ISO Monday..Sunday week containing `date`. A `Date` means "this instant" and
 * is read as a Central calendar day (so Friday 8 PM Central is still Friday,
 * not Saturday UTC); a string is already a calendar day.
 */
export function weekBounds(date: Date | string): { start: string; end: string } {
  const [y, m, day0] = (typeof date === "string" ? date : todayInTz(date)).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, day0));
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  const start = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const end = d.toISOString().slice(0, 10);
  return { start, end };
}
