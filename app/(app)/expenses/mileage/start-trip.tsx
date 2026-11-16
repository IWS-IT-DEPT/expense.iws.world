"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelTrip, startTrip } from "./actions";

const input =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";
const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto dark:bg-white dark:text-black";

/** Save the starting odometer (and where from) before driving. */
export function StartTripForm({ lastOdometerEnd }: { lastOdometerEnd: number | null }) {
  const router = useRouter();
  const [odometer, setOdometer] = useState("");
  const [from, setFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startBusy(async () => {
          const r = await startTrip(odometer, from);
          if (!r.ok) setError(r.error);
          else router.refresh();
        });
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Starting odometer</span>
        <input
          required
          inputMode="decimal"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          placeholder="45210"
          className={input}
        />
        {lastOdometerEnd !== null ? (
          <span className="mt-1 block text-xs opacity-60">
            Your last entry ended at {lastOdometerEnd.toLocaleString("en-US")}.
          </span>
        ) : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Starting from (optional)</span>
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Main Office" className={input} />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={busy || !odometer.trim()} className={primary}>
        {busy ? "Starting…" : "Start trip"}
      </button>
    </form>
  );
}

export function DiscardTrip() {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      className="text-sm text-red-600 underline"
      onClick={() => {
        if (!window.confirm("Discard this started trip? Nothing has been submitted.")) return;
        startBusy(async () => {
          await cancelTrip();
          router.refresh();
        });
      }}
    >
      Discard this trip
    </button>
  );
}
