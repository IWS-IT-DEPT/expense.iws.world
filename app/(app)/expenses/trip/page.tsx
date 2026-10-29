import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { mileageRates } from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import { mapboxConfigured } from "@/lib/mapbox";
import { loadActiveTrip } from "@/lib/trips";

import { TripPanel } from "./trip-panel";

export default async function TripPage() {
  const user = await requireUser();
  if (!user.mileageEligible) redirect("/expenses");

  const [trip, latestRate] = await Promise.all([
    loadActiveTrip(user.id),
    db.query.mileageRates.findFirst({ orderBy: [desc(mileageRates.effectiveDate)] }),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mileage trip</h1>
        <p className="text-sm opacity-70">
          Tap <strong>Start trip</strong>, then <strong>Add stop</strong> at each place you go. Driving
          distance is worked out for you and the whole trip becomes one mileage entry.
        </p>
        <p className="mt-1 text-xs opacity-60">
          Your location is read only at the moment you tap a button — never in the background.
        </p>
      </div>
      <TripPanel
        trip={
          trip && {
            id: trip.id,
            totalMiles: trip.totalMiles,
            missingLegs: trip.missingLegs,
            stops: trip.stops.map((s) => ({
              id: s.id,
              seq: s.seq,
              label: s.label,
              legMiles: s.legMiles,
              override: s.legMilesOverride,
              miles: s.miles,
              time: s.recordedAt.toISOString(),
            })),
          }
        }
        ratePerMile={latestRate?.ratePerMile ?? null}
        routing={mapboxConfigured}
      />
    </div>
  );
}
