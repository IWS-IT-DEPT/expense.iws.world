"use client";

import Link from "next/link";

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
import { checkOdometer } from "@/lib/odometer";

import { createMileage, updateExpenseItem, type FormState } from "./actions";

const inputClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

export interface MileageFormInitial {
  id: string;
  itemDate: string;
  /** Reimbursed miles. Only edited directly for lines saved before odometers existed. */
  miles: string | null;
  odometerStart: string | null;
  odometerEnd: string | null;
  personalMiles: string | null;
  personalMilesNote: string | null;
  tripFrom: string | null;
  tripTo: string | null;
  entityId: string | null;
  locationId: string | null;
  jobId: string | null;
  categoryId: string | null;
  businessPurpose: string | null;
}

export function MileageForm(props: {
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJob: boolean }[];
  userRequiresJob?: boolean;
  mileageCategoryId?: string;
  currentRatePerMile?: string;
  initial?: MileageFormInitial;
  /** Their last ending odometer, shown as a hint for the next starting reading. */
  lastOdometerEnd?: number | null;
  /** A started trip being finished: the starting reading and place are already saved. */
  prefill?: { tripId: string; itemDate: string; odometerStart: string; tripFrom: string };
}) {
  const router = useRouter();
  const i = props.initial;
  const editing = !!i;
  // Lines saved before odometers existed only have a miles figure; keep editing them that way.
  const legacy = editing && i.odometerStart === null;
  const [odoStart, setOdoStart] = useState(i?.odometerStart ?? props.prefill?.odometerStart ?? "");
  const [odoEnd, setOdoEnd] = useState(i?.odometerEnd ?? "");
  const [personal, setPersonal] = useState(i?.personalMiles ?? "");
  const [personalNote, setPersonalNote] = useState(i?.personalMilesNote ?? "");
  const [legacyMiles, setLegacyMiles] = useState(i?.miles ?? "");
  const [dirty, setDirty] = useState(false);

  // Live read-back so a mistyped digit is obvious before saving.
  const odo = checkOdometer(odoStart, odoEnd, personal, personalNote || "x");
  const businessMiles = legacy ? Number(legacyMiles) : odo.ok ? odo.business : 0;

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
    props.currentRatePerMile && businessMiles > 0
      ? (businessMiles * Number(props.currentRatePerMile)).toLocaleString("en-US", {
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
    <form
      action={action}
      onChange={() => setDirty(true)}
      // React resets a form after its action finishes, even when the server sent back an
      // error — which wiped everything they had typed. Keep what is on screen instead.
      onReset={(e) => e.preventDefault()}
      className="space-y-4"
    >
      {i ? <input type="hidden" name="id" value={i.id} /> : null}
      {props.prefill ? <input type="hidden" name="tripId" value={props.prefill.tripId} /> : null}
      {!editing ? (
        <div className="-mb-2">
          {props.prefill ? (
            <Link
              href="/expenses/mileage"
              className="inline-flex min-h-11 items-center px-1 text-sm font-medium underline opacity-80"
            >
              ← Back to mileage
            </Link>
          ) : (
            <CancelWorkflow dirty={dirty} what="mileage entry" variant="top" />
          )}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Date</span>
          <input
            name="itemDate"
            type="date"
            required
            defaultValue={i?.itemDate ?? props.prefill?.itemDate ?? todayInTz()}
            className={inputClass}
          />
        </label>

        {legacy ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Miles</span>
            <input
              name="miles"
              required
              inputMode="decimal"
              value={legacyMiles}
              onChange={(e) => setLegacyMiles(e.target.value)}
              className={inputClass}
            />
            <span className="mt-1 block text-xs opacity-60">
              This entry was saved before odometer readings were collected.
            </span>
          </label>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Starting odometer</span>
              <input
                name="odometerStart"
                required
                inputMode="decimal"
                value={odoStart}
                onChange={(e) => setOdoStart(e.target.value)}
                placeholder="45210"
                className={inputClass}
              />
              {props.lastOdometerEnd != null && !props.prefill && !editing ? (
                <span className="mt-1 block text-xs opacity-60">
                  Your last entry ended at {props.lastOdometerEnd.toLocaleString("en-US")}.
                </span>
              ) : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Ending odometer</span>
              <input
                name="odometerEnd"
                required
                inputMode="decimal"
                value={odoEnd}
                onChange={(e) => setOdoEnd(e.target.value)}
                placeholder="45262"
                className={inputClass}
                autoFocus={!!props.prefill}
              />
            </label>
          </>
        )}

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
          <span className="mb-1 block text-sm font-medium">To / route</span>
          <input
            name="tripTo"
            defaultValue={i?.tripTo ?? ""}
            className={inputClass}
            placeholder="Houston Warehouse 1, then Katy site"
          />
        </label>
      </div>

      {!legacy ? (
        <details
          className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
          open={!!(i?.personalMiles && Number(i.personalMiles) > 0)}
        >
          <summary className="cursor-pointer font-medium">Any personal miles in this stretch?</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <p className="text-xs opacity-70 sm:col-span-2">
              The odometer already counts every mile you drove, including work detours. Only fill this in
              for miles that weren&apos;t for business (a personal errand, say) — they&apos;re taken off.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Personal miles</span>
              <input
                name="personalMiles"
                inputMode="decimal"
                value={personal}
                onChange={(e) => setPersonal(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">What were they for?</span>
              <input
                name="personalMilesNote"
                value={personalNote}
                onChange={(e) => setPersonalNote(e.target.value)}
                className={inputClass}
                placeholder="Stopped at the pharmacy"
              />
            </label>
          </div>
        </details>
      ) : null}

      {!legacy ? (
        <div className="rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
          {odo.ok ? (
            <>
              <strong>{businessMiles.toFixed(1)} business miles</strong>
              {odo.personal > 0 ? (
                <span className="opacity-70">
                  {" "}
                  ({odo.driven.toFixed(1)} driven − {odo.personal.toFixed(1)} personal)
                </span>
              ) : null}
              {estimate ? <span className="opacity-60"> · ≈ {estimate} (estimated)</span> : null}
            </>
          ) : odoStart && odoEnd ? (
            <span className="text-amber-700 dark:text-amber-400">{odo.error}</span>
          ) : (
            <span className="opacity-60">Enter both odometer readings to see your miles.</span>
          )}
        </div>
      ) : estimate ? (
        <p className="text-xs opacity-60">≈ {estimate} (estimated)</p>
      ) : null}

      <fieldset className="space-y-4 rounded-lg border border-black/10 p-3 dark:border-white/15">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide opacity-60">Coding</legend>
        <CodingFields
          entities={props.entities}
          locations={props.locations}
          jobs={props.jobs}
          categories={props.categories}
          userRequiresJob={props.userRequiresJob}
          initial={
            i
              ? {
                  entityId: i.entityId,
                  locationId: i.locationId,
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
          {props.prefill ? (
            <Link
              href="/expenses/mileage"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-black/15 px-4 text-sm font-medium sm:w-auto dark:border-white/20"
            >
              Back (your trip is still saved)
            </Link>
          ) : (
            <CancelWorkflow dirty={dirty} what="mileage entry" />
          )}
        </div>
      ) : dirty ? (
        <SaveBar pending={pending} />
      ) : null}
    </form>
  );
}
