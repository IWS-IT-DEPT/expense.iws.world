"use client";

import { useRouter } from "next/navigation";

import { ConfirmAction } from "@/app/components/confirm-action";

/**
 * The always-visible way out of a "log something" screen, back to the home
 * screen (My Expenses). If nothing has been entered it just leaves; if there's
 * a half-filled form or a scanned receipt it asks first, in plain words, so a
 * stray tap can't throw away someone's work.
 */
export function CancelWorkflow({
  dirty,
  what,
  variant = "bottom",
  href = "/expenses",
}: {
  /** has the user typed anything or added a receipt? */
  dirty: boolean;
  /** "purchase", "reimbursement", "mileage entry" — used in the question */
  what: string;
  variant?: "top" | "bottom";
  href?: string;
}) {
  const router = useRouter();

  if (dirty) {
    return (
      <ConfirmAction
        label={variant === "top" ? "✕ Cancel" : `Cancel this ${what}`}
        confirmLabel="Yes, discard and go back"
        dismissLabel="No, keep going"
        question={
          <>
            Throw away this {what}? What you&apos;ve entered
            {" "}
            (and any receipt you added) will be lost.
          </>
        }
        run={() => router.push(href)}
        className={variant === "top" ? "sm:w-auto" : ""}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className={
        variant === "top"
          ? "inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-medium underline opacity-80"
          : "inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-black/15 px-4 text-sm font-medium sm:w-auto dark:border-white/20"
      }
    >
      {variant === "top" ? "✕ Cancel" : `Cancel`}
    </button>
  );
}
