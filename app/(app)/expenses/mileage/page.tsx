import Link from "next/link";
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
      {!finishing ? (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="text-sm font-semibold">
            {trip ? "You have a trip in progress" : "Driving to more than one place?"}
          </h2>
          <p className="text-sm opacity-70">
            {trip
              ? "Pick up where you left off — add stops or end the trip."
              : "Start a trip, tap Add stop at each place, and the miles are worked out for you."}
          </p>
          <Link
            href="/expenses/trip"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-black px-5 text-sm font-semibold text-white sm:w-auto dark:bg-white dark:text-black"
          >
            {trip ? "Continue trip" : "Start trip"}
          </Link>
          {!trip ? <p className="pt-1 text-xs opacity-60">Or enter a single trip by hand below.</p> : null}
        </div>
      ) : null}
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
