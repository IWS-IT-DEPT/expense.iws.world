"use client";

import { useRouter } from "next/navigation";

import { ConfirmAction } from "@/app/components/confirm-action";
import { ReceiptUploadButton } from "@/app/components/receipt-upload-button";

import { deleteCardExpenseReceipt, deleteExpenseItemReceipt } from "./actions";

interface Rec {
  id: string;
  contentType: string;
  filename: string;
}

/**
 * Receipts on an expense's page: big Add/Scan button, a tappable thumbnail for
 * each one, and a two-step Remove. Read-only once the expense is submitted.
 */
export function ExpenseReceipts({
  receipts,
  purpose,
  targetId,
  editable = true,
}: {
  receipts: Rec[];
  purpose: "pending" | "item";
  targetId: string;
  editable?: boolean;
}) {
  const router = useRouter();
  const del = purpose === "pending" ? deleteCardExpenseReceipt : deleteExpenseItemReceipt;

  return (
    <section className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold">Receipts ({receipts.length})</h2>

      {receipts.length === 0 ? (
        <p className="text-sm opacity-60">{editable ? "No receipt added yet." : "No receipt on this expense."}</p>
      ) : (
        <ul className="space-y-3">
          {receipts.map((r) => (
            <li key={r.id} className="flex items-start gap-3">
              <a href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                {r.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/receipts/${r.id}`}
                    alt={r.filename}
                    className="h-28 w-24 rounded border border-black/10 object-cover dark:border-white/15"
                  />
                ) : (
                  <span className="flex h-28 w-24 items-center justify-center rounded border border-black/10 text-sm opacity-70 dark:border-white/15">
                    PDF
                  </span>
                )}
              </a>
              <div className="min-w-0 flex-1 space-y-2">
                <a
                  href={`/api/receipts/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm underline"
                >
                  {r.filename}
                </a>
                {editable ? (
                  <ConfirmAction
                    label="Remove"
                    confirmLabel="Yes, remove it"
                    question="Remove this receipt? You'll need to add it again if you change your mind."
                    run={async () => {
                      const fd = new FormData();
                      fd.set("receiptId", r.id);
                      await del(fd);
                      router.refresh();
                    }}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <ReceiptUploadButton
          purpose={purpose}
          targetId={targetId}
          label={receipts.length > 0 ? "Add another receipt" : "Add / scan receipt"}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-black/15 px-4 text-sm font-medium hover:bg-black/5 sm:w-auto dark:border-white/20 dark:hover:bg-white/10"
        />
      ) : null}
    </section>
  );
}
