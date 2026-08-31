import { desc, lte } from "drizzle-orm";

import { db } from "@/db";
import { mileageRates } from "@/db/schema";

/** The IRS standard mileage rate in effect on a given date. */
export async function rateForDate(isoDate: string) {
  const rate = await db.query.mileageRates.findFirst({
    where: lte(mileageRates.effectiveDate, isoDate),
    orderBy: [desc(mileageRates.effectiveDate)],
  });
  if (!rate) {
    throw new Error(
      `No mileage rate configured on or before ${isoDate}. Add one under Admin -> Mileage rates.`,
    );
  }
  return rate;
}

/** miles * rate, rounded to whole cents. */
export function mileageAmountCents(miles: number, ratePerMile: string): number {
  return Math.round(miles * Number.parseFloat(ratePerMile) * 100);
}
