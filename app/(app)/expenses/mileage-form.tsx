"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CodingFields,
  type CodingEntityOption,
  type CodingScopedOption,
} from "@/app/components/coding-fields";

import { createMileage, type FormState } from "./actions";

const inputClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

export function MileageForm(props: {
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  units: CodingScopedOption[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJobOrUnit: boolean }[];
  mileageCategoryId?: string;
  currentRatePerMile?: string;
}) {
  const router = useRouter();
  const [miles, setMiles] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(createMileage, {});

  const estimate =
    props.currentRatePerMile && Number(miles) > 0
      ? (Number(miles) * Number(props.currentRatePerMile)).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })
      : null;

  if (state.ok) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Mileage saved.</p>
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
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Date</span>
          <input
            name="itemDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
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
        <label className="block">
          <span className="mb-1 block text-sm font-medium">From</span>
          <input name="tripFrom" className={inputClass} placeholder="Main Office" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">To</span>
          <input name="tripTo" className={inputClass} placeholder="Houston Warehouse 1" />
        </label>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-black/10 p-3 dark:border-white/15">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide opacity-60">Coding</legend>
        <CodingFields
          entities={props.entities}
          locations={props.locations}
          units={props.units}
          jobs={props.jobs}
          categories={props.categories}
          initial={props.mileageCategoryId ? { categoryId: props.mileageCategoryId } : undefined}
        />
      </fieldset>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : "Save mileage"}
      </button>
    </form>
  );
}
