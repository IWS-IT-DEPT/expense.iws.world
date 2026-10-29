import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/current-user";
import { loadActiveTrip } from "@/lib/trips";

const card = "space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/15";
const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-black px-5 text-sm font-semibold text-white sm:w-auto dark:bg-white dark:text-black";
const secondary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-black/15 px-5 text-sm font-semibold sm:w-auto dark:border-white/20";

export default async function MileagePage({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string }>;
}) {
  const user = await requireUser();
  if (!user.mileageEligible) redirect("/expenses");

  // Old links to the form with a finished trip.
  const { trip: tripParam } = await searchParams;
  if (tripParam) redirect(`/expenses/mileage/manual?trip=${encodeURIComponent(tripParam)}`);

  const trip = await loadActiveTrip(user.id);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mileage</h1>
        <p className="text-sm opacity-70">
          Business miles in your personal vehicle. Reimbursed at the IRS standard rate for the trip
          date.
        </p>
      </div>

      <div className={card}>
        <h2 className="text-sm font-semibold">
          {trip ? "You have a trip in progress" : "Start a trip and log each stop"}
        </h2>
        <p className="text-sm opacity-70">
          {trip
            ? "Pick up where you left off — add stops or end the trip."
            : "Tap Start trip, then Add stop at each place you go. The driving miles are worked out for you."}
        </p>
        <Link href="/expenses/trip" className={primary}>
          {trip ? "Continue trip" : "Start trip"}
        </Link>
      </div>

      <div className={card}>
        <h2 className="text-sm font-semibold">Add mileage manually</h2>
        <p className="text-sm opacity-70">
          Already made the trip? Enter where you went (with any stops) and the miles.
        </p>
        <Link href="/expenses/mileage/manual" className={secondary}>
          Add mileage manually
        </Link>
      </div>
    </div>
  );
}
