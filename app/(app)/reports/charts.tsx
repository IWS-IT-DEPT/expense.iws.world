import { money } from "@/lib/format";

const DEFAULT_BAR = "#2f9e5a";

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

/** Two-segment proportion bar (card vs reimbursement). */
export function SplitBar({ card, reimbursement }: { card: number; reimbursement: number }) {
  const total = Math.max(1, card + reimbursement);
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded">
        <span style={{ width: `${(card / total) * 100}%`, backgroundColor: "#2731a8" }} />
        <span style={{ width: `${(reimbursement / total) * 100}%`, backgroundColor: "#2f9e5a" }} />
      </div>
      <div className="mt-1 flex justify-between text-xs opacity-70">
        <span>Card {money(card)}</span>
        <span>Reimbursement {money(reimbursement)}</span>
      </div>
    </div>
  );
}
