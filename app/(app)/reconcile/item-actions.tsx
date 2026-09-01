"use client";

import { useState } from "react";

import { approveExpenseItem, rejectExpenseItem } from "./actions";

export function ItemActions({ itemId }: { itemId: string }) {
  const [sendingBack, setSendingBack] = useState(false);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={approveExpenseItem}>
          <input type="hidden" name="id" value={itemId} />
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Approve
          </button>
        </form>
        <button
          type="button"
          onClick={() => setSendingBack((v) => !v)}
          className="rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/20"
        >
          Send back
        </button>
      </div>

      {sendingBack && (
        <form
          action={rejectExpenseItem}
          className="flex flex-wrap items-end gap-2 rounded-md border border-black/10 p-2 dark:border-white/15"
        >
          <input type="hidden" name="id" value={itemId} />
          <input
            name="reason"
            required
            placeholder="what needs fixing?"
            className="flex-1 rounded border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
          />
          <button
            type="submit"
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Send back to submitter
          </button>
        </form>
      )}
    </div>
  );
}
