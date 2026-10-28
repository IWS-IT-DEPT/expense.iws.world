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
  "rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

// Row action controls: full-width, comfortable tap targets on phones; compact
// inline buttons from `sm:` up.
export const rowAction =
  "inline-flex min-h-[40px] grow items-center justify-center rounded-md border border-black/15 px-3.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10 sm:min-h-0 sm:grow-0 sm:px-2.5 sm:py-1 sm:text-xs";
export const rowActionPrimary =
  "inline-flex min-h-[40px] grow items-center justify-center rounded-md border border-emerald-600 bg-emerald-600 px-3.5 text-sm font-medium text-white hover:bg-emerald-700 sm:min-h-0 sm:grow-0 sm:px-2.5 sm:py-1 sm:text-xs";

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

export function Row(props: {
  title: string;
  amount: string;
  date: string;
  status: string;
  rejected?: boolean;
  reason?: string;
  sub: React.ReactNode;
  receipts: number;
  checks: string[];
  editHref?: string;
  submitForm?: React.ReactNode;
  upload?: React.ReactNode;
  voidForm?: React.ReactNode;
  /** whole days past the Friday deadline; shown as a red badge when > 0 */
  overdueDays?: number;
}) {
  const blocked = props.checks.length > 0;
  const tone = props.rejected
    ? "border-red-500/60 bg-red-500/10"
    : blocked
      ? "border-amber-500/50 bg-amber-500/5"
      : "border-black/10 dark:border-white/15";
  return (
    <div className={`rounded-lg border p-3 text-sm ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {props.editHref ? (
          <Link href={props.editHref} className="font-medium underline decoration-dotted hover:decoration-solid">
            {props.title}
          </Link>
        ) : (
          <span className="font-medium">{props.title}</span>
        )}
        <span>{props.amount}</span>
        <span className="opacity-60">{shortDate(props.date)}</span>
        {props.overdueDays ? (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">
            {props.overdueDays} {props.overdueDays === 1 ? "day" : "days"} overdue
          </span>
        ) : null}
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            props.rejected
              ? "bg-red-500/15 font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300"
              : "bg-black/5 dark:bg-white/10"
          }`}
        >
          {STATUS_LABEL[props.status] ?? props.status}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 opacity-80">{props.sub}</div>
      {props.rejected && props.reason ? (
        <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          Sent back: {props.reason}
        </p>
      ) : null}
      {blocked && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
          {props.checks.map((c, i) => (
            <li key={i}>
              • {c}
              {props.editHref ? (
                <>
                  {" "}
                  <Link href={props.editHref} className="underline">
                    fix
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs opacity-60">
          {props.receipts > 0 ? `📎 ${props.receipts}` : "no receipt"}
        </span>
        {props.editHref ? (
          <Link href={props.editHref} className={rowAction}>
            Open / edit
          </Link>
        ) : null}
        {props.upload}
        {props.submitForm}
        {props.voidForm}
      </div>
    </div>
  );
}
