import Link from "next/link";

import { shortDate } from "@/lib/format";

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reconciled: "Reconciled",
  approved: "Approved",
  rejected: "Sent back",
  cancelled: "Voided",
};
export const EDITABLE = new Set(["draft", "rejected"]);

export const btn =
  "press inline-flex min-h-11 items-center justify-center rounded-md border border-black/15 px-4 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm opacity-60">{children}</p>;
}

/**
 * One expense as a single big tap target. There are deliberately no buttons on
 * it: tap anywhere to open the expense, where editing, receipts, submitting and
 * discarding all live. That keeps thumbs from hitting the wrong thing.
 */
export function Row(props: {
  href: string;
  title: string;
  amount: string;
  date: string;
  status: string;
  rejected?: boolean;
  reason?: string;
  sub: React.ReactNode;
  receipts: number;
  /** what's still missing, from the readiness checks (empty = nothing wrong) */
  needs?: string[];
  /** whole days past the Friday deadline; shown as a red badge when > 0 */
  overdueDays?: number;
}) {
  const needs = props.needs ?? [];
  const blocked = needs.length > 0;
  const tone = props.rejected
    ? "border-red-500/60 bg-red-500/10"
    : blocked
      ? "border-amber-500/50 bg-amber-500/5"
      : "border-black/10 dark:border-white/15";

  return (
    <Link
      href={props.href}
      className={`press block rounded-lg border p-3.5 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.05] ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium">{props.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 opacity-70">{props.sub}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums">{props.amount}</p>
          <p className="text-xs opacity-60">{shortDate(props.date)}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded px-1.5 py-0.5 ${
            props.rejected
              ? "bg-red-500/15 font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300"
              : "bg-black/5 dark:bg-white/10"
          }`}
        >
          {STATUS_LABEL[props.status] ?? props.status}
        </span>
        {props.overdueDays ? (
          <span className="rounded bg-red-600 px-1.5 py-0.5 font-medium text-white">
            {props.overdueDays} {props.overdueDays === 1 ? "day" : "days"} overdue
          </span>
        ) : null}
        {blocked ? (
          <span className="font-medium text-amber-700 dark:text-amber-400">
            ⚠ {needs.length} {needs.length === 1 ? "thing" : "things"} needed
          </span>
        ) : null}
        <span className="opacity-60">{props.receipts > 0 ? `📎 ${props.receipts}` : "no receipt"}</span>
        <span className="ml-auto text-base opacity-40" aria-hidden>
          ›
        </span>
      </div>

      {props.rejected && props.reason ? (
        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">Sent back: {props.reason}</p>
      ) : null}
    </Link>
  );
}
