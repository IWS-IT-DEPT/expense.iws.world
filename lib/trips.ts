import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, trips } from "@/db/schema";

export interface ActiveTrip {
  id: string;
  startedAt: Date;
  odometerStart: number;
  startedFrom: string | null;
}

/** The person's started-but-not-ended trip (starting odometer saved), or null. */
export async function loadActiveTrip(userId: string): Promise<ActiveTrip | null> {
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.userId, userId), eq(trips.status, "active")),
  });
  if (!trip || trip.odometerStart === null) return null;
  return {
    id: trip.id,
    startedAt: trip.startedAt,
    odometerStart: Number(trip.odometerStart),
    startedFrom: trip.startedFrom,
  };
}

/** Where their last mileage entry ended — shown as a hint when they key in the next starting reading. */
export async function lastOdometerEnd(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ end: expenseItems.odometerEnd })
    .from(expenseItems)
    .where(and(eq(expenseItems.userId, userId), eq(expenseItems.kind, "mileage"), isNotNull(expenseItems.odometerEnd)))
    .orderBy(desc(expenseItems.createdAt))
    .limit(1);
  return row?.end == null ? null : Number(row.end);
}
