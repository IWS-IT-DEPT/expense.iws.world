"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/** Minimal modal — the app has no dialog library. Backdrop + Escape to close. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-xl border border-black/10 bg-[var(--background)] p-5 shadow-xl dark:border-white/15"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-sm opacity-60 hover:opacity-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
