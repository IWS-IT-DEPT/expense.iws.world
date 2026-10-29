import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, mileageRates } from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import { loadActiveTrip, routeText } from "@/lib/trips";
import { todayInTz } from "@/lib/tz";

import { MileageForm } from "../mileage-form";
import { loadCodingOptions } from "../coding-options";

export default async function MileagePage({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string }>;
}) {
  const user = await requireUser();
  if (!user.mileageEligible) redirect("/expenses");

  const { trip: tripParam } = await searchParams;
  const trip = await loadActiveTrip(user.id);
  const finishing = trip && trip.id === tripParam && trip.stops.length > 1 ? trip : null;
  if (tripParam && !finishing) redirect("/expenses/trip");
  if (finishing && finishing.missingLegs > 0) redirect("/expenses/trip");

  const [options, mileageCat, latestRate] = await Promise.all([
    loadCodingOptions(user.jobExempt),
    db.query.categories.findFirst({ where: eq(categories.code, "MILEAGE") }),
    db.query.mileageRates.findFirst({ orderBy: [desc(mileageRates.effectiveDate)] }),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mileage</h1>
        <p className="text-sm opacity-70">
          Business miles in your personal vehicle. Reimbursed at the IRS standard rate for the trip
          date.
        </p>
      </div>
      <MileageForm
        {...options}
        mileageCategoryId={mileageCat?.id}
        currentRatePerMile={latestRate?.ratePerMile}
        prefill={
          finishing
            ? {
                tripId: finishing.id,
                itemDate: todayInTz(finishing.startedAt),
                miles: finishing.totalMiles.toFixed(1),
                ...(() => {
                  const r = routeText(finishing.stops);
                  return { tripFrom: r.from, tripTo: r.to };
                })(),
              }
            : undefined
        }
      />
    </div>
  );
}
