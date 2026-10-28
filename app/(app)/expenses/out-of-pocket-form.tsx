"use client";

import { SubmitButton } from "@/app/components/submit-button";
import { useActionState, useState } from "react";
import { todayInTz } from "@/lib/tz";
import { useRouter } from "next/navigation";

import {
  CodingFields,
  type CodingEntityOption,
  type CodingScopedOption,
} from "@/app/components/coding-fields";
import { CancelWorkflow } from "@/app/components/cancel-workflow";
import { ReceiptStager, centsFromText, uploadStagedReceipts } from "@/app/components/receipt-stager";
import { SaveBar } from "@/app/components/save-bar";

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
  receiptThresholdCents?: number;
}) {
  const router = useRouter();
  const i = props.initial;
  const editing = !!i;
  const [dirty, setDirty] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [amountText, setAmountText] = useState(i ? (i.amountCents / 100).toFixed(2) : "");
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      const r = await (editing ? updateExpenseItem : createOutOfPocket)(prev, fd);
      if (!r.ok) return r;
      setDirty(false);
      if (editing) {
        router.refresh();
        return r;
      }
      if (r.id && staged.length > 0) {
        const up = await uploadStagedReceipts("item", r.id, staged);
        if (!up.ok) return { ...r, uploadError: up.error } as FormState;
      }
      router.push(`/expenses/${r.id}`);
      return r;
    },
    {},
  );

  const uploadError = (state as FormState & { uploadError?: string }).uploadError;
  if (state.ok && state.id && !editing && uploadError) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-emerald-700 dark:text-emerald-400">Saved.</p>
        <p className="text-red-600">The receipt didn&apos;t upload: {uploadError}</p>
        <button
          type="button"
          onClick={() => router.push(`/expenses/${state.id}`)}
          className="inline-flex min-h-12 items-center rounded-lg bg-black px-5 font-semibold text-white dark:bg-white dark:text-black"
        >
          Open it and add the receipt
        </button>
      </div>
    );
  }

  const thresholdCents = props.receiptThresholdCents ?? 7500;
  const cents = centsFromText(amountText);
  const receiptRequired = !editing && cents !== null && cents >= thresholdCents;
  const receiptMissing = receiptRequired && staged.length === 0;

  return (
    <form action={action} onChange={() => setDirty(true)} className="space-y-4">
      {i ? <input type="hidden" name="id" value={i.id} /> : null}

      {!editing ? (
        <div className="-mb-2">
          <CancelWorkflow dirty={dirty || staged.length > 0} what="reimbursement" variant="top" />
        </div>
      ) : null}

      {!editing ? (
        <ReceiptStager
          files={staged}
          onChange={setStaged}
          required={receiptRequired}
          requiredNote={`A receipt is required for expenses of ${(thresholdCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} or more — add it now while you have it.`}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Date</span>
          <input
            name="itemDate"
            type="date"
            required
            defaultValue={i?.itemDate ?? todayInTz()}
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
            onChange={(e) => setAmountText(e.target.value)}
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

      {editing && state.ok && !dirty ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Changes saved.</p>
      ) : null}

      {!editing ? (
        <div className="space-y-2">
          <SubmitButton
            type="submit"
            disabled={pending || receiptMissing}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto dark:bg-white dark:text-black"
          >
            {pending ? "Saving…" : receiptMissing ? "Add a receipt to save" : "Save reimbursement"}
          </SubmitButton>
          {receiptMissing ? (
            <SubmitButton
              type="submit"
              disabled={pending}
              className="block min-h-11 text-sm underline opacity-70 hover:opacity-100"
            >
              Save without a receipt for now (I&apos;ll add it later)
            </SubmitButton>
          ) : null}
          <CancelWorkflow dirty={dirty || staged.length > 0} what="reimbursement" />
        </div>
      ) : dirty ? (
        <SaveBar pending={pending} />
      ) : null}
    </form>
  );
}
