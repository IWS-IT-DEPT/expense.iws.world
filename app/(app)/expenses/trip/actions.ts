"use server";

import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { locations, trips, tripStops } from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import { drivingMiles, forwardGeocode, metersBetween, reverseGeocode, type LatLng } from "@/lib/mapbox";

/** A stop within this distance of a saved site is named after the site. */
const SITE_RADIUS_M = 250;

type Result = { ok: true } | { ok: false; error: string };

async function activeTrip(userId: string) {
  return db.query.trips.findFirst({
    where: and(eq(trips.userId, userId), eq(trips.status, "active")),
  });
}

async function requireMileageUser() {
  const user = await requireUser();
  return user.mileageEligible ? user : null;
}

const NOT_ALLOWED: Result = { ok: false, error: "Mileage isn't turned on for your account." };

function validPoint(p: LatLng) {
  return (
    Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
  );
}

/** Name a point: a saved site if it's at one, else its street address, else a plain fallback. */
async function nameFor(p: LatLng, fallback: string): Promise<string> {
  const sites = await db.query.locations.findMany({ where: eq(locations.active, true) });
  let best: { name: string; d: number } | null = null;
  for (const s of sites) {
    if (s.latitude === null || s.longitude === null) continue;
    const d = metersBetween(p, { lat: Number(s.latitude), lng: Number(s.longitude) });
    if (d <= SITE_RADIUS_M && (!best || d < best.d)) best = { name: s.name, d };
  }
  return best?.name ?? (await reverseGeocode(p)) ?? fallback;
}

/** Miles from the stop just before `seq` (or the last stop when `seq` is omitted) to `p`. */
async function legFrom(tripId: string, p: LatLng, seq?: number) {
  const [prev] = await db
    .select()
    .from(tripStops)
    .where(seq === undefined ? eq(tripStops.tripId, tripId) : and(eq(tripStops.tripId, tripId), lt(tripStops.seq, seq)))
    .orderBy(desc(tripStops.seq))
    .limit(1);
  if (!prev) return { prev: null, miles: null };
  const miles = await drivingMiles({ lat: Number(prev.latitude), lng: Number(prev.longitude) }, p);
  return { prev, miles };
}

async function appendStop(tripId: string, p: LatLng, label?: string): Promise<void> {
  const { prev, miles } = await legFrom(tripId, p);
  const seq = prev ? prev.seq + 1 : 0;
  await db.insert(tripStops).values({
    tripId,
    seq,
    label: label || (await nameFor(p, seq === 0 ? "Start" : `Stop ${seq}`)),
    latitude: p.lat.toFixed(6),
    longitude: p.lng.toFixed(6),
    legMiles: miles === null ? null : miles.toFixed(1),
  });
}

export async function startTrip(p: LatLng): Promise<Result> {
  const user = await requireMileageUser();
  if (!user) return NOT_ALLOWED;
  if (!validPoint(p)) return { ok: false, error: "Couldn't read your location." };
  if (await activeTrip(user.id)) return { ok: false, error: "You already have a trip in progress." };
  const [trip] = await db.insert(trips).values({ userId: user.id }).returning({ id: trips.id });
  await appendStop(trip.id, p);
  revalidatePath("/expenses/trip");
  return { ok: true };
}

export async function addStop(p: LatLng): Promise<Result> {
  const user = await requireMileageUser();
  if (!user) return NOT_ALLOWED;
  if (!validPoint(p)) return { ok: false, error: "Couldn't read your location." };
  const trip = await activeTrip(user.id);
  if (!trip) return { ok: false, error: "No trip in progress." };
  await appendStop(trip.id, p);
  revalidatePath("/expenses/trip");
  return { ok: true };
}

/** For when GPS isn't available or they forgot to tap: add a stop by typing its address. */
export async function addStopByAddress(address: string): Promise<Result> {
  const user = await requireMileageUser();
  if (!user) return NOT_ALLOWED;
  const trip = await activeTrip(user.id);
  if (!trip) return { ok: false, error: "No trip in progress." };
  const hit = await forwardGeocode(address);
  if (!hit) return { ok: false, error: "Couldn't find that address. Add the city and state." };
  await appendStop(trip.id, hit, hit.label);
  revalidatePath("/expenses/trip");
  return { ok: true };
}

async function ownedStop(userId: string, stopId: string) {
  const trip = await activeTrip(userId);
  if (!trip) return null;
  const stop = await db.query.tripStops.findFirst({
    where: and(eq(tripStops.id, stopId), eq(tripStops.tripId, trip.id)),
  });
  return stop ? { trip, stop } : null;
}

export async function renameStop(stopId: string, label: string): Promise<Result> {
  const user = await requireUser();
  const hit = await ownedStop(user.id, stopId);
  const clean = label.trim().slice(0, 200);
  if (!hit || !clean) return { ok: false, error: "Not found." };
  await db.update(tripStops).set({ label: clean }).where(eq(tripStops.id, stopId));
  revalidatePath("/expenses/trip");
  return { ok: true };
}

/** `miles` blank clears the override and goes back to the calculated distance. */
export async function setLegMiles(stopId: string, miles: string): Promise<Result> {
  const user = await requireUser();
  const hit = await ownedStop(user.id, stopId);
  if (!hit) return { ok: false, error: "Not found." };
  const n = miles.trim() === "" ? null : Number(miles);
  if (n !== null && (!Number.isFinite(n) || n < 0 || n > 2000)) {
    return { ok: false, error: "Enter miles for this leg." };
  }
  await db
    .update(tripStops)
    .set({ legMilesOverride: n === null ? null : n.toFixed(1) })
    .where(eq(tripStops.id, stopId));
  revalidatePath("/expenses/trip");
  return { ok: true };
}

export async function removeStop(stopId: string): Promise<Result> {
  const user = await requireUser();
  const hit = await ownedStop(user.id, stopId);
  if (!hit || hit.stop.seq === 0) return { ok: false, error: "The start can't be removed." };
  await db.delete(tripStops).where(eq(tripStops.id, stopId));
  // The stop after it now follows an earlier point: re-measure that leg.
  const [after] = await db
    .select()
    .from(tripStops)
    .where(and(eq(tripStops.tripId, hit.trip.id), gt(tripStops.seq, hit.stop.seq)))
    .orderBy(asc(tripStops.seq))
    .limit(1);
  if (after) {
    const here = { lat: Number(after.latitude), lng: Number(after.longitude) };
    const { miles } = await legFrom(hit.trip.id, here, after.seq);
    await db
      .update(tripStops)
      .set({ legMiles: miles === null ? null : miles.toFixed(1), legMilesOverride: null })
      .where(eq(tripStops.id, after.id));
  }
  revalidatePath("/expenses/trip");
  return { ok: true };
}

export async function cancelTrip(): Promise<Result> {
  const user = await requireUser();
  const trip = await activeTrip(user.id);
  if (!trip) return { ok: true };
  await db.update(trips).set({ status: "cancelled", endedAt: new Date() }).where(eq(trips.id, trip.id));
  revalidatePath("/expenses/trip");
  return { ok: true };
}
