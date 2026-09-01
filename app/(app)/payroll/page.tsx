import Link from "next/link";

import { requireRole } from "@/lib/current-user";
import { money } from "@/lib/format";
import {
  groupTotals,
  loadSpend,
  periodTitle,
  resolvePeriod,
  summarize,
  timeBuckets,
  type RangeKind,
  type SpendScope,
} from "@/lib/reports";

import { BarsH, BreakdownTable, Card, Panel, SplitBar, TimeBars } from "../reports/charts";

export const dynamic = "force-dynamic";

const RANGES: RangeKind[] = ["week", "month", "quarter"];

function href(range: RangeKind, start: string | null, scope: SpendScope): string {
  const sp = new URLSearchParams({ range });
  if (start) sp.set("start", start);
  if (scope === "approved") sp.set("scope", "approved");
  return `/payroll?${sp.toString()}`;
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; scope?: string }>;
}) {
  await requireRole("payroll", "admin");
  const sp = await searchParams;

  const range: RangeKind = RANGES.includes(sp.range as RangeKind) ? (sp.range as RangeKind) : "month";
  const scope: SpendScope = sp.scope === "approved" ? "approved" : "turned_in";
  const period = resolvePeriod(range, sp.start);
  const prev = resolvePeriod(range, period.prevStart);

  const lines = await loadSpend({
    start: period.start,
    end: period.end,
    scope,
    only: "reimbursement",
  });
  const prevLines = await loadSpend({
    start: prev.start,
    end: prev.end,
    scope,
    only: "reimbursement",
  });

  const summary = summarize(lines, prevLines);
  const buckets = timeBuckets(period, lines);

  const mileage = lines.filter((l) => l.kind === "mileage");
  const oop = lines.filter((l) => l.kind === "out_of_pocket");
  const oopDollars = oop.reduce((s, l) => s + l.amountCents, 0);

  const byEmployee = groupTotals(lines, (l) => ({ key: l.userId, label: l.userName }));
  const byEntity = groupTotals(lines, (l) => ({
    key: l.entityCode ?? "—",
    label: l.entityCode ?? "Unassigned",
    color: l.entityColor ?? undefined,
  }));
  const byCategory = groupTotals(lines, (l) => ({
    key: l.categoryName ?? "—",
    label: l.categoryName ?? "Uncategorized",
  }));

  const exportQs = new URLSearchParams({ view: "reimbursement", range, start: period.start });
  if (scope === "approved") exportQs.set("scope", "approved");

  const delta =
    summary.deltaPct == null
      ? "no prior data"
      : `${summary.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(summary.deltaPct).toFixed(1)}% vs last ${periodTitle(range)}`;

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Reimbursements</h1>

        <div className="flex rounded-md border border-black/15 p-0.5 text-xs dark:border-white/20">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={href(r, null, scope)}
              className={`rounded px-2.5 py-1 font-medium capitalize ${
                r === range
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {r === "week" ? "Weekly" : r === "month" ? "Monthly" : "Quarterly"}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1 text-sm">
          <Link
            href={href(range, period.prevStart, scope)}
            className="rounded border border-black/15 px-2 py-0.5 dark:border-white/20"
            aria-label="Previous period"
          >
            ‹
          </Link>
          <span className="min-w-[12rem] text-center font-medium">{period.label}</span>
          {period.nextStart ? (
            <Link
              href={href(range, period.nextStart, scope)}
              className="rounded border border-black/15 px-2 py-0.5 dark:border-white/20"
              aria-label="Next period"
            >
              ›
            </Link>
          ) : (
            <span className="rounded border border-black/10 px-2 py-0.5 opacity-30 dark:border-white/10">
              ›
            </span>
          )}
        </div>

        <div className="flex rounded-md border border-black/15 p-0.5 text-xs dark:border-white/20">
          <Link
            href={href(range, period.start, "turned_in")}
            className={`rounded px-2.5 py-1 font-medium ${
              scope === "turned_in"
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            Turned in
          </Link>
          <Link
            href={href(range, period.start, "approved")}
            className={`rounded px-2.5 py-1 font-medium ${
              scope === "approved"
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            Approved only
          </Link>
        </div>

        <div className="ml-auto flex gap-2">
          <a
            href={`/api/reports/export?format=xlsx&${exportQs.toString()}`}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Download Excel
          </a>
          <a
            href={`/api/reports/export?format=pdf&${exportQs.toString()}`}
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20"
          >
            Download PDF
          </a>
        </div>
      </div>

      <p className="text-xs opacity-60">
        Mileage and out-of-pocket reimbursements with an item date in {period.label}, counting{" "}
        {scope === "approved" ? "approved" : "submitted and approved"} items. Card purchases are on
        the Accounting → Reports tab.
      </p>

      {/* summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card label="Total reimbursements" value={money(summary.reimbursement)} hint={delta} />
        <Card label="Out of pocket" value={money(oopDollars)} hint={`${oop.length} items`} />
        <Card
          label="Mileage"
          value={money(summary.mileageDollars)}
          hint={`${summary.miles.toLocaleString()} mi · ${mileage.length} trips`}
        />
        <Card label="Line items" value={String(summary.txnCount)} />
        <Card label="Avg item" value={money(summary.avg)} />
      </div>

      {/* charts */}
      <Panel title={`Reimbursements over time — ${period.label}`}>
        <TimeBars data={buckets} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Mileage vs out of pocket">
          <SplitBar
            aLabel="Mileage"
            aValue={summary.mileageDollars}
            bLabel="Out of pocket"
            bValue={oopDollars}
          />
        </Panel>
        <Panel title="By entity">
          <BarsH
            data={byEntity.map((g) => ({
              label: g.label,
              value: g.total,
              color: g.color,
              sub: `${g.count}`,
            }))}
            empty="No reimbursements in this period."
          />
        </Panel>
        <Panel title="By employee (top 10)">
          <BarsH
            data={byEmployee.slice(0, 10).map((g) => ({ label: g.label, value: g.total }))}
            empty="No reimbursements in this period."
          />
        </Panel>
        <Panel title="By category (top 10)">
          <BarsH
            data={byCategory.slice(0, 10).map((g) => ({ label: g.label, value: g.total }))}
            empty="No reimbursements in this period."
          />
        </Panel>
      </div>

      {/* breakdown tables */}
      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownTable heading="By employee" label="Employee" groups={byEmployee} />
        <BreakdownTable heading="By entity" label="Entity" groups={byEntity} />
        <BreakdownTable heading="By category" label="Category" groups={byCategory} />
      </div>
    </div>
  );
}
