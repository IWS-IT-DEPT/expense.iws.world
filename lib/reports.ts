/**
 * Spend analytics for the accounting Reports tab. Pure data layer — no React.
 *
 * Two tables hold real spend: `pending_expenses` (card purchases) and
 * `expense_items` (out-of-pocket + mileage). This module normalizes both into a
 * single `SpendLine`, resolves week / month / quarter / year / all-time / custom periods, and produces the
 * aggregates the dashboard, the .xlsx workbook and the PDF all share.
 */
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses } from "@/db/schema";
import { entityColor } from "@/lib/brand";
import { weekBounds } from "@/lib/format";
import { todayInTz } from "@/lib/tz";

export type RangeKind = "week" | "month" | "quarter" | "year" | "all" | "custom";
export type SpendScope = "turned_in" | "approved";

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ------------------------------------------------------------------ dates -- */

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}
function addDaysUTC(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function fmtDay(d: Date): string {
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export interface Period {
  range: RangeKind;
  /** yyyy-mm-dd, inclusive */
  start: string;
  /** yyyy-mm-dd, inclusive */
  end: string;
  label: string;
  /** anchor date for the previous period (feed back into resolvePeriod); null for custom / all time */
  prevStart: string | null;
  /** anchor for the next period, or null when it would be in the future or doesn't apply */
  nextStart: string | null;
  /** the window this one is compared with, or null when there's nothing to compare to (all time) */
  prevRange: { start: string; end: string } | null;
}

const ALL_START = "0001-01-01";
const ALL_END = "9999-12-31";
const isYmd = (s?: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseYmd(s).getTime());

function fmtFull(d: Date): string {
  return `${fmtDay(d)}, ${d.getUTCFullYear()}`;
}

export function resolvePeriod(
  range: RangeKind,
  anchor?: string,
  custom?: { from?: string | null; to?: string | null },
): Period {
  const today = todayInTz();

  if (range === "all") {
    return { range, start: ALL_START, end: ALL_END, label: "All time", prevStart: null, nextStart: null, prevRange: null };
  }

  if (range === "custom") {
    const t = parseYmd(today);
    let from = isYmd(custom?.from) ? parseYmd(custom!.from!) : new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    let to = isYmd(custom?.to) ? parseYmd(custom!.to!) : t;
    if (from > to) [from, to] = [to, from];
    // Keep the window sane so charts and exports stay bounded.
    const floor = new Date(Date.UTC(1990, 0, 1));
    const ceil = new Date(Date.UTC(2100, 11, 31));
    if (from < floor) from = floor;
    if (to > ceil) to = ceil;
    if (from > to) from = to;
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const prevEnd = addDaysUTC(from, -1);
    return {
      range,
      start: ymd(from),
      end: ymd(to),
      label: ymd(from) === ymd(to) ? fmtFull(from) : `${fmtFull(from)} – ${fmtFull(to)}`,
      prevStart: null,
      nextStart: null,
      prevRange: { start: ymd(addDaysUTC(prevEnd, -(days - 1))), end: ymd(prevEnd) },
    };
  }

  const base = isYmd(anchor) ? parseYmd(anchor) : parseYmd(today);

  let start: Date;
  let end: Date;
  let label: string;

  if (range === "week") {
    const wb = weekBounds(ymd(base));
    start = parseYmd(wb.start);
    end = parseYmd(wb.end);
    label = `${fmtDay(start)} – ${fmtDay(end)}, ${end.getUTCFullYear()}`;
  } else if (range === "month") {
    start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
    label = `${MONTH_LONG[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  } else if (range === "quarter") {
    const q = Math.floor(base.getUTCMonth() / 3);
    start = new Date(Date.UTC(base.getUTCFullYear(), q * 3, 1));
    end = new Date(Date.UTC(base.getUTCFullYear(), q * 3 + 3, 0));
    label = `Q${q + 1} ${start.getUTCFullYear()}`;
  } else {
    start = new Date(Date.UTC(base.getUTCFullYear(), 0, 1));
    end = new Date(Date.UTC(base.getUTCFullYear(), 11, 31));
    label = String(start.getUTCFullYear());
  }

  const prevStart =
    range === "week"
      ? addDaysUTC(start, -7)
      : range === "month"
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1))
        : range === "quarter"
          ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1))
          : new Date(Date.UTC(start.getUTCFullYear() - 1, 0, 1));

  const nextStart =
    range === "week"
      ? addDaysUTC(start, 7)
      : range === "month"
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
        : range === "quarter"
          ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1))
          : new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));

  const prevPeriodEnd =
    range === "week"
      ? addDaysUTC(prevStart, 6)
      : range === "month"
        ? new Date(Date.UTC(prevStart.getUTCFullYear(), prevStart.getUTCMonth() + 1, 0))
        : range === "quarter"
          ? new Date(Date.UTC(prevStart.getUTCFullYear(), prevStart.getUTCMonth() + 3, 0))
          : new Date(Date.UTC(prevStart.getUTCFullYear(), 11, 31));

  return {
    range,
    start: ymd(start),
    end: ymd(end),
    label,
    prevStart: ymd(prevStart),
    nextStart: ymd(nextStart) <= today ? ymd(nextStart) : null,
    prevRange: { start: ymd(prevStart), end: ymd(prevPeriodEnd) },
  };
}

export function periodTitle(range: RangeKind): string {
  return range === "week"
    ? "week"
    : range === "month"
      ? "month"
      : range === "quarter"
        ? "quarter"
        : range === "year"
          ? "year"
          : "period";
}

/** Query-string params that reproduce this exact period (used by tabs, arrows and exports). */
export function periodQuery(period: Period): URLSearchParams {
  const sp = new URLSearchParams({ range: period.range });
  if (period.range === "custom") {
    sp.set("from", period.start);
    sp.set("to", period.end);
  } else if (period.range !== "all") {
    sp.set("start", period.start);
  }
  return sp;
}

/** "▲ 4.2% vs last month" style hint for the headline card. */
export function deltaHint(deltaPct: number | null, period: Period): string {
  if (period.range === "all") return "all time";
  if (deltaPct == null) return "no prior data";
  const arrow = `${deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(1)}%`;
  return period.range === "custom" ? `${arrow} vs the previous period of the same length` : `${arrow} vs last ${periodTitle(period.range)}`;
}

/* ------------------------------------------------------------- spend lines -- */

export interface SpendLine {
  id: string;
  source: "card" | "reimbursement";
  kind: "card" | "out_of_pocket" | "mileage";
  /** effective date, yyyy-mm-dd */
  date: string;
  /** effective amount in cents (accounting's correction wins for card lines) */
  amountCents: number;
  enteredCents: number;
  actualCents: number | null;
  userId: string;
  userName: string;
  entityCode: string | null;
  entityColor: string | null;
  categoryName: string | null;
  locationName: string | null;
  merchant: string | null;
  businessPurpose: string | null;
  miles: number | null;
  status: string;
  /** receipts attached to the line */
  receiptCount: number;
}

type CardStatus = (typeof pendingExpenses.status.enumValues)[number];
type ItemStatus = (typeof expenseItems.status.enumValues)[number];

export async function loadSpend(opts: {
  start: string;
  end: string;
  scope: SpendScope;
  /** Restrict to one spend stream. Card = `pending_expenses`, reimbursement =
   *  `expense_items` (out-of-pocket + mileage). Omit for both. */
  only?: "card" | "reimbursement";
}): Promise<SpendLine[]> {
  const { start, end, scope, only } = opts;
  const cardStatuses: CardStatus[] =
    scope === "approved" ? ["approved"] : ["submitted", "reconciled", "approved"];
  const itemStatuses: ItemStatus[] =
    scope === "approved" ? ["approved"] : ["submitted", "reconciled", "approved"];

  const cardRows =
    only === "reimbursement"
      ? []
      : await db.query.pendingExpenses.findMany({
          where: inArray(pendingExpenses.status, cardStatuses),
          with: {
            user: { columns: { id: true, name: true } },
            entity: { columns: { code: true, brandColor: true } },
            category: { columns: { name: true } },
            location: { columns: { name: true } },
            receipts: { columns: { id: true } },
          },
        });

  const itemRows =
    only === "card"
      ? []
      : await db.query.expenseItems.findMany({
          where: inArray(expenseItems.status, itemStatuses),
          with: {
            user: { columns: { id: true, name: true } },
            entity: { columns: { code: true, brandColor: true } },
            category: { columns: { name: true } },
            location: { columns: { name: true } },
            receipts: { columns: { id: true } },
          },
        });

  const lines: SpendLine[] = [];

  for (const r of cardRows) {
    const date = r.actualPurchaseDate ?? r.purchaseDate;
    if (date < start || date > end) continue;
    lines.push({
      id: r.id,
      source: "card",
      kind: "card",
      date,
      amountCents: r.actualAmountCents ?? r.amountCents,
      enteredCents: r.amountCents,
      actualCents: r.actualAmountCents ?? null,
      userId: r.userId,
      userName: r.user?.name ?? "—",
      entityCode: r.entity?.code ?? null,
      entityColor: r.entity ? entityColor(r.entity.code, r.entity.brandColor) : null,
      categoryName: r.category?.name ?? null,
      locationName: r.location?.name ?? null,
      merchant: r.merchant,
      businessPurpose: r.businessPurpose,
      miles: null,
      status: r.status,
      receiptCount: r.receipts.length,
    });
  }

  for (const r of itemRows) {
    const date = r.itemDate;
    if (date < start || date > end) continue;
    lines.push({
      id: r.id,
      source: "reimbursement",
      kind: r.kind,
      date,
      amountCents: r.amountCents,
      enteredCents: r.amountCents,
      actualCents: null,
      userId: r.userId,
      userName: r.user?.name ?? "—",
      entityCode: r.entity?.code ?? null,
      entityColor: r.entity ? entityColor(r.entity.code, r.entity.brandColor) : null,
      categoryName: r.category?.name ?? null,
      locationName: r.location?.name ?? null,
      merchant: r.kind === "mileage" ? [r.tripFrom, r.tripTo].filter(Boolean).join(" → ") || null : null,
      businessPurpose: r.businessPurpose,
      miles: r.miles ? Number(r.miles) : null,
      status: r.status,
      receiptCount: r.receipts.length,
    });
  }

  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return lines;
}

/* ------------------------------------------------------------ aggregation -- */

export interface GroupTotal {
  key: string;
  label: string;
  total: number;
  count: number;
  color?: string;
}

export function groupTotals(
  lines: SpendLine[],
  keyer: (l: SpendLine) => { key: string; label: string; color?: string },
): GroupTotal[] {
  const map = new Map<string, GroupTotal>();
  for (const l of lines) {
    const { key, label, color } = keyer(l);
    const g = map.get(key);
    if (g) {
      g.total += l.amountCents;
      g.count += 1;
    } else {
      map.set(key, { key, label, color, total: l.amountCents, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface TimeBucket {
  label: string;
  total: number;
}

type Gran = "day" | "weekday" | "week" | "month" | "year";

function pickGranularity(period: Period, days: number): Gran {
  if (period.range === "week") return "weekday";
  if (period.range === "month") return "week";
  if (period.range === "quarter" || period.range === "year") return "month";
  // custom / all time: choose by how long the window is
  if (days <= 31) return "day";
  if (days <= 150) return "week";
  if (days <= 1100) return "month";
  return "year";
}

export function timeBuckets(period: Period, lines: SpendLine[]): TimeBucket[] {
  let s = parseYmd(period.start);
  let e = parseYmd(period.end);

  if (period.range === "all") {
    if (lines.length === 0) return [];
    // lines are sorted by date
    s = parseYmd(lines[0].date);
    e = parseYmd(lines[lines.length - 1].date);
  }

  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  const gran = pickGranularity(period, days);
  const multiYear = s.getUTCFullYear() !== e.getUTCFullYear();
  const spans: { label: string; start: Date; end: Date }[] = [];

  if (gran === "weekday") {
    for (let i = 0; i < 7; i++) {
      const d = addDaysUTC(s, i);
      spans.push({ label: WD_SHORT[d.getUTCDay()], start: d, end: d });
    }
  } else if (gran === "day") {
    for (let d = s; d <= e; d = addDaysUTC(d, 1)) {
      spans.push({ label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, start: d, end: d });
    }
  } else if (gran === "week") {
    // Monday-aligned weekly buckets
    const firstDow = (s.getUTCDay() + 6) % 7;
    for (let cur = addDaysUTC(s, -firstDow); cur <= e; cur = addDaysUTC(cur, 7)) {
      spans.push({ label: `${cur.getUTCMonth() + 1}/${cur.getUTCDate()}`, start: cur, end: addDaysUTC(cur, 6) });
    }
  } else if (gran === "month") {
    let cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
    while (cur <= e) {
      const me = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
      const yy = String(cur.getUTCFullYear()).slice(2);
      spans.push({
        label: multiYear ? `${MONTH_SHORT[cur.getUTCMonth()]} ’${yy}` : MONTH_SHORT[cur.getUTCMonth()],
        start: cur,
        end: me,
      });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  } else {
    for (let y = s.getUTCFullYear(); y <= e.getUTCFullYear(); y++) {
      spans.push({ label: String(y), start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31)) });
    }
  }

  return spans.map((span) => {
    const a = ymd(span.start);
    const b = ymd(span.end);
    return {
      label: span.label,
      total: lines
        .filter((l) => l.date >= a && l.date <= b)
        .reduce((sum, l) => sum + l.amountCents, 0),
    };
  });
}

export interface Summary {
  total: number;
  card: number;
  reimbursement: number;
  mileageDollars: number;
  miles: number;
  txnCount: number;
  avg: number;
  prevTotal: number;
  deltaPct: number | null;
}

export function summarize(lines: SpendLine[], prevLines: SpendLine[]): Summary {
  const total = lines.reduce((s, l) => s + l.amountCents, 0);
  const card = lines.filter((l) => l.source === "card").reduce((s, l) => s + l.amountCents, 0);
  const mileage = lines.filter((l) => l.kind === "mileage");
  const prevTotal = prevLines.reduce((s, l) => s + l.amountCents, 0);
  return {
    total,
    card,
    reimbursement: total - card,
    mileageDollars: mileage.reduce((s, l) => s + l.amountCents, 0),
    miles: mileage.reduce((s, l) => s + (l.miles ?? 0), 0),
    txnCount: lines.length,
    avg: lines.length ? Math.round(total / lines.length) : 0,
    prevTotal,
    deltaPct: prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null,
  };
}

/* --------------------------------------------------------------- datasets -- */

export type DatasetKind =
  | "transactions"
  | "summary"
  | "entity"
  | "category"
  | "cardholder"
  | "merchant";

/** Card-spend view (accounting) vs reimbursement view (payroll). */
export type SpendView = "card" | "reimbursement";

export interface Dataset {
  /** sheet / section name */
  name: string;
  columns: string[];
  rows: (string | number)[][];
  /** 0-based indexes of columns that hold dollar amounts */
  moneyColumns: number[];
  /** per row: app path that opens the line (and its receipts), for a hyperlink column */
  links?: string[];
}

const dollars = (cents: number) => Math.round(cents) / 100;

export function buildDataset(
  kind: DatasetKind,
  lines: SpendLine[],
  summary: Summary,
  period: Period,
  view: SpendView = "card",
): Dataset {
  const personLabel = view === "reimbursement" ? "Employee" : "Cardholder";
  switch (kind) {
    case "transactions":
      return {
        name: "Transactions",
        columns: [
          "Date", "Source", "Type", "Merchant / trip", personLabel, "Entity",
          "Category", "Location", "Business purpose", "Entered", "Posted", "Miles", "Status",
          "Receipts",
        ],
        moneyColumns: [9, 10],
        links: lines.map((l) => `/expenses/${l.id}`),
        rows: lines.map((l) => [
          l.date,
          l.source === "card" ? "Card" : "Reimbursement",
          l.kind === "out_of_pocket" ? "Out of pocket" : l.kind === "mileage" ? "Mileage" : "Card",
          l.merchant ?? l.businessPurpose ?? "",
          l.userName,
          l.entityCode ?? "",
          l.categoryName ?? "",
          l.locationName ?? "",
          l.businessPurpose ?? "",
          dollars(l.enteredCents),
          l.actualCents != null ? dollars(l.actualCents) : "",
          l.miles ?? "",
          l.status,
          l.kind === "mileage" ? "" : l.receiptCount,
        ]),
      };

    case "summary": {
      const usd = (cents: number) =>
        `$${dollars(cents).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const delta: [string, string] = [
        "Change vs previous",
        summary.deltaPct == null
          ? "n/a"
          : `${summary.deltaPct >= 0 ? "+" : ""}${summary.deltaPct.toFixed(1)}%`,
      ];
      const rows: (string | number)[][] =
        view === "reimbursement"
          ? [
              ["Period", period.label],
              ["Total reimbursements", usd(summary.reimbursement)],
              ["Out of pocket", usd(summary.reimbursement - summary.mileageDollars)],
              ["Mileage", usd(summary.mileageDollars)],
              ["Miles driven", summary.miles.toLocaleString("en-US")],
              ["Line items", String(summary.txnCount)],
              ["Average item", usd(summary.avg)],
              ["Previous period total", usd(summary.prevTotal)],
              delta,
            ]
          : [
              ["Period", period.label],
              ["Card spend", usd(summary.card)],
              ["Transactions", String(summary.txnCount)],
              ["Average transaction", usd(summary.avg)],
              ["Previous period total", usd(summary.prevTotal)],
              delta,
            ];
      return { name: "Summary", columns: ["Metric", "Value"], moneyColumns: [], rows };
    }

    case "entity":
    case "category":
    case "cardholder":
    case "merchant": {
      const groups =
        kind === "entity"
          ? groupTotals(lines, (l) => ({ key: l.entityCode ?? "—", label: l.entityCode ?? "Unassigned" }))
          : kind === "category"
            ? groupTotals(lines, (l) => ({ key: l.categoryName ?? "—", label: l.categoryName ?? "Uncategorized" }))
            : kind === "cardholder"
              ? groupTotals(lines, (l) => ({ key: l.userId, label: l.userName }))
              : groupTotals(
                  lines.filter((l) => l.source === "card"),
                  (l) => ({ key: l.merchant ?? "—", label: l.merchant ?? "—" }),
                );
      const grand = groups.reduce((s, g) => s + g.total, 0);
      const heading =
        kind === "entity" ? "Entity" : kind === "category" ? "Category" : kind === "cardholder" ? personLabel : "Merchant";
      return {
        name: `By ${heading.toLowerCase()}`,
        columns: [heading, "Transactions", "Total", "% of period"],
        moneyColumns: [2],
        rows: groups.map((g) => [
          g.label,
          g.count,
          dollars(g.total),
          grand ? `${((g.total / grand) * 100).toFixed(1)}%` : "0%",
        ]),
      };
    }
  }
}

export function exportFilename(period: Period, ext: string, view: SpendView = "card"): string {
  const slug = period.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const stem = view === "reimbursement" ? "reimbursements" : "expense";
  return `iws-${stem}-${slug}.${ext}`;
}
