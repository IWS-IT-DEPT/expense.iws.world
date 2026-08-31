"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import {
  CodingFields,
  type CodingEntityOption,
  type CodingScopedOption,
} from "@/app/components/coding-fields";

import { saveCoding, type SaveCodingState } from "../actions";

export function CodingForm({
  transactionId,
  cardOwnerEntityId,
  entities,
  locations,
  units,
  jobs,
  categories,
  initial,
}: {
  transactionId: string;
  cardOwnerEntityId: string;
  entities: CodingEntityOption[];
  locations: { id: string; name: string; homeEntityId: string | null }[];
  units: CodingScopedOption[];
  jobs: CodingScopedOption[];
  categories: { id: string; name: string; requiresJobOrUnit: boolean }[];
  initial?: {
    entityId: string;
    locationId: string;
    unitId: string | null;
    jobId: string | null;
    categoryId: string;
    businessPurpose: string;
  };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SaveCodingState, FormData>(
    async (prev, fd) => {
      const result = await saveCoding(prev, fd);
      if (result.ok) router.push("/transactions");
      return result;
    },
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="transactionId" value={transactionId} />

      <CodingFields
        entities={entities}
        locations={locations}
        units={units}
        jobs={jobs}
        categories={categories}
        cardOwnerEntityId={cardOwnerEntityId}
        initial={initial}
      />

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : "Save coding"}
      </button>
    </form>
  );
}
