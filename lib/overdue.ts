import { todayInTz } from "./tz";

export { todayInTz };

const DAY_MS = 24 * 60 * 60 * 1000;

function utcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** The Friday that closes the Mon–Sun week containing `iso` (end of day is the deadline). */
export function dueDateFor(iso: string): string {
  const d = new Date(utcMs(iso));
  const fromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - fromMonday + 4);
  return d.toISOString().slice(0, 10);
}

/** Whole days past the Friday deadline for an expense dated `iso`; 0 if not yet overdue. */
export function daysOverdue(iso: string, today: string): number {
  return Math.max(0, Math.round((utcMs(today) - utcMs(dueDateFor(iso))) / DAY_MS));
}
