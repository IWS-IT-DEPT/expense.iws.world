"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { trips } from "@/db/schema";
import { requireUser } from "@/lib/current-user";

type Result = { ok: true } | { ok: false; error: string };

/** Save the starting odometer now; the ending one is entered when the trip is done. */
export async function startTrip(odometer: string, from: string): Promise<Result> {
  const user = await requireUser();
  if (!user.mileageEligible) return { ok: false, error: "Mileage isn't turned on for your account." };
  const reading = Number(odometer.replace(/,/g, ""));
  if (odometer.trim() === "" || !Number.isFinite(reading) || reading < 0) {
    return { ok: false, error: "Enter the odometer reading you're starting at." };
  }
  const active = await db.query.trips.findFirst({
    where: and(eq(trips.userId, user.id), eq(trips.status, "active")),
  });
  if (active) return { ok: false, error: "You already have a trip in progress." };
  await db.insert(trips).values({
    userId: user.id,
    odometerStart: reading.toFixed(1),
    startedFrom: from.trim().slice(0, 200) || null,
  });
  revalidatePath("/expenses/mileage");
  revalidatePath("/expenses");
  return { ok: true };
}

export async function cancelTrip(): Promise<Result> {
  const user = await requireUser();
  await db
    .update(trips)
    .set({ status: "cancelled", endedAt: new Date() })
    .where(and(eq(trips.userId, user.id), eq(trips.status, "active")));
  revalidatePath("/expenses/mileage");
  revalidatePath("/expenses");
  return { ok: true };
}
