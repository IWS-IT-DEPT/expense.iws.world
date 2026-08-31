"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import {
  CodingFields,
  type CodingEntityOption,
  type CodingScopedOption,
} from "@/app/components/coding-fields";
import { ReceiptUploadButton } from "@/app/components/receipt-upload-button";

import { createCardExpense, updateCardExpense, type FormState } from "./actions";

const inputClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

export interface CardExpenseFormProps {
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  units: CodingScopedOption[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJobOrUnit: boolean }[];
  cards: { id: string; label: string }[];
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
  const [state, action, pending] = useActionState<FormState, FormData>(
    editing ? updateCardExpense : createCardExpense,
    {},
  );

  if (state.ok && state.id) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Purchase saved.</p>
        <ReceiptUploadButton
          purpose="pending"
          targetId={state.id}
          label={editing ? "Add another receipt" : "Add the receipt"}
          onDone={() => {
            router.refresh();
            props.onDone?.();
          }}
        />
        <div>
          <button
            type="button"
            onClick={() => {
              router.push("/expenses");
              props.onDone?.();
            }}
            className="text-xs underline opacity-70 hover:opacity-100"
          >
            {editing ? "Done" : "Done — I'll add the receipt later"}
          </button>
        </div>
      </div>
    );
  }

  const i = props.initial;
  const noCards = props.cards.length === 0;

  return (
    <form action={action} className="space-y-4">
      {i ? <input type="hidden" name="id" value={i.id} /> : null}

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
            defaultValue={i?.purchaseDate ?? new Date().toISOString().slice(0, 10)}
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : editing ? "Save changes" : "Save purchase"}
      </button>
    </form>
  );
}
