"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { confirmMatch, type ConfirmMatchState } from "@/app/(app)/receipts/actions";

/** Applies a Receipt Bank entry's coding + receipts to a transaction. */
export function ConfirmMatchButton({
  pendingExpenseId,
  transactionId,
  label = "Apply this coding & attach receipt",
}: {
  pendingExpenseId: string;
  transactionId: string;
  label?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ConfirmMatchState, FormData>(
    async (prev, fd) => {
      const r = await confirmMatch(prev, fd);
      if (r.ok) router.refresh();
      return r;
    },
    {},
  );

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="pendingExpenseId" value={pendingExpenseId} />
      <input type="hidden" name="transactionId" value={transactionId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? "Linking…" : label}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
