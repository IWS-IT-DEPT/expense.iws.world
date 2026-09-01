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

import { BarsH, SplitBar, TimeBars } from "./charts";

export const dynamic = "force-dynamic";

const RANGES: RangeKind[] = ["week", "month", "quarter"];

function href(range: RangeKind, start: string | null, scope: SpendScope): string {
  const sp = new URLSearchParams({ range });
  if (start) sp.set("start", start);
  if (scope === "approved") sp.set("scope", "approved");
  return `/reports?${sp.toString()}`;
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs opacity-70">{label}</div>
      {hint ? <div className="mt-0.5 text-xs opacity-50">{hint}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BreakdownTable({
  heading,
  label,
  groups,
}: {
  heading: string;
  label: string;
  groups: { label: string; total: number; count: number }[];
}) {
  const grand = groups.reduce((s, g) => s + g.total, 0);
  return (
    <Panel title={heading}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left opacity-60">
            <tr>
              <th className="pb-1 font-medium">{label}</th>
              <th className="pb-1 text-right font-medium">Txns</th>
              <th className="pb-1 text-right font-medium">Total</th>
              <th className="pb-1 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-2 opacity-50">
                  Nothing in this period.
                </td>
              </tr>
            ) : (
              groups.map((g, i) => (
                <tr key={i} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-1">{g.label}</td>
                  <td className="py-1 text-right tabular-nums">{g.count}</td>
                  <td className="py-1 text-right tabular-nums">{money(g.total)}</td>
                  <td className="py-1 text-right tabular-nums opacity-60">
                    {grand ? `${((g.total / grand) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; scope?: string }>;
}) {
  await requireRole("accounting", "approver", "admin");
  const sp = await searchParams;

  const range: RangeKind = RANGES.includes(sp.range as RangeKind) ? (sp.range as RangeKind) : "month";
  const scope: SpendScope = sp.scope === "approved" ? "approved" : "turned_in";
  const period = resolvePeriod(range, sp.start);
  const prev = resolvePeriod(range, period.prevStart);

  const lines = await loadSpend({ start: period.start, end: period.end, scope });
  const prevLines = await loadSpend({ start: prev.start, end: prev.end, scope });

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

  const exportQs = new URLSearchParams({ range, start: period.start });
  if (scope === "approved") exportQs.set("scope", "approved");

  const delta =
    summary.deltaPct == null
      ? "no prior data"
      : `${summary.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(summary.deltaPct).toFixed(1)}% vs last ${periodTitle(range)}`;

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Reports</h1>

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
        Counting {scope === "approved" ? "approved" : "submitted, reconciled and approved"} card
        charges and reimbursements dated within {period.label}. Card amounts use accounting&apos;s
        corrected figure where one was entered.
      </p>

      {/* summary */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="Total spend" value={money(summary.total)} hint={delta} />
        <Card label="Card spend" value={money(summary.card)} />
        <Card label="Reimbursements" value={money(summary.reimbursement)} />
        <Card
          label="Mileage"
          value={money(summary.mileageDollars)}
          hint={`${summary.miles.toLocaleString()} mi`}
        />
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
        <Panel title="Card vs reimbursement">
          <SplitBar card={summary.card} reimbursement={summary.reimbursement} />
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
