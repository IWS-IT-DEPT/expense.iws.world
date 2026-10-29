import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { trips, tripStops } from "@/db/schema";

export interface TripStopView {
  id: string;
  seq: number;
  label: string;
  recordedAt: Date;
  /** Calculated driving miles from the previous stop (null = couldn't be calculated). */
  legMiles: number | null;
  legMilesOverride: number | null;
  /** What counts: the person's figure if they set one, else the calculated one. */
  miles: number | null;
}

export interface TripView {
  id: string;
  startedAt: Date;
  stops: TripStopView[];
  totalMiles: number;
  /** Legs with no distance yet — the person must type them before saving. */
  missingLegs: number;
}

const num = (v: string | null) => (v === null ? null : Number(v));

/** The person's in-progress trip with its stops, or null. */
export async function loadActiveTrip(userId: string): Promise<TripView | null> {
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.userId, userId), eq(trips.status, "active")),
  });
  if (!trip) return null;
  const rows = await db
    .select()
    .from(tripStops)
    .where(eq(tripStops.tripId, trip.id))
    .orderBy(asc(tripStops.seq));
  const stops: TripStopView[] = rows.map((r, i) => {
    const legMiles = num(r.legMiles);
    const legMilesOverride = num(r.legMilesOverride);
    return {
      id: r.id,
      seq: r.seq,
      label: r.label,
      recordedAt: r.recordedAt,
      legMiles,
      legMilesOverride,
      miles: i === 0 ? null : (legMilesOverride ?? legMiles),
    };
  });
  const legs = stops.slice(1);
  return {
    id: trip.id,
    startedAt: trip.startedAt,
    stops,
    totalMiles: Math.round(legs.reduce((a, s) => a + (s.miles ?? 0), 0) * 10) / 10,
    missingLegs: legs.filter((s) => s.miles === null).length,
  };
}

/** Stops -> the From / To text on the single mileage line: "To" carries any in-between stops. */
export function routeText(stops: { label: string }[]): { from: string; to: string } {
  const first = stops[0]?.label ?? "";
  const last = stops.length > 1 ? stops[stops.length - 1].label : "";
  const via = stops.slice(1, -1).map((s) => s.label);
  return { from: first, to: via.length ? `${last} (via ${via.join("; ")})` : last };
}
