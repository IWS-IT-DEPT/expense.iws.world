import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, mileageRates } from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import { lastOdometerEnd, loadActiveTrip } from "@/lib/trips";
import { todayInTz } from "@/lib/tz";

import { MileageForm } from "../../mileage-form";
import { loadCodingOptions } from "../../coding-options";

export default async function LogMileagePage({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string }>;
}) {
  const user = await requireUser();
  if (!user.mileageEligible) redirect("/expenses");

  const { trip: tripParam } = await searchParams;
  const trip = tripParam ? await loadActiveTrip(user.id) : null;
  if (tripParam && (!trip || trip.id !== tripParam)) redirect("/expenses/mileage");

  const [options, mileageCat, latestRate, lastEnd] = await Promise.all([
    loadCodingOptions(user.requiresJobCode),
    db.query.categories.findFirst({ where: eq(categories.code, "MILEAGE") }),
    db.query.mileageRates.findFirst({ orderBy: [desc(mileageRates.effectiveDate)] }),
    lastOdometerEnd(user.id),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{trip ? "End your trip" : "Log a finished trip"}</h1>
        <p className="text-sm opacity-70">
          {trip
            ? "Enter your ending odometer and the coding, then tap Save mileage. Your trip stays saved until you do."
            : "Enter your odometer at the start and end of the trip. Reimbursed at the IRS standard rate for the trip date."}
        </p>
      </div>
      <MileageForm
        {...options}
        mileageCategoryId={mileageCat?.id}
        currentRatePerMile={latestRate?.ratePerMile}
        lastOdometerEnd={lastEnd}
        prefill={
          trip
            ? {
                tripId: trip.id,
                itemDate: todayInTz(trip.startedAt),
                odometerStart: String(trip.odometerStart),
                tripFrom: trip.startedFrom ?? "",
              }
            : undefined
        }
      />
    </div>
  );
}
