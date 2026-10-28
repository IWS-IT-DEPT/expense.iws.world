"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "./spinner";

/**
 * A submit button that knows its form is working: while the form's action runs
 * it disables itself (no double taps) and swaps in a spinner. Drop-in for
 * `<button>` inside any `<form action={…}>`.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`${className} ${pending ? "cursor-progress opacity-70" : ""}`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner className="h-3.5 w-3.5" />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
