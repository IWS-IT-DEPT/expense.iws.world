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

import { PeriodControls } from "./period-controls";
import { BarsH, BreakdownTable, Card, Panel, TimeBars } from "./charts";

export const dynamic = "force-dynamic";

const RANGES: RangeKind[] = ["week", "month", "quarter", "year", "all", "custom"];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; from?: string; to?: string; scope?: string }>;
}) {
  await requireRole("accounting", "approver", "admin");
  const sp = await searchParams;

  const range: RangeKind = RANGES.includes(sp.range as RangeKind) ? (sp.range as RangeKind) : "month";
  const scope: SpendScope = sp.scope === "approved" ? "approved" : "turned_in";
  const period = resolvePeriod(range, sp.start, { from: sp.from, to: sp.to });

  // Reimbursements (mileage + out-of-pocket) are the payroll team's domain — see
  // the Payroll tab. Accounting's Reports covers card spend only.
  const lines = await loadSpend({ start: period.start, end: period.end, scope, only: "card" });
  const prevLines = period.prevRange
    ? await loadSpend({ ...period.prevRange, scope, only: "card" })
    : [];

  const summary = summarize(lines, prevLines);
  const buckets = timeBuckets(period, lines);

  const byEntity = groupTotals(lines, (l) => ({
    key: l.entityCode ?? "—",
    label: l.entityCode ?? "Unassigned",
    color: l.entityColor ?? undefined,
  }));
  const byCategory = groupTotals(lines, (l) => ({
    key: l.categoryName ?? "—",
    label: l.categoryName ?? "Uncategorized",
  }));
  const byCardholder = groupTotals(lines, (l) => ({ key: l.userId, label: l.userName }));
  const byMerchant = groupTotals(
    lines.filter((l) => l.source === "card"),
    (l) => ({ key: l.merchant ?? "—", label: l.merchant ?? "—" }),
  );

  const exportQs = periodQuery(period);
  if (scope === "approved") exportQs.set("scope", "approved");

  const delta = deltaHint(summary.deltaPct, period);

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Reports</h1>

        <PeriodControls basePath="/reports" period={period} scope={scope} />

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
        Counting {scope === "approved" ? "approved" : "submitted, reconciled and approved"} card
        charges dated {period.range === "all" ? "at any time" : `within ${period.label}`}, using accounting&apos;s corrected figure where one was
        entered. Mileage and out-of-pocket reimbursements live on the Payroll tab.
      </p>

      {/* summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Card spend" value={money(summary.card)} hint={delta} />
        <Card label="Transactions" value={String(summary.txnCount)} />
        <Card label="Avg transaction" value={money(summary.avg)} />
      </div>

      {/* charts */}
      <Panel title={`Spend over time — ${period.label}`}>
        <TimeBars data={buckets} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By entity">
          <BarsH data={byEntity.map((g) => ({ label: g.label, value: g.total, color: g.color, sub: `${g.count}` }))} />
        </Panel>
        <Panel title="By category (top 10)">
          <BarsH data={byCategory.slice(0, 10).map((g) => ({ label: g.label, value: g.total }))} />
        </Panel>
        <Panel title="By cardholder (top 10)">
          <BarsH data={byCardholder.slice(0, 10).map((g) => ({ label: g.label, value: g.total }))} />
        </Panel>
        <Panel title="Top merchants (card, top 10)">
          <BarsH
            data={byMerchant.slice(0, 10).map((g) => ({ label: g.label, value: g.total }))}
            empty="No card spend in this period."
          />
        </Panel>
      </div>

      {/* breakdown tables */}
      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownTable heading="By entity" label="Entity" groups={byEntity} />
        <BreakdownTable heading="By category" label="Category" groups={byCategory} />
        <BreakdownTable heading="By cardholder" label="Cardholder" groups={byCardholder} />
      </div>
    </div>
  );
}
