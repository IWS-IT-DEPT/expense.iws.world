"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { submitWeek, type SubmitState } from "./actions";

export function SubmitWeekButton({
  periodStart,
  periodEnd,
  disabled,
  count,
}: {
  periodStart: string;
  periodEnd: string;
  disabled: boolean;
  count: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SubmitState, FormData>(
    async (prev, fd) => {
      const r = await submitWeek(prev, fd);
      if (r.ok) router.refresh();
      return r;
    },
    {},
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="periodStart" value={periodStart} />
      <input type="hidden" name="periodEnd" value={periodEnd} />
      <button
        type="submit"
        disabled={disabled || pending || count === 0}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {pending ? "Submitting…" : `Submit week (${count})`}
      </button>
      {disabled && count > 0 ? (
        <p className="text-xs opacity-60">Clear the items that need attention first.</p>
      ) : null}
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
