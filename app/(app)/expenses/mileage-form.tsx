"use client";

import { SubmitButton } from "@/app/components/submit-button";
import { useActionState, useState } from "react";
import { todayInTz } from "@/lib/tz";
import { useRouter } from "next/navigation";

import { CancelWorkflow } from "@/app/components/cancel-workflow";
import { SaveBar } from "@/app/components/save-bar";
import {
  CodingFields,
  type CodingEntityOption,
  type CodingScopedOption,
} from "@/app/components/coding-fields";

import { calculateRoute } from "./trip/actions";
import { createMileage, updateExpenseItem, type FormState } from "./actions";

const inputClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

export interface MileageFormInitial {
  id: string;
  itemDate: string;
  miles: string | null;
  tripFrom: string | null;
  tripTo: string | null;
  entityId: string | null;
  locationId: string | null;
  unitId: string | null;
  jobId: string | null;
  categoryId: string | null;
  businessPurpose: string | null;
}

export function MileageForm(props: {
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  units: CodingScopedOption[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJobOrUnit: boolean }[];
  mileageCategoryId?: string;
  currentRatePerMile?: string;
  initial?: MileageFormInitial;
  /** A finished trip being turned into the one mileage line. */
  prefill?: { tripId: string; itemDate: string; miles: string; tripFrom: string; tripTo: string };
}) {
  const router = useRouter();
  const i = props.initial;
  const editing = !!i;
  const [miles, setMiles] = useState(i?.miles ?? props.prefill?.miles ?? "");
  const [dirty, setDirty] = useState(false);
  // New hand-entered trips can list stops along the way; edits and finished trips already carry theirs.
  const withStops = !editing && !props.prefill;
  const [stops, setStops] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [calc, setCalc] = useState<{ working: boolean; error?: string; legs?: number[] }>({ working: false });

  async function calculate() {
    setCalc({ working: true });
    const r = await calculateRoute([from, ...stops, to]);
    if (r.ok) {
      setMiles(r.total.toFixed(1));
      setDirty(true);
      setCalc({ working: false, legs: r.legs });
    } else {
      setCalc({ working: false, error: r.error });
    }
  }
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      const r = await (editing ? updateExpenseItem : createMileage)(prev, fd);
      if (r.ok && editing) {
        setDirty(false);
        router.refresh();
      }
      return r;
    },
    {},
  );

  const estimate =
    props.currentRatePerMile && Number(miles) > 0
      ? (Number(miles) * Number(props.currentRatePerMile)).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })
      : null;

  if (state.ok && !editing) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</p>
        <button
          type="button"
          onClick={() => router.push("/expenses")}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Back to My Expenses
        </button>
      </div>
    );
  }

  return (
    <form action={action} onChange={() => setDirty(true)} className="space-y-4">
      {i ? <input type="hidden" name="id" value={i.id} /> : null}
      {props.prefill ? <input type="hidden" name="tripId" value={props.prefill.tripId} /> : null}
      {!editing ? (
        <div className="-mb-2">
          <CancelWorkflow dirty={dirty} what="mileage entry" variant="top" />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Date</span>
          <input
            name="itemDate"
            type="date"
            required
            defaultValue={i?.itemDate ?? props.prefill?.itemDate ?? todayInTz()}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Miles</span>
          <input
            name="miles"
            required
            inputMode="decimal"
            step="0.1"
            value={miles}
            onChange={(e) => setMiles(e.target.value)}
            placeholder="42.0"
            className={inputClass}
          />
          {estimate ? (
            <span className="mt-1 block text-xs opacity-60">≈ {estimate} (estimated)</span>
          ) : null}
        </label>
        {withStops ? (
          <div className="space-y-3 sm:col-span-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">From</span>
              <input
                name="tripFrom"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputClass}
                placeholder="Main Office"
              />
            </label>
            {stops.map((s, n) => (
              <div key={n} className="flex items-end gap-2">
                <label className="block flex-1">
                  <span className="mb-1 block text-sm font-medium">Stop {n + 1}</span>
                  <input
                    name="stop"
                    value={s}
                    onChange={(e) => setStops(stops.map((v, k) => (k === n ? e.target.value : v)))}
                    className={inputClass}
                    placeholder="Customer site or address"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setStops(stops.filter((_, k) => k !== n))}
                  className="min-h-9 rounded-md border border-black/15 px-3 text-sm dark:border-white/20"
                  aria-label={`Remove stop ${n + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setStops([...stops, ""])}
              className="text-sm underline"
              disabled={stops.length >= 10}
            >
              + Add a stop
            </button>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">To</span>
              <input
                name="tripTo"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputClass}
                placeholder="Houston Warehouse 1"
              />
            </label>
            <div className="space-y-1">
              <button
                type="button"
                onClick={calculate}
                disabled={calc.working || !from.trim() || !to.trim()}
                className="min-h-10 rounded-md border border-black/15 px-3 text-sm font-medium disabled:opacity-50 dark:border-white/20"
              >
                {calc.working ? "Calculating…" : "Calculate miles from these places"}
              </button>
              {calc.legs ? (
                <p className="text-xs opacity-70">
                  Driving: {calc.legs.map((l) => `${l.toFixed(1)} mi`).join(" + ")}. You can adjust the miles above.
                </p>
              ) : null}
              {calc.error ? <p className="text-xs text-red-600">{calc.error}</p> : null}
            </div>
          </div>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">From</span>
              <input
                name="tripFrom"
                defaultValue={i?.tripFrom ?? props.prefill?.tripFrom ?? ""}
                className={inputClass}
                placeholder="Main Office"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">To</span>
              <input
                name="tripTo"
                defaultValue={i?.tripTo ?? props.prefill?.tripTo ?? ""}
                className={inputClass}
                placeholder="Houston Warehouse 1"
              />
            </label>
          </>
        )}
      </div>

      <fieldset className="space-y-4 rounded-lg border border-black/10 p-3 dark:border-white/15">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide opacity-60">Coding</legend>
        <CodingFields
          entities={props.entities}
          locations={props.locations}
          units={props.units}
          jobs={props.jobs}
          categories={props.categories}
          initial={
            i
              ? {
                  entityId: i.entityId,
                  locationId: i.locationId,
                  unitId: i.unitId,
                  jobId: i.jobId,
                  categoryId: i.categoryId,
                  businessPurpose: i.businessPurpose,
                }
              : props.mileageCategoryId
                ? { categoryId: props.mileageCategoryId }
                : undefined
          }
        />
      </fieldset>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      {editing && state.ok && !dirty ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Changes saved.</p>
      ) : null}

      {!editing ? (
        <div className="space-y-2">
        <SubmitButton
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto dark:bg-white dark:text-black"
        >
          {pending ? "Saving…" : "Save mileage"}
        </SubmitButton>
        <CancelWorkflow dirty={dirty} what="mileage entry" />
        </div>
      ) : dirty ? (
        <SaveBar pending={pending} />
      ) : null}
    </form>
  );
}
