"use client";

import { useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Pages that are "home" in each section — no Back needed there. */
const TOP_LEVEL = new Set([
  "/",
  "/expenses",
  "/summary",
  "/report",
  "/cards",
  "/reconcile",
  "/approvals",
  "/reports",
  "/payroll/reconcile",
  "/payroll/approvals",
  "/payroll/reports",
  "/admin",
  "/help",
  "/account",
]);

const noop = () => () => {};
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * The installed app has no browser Back button (iPhone especially), so on any
 * page that isn't a section's home it shows one. Hidden in a normal browser,
 * which already has its own.
 */
export function BackButton() {
  const router = useRouter();
  const path = usePathname();
  const standalone = useSyncExternalStore(noop, isStandalone, () => false);

  if (!standalone || TOP_LEVEL.has(path)) return null;

  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/expenses"))}
      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium"
      aria-label="Back"
    >
      <span aria-hidden>‹</span> Back
    </button>
  );
}
