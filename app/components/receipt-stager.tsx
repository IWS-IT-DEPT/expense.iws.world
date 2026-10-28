"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/app/components/modal";
import { ReceiptScanner } from "@/app/components/receipt-scanner";

const MAX_RECEIPTS = 12;

/**
 * Receipt capture INSIDE the "log an expense" form. Receipts are scanned (or
 * picked) and held here; they upload together with the expense when the user
 * saves, so adding the receipt is part of logging — not a second step to forget.
 */
export function ReceiptStager({
  files,
  onChange,
  required,
  requiredNote,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  /** true when this expense must have a receipt to be saved/submitted */
  required?: boolean;
  requiredNote?: string;
}) {
  const [open, setOpen] = useState(false);

  const previews = useMemo(
    () => files.map((f) => ({ file: f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null })),
    [files],
  );
  useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);

  const missing = required && files.length === 0;

  return (
    <section
      className={`space-y-3 rounded-lg border p-4 ${
        missing ? "border-amber-500/60 bg-amber-500/5" : "border-black/10 dark:border-white/15"
      }`}
    >
      <div>
        <h2 className="text-sm font-semibold">Receipt</h2>
        <p className="text-xs opacity-70">
          {missing
            ? (requiredNote ?? "A receipt is required — add it now while you have it.")
            : "Add it now while you have it — it takes a few seconds."}
        </p>
      </div>

      {previews.length > 0 ? (
        <ul className="space-y-3">
          {previews.map((p, idx) => (
            <li key={`${p.file.name}-${idx}`} className="flex items-center gap-3">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt="Receipt"
                  className="h-20 w-16 rounded border border-black/10 object-cover dark:border-white/15"
                />
              ) : (
                <span className="flex h-20 w-16 items-center justify-center rounded border border-black/10 text-xs opacity-70 dark:border-white/15">
                  PDF
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">
                {p.file.name} <span className="opacity-50">· {(p.file.size / 1024).toFixed(0)} KB</span>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== idx))}
                className="inline-flex min-h-11 items-center rounded-lg border border-black/15 px-3 text-sm dark:border-white/20"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {files.length < MAX_RECEIPTS ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"
        >
          {files.length > 0 ? "Add another receipt" : "📷 Scan or add receipt"}
        </button>
      ) : null}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a receipt">
        <ReceiptScanner
          purpose="pending"
          onFile={(f) => {
            onChange([...files, f]);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </section>
  );
}

/** Upload staged receipts to an expense that was just created. */
export async function uploadStagedReceipts(
  purpose: "pending" | "item",
  targetId: string,
  files: File[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (files.length === 0) return { ok: true };
  const fd = new FormData();
  fd.set("purpose", purpose);
  fd.set("targetId", targetId);
  for (const f of files) fd.append("file", f);
  try {
    const res = await fetch("/api/receipts", { method: "POST", body: fd });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? "The receipt didn't upload." };
  } catch {
    return { ok: false, error: "The receipt didn't upload — check your connection." };
  }
}

/** Dollars-text → cents for the "receipt required at $X" check (UI only; the server re-checks). */
export function centsFromText(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
