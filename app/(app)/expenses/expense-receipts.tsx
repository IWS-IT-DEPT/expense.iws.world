import { ReceiptUploadButton } from "@/app/components/receipt-upload-button";

import { deleteCardExpenseReceipt, deleteExpenseItemReceipt } from "./actions";

interface Rec {
  id: string;
  contentType: string;
  filename: string;
}

/** Existing receipts (thumbnail + remove) plus the add/scan/QR button. */
export function ExpenseReceipts({
  receipts,
  purpose,
  targetId,
}: {
  receipts: Rec[];
  purpose: "pending" | "item";
  targetId: string;
}) {
  const del = purpose === "pending" ? deleteCardExpenseReceipt : deleteExpenseItemReceipt;

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Receipts ({receipts.length})</h2>
        <ReceiptUploadButton purpose={purpose} targetId={targetId} label="Add / scan receipt" />
      </div>
      {receipts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {receipts.map((r) => (
            <div key={r.id} className="group relative">
              <a href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer">
                {r.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/receipts/${r.id}`}
                    alt={r.filename}
                    className="h-24 w-20 rounded border border-black/10 object-cover dark:border-white/15"
                  />
                ) : (
                  <span className="flex h-24 w-20 items-center justify-center rounded border border-black/10 text-xs opacity-70 dark:border-white/15">
                    PDF
                  </span>
                )}
              </a>
              <form action={del} className="absolute -right-1 -top-1">
                <input type="hidden" name="receiptId" value={r.id} />
                <button
                  className="rounded-full bg-black/70 px-1 text-[10px] leading-4 text-white opacity-0 group-hover:opacity-100"
                  title="Remove receipt"
                >
                  ✕
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
