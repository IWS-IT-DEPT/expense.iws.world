import { requireRole } from "@/lib/current-user";
import { money } from "@/lib/format";
import {
  groupTotals,
  loadSpend,
  deltaHint,
  periodQuery,
  resolvePeriod,
  summarize,
  timeBuckets,
  type RangeKind,
  type SpendScope,
} from "@/lib/reports";

import { BarsH, BreakdownTable, Card, Panel, SplitBar, TimeBars } from "../../reports/charts";
import { PeriodControls } from "../../reports/period-controls";

export const dynamic = "force-dynamic";

const RANGES: RangeKind[] = ["week", "month", "quarter", "year", "all", "custom"];

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; from?: string; to?: string; scope?: string }>;
}) {
  await requireRole("payroll", "admin");
  const sp = await searchParams;

  const range: RangeKind = RANGES.includes(sp.range as RangeKind) ? (sp.range as RangeKind) : "month";
  const scope: SpendScope = sp.scope === "approved" ? "approved" : "turned_in";
  const period = resolvePeriod(range, sp.start, { from: sp.from, to: sp.to });

  const lines = await loadSpend({
    start: period.start,
    end: period.end,
    scope,
    only: "reimbursement",
  });
  const prevLines = period.prevRange
    ? await loadSpend({ ...period.prevRange, scope, only: "reimbursement" })
    : [];

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

  const exportQs = periodQuery(period);
  exportQs.set("view", "reimbursement");
  if (scope === "approved") exportQs.set("scope", "approved");

  const delta = deltaHint(summary.deltaPct, period);

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Reimbursements</h1>

        <PeriodControls basePath="/payroll/reports" period={period} scope={scope} />

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
        Mileage and out-of-pocket reimbursements with an item date {period.range === "all" ? "at any time" : `in ${period.label}`}, counting{" "}
        {scope === "approved" ? "approved" : "submitted, reconciled and approved"} items. Card
        purchases are on the Accounting → Reports tab.
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
