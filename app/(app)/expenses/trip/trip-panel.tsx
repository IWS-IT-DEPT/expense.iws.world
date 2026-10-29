"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addStop, addStopByAddress, cancelTrip, removeStop, renameStop, setLegMiles, startTrip } from "./actions";

interface Stop {
  id: string;
  seq: number;
  label: string;
  legMiles: number | null;
  override: number | null;
  miles: number | null;
  time: string;
}

interface Props {
  trip: { id: string; totalMiles: number; missingLegs: number; stops: Stop[] } | null;
  ratePerMile: string | null;
  routing: boolean;
}

const btn =
  "inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-semibold disabled:opacity-50";
const primary = `${btn} bg-black text-white dark:bg-white dark:text-black`;
const secondary = `${btn} border border-black/15 dark:border-white/20`;
const input =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

/** One-shot GPS fix, only when the person taps. */
function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This device can't share its location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Location is turned off for this app. Allow it in your phone's settings, or add the stop by address."
              : "Couldn't get your location. Try again outside, or add the stop by address.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function TripPanel({ trip, ratePerMile, routing }: Props) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState("");

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string } | void>, after?: () => void) {
    setError(null);
    setWorking(label);
    try {
      const r = await fn();
      if (r && !r.ok) setError(r.error ?? "Something went wrong.");
      else after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setWorking(null);
      startBusy(() => router.refresh());
    }
  }

  const disabled = busy || working !== null;
  const estimate =
    trip && ratePerMile
      ? (trip.totalMiles * Number(ratePerMile)).toLocaleString("en-US", { style: "currency", currency: "USD" })
      : null;

  if (!trip) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          disabled={disabled}
          className={`${primary} w-full`}
          onClick={() => run("Starting…", async () => startTrip(await currentPosition()))}
        >
          {working ?? "Start trip"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-sm opacity-70">
          <Link href="/expenses/mileage" className="underline">
            ← Back to mileage
          </Link>
        </p>
      </div>
    );
  }

  const last = trip.stops[trip.stops.length - 1];

  return (
    <div className="space-y-4">
      {!routing ? (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          Driving distance isn&apos;t available right now, so type the miles for each leg.
        </p>
      ) : null}

      <ol className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
        {trip.stops.map((s) => (
          <StopRow key={s.id} stop={s} disabled={disabled} run={run} />
        ))}
      </ol>

      <div className="flex items-baseline justify-between rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
        <span className="font-medium">Trip so far</span>
        <span>
          <strong>{trip.totalMiles.toFixed(1)} mi</strong>
          {estimate ? <span className="opacity-60"> · ≈ {estimate}</span> : null}
        </span>
      </div>

      {trip.missingLegs > 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {trip.missingLegs} leg{trip.missingLegs === 1 ? "" : "s"} still need miles — type them in above.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          className={secondary}
          onClick={() => run("Adding stop…", async () => addStop(await currentPosition()))}
        >
          {working === "Adding stop…" ? working : "Add stop here"}
        </button>
        <button
          type="button"
          disabled={disabled || trip.stops.length < 2}
          className={primary}
          onClick={() => run("Ending…", async () => addStop(await currentPosition()), () => router.push(`/expenses/mileage/manual?trip=${trip.id}`))}
        >
          {working === "Ending…" ? working : "End trip here"}
        </button>
      </div>
      {trip.stops.length > 1 ? (
        <Link
          href={`/expenses/mileage/manual?trip=${trip.id}`}
          className="block text-center text-sm underline opacity-80"
        >
          End the trip at the last stop ({last.label.split(",")[0]}) without adding a new one
        </Link>
      ) : null}

      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          const a = address;
          void run("Finding address…", () => addStopByAddress(a), () => setAddress(""));
        }}
      >
        <label className="block text-sm font-medium" htmlFor="stop-address">
          Or add a stop by address
        </label>
        <div className="flex gap-2">
          <input
            id="stop-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Houston, TX"
            className={input}
          />
          <button type="submit" disabled={disabled || !address.trim()} className={secondary}>
            Add
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={disabled}
        className="text-sm text-red-600 underline"
        onClick={() => {
          if (window.confirm("Discard this trip and its stops?")) void run("Discarding…", cancelTrip);
        }}
      >
        Discard this trip
      </button>
    </div>
  );
}

function StopRow({
  stop,
  disabled,
  run,
}: {
  stop: Stop;
  disabled: boolean;
  run: (label: string, fn: () => Promise<{ ok: boolean; error?: string } | void>) => Promise<void>;
}) {
  const [label, setLabel] = useState(stop.label);
  const [miles, setMiles] = useState(stop.override !== null ? String(stop.override) : "");
  const start = stop.seq === 0;

  return (
    <li className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">
          {start ? "Start" : `Stop ${stop.seq}`} · {fmtTime(stop.time)}
        </span>
        {!start ? (
          <button
            type="button"
            disabled={disabled}
            className="text-xs text-red-600 underline"
            onClick={() => run("Removing…", () => removeStop(stop.id))}
          >
            Remove
          </button>
        ) : null}
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label.trim() && label !== stop.label) void run("Saving…", () => renameStop(stop.id, label));
        }}
        aria-label="Name of this stop"
        className={input}
      />
      {!start ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="opacity-70">
            {stop.legMiles !== null ? `Drove ${stop.legMiles.toFixed(1)} mi` : "Distance not calculated"}
          </span>
          <label className="ml-auto flex items-center gap-1">
            <span className="opacity-70">Use</span>
            <input
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              onBlur={() => {
                if (miles !== (stop.override !== null ? String(stop.override) : "")) {
                  void run("Saving…", () => setLegMiles(stop.id, miles));
                }
              }}
              inputMode="decimal"
              placeholder={stop.legMiles !== null ? stop.legMiles.toFixed(1) : "miles"}
              aria-label="Miles for this leg"
              className="w-20 rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
            />
            <span className="opacity-70">mi</span>
          </label>
        </div>
      ) : null}
    </li>
  );
}
