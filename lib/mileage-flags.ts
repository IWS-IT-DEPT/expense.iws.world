import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems } from "@/db/schema";

/**
 * Payroll-only review flags on mileage lines. Never shown to the employee, never
 * stored: recomputed from the odometer readings each time so the rules can change.
 * A flag is a question to ask, not proof of anything — people do drive more than
 * one vehicle and do round their readings.
 */
export type MileageFlag =
  | { kind: "overlap"; otherId: string; otherDate: string; otherStart: number; otherEnd: number }
  | { kind: "round" };

export interface FlagLine {
  id: string;
  userId: string;
  itemDate: string;
  odometerStart: string | null;
  odometerEnd: string | null;
}

/** Lines that count as the person's real history when looking for overlaps. */
const COUNTED = ["submitted", "reconciled", "approved"] as const;

const n = (v: string) => Number(v);
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Both readings are whole numbers ending in 0 (so also 00): likely estimated, not read off the dash. */
export function isRoundPair(start: number, end: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start % 10 === 0 && end % 10 === 0;
}

/** Ranges that share real distance. One trip ending where the next starts is normal, not an overlap. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function computeMileageFlags(lines: FlagLine[]): Map<string, MileageFlag[]> {
  const out = new Map<string, MileageFlag[]>();
  const add = (id: string, f: MileageFlag) => out.set(id, [...(out.get(id) ?? []), f]);

  const byUser = new Map<string, (FlagLine & { s: number; e: number })[]>();
  for (const l of lines) {
    if (l.odometerStart === null || l.odometerEnd === null) continue;
    const row = { ...l, s: n(l.odometerStart), e: n(l.odometerEnd) };
    byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), row]);
  }

  for (const rows of byUser.values()) {
    for (const a of rows) {
      if (isRoundPair(a.s, a.e)) add(a.id, { kind: "round" });
      for (const b of rows) {
        if (a.id !== b.id && rangesOverlap(a.s, a.e, b.s, b.e)) {
          add(a.id, { kind: "overlap", otherId: b.id, otherDate: b.itemDate, otherStart: b.s, otherEnd: b.e });
        }
      }
    }
  }
  return out;
}

/** Flags for every counted mileage line belonging to these people (their whole history is compared). */
export async function loadMileageFlags(userIds: string[]): Promise<Map<string, MileageFlag[]>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: expenseItems.id,
      userId: expenseItems.userId,
      itemDate: expenseItems.itemDate,
      odometerStart: expenseItems.odometerStart,
      odometerEnd: expenseItems.odometerEnd,
    })
    .from(expenseItems)
    .where(
      and(
        eq(expenseItems.kind, "mileage"),
        inArray(expenseItems.userId, [...new Set(userIds)]),
        inArray(expenseItems.status, [...COUNTED]),
        isNotNull(expenseItems.odometerStart),
        isNotNull(expenseItems.odometerEnd),
      ),
    );
  return computeMileageFlags(rows);
}

export function flagText(f: MileageFlag): string {
  return f.kind === "round"
    ? "Both odometer readings end in 0 — possibly estimated"
    : `Overlaps another trip (${f.otherDate}, odometer ${fmt(f.otherStart)}–${fmt(f.otherEnd)})`;
}
