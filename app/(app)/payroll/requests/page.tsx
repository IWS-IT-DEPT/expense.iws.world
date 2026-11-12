import Link from "next/link";
import { forbidden } from "next/navigation";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { entities, expenseItems, receipts, users } from "@/db/schema";
import { canSeePayroll, requireUser } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { EntityBadge } from "../../../components/entity-badge";
import { STATUS_LABEL, btn } from "../../expenses/expense-row";

const PAGE_SIZE = 50;

/** Everything past draft. */
const STATUSES = ["submitted", "reconciled", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

const field =
  "w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20";

type Params = {
  q?: string;
  from?: string;
  to?: string;
  user?: string;
  entity?: string;
  kind?: string;
  status?: string;
  min?: string;
  max?: string;
  receipts?: string;
  page?: string;
};

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cents(s?: string): number | null {
  if (!s?.trim()) return null;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Every out-of-pocket and mileage request that's been turned in — submitted,
 * reconciled, approved or sent back — searchable long after it has left the
 * Reconcile / Approvals queues. The payroll counterpart of All Charges.
 */
export default async function PayrollRequestsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await requireUser();
  if (!canSeePayroll(me)) forbidden();
  const p = await searchParams;

  const receiptCount = sql<number>`(select count(*)::int from ${receipts} where ${receipts.expenseItemId} = ${expenseItems.id})`;

  const status: Status | null = (STATUSES as readonly string[]).includes(p.status ?? "")
    ? (p.status as Status)
    : null;
  const kind = p.kind === "mileage" || p.kind === "out_of_pocket" ? p.kind : null;
  const min = cents(p.min);
  const max = cents(p.max);
  const q = p.q?.trim();

  const conds = [
    status ? eq(expenseItems.status, status) : inArray(expenseItems.status, [...STATUSES]),
    kind ? eq(expenseItems.kind, kind) : undefined,
    isDate(p.from) ? gte(expenseItems.itemDate, p.from!) : undefined,
    isDate(p.to) ? lte(expenseItems.itemDate, p.to!) : undefined,
    p.user && UUID.test(p.user) ? eq(expenseItems.userId, p.user) : undefined,
    p.entity && UUID.test(p.entity) ? eq(expenseItems.entityId, p.entity) : undefined,
    min != null ? gte(expenseItems.amountCents, min) : undefined,
    max != null ? lte(expenseItems.amountCents, max) : undefined,
    q
      ? or(
          ilike(expenseItems.businessPurpose, `%${q}%`),
          ilike(expenseItems.tripFrom, `%${q}%`),
          ilike(expenseItems.tripTo, `%${q}%`),
        )
      : undefined,
    p.receipts === "none" ? sql`${receiptCount} = 0` : undefined,
  ].filter((c) => c !== undefined);
  const where = and(...conds);

  const page = Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1);

  const [people, companies, [{ total, sum, miles }], rows] = await Promise.all([
    db.query.users.findMany({ columns: { id: true, name: true }, orderBy: [asc(users.name)] }),
    db.query.entities.findMany({ columns: { id: true, code: true, name: true }, orderBy: [asc(entities.code)] }),
    db
      .select({
        total: sql<number>`count(*)::int`,
        sum: sql<number>`coalesce(sum(${expenseItems.amountCents}), 0)::bigint`,
        miles: sql<string>`coalesce(sum(${expenseItems.miles}), 0)::text`,
      })
      .from(expenseItems)
      .where(where),
    db
      .select({
        id: expenseItems.id,
        date: expenseItems.itemDate,
        cents: expenseItems.amountCents,
        kind: expenseItems.kind,
        purpose: expenseItems.businessPurpose,
        from: expenseItems.tripFrom,
        to: expenseItems.tripTo,
        miles: expenseItems.miles,
        status: expenseItems.status,
        userName: users.name,
        entityCode: entities.code,
        entityColor: entities.brandColor,
        receipts: receiptCount,
      })
      .from(expenseItems)
      .leftJoin(users, eq(users.id, expenseItems.userId))
      .leftJoin(entities, eq(entities.id, expenseItems.entityId))
      .where(where)
      .orderBy(desc(expenseItems.itemDate), desc(expenseItems.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (n: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v && k !== "page") u.set(k, v);
    u.set("page", String(n));
    return `/payroll/requests?${u.toString()}`;
  };
  const filtered = Object.entries(p).some(([k, v]) => k !== "page" && v);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">All Requests</h1>
        <p className="text-sm opacity-70">
          Every reimbursement and mileage request that&apos;s been turned in, including approved ones from months
          back. Open one to see its details and receipts.
        </p>
      </div>

      <form method="get" className="grid gap-3 rounded-lg border border-black/10 p-4 text-sm sm:grid-cols-4 dark:border-white/15">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium opacity-70">Purpose or route</span>
          <input name="q" defaultValue={p.q ?? ""} placeholder="e.g. Site visit, Lowe's" className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">From</span>
          <input type="date" name="from" defaultValue={p.from ?? ""} className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">To</span>
          <input type="date" name="to" defaultValue={p.to ?? ""} className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Employee</span>
          <select name="user" defaultValue={p.user ?? ""} className={field}>
            <option value="">Anyone</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Type</span>
          <select name="kind" defaultValue={kind ?? ""} className={field}>
            <option value="">Mileage &amp; out-of-pocket</option>
            <option value="mileage">Mileage</option>
            <option value="out_of_pocket">Out-of-pocket</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Company</span>
          <select name="entity" defaultValue={p.entity ?? ""} className={field}>
            <option value="">Any</option>
            {companies.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} — {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Status</span>
          <select name="status" defaultValue={status ?? ""} className={field}>
            <option value="">Any (turned in)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Receipts</span>
          <select name="receipts" defaultValue={p.receipts ?? ""} className={field}>
            <option value="">Any</option>
            <option value="none">Missing a receipt</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Amount from ($)</span>
          <input name="min" inputMode="decimal" defaultValue={p.min ?? ""} className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Amount to ($)</span>
          <input name="max" inputMode="decimal" defaultValue={p.max ?? ""} className={field} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Search
          </button>
          {filtered ? (
            <Link href="/payroll/requests" className="px-2 py-2 text-sm underline opacity-70">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-sm opacity-70">
        {total} {total === 1 ? "request" : "requests"} · {money(Number(sum))}
        {Number(miles) > 0 ? ` · ${Number(miles).toFixed(1)} mi` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm opacity-60">No requests match.</p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
          {rows.map((r) => {
            const mileage = r.kind === "mileage";
            const route = [r.from, r.to].filter(Boolean).join(" → ");
            return (
              <li key={r.id}>
                <Link
                  href={`/expenses/${r.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                >
                  <span className="w-20 shrink-0 tabular-nums opacity-70">{shortDate(r.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.userName ?? "—"}</span>
                    <span className="opacity-60">
                      {" "}
                      · {mileage ? `Mileage${r.miles ? ` · ${Number(r.miles).toFixed(1)} mi` : ""}` : "Out-of-pocket"}
                    </span>
                    {mileage && route ? <span className="block truncate text-xs opacity-60">{route}</span> : null}
                    {r.purpose ? <span className="block truncate text-xs opacity-60">{r.purpose}</span> : null}
                  </span>
                  {r.entityCode ? <EntityBadge code={r.entityCode} color={r.entityColor} /> : null}
                  <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {mileage ? null : (
                    <span
                      className={`text-xs ${r.receipts === 0 ? "font-medium text-amber-600 dark:text-amber-400" : "opacity-70"}`}
                    >
                      {r.receipts === 0 ? "no receipt" : `${r.receipts} receipt${r.receipts === 1 ? "" : "s"}`}
                    </span>
                  )}
                  <span className="w-24 text-right font-semibold tabular-nums">{money(r.cents)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={qs(page - 1)} className={btn}>
              ← Newer
            </Link>
          ) : null}
          <span className="opacity-60">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={qs(page + 1)} className={btn}>
              Older →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
