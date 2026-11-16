import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/current-user";
import { shortDate } from "@/lib/format";
import { lastOdometerEnd, loadActiveTrip } from "@/lib/trips";
import { todayInTz } from "@/lib/tz";

import { DiscardTrip, StartTripForm } from "./start-trip";

const card = "space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15";
const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-black px-5 text-sm font-semibold text-white sm:w-auto dark:bg-white dark:text-black";
const secondary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-black/15 px-5 text-sm font-semibold sm:w-auto dark:border-white/20";

export default async function MileagePage() {
  const user = await requireUser();
  if (!user.mileageEligible) redirect("/expenses");

  const [trip, lastEnd] = await Promise.all([loadActiveTrip(user.id), lastOdometerEnd(user.id)]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mileage</h1>
        <p className="text-sm opacity-70">
          Business miles in your personal vehicle, from your odometer. Reimbursed at the IRS standard
          rate for the trip date.
        </p>
      </div>

      {trip ? (
        <div className={card}>
          <h2 className="text-sm font-semibold">You have a trip in progress</h2>
          <p className="text-sm opacity-70">
            Started {shortDate(todayInTz(trip.startedAt))} at odometer{" "}
            <strong>{trip.odometerStart.toLocaleString("en-US")}</strong>
            {trip.startedFrom ? <> from {trip.startedFrom}</> : null}. When you&apos;re done, read your
            odometer again and end the trip.
          </p>
          <Link href={`/expenses/mileage/manual?trip=${trip.id}`} className={primary}>
            End trip
          </Link>
          <div>
            <DiscardTrip />
          </div>
        </div>
      ) : (
        <>
          <div className={card}>
            <h2 className="text-sm font-semibold">Starting a trip</h2>
            <p className="text-sm opacity-70">
              Save your starting odometer now. Come back and enter the ending one when you&apos;re done —
              every mile in between counts, detours included.
            </p>
            <StartTripForm lastOdometerEnd={lastEnd} />
          </div>

          <div className={card}>
            <h2 className="text-sm font-semibold">Already finished?</h2>
            <p className="text-sm opacity-70">Enter both odometer readings in one go.</p>
            <Link href="/expenses/mileage/manual" className={secondary}>
              Log a finished trip
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
