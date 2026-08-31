"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { reconcileLine, rejectLine, type LineActionState } from "./actions";

export function ReconcileLine({
  lineId,
  amountLabel,
  dateLabel,
}: {
  lineId: string;
  amountLabel: string;
  dateLabel: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "correct" | "reject">("idle");
  const [confirmState, confirmAction, confirmPending] = useActionState<LineActionState, FormData>(
    async (p, fd) => {
      const r = await reconcileLine(p, fd);
      if (r.ok) router.refresh();
      return r;
    },
    {},
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<LineActionState, FormData>(
    async (p, fd) => {
      const r = await rejectLine(p, fd);
      if (r.ok) router.refresh();
      return r;
    },
    {},
  );

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={confirmAction}>
          <input type="hidden" name="lineId" value={lineId} />
          <button
            type="submit"
            disabled={confirmPending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {confirmPending ? "…" : "Confirm as entered"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "correct" ? "idle" : "correct")}
          className="rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/20"
        >
          Correct amount / date
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "reject" ? "idle" : "reject")}
          className="rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/20"
        >
          Send back
        </button>
      </div>

      {mode === "correct" && (
        <form action={confirmAction} className="flex flex-wrap items-end gap-2 rounded-md border border-black/10 p-2 dark:border-white/15">
          <input type="hidden" name="lineId" value={lineId} />
          <label className="text-xs">
            <span className="block opacity-60">Actual amount</span>
            <input name="actualAmount" inputMode="decimal" placeholder={amountLabel} className="w-24 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20" />
          </label>
          <label className="text-xs">
            <span className="block opacity-60">Actual date</span>
            <input name="actualPurchaseDate" type="date" defaultValue={dateLabel} className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20" />
          </label>
          <input name="note" placeholder="note (optional)" className="flex-1 rounded border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20" />
          <button type="submit" disabled={confirmPending} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Confirm with correction
          </button>
        </form>
      )}

      {mode === "reject" && (
        <form action={rejectAction} className="flex flex-wrap items-end gap-2 rounded-md border border-black/10 p-2 dark:border-white/15">
          <input type="hidden" name="lineId" value={lineId} />
          <input name="reason" required placeholder="what needs fixing?" className="flex-1 rounded border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20" />
          <button type="submit" disabled={rejectPending} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Send back to cardholder
          </button>
        </form>
      )}

      {confirmState.error ? <p className="text-xs text-red-600">{confirmState.error}</p> : null}
      {rejectState.error ? <p className="text-xs text-red-600">{rejectState.error}</p> : null}
    </div>
  );
}
