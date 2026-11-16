import Link from "next/link";

import { periodQuery, resolvePeriod, type Period, type RangeKind, type SpendScope } from "@/lib/reports";

const TABS: { range: RangeKind; label: string }[] = [
  { range: "week", label: "Weekly" },
  { range: "month", label: "Monthly" },
  { range: "quarter", label: "Quarterly" },
  { range: "year", label: "Yearly" },
  { range: "all", label: "All Time" },
  { range: "custom", label: "Custom" },
];

const seg = "flex rounded-md border border-black/15 p-0.5 text-xs dark:border-white/20";
const on = "bg-black text-white dark:bg-white dark:text-black";
const off = "opacity-70 hover:opacity-100";
const dateInput =
  "rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/20";

/**
 * The period + scope controls shared by Accounting → Reports and Payroll → Reports:
 * Weekly / Monthly / Quarterly / Yearly / All Time / Custom range, prev/next arrows
 * where they make sense, and the Turned in / Approved only toggle.
 */
export function PeriodControls({
  basePath,
  period,
  scope,
}: {
  basePath: string;
  period: Period;
  scope: SpendScope;
}) {
  const link = (sp: URLSearchParams) => {
    if (scope === "approved") sp.set("scope", "approved");
    return `${basePath}?${sp.toString()}`;
  };
  const tabHref = (range: RangeKind) =>
    // Switching tab keeps a custom window's dates so "Custom" doesn't forget them.
    link(
      range === "custom" && period.range !== "all"
        ? periodQuery(resolvePeriod("custom", undefined, { from: period.start, to: period.end }))
        : periodQuery(resolvePeriod(range)),
    );
  const nav = (anchor: string) => link(periodQuery(resolvePeriod(period.range, anchor)));
  const scopeHref = (s: SpendScope) => {
    const sp = periodQuery(period);
    if (s === "approved") sp.set("scope", "approved");
    return `${basePath}?${sp.toString()}`;
  };

  return (
    <>
      <div className={seg}>
        {TABS.map((t) => (
          <Link
            key={t.range}
            href={tabHref(t.range)}
            className={`rounded px-2.5 py-1 font-medium ${t.range === period.range ? on : off}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-1 text-sm">
        {period.prevStart ? (
          <Link
            href={nav(period.prevStart)}
            className="rounded border border-black/15 px-2 py-0.5 dark:border-white/20"
            aria-label="Previous period"
          >
            ‹
          </Link>
        ) : null}
        <span className="min-w-[12rem] text-center font-medium">{period.label}</span>
        {period.prevStart ? (
          period.nextStart ? (
            <Link
              href={nav(period.nextStart)}
              className="rounded border border-black/15 px-2 py-0.5 dark:border-white/20"
              aria-label="Next period"
            >
              ›
            </Link>
          ) : (
            <span className="rounded border border-black/10 px-2 py-0.5 opacity-30 dark:border-white/10">›</span>
          )
        ) : null}
      </div>

      <div className={seg}>
        <Link href={scopeHref("turned_in")} className={`rounded px-2.5 py-1 font-medium ${scope === "turned_in" ? on : off}`}>
          Turned in
        </Link>
        <Link href={scopeHref("approved")} className={`rounded px-2.5 py-1 font-medium ${scope === "approved" ? on : off}`}>
          Approved only
        </Link>
      </div>

      {period.range === "custom" ? (
        <form method="get" action={basePath} className="flex w-full flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="range" value="custom" />
          {scope === "approved" ? <input type="hidden" name="scope" value="approved" /> : null}
          <label>
            <span className="mb-1 block text-xs font-medium opacity-70">From</span>
            <input type="date" name="from" required defaultValue={period.start} className={dateInput} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium opacity-70">To</span>
            <input type="date" name="to" required defaultValue={period.end} className={dateInput} />
          </label>
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Apply
          </button>
        </form>
      ) : null}
    </>
  );
}
