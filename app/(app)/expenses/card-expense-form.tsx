"use client";

import { useActionState, useState } from "react";
import { todayInTz } from "@/lib/tz";
import { useRouter } from "next/navigation";

import {
  CodingFields,
  type CodingEntityOption,
  type CodingScopedOption,
} from "@/app/components/coding-fields";
import { CancelWorkflow } from "@/app/components/cancel-workflow";
import { ConfirmAction } from "@/app/components/confirm-action";
import { ReceiptStager, centsFromText, uploadStagedReceipts } from "@/app/components/receipt-stager";
import { SaveBar } from "@/app/components/save-bar";

import {
  createCardExpense,
  submitCardExpense,
  updateCardExpense,
  type FormState,
} from "./actions";

const inputClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

export interface CardExpenseFormProps {
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  units: CodingScopedOption[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJobOrUnit: boolean }[];
  cards: { id: string; label: string }[];
  /** true when the server says this expense passes every check and can be sent to accounting */
  submitReady?: boolean;
  /** receipt required at/above this amount (cents) — used to prompt for it while logging */
  receiptThresholdCents?: number;
  initial?: {
    id: string;
    merchant: string;
    amountCents: number;
    purchaseDate: string;
    cardId: string | null;
    notes: string | null;
    entityId: string | null;
    locationId: string | null;
    unitId: string | null;
    jobId: string | null;
    categoryId: string | null;
    businessPurpose: string | null;
  };
  onDone?: () => void;
}

export function CardExpenseForm(props: CardExpenseFormProps) {
  const router = useRouter();
  const editing = !!props.initial;
  const [dirty, setDirty] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [amountText, setAmountText] = useState(
    props.initial ? (props.initial.amountCents / 100).toFixed(2) : "",
  );
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      const r = await (editing ? updateCardExpense : createCardExpense)(prev, fd);
      if (!r.ok) return r;
      setDirty(false);
      if (editing) {
        router.refresh(); // re-pull server checks / submitReady
        return r;
      }
      // Create: send the receipt(s) up with the expense, then open it.
      if (r.id && staged.length > 0) {
        const up = await uploadStagedReceipts("pending", r.id, staged);
        if (!up.ok) return { ...r, uploadError: up.error } as FormState;
      }
      router.push(`/expenses/${r.id}`);
      props.onDone?.();
      return r;
    },
    {},
  );

  // Create flow: saved, but the receipt didn't make it — don't lose the expense.
  const uploadError = (state as FormState & { uploadError?: string }).uploadError;
  if (state.ok && state.id && !editing && uploadError) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-emerald-700 dark:text-emerald-400">Purchase saved.</p>
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

  const i = props.initial;
  const noCards = props.cards.length === 0;
  const savedClean = editing && state.ok && !dirty;

  return (
    <form action={action} onChange={() => setDirty(true)} className="space-y-4">
      {i ? <input type="hidden" name="id" value={i.id} /> : null}

      {!editing ? (
        <div className="-mb-2">
          <CancelWorkflow dirty={dirty || staged.length > 0} what="purchase" variant="top" />
        </div>
      ) : null}

      {!editing ? (
        <ReceiptStager
          files={staged}
          onChange={setStaged}
          required={receiptRequired}
          requiredNote={`A receipt is required for purchases of ${(thresholdCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} or more — add it now while you have it.`}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Merchant</span>
          <input name="merchant" required defaultValue={i?.merchant ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Amount</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={i ? (i.amountCents / 100).toFixed(2) : ""}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="84.12"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Purchase date</span>
          <input
            name="purchaseDate"
            type="date"
            required
            defaultValue={i?.purchaseDate ?? todayInTz()}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Which card?</span>
          <select name="cardId" defaultValue={i?.cardId ?? ""} className={inputClass}>
            <option value="">{noCards ? "No cards registered yet" : "Select a card…"}</option>
            {props.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {noCards ? (
            <span className="mt-1 block text-xs opacity-60">
              Add one on{" "}
              <a href="/cards" className="underline">
                My Cards
              </a>{" "}
              — you&apos;ll need it before you can submit.
            </span>
          ) : null}
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notes (optional)</span>
        <input name="notes" defaultValue={i?.notes ?? ""} className={inputClass} />
      </label>

      <fieldset className="space-y-4 rounded-lg border border-black/10 p-3 dark:border-white/15">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide opacity-60">
          Coding — fill it in now, or leave blank and finish before you submit
        </legend>
        <CodingFields
          required={false}
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
      {savedClean ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Changes saved.</p>
      ) : null}

      {!editing ? (
        <div className="space-y-2">
          <button
            type="submit"
            disabled={pending || receiptMissing}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto dark:bg-white dark:text-black"
          >
            {pending ? "Saving…" : receiptMissing ? "Add a receipt to save" : "Save purchase"}
          </button>
          {receiptMissing ? (
            <button
              type="submit"
              disabled={pending}
              className="block min-h-11 text-sm underline opacity-70 hover:opacity-100"
            >
              Save without a receipt for now (I&apos;ll add it later)
            </button>
          ) : null}
          <CancelWorkflow dirty={dirty || staged.length > 0} what="purchase" />
        </div>
      ) : dirty ? (
        <SaveBar pending={pending} />
      ) : props.submitReady ? (
        <ConfirmAction
          tone="primary"
          label="Submit to accounting"
          confirmLabel="Yes, submit it"
          question={
            <>
              Send <strong>{i?.merchant}</strong> to accounting? You won&apos;t be able to change it after
              this unless they send it back.
            </>
          }
          run={async () => {
            const fd = new FormData();
            fd.set("id", i!.id);
            await submitCardExpense(fd);
            router.push("/expenses");
            router.refresh();
          }}
        />
      ) : null}
    </form>
  );
}
