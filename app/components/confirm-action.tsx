"use client";

import { useState, useTransition } from "react";

/**
 * Two-step button for anything hard to undo. The first tap only reveals a
 * clearly worded question; nothing happens until the second, deliberately
 * different button is tapped — so a stray thumb can't do damage.
 *
 *   <ConfirmAction label="Discard expense" question="…" confirmLabel="Yes, discard" run={fn} />
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  run,
  tone = "danger",
  className = "",
}: {
  label: string;
  question: React.ReactNode;
  confirmLabel: string;
  /** runs after the second tap */
  run: () => void | Promise<void>;
  tone?: "danger" | "primary";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const confirmTone =
    tone === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-emerald-600 text-white hover:bg-emerald-700";
  const openTone =
    tone === "danger"
      ? "border-red-500/50 text-red-700 hover:bg-red-500/10 dark:text-red-400"
      : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-12 w-full items-center justify-center rounded-lg border px-4 text-sm font-medium sm:w-auto ${openTone} ${className}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className={`w-full space-y-3 rounded-lg border p-4 text-sm ${
        tone === "danger" ? "border-red-500/50 bg-red-500/5" : "border-emerald-600/50 bg-emerald-600/5"
      } ${className}`}
    >
      <p>{question}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await run()))}
          className={`inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50 ${confirmTone}`}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="inline-flex min-h-12 items-center justify-center rounded-lg border border-black/15 px-4 text-sm font-medium dark:border-white/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
