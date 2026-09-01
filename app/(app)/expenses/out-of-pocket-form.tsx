"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import {
  CodingFields,
  type CodingEntityOption,
  type CodingScopedOption,
} from "@/app/components/coding-fields";
import { ReceiptUploadButton } from "@/app/components/receipt-upload-button";

import { createOutOfPocket, updateExpenseItem, type FormState } from "./actions";

const inputClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

export interface ItemFormInitial {
  id: string;
  itemDate: string;
  amountCents: number;
  paymentMethod: string | null;
  entityId: string | null;
  locationId: string | null;
  unitId: string | null;
  jobId: string | null;
  categoryId: string | null;
  businessPurpose: string | null;
}

export function OutOfPocketForm(props: {
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  units: CodingScopedOption[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJobOrUnit: boolean }[];
  initial?: ItemFormInitial;
}) {
  const router = useRouter();
  const i = props.initial;
  const editing = !!i;
  const [state, action, pending] = useActionState<FormState, FormData>(
    editing ? updateExpenseItem : createOutOfPocket,
    {},
  );

  if (state.ok && state.id) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</p>
        <ReceiptUploadButton
          purpose="item"
          targetId={state.id}
          label={editing ? "Add another receipt" : "Add the receipt"}
          onDone={() => router.refresh()}
        />
        <div>
          <button
            type="button"
            onClick={() => router.push("/expenses")}
            className="text-xs underline opacity-70 hover:opacity-100"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {i ? <input type="hidden" name="id" value={i.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Date</span>
          <input
            name="itemDate"
            type="date"
            required
            defaultValue={i?.itemDate ?? new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Amount</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={i ? (i.amountCents / 100).toFixed(2) : ""}
            placeholder="24.60"
            className={inputClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">How did you pay?</span>
          <select
            name="paymentMethod"
            required
            defaultValue={i?.paymentMethod ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Select…
            </option>
            <option value="personal_card">Personal card</option>
            <option value="cash">Cash</option>
            <option value="personal_check">Personal check</option>
          </select>
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
              : undefined
          }
        />
      </fieldset>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : editing ? "Save changes" : "Save reimbursement"}
      </button>
    </form>
  );
}
