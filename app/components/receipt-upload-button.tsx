"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/app/components/modal";
import type { UploadPurpose } from "@/lib/upload-token";

/**
 * "Upload receipt" entry point. Phase 1: a modal with a file picker that POSTs
 * to /api/receipts. Later phases add the in-browser scanner ("use this device")
 * and the QR desktop→phone handoff ("use my phone").
 */
export function ReceiptUploadButton({
  purpose,
  targetId,
  label = "Upload receipt",
  compact = false,
  onDone,
}: {
  purpose: UploadPurpose;
  targetId?: string;
  label?: string;
  compact?: boolean;
  onDone?: (r: { receiptCount: number; pendingExpenseId?: string | null }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("purpose", purpose);
    if (targetId) fd.set("targetId", targetId);
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/receipts", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}) as Record<string, unknown>);
    setBusy(false);
    if (!res.ok) {
      setErr((json.error as string) ?? "Upload failed.");
      return;
    }
    setOpen(false);
    onDone?.({
      receiptCount: (json.receiptCount as number) ?? 0,
      pendingExpenseId: (json.pendingExpenseId as string | null) ?? null,
    });
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "text-xs underline opacity-70 hover:opacity-100"
            : "rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        }
      >
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a receipt">
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="file"
            name="file"
            accept="image/*,application/pdf"
            multiple
            required
            className="block w-full text-sm"
          />
          <p className="text-xs opacity-60">
            Photos or PDFs — pick one or several. A scanner and a “send from your phone” option are
            coming next.
          </p>
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </form>
      </Modal>
    </>
  );
}
