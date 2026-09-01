import type { ReactNode } from "react";

import { money } from "@/lib/format";

const DEFAULT_BAR = "#2f9e5a";

/* -------------------------------------------------------------- layout bits -- */

export function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs opacity-70">{label}</div>
      {hint ? <div className="mt-0.5 text-xs opacity-50">{hint}</div> : null}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function BreakdownTable({
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
              <th className="pb-1 text-right font-medium">Items</th>
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

/** Horizontal bar list — label, bar, value. Server component (no interactivity). */
export function BarsH({
  data,
  empty = "No spend in this period.",
}: {
  data: { label: string; value: number; color?: string; sub?: string }[];
  empty?: string;
}) {
  if (data.length === 0) {
    return <p className="text-xs opacity-50">{empty}</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="grid grid-cols-[8.5rem_1fr_5.5rem] items-center gap-2 text-xs">
          <span className="truncate opacity-80" title={d.label}>
            {d.label}
            {d.sub ? <span className="opacity-50"> · {d.sub}</span> : null}
          </span>
          <span className="block h-3 rounded bg-black/5 dark:bg-white/10">
            <span
              className="block h-3 rounded"
              style={{ width: `${Math.max(1, (d.value / max) * 100)}%`, backgroundColor: d.color ?? DEFAULT_BAR }}
            />
          </span>
          <span className="text-right tabular-nums opacity-80">{money(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars for a time series. */
export function TimeBars({ data }: { data: { label: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const n = Math.max(1, data.length);
  const W = 100;
  const H = 42;
  const gap = n > 1 ? 1.5 : 0;
  const bw = (W - gap * (n - 1)) / n;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full text-emerald-600 dark:text-emerald-500"
        role="img"
        aria-label="Spend over time"
      >
        {data.map((d, i) => {
          const h = (d.total / max) * H;
          return (
            <rect
              key={i}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={Math.max(h, 0.4)}
              fill="currentColor"
            />
          );
        })}
      </svg>
      <div className="mt-1 flex text-[10px] opacity-60">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Two-segment proportion bar. */
export function SplitBar({
  aLabel,
  aValue,
  bLabel,
  bValue,
  aColor = "#2731a8",
  bColor = "#2f9e5a",
}: {
  aLabel: string;
  aValue: number;
  bLabel: string;
  bValue: number;
  aColor?: string;
  bColor?: string;
}) {
  const total = Math.max(1, aValue + bValue);
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded">
        <span style={{ width: `${(aValue / total) * 100}%`, backgroundColor: aColor }} />
        <span style={{ width: `${(bValue / total) * 100}%`, backgroundColor: bColor }} />
      </div>
      <div className="mt-1 flex justify-between text-xs opacity-70">
        <span>
          {aLabel} {money(aValue)}
        </span>
        <span>
          {bLabel} {money(bValue)}
        </span>
      </div>
    </div>
  );
}
